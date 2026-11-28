import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import DoneBox from '../components/DoneBox.jsx'
import Tabs from '../components/Tabs.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import {
  FABRIC_TYPE_LABEL,
  byProductText,
  formatByProduct,
  cadsOfEntry,
  hasFabricDetails,
  missingFabricDetails,
  primaryDetailsPending,
  primaryLinesFor,
  primaryListState,
  rowByProduct,
  rowsMissingFabricDetails,
  sizeLabel,
} from '../lib/cad.js'
import { nameMap, useLoad } from '../lib/data.js'
import { friendlyError } from '../lib/format.js'
import { BUCKET, canWorkOn, isReadyForCad, latestImage, loadSampleData } from '../lib/sampleData.js'
import { CadCard, CadFabricDialog, CadForm, PrimaryAccessoryDialog } from './CadParts.jsx'
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
//   Pending drawing - wishlist items with no CAD of their sample, size and ratio yet,
//                     and approved samples that have neither a wishlist item nor a CAD
// A wishlist item picks up every CAD of its sample, size and ratio by itself.
//   Accessory pending - for the CAD team: a sample and size with a CAD whose primary
//                     accessory list is not added, or has details still to fill
//   Fabric pending  - CADs with a row whose fabric, vendor or rate is still missing;
//                     inside it: All, and Partly filled (some details are in)
//   All rows        - every drawing row in one list, to filter and export
export default function CadPage() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [viewingId, setViewingId] = useState(null)
  const [form, setForm] = useState(null) // { cad } to edit, { start } for new
  const [fabricFor, setFabricFor] = useState(null) // { cadId, sampleId }
  const [primary, setPrimary] = useState(null) // { sampleId, sizeRatioId }
  const [notice, setNotice] = useState('')
  const [accessoryView, setAccessoryView] = useState('all') // inside Accessory pending: 'all', 'none' or 'details'
  const [fabricView, setFabricView] = useState('all') // inside Fabric pending: 'all' or 'partial'
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
          return isReadyForCad(sample) && sample.cads.length === 0
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
        ? cads.filter(({ cad, sample }) => rowsMissingFabricDetails(cad).length > 0 && canWorkOn(sample, data, profile))
        : [],
    [cads, data, profile],
  )
  const allRows = useMemo(() => cads.flatMap(({ cad, sample }) => cad.rows.map((row) => ({ ...row, cad, sample }))), [cads])
  // One row per sample + size (and ratio) that has a CAD, while its primary accessory
  // list is not added yet or still has an accessory with details pending.
  const accessoryPending = useMemo(
    () =>
      samples.flatMap((sample) =>
        [...new Set(sample.cads.map((cad) => cad.size_ratio_id))]
          .map((sizeRatioId) => {
            const lines = primaryLinesFor(sample, sizeRatioId)
            return {
              id: `${sample.id}-${sizeRatioId}`,
              sample,
              sizeRatioId,
              lines,
              state: primaryListState(lines),
              cadNos: sample.cads.filter((cad) => cad.size_ratio_id === sizeRatioId).map((cad) => cad.cad_no),
            }
          })
          .filter((row) => row.state !== 'added'),
      ),
    [samples],
  )
  const accessoryShown = accessoryView === 'all' ? accessoryPending : accessoryPending.filter((row) => (accessoryView === 'none' ? row.state === 'pending' : row.state === 'details'))
  const fabricPartial = useMemo(() => fabricPending.filter(({ cad }) => hasFabricDetails(cad)), [fabricPending])
  const fillsFabric = Boolean(data?.access.manages) || fabricPending.length > 0 || samples.some((sample) => sample.designer_id === profile.id)

  const tabs = [
    { key: 'cads', label: 'CAD drawings', count: cads.length },
    { key: 'pending', label: 'Pending drawing', count: pending.length },
    fillsFabric && { key: 'fabric', label: 'Fabric pending', count: fabricPending.length },
    canCad && { key: 'accessory', label: 'Accessory pending', count: accessoryPending.length },
    { key: 'rows', label: 'All rows' },
  ].filter(Boolean)
  const wanted = params.get('tab') ?? 'cads'
  const tab = tabs.some((item) => item.key === wanted) ? wanted : 'cads'

  const openSample = useCallback((sample) => setViewingId(sample.id), [])
  const done = async (message) => {
    setForm(null)
    setFabricFor(null)
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
      ...(canCad
        ? [
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <span className="row-actions">
                  <button
                    type="button"
                    className="btn btn--small btn--primary"
                    onClick={() =>
                      setForm({
                        start: { sample: row.sample, sizeRatioId: row.size_ratio_id },
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
        header: 'WHAT IS MISSING',
        value: (row) =>
          rowsMissingFabricDetails(row.cad).map((item) => `${lookups.particular.get(item.particular_id)}: ${missingFabricDetails(item).join(', ')}`),
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
      { key: 'by_products', header: 'BY-PRODUCTS', value: (row) => (row.by_products ?? []).map(byProductText) },
      { key: 'by_product_mtr', header: 'BY-PRODUCT (MTR / PC)', align: 'right', value: (row) => (rowByProduct(row) > 0 ? formatByProduct(rowByProduct(row)) : '') },
    ],
    [lookups, openSample],
  )

  const accessoryColumns = useMemo(
    () =>
      lookups
        ? [
            ...sampleColumns(openSample, (row) => row.sample),
            { key: 'size', header: 'SIZE', value: (row) => lookups.combination.get(row.sizeRatioId)?.size ?? '' },
            { key: 'ratio', header: 'RATIO', value: (row) => lookups.combination.get(row.sizeRatioId)?.ratio ?? '' },
            { key: 'cads', header: 'CADS', value: (row) => row.cadNos },
            {
              key: 'state',
              header: 'ACCESSORY LIST',
              value: (row) => (row.state === 'pending' ? 'Not added' : 'Details pending'),
              render: (row) => <span className="badge badge--pending">{row.state === 'pending' ? 'Not added' : 'Details pending'}</span>,
            },
            {
              key: 'waiting',
              header: 'DETAILS PENDING FOR',
              value: (row) => row.lines.filter(primaryDetailsPending).map((line) => data.accessories.find((item) => item.id === line.accessory_id)?.name ?? ''),
            },
            {
              key: 'actions',
              header: '',
              render: (row) => (
                <button type="button" className="btn btn--small btn--primary" onClick={() => setPrimary({ sampleId: row.sample.id, sizeRatioId: row.sizeRatioId })}>
                  {row.state === 'pending' ? 'Add accessory list' : 'Fill details'}
                </button>
              ),
            },
          ]
        : [],
    [lookups, openSample, data],
  )
  const viewing = sampleOf(viewingId)
  const fabricSample = fabricFor && sampleOf(fabricFor.sampleId)
  const fabricCad = fabricSample?.cads.find((cad) => cad.id === fabricFor.cadId)
  const primarySample = primary && sampleOf(primary.sampleId)

  return (
    <>
      <PageHead
        title="CAD drawings"
        note="One CAD per sample and size, with a row for every drawing. Every wishlist item of the same sample, size and ratio uses it by itself; nothing needs assigning."
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
              onFabric={(item, itemSample) => setFabricFor({ cadId: item.id, sampleId: itemSample.id })}
              onPrimary={(itemSample, sizeRatioId) => setPrimary({ sampleId: itemSample.id, sizeRatioId })}
            />
          ))}
        </>
      )}
      {tab === 'pending' && (
        <>
          <p className="tab-note">
            Wishlist items with no CAD of their sample, size and ratio yet. Once that CAD is made, every wishlist item
            of that sample, size and ratio leaves this list. Approved samples not in the wishlist yet are listed too,
            until their first CAD is made.
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
      {tab === 'accessory' && (
        <>
          <p className="tab-note">
            A sample and size that has a CAD, while its primary accessory list is not added yet, or has an accessory whose
            details are still to be filled.
          </p>
          <Tabs
            sub
            label="Accessory pending views"
            tabs={[
              { key: 'all', label: 'All', count: accessoryPending.length },
              { key: 'none', label: 'Not added', count: accessoryPending.filter((row) => row.state === 'pending').length },
              { key: 'details', label: 'Details pending', count: accessoryPending.filter((row) => row.state === 'details').length },
            ]}
            value={accessoryView}
            onChange={setAccessoryView}
          />
          <DataTable
            tableId="cad-accessory-pending"
            title="Primary accessory lists waiting"
            columns={accessoryColumns}
            rows={accessoryShown}
            loading={loading}
            emptyText="No primary accessory list is waiting."
          />
        </>
      )}
      {tab === 'fabric' && (
        <>
          <p className="tab-note">
            CADs of the samples you look after, with a drawing row whose fabric, vendor or rate is still missing. Partly
            filled shows the ones where some of these are already entered.
          </p>
          <Tabs
            sub
            label="Fabric pending views"
            tabs={[
              { key: 'all', label: 'All', count: fabricPending.length },
              { key: 'partial', label: 'Partly filled', count: fabricPartial.length },
            ]}
            value={fabricView}
            onChange={setFabricView}
          />
          <DataTable
            tableId="cad-fabric-pending"
            title="CADs waiting for fabric"
            columns={fabricColumns}
            rows={(fabricView === 'partial' ? fabricPartial : fabricPending).map((item) => ({ ...item, id: item.cad.id }))}
            loading={loading}
            emptyText={fabricView === 'partial' ? 'No CAD has its fabric details partly filled.' : 'No CAD is waiting for its fabric details.'}
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
          onSaved={(numbers, serves) => {
            const message = numbers.length ? `Saved ${numbers.join(', ')}.` : ''
            const note = serves.length ? `Used by wishlist ${serves.length > 1 ? 'items' : 'item'} ${serves.join(', ')}.` : 'No wishlist item of this size and ratio yet.'
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
