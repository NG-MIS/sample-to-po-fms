import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import DoneBox from '../components/DoneBox.jsx'
import Tabs from '../components/Tabs.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { FABRIC_TYPE_LABEL, cadsForEntry, cadsOfEntry, primaryLinesFor, rowsWithoutFabric, sizeLabel } from '../lib/cad.js'
import { nameMap, useLoad } from '../lib/data.js'
import { friendlyError } from '../lib/format.js'
import { BUCKET, canWorkOn, latestImage, loadSampleData } from '../lib/sampleData.js'
import { CadAssignDialog, CadCard, CadFabricDialog, CadForm, PrimaryAccessoryDialog } from './CadParts.jsx'
import SampleDetail from './SampleDetail.jsx'

function sampleColumns(onOpen, getSample) {
  return [
    {
      key: 'sample_no',
      header: 'SAMPLE NO',
      value: (row) => getSample(row).sample_no,
      render: (row) => (
        <button type="button" className="link link--strong" onClick={() => onOpen(getSample(row))}>
          {getSample(row).sample_no}
        </button>
      ),
    },
    { key: 'design_no', header: 'DESIGN NO', value: (row) => getSample(row).design_no ?? '' },
    {
      key: 'image',
      header: 'IMAGE',
      value: (row) => latestImage(getSample(row))?.label ?? '',
      render: (row) => {
        const image = latestImage(getSample(row))
        return image && <ClickableImage bucket={BUCKET} path={image.path} alt={`${getSample(row).sample_no} image`} size={44} />
      },
    },
  ]
}

// CAD drawings.
//   CAD drawings    - every CAD as a table, like the CAD sheet
//   Pending drawing - wishlist items with no CAD assigned yet, and approved samples
//                     that have neither a wishlist item nor a CAD
//   Fabric pending  - CADs with rows that still have no fabric
//   All rows        - every drawing row in one list, to filter and export
export default function CadPage() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [viewingId, setViewingId] = useState(null)
  const [form, setForm] = useState(null) // { cad } to edit, { start } for new
  const [fabricFor, setFabricFor] = useState(null) // { cadId, sampleId }
  const [assign, setAssign] = useState(null) // { cadId | entryId, sampleId }
  const [primary, setPrimary] = useState(null) // { sampleId, sizeRatioId }
  const [notice, setNotice] = useState('')
  const [doneBox, setDoneBox] = useState(null) // { title, text, number, note }

  const samples = useMemo(() => data?.samples ?? [], [data])
  const sampleOf = (id) => samples.find((sample) => sample.id === id)
  const canCad = Boolean(data?.access.cad)

  const lookups = useMemo(
    () => ({
      person: nameMap(data?.people),
      particular: nameMap(data?.cadParticulars),
      component: nameMap(data?.components),
      fabric: nameMap(data?.fabrics),
      vendor: new Map((data?.fabricVendors ?? []).map((vendor) => [vendor.id, vendor.code])),
      combination: new Map((data?.sizeRatios ?? []).map((row) => [row.id, row])),
    }),
    [data],
  )

  const cads = useMemo(() => samples.flatMap((sample) => sample.cads.map((cad) => ({ cad, sample }))), [samples])
  const pending = useMemo(
    () =>
      samples.flatMap((sample) => {
        // Approved, but not in the wishlist yet and with no CAD: the drawing is still to be made.
        if (sample.wishlist.length === 0) {
          return sample.approvals.final?.decision === 'yes' && sample.cads.length === 0
            ? [{ id: `sample-${sample.id}`, noWishlist: true, wishlist_no: '', size_ratio_id: null, qty: '', sample }]
            : []
        }
        return sample.wishlist.filter((entry) => cadsOfEntry(sample, entry).length === 0).map((entry) => ({ ...entry, sample }))
      }),
    [samples],
  )
  const fabricPending = useMemo(
    () =>
      data
        ? cads.filter(({ cad, sample }) => rowsWithoutFabric(cad).length > 0 && canWorkOn(sample, data, profile))
        : [],
    [cads, data, profile],
  )
  const allRows = useMemo(() => cads.flatMap(({ cad, sample }) => cad.rows.map((row) => ({ ...row, cad, sample }))), [cads])
  const fillsFabric = Boolean(data?.access.manages) || fabricPending.length > 0 || samples.some((sample) => sample.designer_id === profile.id)

  const tabs = [
    { key: 'cads', label: 'CAD drawings', count: cads.length },
    { key: 'pending', label: 'Pending drawing', count: pending.length },
    fillsFabric && { key: 'fabric', label: 'Fabric pending', count: fabricPending.length },
    { key: 'rows', label: 'All rows' },
  ].filter(Boolean)
  const wanted = params.get('tab') ?? 'cads'
  const tab = tabs.some((item) => item.key === wanted) ? wanted : 'cads'

  const openSample = useCallback((sample) => setViewingId(sample.id), [])
  const done = async (message) => {
    setForm(null)
    setFabricFor(null)
    setAssign(null)
    if (message) setNotice(message)
    await reload()
  }

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return cads
    return cads.filter(({ cad, sample }) => {
      const text = [
        cad.cad_no,
        sample.sample_no,
        sample.design_no ?? '',
        sizeLabel(lookups.combination.get(cad.size_ratio_id)),
        ...cad.rows.map((row) => `${lookups.particular.get(row.particular_id) ?? ''} ${lookups.fabric.get(row.fabric_id) ?? ''}`),
        ...sample.wishlist.filter((entry) => cad.wishlist_ids.includes(entry.id)).map((entry) => entry.wishlist_no),
      ]
        .join(' ')
        .toLowerCase()
      return words.every((word) => text.includes(word))
    })
  }, [cads, search, lookups])

  const pendingColumns = useMemo(
    () => [
      {
        key: 'wishlist_no',
        header: 'WISHLIST ID',
        value: (row) => (row.noWishlist ? 'Not in the wishlist yet' : row.wishlist_no),
        render: (row) => (row.noWishlist ? <span className="badge badge--pending">Not in the wishlist yet</span> : row.wishlist_no),
      },
      ...sampleColumns(openSample, (row) => row.sample),
      { key: 'size', header: 'SIZE', value: (row) => lookups.combination.get(row.size_ratio_id)?.size ?? '' },
      { key: 'ratio', header: 'RATIO', value: (row) => lookups.combination.get(row.size_ratio_id)?.ratio ?? '' },
      { key: 'qty', header: 'QTY (PCS)', align: 'right', value: (row) => row.qty },
      {
        key: 'available',
        header: 'CADS OF THIS SIZE',
        value: (row) => cadsForEntry(row.sample, row).map((cad) => cad.cad_no),
      },
      ...(canCad
        ? [
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <span className="row-actions">
                  {cadsForEntry(row.sample, row).length > 0 && (
                    <button type="button" className="btn btn--small btn--primary" onClick={() => setAssign({ entryId: row.id, sampleId: row.sample.id })}>
                      Assign CAD
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn btn--small ${cadsForEntry(row.sample, row).length ? '' : 'btn--primary'}`}
                    onClick={() =>
                      setForm({
                        start: {
                          sample: row.sample,
                          sizeRatioId: row.size_ratio_id,
                          entry: row.noWishlist ? null : { id: row.id, wishlist_no: row.wishlist_no, sample_id: row.sample.id, size_ratio_id: row.size_ratio_id },
                        },
                      })
                    }
                  >
                    New CAD
                  </button>
                </span>
              ),
            },
          ]
        : []),
    ],
    [lookups, openSample, canCad],
  )

  const fabricColumns = useMemo(
    () => [
      { key: 'cad_no', header: 'CAD', value: (row) => row.cad.cad_no },
      ...sampleColumns(openSample, (row) => row.sample),
      { key: 'size', header: 'SIZE', value: (row) => sizeLabel(lookups.combination.get(row.cad.size_ratio_id)) },
      {
        key: 'missing',
        header: 'ROWS WITHOUT FABRIC',
        value: (row) => rowsWithoutFabric(row.cad).map((item) => lookups.particular.get(item.particular_id)),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <button type="button" className="btn btn--small btn--primary" onClick={() => setFabricFor({ cadId: row.cad.id, sampleId: row.sample.id })}>
            Fill fabric
          </button>
        ),
      },
    ],
    [lookups, openSample],
  )

  const rowColumns = useMemo(
    () => [
      { key: 'cad_no', header: 'CAD', value: (row) => row.cad.cad_no },
      ...sampleColumns(openSample, (row) => row.sample),
      { key: 'size', header: 'SIZE', value: (row) => lookups.combination.get(row.cad.size_ratio_id)?.size ?? '' },
      { key: 'ratio', header: 'RATIO', value: (row) => lookups.combination.get(row.cad.size_ratio_id)?.ratio ?? '' },
      { key: 'particulars', header: 'PARTICULARS', value: (row) => lookups.particular.get(row.particular_id) ?? '' },
      { key: 'fabric_type', header: 'FABRIC TYPE', value: (row) => FABRIC_TYPE_LABEL[row.fabric_type] },
      { key: 'msrmnt', header: 'MSRMNT', align: 'right', value: (row) => (row.msrmnt === null ? '' : Number(row.msrmnt)) },
      { key: 'paina', header: 'PAINA', align: 'right', value: (row) => (row.paina === null ? '' : Number(row.paina)) },
      { key: 'pcs_in_layer', header: 'NO. OF PCS IN LAYER', align: 'right', value: (row) => row.pcs_in_layer ?? '' },
      { key: 'panels', header: 'NO OF PANELS', align: 'right', value: (row) => row.panels ?? '' },
      { key: 'components', header: 'COMPONENTS', value: (row) => (row.component_ids ?? []).map((id) => lookups.component.get(id) ?? '') },
      { key: 'efficiency', header: 'EFFICIENCY %', align: 'right', value: (row) => (row.efficiency === null || row.efficiency === undefined ? '' : Number(row.efficiency)) },
      { key: 'fabric', header: 'FABRIC', value: (row) => lookups.fabric.get(row.fabric_id) ?? '' },
      { key: 'vendor', header: 'VENDOR CODE', value: (row) => lookups.vendor.get(row.vendor_id) ?? '' },
      { key: 'rate', header: 'RATE', align: 'right', value: (row) => (row.rate === null ? '' : Number(row.rate).toFixed(2)) },
      {
        key: 'wishlist',
        header: 'WISHLIST',
        value: (row) => row.sample.wishlist.filter((entry) => row.cad.wishlist_ids.includes(entry.id)).map((entry) => entry.wishlist_no),
      },
    ],
    [lookups, openSample],
  )

  const viewing = sampleOf(viewingId)
  const fabricSample = fabricFor && sampleOf(fabricFor.sampleId)
  const fabricCad = fabricSample?.cads.find((cad) => cad.id === fabricFor.cadId)
  const assignSample = assign && sampleOf(assign.sampleId)
  const primarySample = primary && sampleOf(primary.sampleId)

  return (
    <>
      <PageHead
        title="CAD drawings"
        note="One CAD per sample and size, with a row for every drawing. A CAD is assigned to the wishlist items it is for; one assigned CAD is enough for a wishlist item."
      />
      {error && (
        <p className="alert alert--error" role="alert">
          {friendlyError(error)}
        </p>
      )}
      {notice && (
        <p className="alert alert--ok" role="status">
          {notice}
        </p>
      )}
      <Tabs tabs={tabs} value={tab} label="CAD views" onChange={(key) => setParams(key === 'cads' ? {} : { tab: key }, { replace: true })} />

      {tab === 'cads' && (
        <>
          <div className="cad-toolbar">
            <input
              className="input cad-search"
              type="search"
              placeholder="Search CAD, sample, design, particulars, wishlist id…"
              aria-label="Search CADs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="hint">
              {shown.length} of {cads.length} CADs
            </span>
            {canCad && (
              <button type="button" className="btn btn--primary" onClick={() => setForm({ start: {} })}>
                New CAD
              </button>
            )}
          </div>
          {!loading && shown.length === 0 && (
            <p className="table-empty cad-empty">{cads.length ? 'No CAD matches the search.' : 'No CAD has been made yet.'}</p>
          )}
          {shown.map(({ cad, sample }) => (
            <CadCard
              key={cad.id}
              cad={cad}
              sample={sample}
              data={data}
              lookups={lookups}
              canCad={canCad}
              canFabric={canWorkOn(sample, data, profile)}
              onEdit={(item) => setForm({ cad: item })}
              onCopy={(item, itemSample) => setForm({ start: { sample: itemSample, copyFrom: item } })}
              onAssign={(item, itemSample) => setAssign({ cadId: item.id, sampleId: itemSample.id })}
              onFabric={(item, itemSample) => setFabricFor({ cadId: item.id, sampleId: itemSample.id })}
              onPrimary={(itemSample, sizeRatioId) => setPrimary({ sampleId: itemSample.id, sizeRatioId })}
            />
          ))}
        </>
      )}
      {tab === 'pending' && (
        <>
          <p className="tab-note">
            Wishlist items with no CAD assigned yet. A CAD of the same sample, size and ratio can be assigned, or a new
            one made. An item leaves this list once a CAD is assigned. Approved samples not in the wishlist yet are
            listed too, until their first CAD is made.
          </p>
          <DataTable
            tableId="cad-pending-drawing"
            title="Pending drawing"
            columns={pendingColumns}
            rows={pending}
            loading={loading}
            emptyText="No wishlist item is waiting for a CAD."
            searchPlaceholder="Search wishlist items…"
          />
        </>
      )}
      {tab === 'fabric' && (
        <>
          <p className="tab-note">CADs of the samples you look after, with drawing rows that still have no fabric.</p>
          <DataTable
            tableId="cad-fabric-pending"
            title="CADs waiting for fabric"
            columns={fabricColumns}
            rows={fabricPending.map((item) => ({ ...item, id: item.cad.id }))}
            loading={loading}
            emptyText="No CAD is waiting for its fabric."
            searchPlaceholder="Search CADs…"
          />
        </>
      )}
      {tab === 'rows' && (
        <DataTable
          tableId="cad-all-rows"
          title="CAD drawing rows"
          columns={rowColumns}
          rows={allRows}
          loading={loading}
          emptyText="No CAD has been made yet."
          searchPlaceholder="Search drawing rows…"
        />
      )}

      {form && (
        <CadForm
          cad={form.cad}
          start={form.start}
          data={data}
          onClose={() => setForm(null)}
          onSaved={(numbers, link) => {
            let message = numbers.length ? `Saved ${numbers.join(', ')}.` : ''
            let note = ''
            if (link?.assigned) note = `${link.assigned} is assigned to ${link.entry.wishlist_no}.`
            else if (link?.problem) note = `It could not be assigned to ${link.entry.wishlist_no}: ${link.problem} Please assign it from here.`
            else if (link?.entry && numbers.length) note = `Not assigned to ${link.entry.wishlist_no}, as the sample, size or ratio is different.`
            if (note) message += ` ${note}`
            if (!form.cad && numbers.length) {
              setDoneBox({
                title: numbers.length > 1 ? 'CADs created' : 'CAD created',
                text: numbers.length > 1 ? 'The CAD drawings were created. Their numbers are' : 'The CAD drawing was created. Its number is',
                number: numbers,
                note,
              })
            }
            return done(message)
          }}
          onPrimary={(sample, sizeRatioId) => setPrimary({ sampleId: sample.id, sizeRatioId })}
        />
      )}
      {fabricCad && (
        <CadFabricDialog
          cad={fabricCad}
          data={data}
          lookups={lookups}
          onClose={() => setFabricFor(null)}
          onSaved={() => done(`Fabric of ${fabricCad.cad_no} saved.`)}
        />
      )}
      {assignSample && (
        <CadAssignDialog
          cad={assign.cadId ? assignSample.cads.find((cad) => cad.id === assign.cadId) : null}
          entry={assign.entryId ? assignSample.wishlist.find((entry) => entry.id === assign.entryId) : null}
          sample={assignSample}
          lookups={lookups}
          onClose={() => setAssign(null)}
          onSaved={(result) => {
            const list = result.names.join(', ')
            setDoneBox({
              title: 'Assignment saved',
              text: result.byCad ? 'CAD drawing' : 'Wishlist item',
              number: result.number,
              note: result.byCad
                ? list
                  ? `is assigned to ${list}.`
                  : 'is not assigned to any wishlist item now.'
                : list
                  ? `has ${list} assigned.`
                  : 'has no CAD assigned now.',
            })
            return done('Assignment saved.')
          }}
        />
      )}
      {primarySample && (
        <PrimaryAccessoryDialog
          sample={primarySample}
          sizeRatioId={primary.sizeRatioId}
          data={data}
          canEdit={canCad}
          onClose={() => setPrimary(null)}
          onSaved={async () => {
            const count = primaryLinesFor(primarySample, primary.sizeRatioId).length
            setPrimary(null)
            setNotice(count ? 'Primary accessory list changed.' : 'Primary accessory list added.')
            await reload()
          }}
        />
      )}
      {viewing && <SampleDetail sample={viewing} data={data} onChanged={reload} onClose={() => setViewingId(null)} />}
      {doneBox && <DoneBox {...doneBox} onClose={() => setDoneBox(null)} />}
    </>
  )
}
