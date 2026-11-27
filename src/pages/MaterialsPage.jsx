import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import Tabs from '../components/Tabs.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { nameMap, useLoad } from '../lib/data.js'
import { friendlyError } from '../lib/format.js'
import { cadsOfEntry } from '../lib/cad.js'
import { KINDS, KIND_LABEL, LIST_STATUS_LABEL, listOrdered, listProgress, listStatus } from '../lib/materials.js'
import { BUCKET, canWorkOn, latestImage, loadSampleData } from '../lib/sampleData.js'
import { ListStatusBadge, MaterialListDialog } from './MaterialParts.jsx'
import { PoForm } from './PoParts.jsx'
import SampleDetail from './SampleDetail.jsx'

const NOTES = {
  primary_fabric: 'Wishlist items whose primary fabric is still to be listed or ordered. This comes first: the other three lists wait for it.',
  primary_accessory: 'Wishlist items whose primary fabric is done, and whose primary accessories are still to be listed or ordered.',
  secondary_fabric: 'Wishlist items whose primary fabric is done, and whose secondary fabric is still to be listed or ordered.',
  secondary_accessory: 'Wishlist items whose primary fabric is done, and whose secondary accessories are still to be listed or ordered.',
}

// Material lists: what has to be bought for every wishlist item, in four
// lists, and the purchase orders raised from them.
//   A list is Pending until it is confirmed, Updated once confirmed, and
//   Ordered when every material has a PO or is marked not required.
export default function MaterialsPage() {
  const { profile, isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [viewingId, setViewingId] = useState(null)
  const [opened, setOpened] = useState(null) // { entryId, kind } - the list on screen
  const [raising, setRaising] = useState(null) // { family, vendorId } - the PO being raised from it
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState('')
  const [params, setParams] = useSearchParams()

  const samples = useMemo(() => data?.samples ?? [], [data])
  const viewing = samples.find((sample) => sample.id === viewingId)
  const entries = useMemo(
    () => samples.flatMap((sample) => sample.wishlist.map((entry) => ({ ...entry, sample }))),
    [samples],
  )
  const lookups = useMemo(
    () => ({
      person: nameMap(data?.people),
      combination: new Map((data?.sizeRatios ?? []).map((row) => [row.id, row])),
    }),
    [data],
  )

  // Primary fabric comes first. The other lists wait until it is ordered.
  const pending = useMemo(() => {
    const lists = {}
    KINDS.forEach(({ key }) => {
      lists[key] = entries.filter(
        (entry) =>
          !listOrdered(entry, key) && (key === 'primary_fabric' || listOrdered(entry, 'primary_fabric')),
      )
    })
    return lists
  }, [entries])

  const tabs = [
    ...KINDS.map((kind) => ({ key: kind.key, label: `${kind.label} pending`, count: pending[kind.key].length })),
    { key: 'all', label: 'All wishlist items', count: entries.length },
  ]
  const wanted = params.get('tab') ?? 'primary_fabric'
  const tab = tabs.some((item) => item.key === wanted) ? wanted : 'primary_fabric'

  const openSample = useCallback((sample) => setViewingId(sample.id), [])
  const openList = useCallback((entry, kind) => {
    setNotice('')
    setOpened({ entryId: entry.id, kind })
  }, [])

  const columns = useMemo(() => {
    const first = [
      { key: 'wishlist_no', header: 'WISHLIST ID', value: (row) => row.wishlist_no },
      {
        key: 'sample_no',
        header: 'SAMPLE NO',
        value: (row) => row.sample.sample_no,
        render: (row) => (
          <button type="button" className="link link--strong" onClick={() => openSample(row.sample)}>
            {row.sample.sample_no}
          </button>
        ),
      },
      { key: 'design_no', header: 'DESIGN NO', value: (row) => row.sample.design_no ?? '' },
      {
        key: 'image',
        header: 'IMAGE',
        value: (row) => latestImage(row.sample)?.label ?? '',
        render: (row) => {
          const image = latestImage(row.sample)
          return image && <ClickableImage bucket={BUCKET} path={image.path} alt={`${row.sample.sample_no} ${image.label.toLowerCase()} image`} size={44} />
        },
      },
      { key: 'size', header: 'SIZE', value: (row) => lookups.combination.get(row.size_ratio_id)?.size ?? '' },
      { key: 'ratio', header: 'RATIO', value: (row) => lookups.combination.get(row.size_ratio_id)?.ratio ?? '' },
      { key: 'qty', header: 'QTY (PCS)', align: 'right', value: (row) => row.qty },
      {
        key: 'cad',
        header: 'CAD DRAWINGS',
        value: (row) => (cadsOfEntry(row.sample, row).length ? cadsOfEntry(row.sample, row).map((cad) => cad.cad_no) : 'Pending'),
      },
    ]
    const statusColumn = (kind) => ({
      key: kind.key,
      header: kind.short,
      value: (row) => LIST_STATUS_LABEL[listStatus(row, kind.key)],
      render: (row) => (
        <button type="button" className="link material-status" aria-label={`${kind.label} list of ${row.wishlist_no}`} onClick={() => openList(row, kind.key)}>
          <ListStatusBadge entry={row} kind={kind.key} />
        </button>
      ),
    })
    const last = [{ key: 'designer', header: 'DESIGNER', value: (row) => lookups.person.get(row.sample.designer_id) ?? '' }]
    if (tab === 'all') return [...first, ...KINDS.map(statusColumn), ...last]
    const kind = KINDS.find((item) => item.key === tab)
    return [
      ...first,
      statusColumn(kind),
      { key: 'progress', header: 'PROGRESS', value: (row) => listProgress(row, tab) },
      ...last,
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <button type="button" className="btn btn--small btn--primary" onClick={() => openList(row, tab)}>
            Open list
          </button>
        ),
      },
    ]
  }, [tab, lookups, openSample, openList])

  const openedEntry = opened && entries.find((entry) => entry.id === opened.entryId)

  return (
    <>
      <PageHead
        title="Material lists"
        note="What has to be bought for every wishlist item: primary and secondary fabric, primary and secondary accessories. Confirm a list, then raise its POs or mark a material not required."
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
      <Tabs
        tabs={tabs}
        value={tab}
        label="Material list views"
        onChange={(key) => setParams(key === 'primary_fabric' ? {} : { tab: key }, { replace: true })}
      />
      <p className="tab-note">
        {tab === 'all' ? 'Every wishlist item with its four lists. Click a status to open that list.' : NOTES[tab]}
      </p>
      <DataTable
        key={tab}
        tableId={`materials-${tab}`}
        title={tab === 'all' ? 'Material lists' : `${KIND_LABEL[tab]} pending`}
        columns={columns}
        rows={tab === 'all' ? entries : pending[tab]}
        loading={loading}
        emptyText={tab === 'all' ? 'Nothing is in the wishlist yet.' : 'Nothing is pending here.'}
        searchPlaceholder="Search wishlist items…"
      />
      {openedEntry && !raising && (
        <MaterialListDialog
          key={`${opened.entryId}-${opened.kind}-${version}`}
          entry={openedEntry}
          sample={openedEntry.sample}
          kind={opened.kind}
          data={data}
          canEdit={canWorkOn(openedEntry.sample, data, profile)}
          isAdmin={isAdmin}
          onClose={() => setOpened(null)}
          onChanged={async (message) => {
            await reload()
            setNotice(message)
            setVersion((number) => number + 1)
          }}
          onRaise={setRaising}
        />
      )}
      {openedEntry && raising && (
        <PoForm
          entry={openedEntry}
          family={raising.family}
          vendorId={raising.vendorId}
          data={data}
          onClose={() => setRaising(null)}
          onSaved={async (number) => {
            await reload()
            setRaising(null)
            setNotice(`${number} raised.`)
            setVersion((value) => value + 1)
          }}
        />
      )}
      {viewing && <SampleDetail sample={viewing} data={data} onChanged={reload} onClose={() => setViewingId(null)} />}
    </>
  )
}
