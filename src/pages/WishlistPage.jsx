import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import Tabs from '../components/Tabs.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { nameMap, useLoad } from '../lib/data.js'
import { formatDate, formatDateTime, friendlyError } from '../lib/format.js'
import { BUCKET, isApproved, latestImage, loadSampleData } from '../lib/sampleData.js'
import { setsText, wishlistKind } from '../lib/wishlist.js'
import SampleDetail from './SampleDetail.jsx'
import { WishlistCorrectDialog, WishlistDialog } from './WishlistParts.jsx'

// Columns that say which sample a row is about.
function sampleColumns(lookups, onOpen, getSample) {
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
        return (
          image && (
            <ClickableImage
              bucket={BUCKET}
              path={image.path}
              alt={`${getSample(row).sample_no} ${image.label.toLowerCase()} image`}
              size={44}
            />
          )
        )
      },
    },
  ]
}

const contextColumns = (lookups, getSample) => [
  { key: 'designer', header: 'DESIGNER', value: (row) => lookups.person.get(getSample(row).designer_id) ?? '' },
  { key: 'product_type', header: 'PRODUCT TYPE', value: (row) => lookups.productType.get(getSample(row).product_type_id) ?? '' },
  { key: 'collection', header: 'COLLECTION', value: (row) => lookups.collection.get(getSample(row).collection_id) ?? '' },
]

// The wishlist: what approved samples are to be produced in.
//   Wishlist       - every entry
//   Newly approved - samples with final approval Yes that are not in the wishlist yet
//   Add repeat     - samples already in the wishlist, to add another entry
// Entries are added by the people who approve samples.
export default function WishlistPage() {
  const { profile, isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [viewingId, setViewingId] = useState(null)
  const [adding, setAdding] = useState(null) // the sample being added to the wishlist
  const [correcting, setCorrecting] = useState(null) // the entry being corrected
  const [notice, setNotice] = useState('')
  const [params, setParams] = useSearchParams()

  const samples = useMemo(() => data?.samples ?? [], [data])
  const viewing = samples.find((sample) => sample.id === viewingId)
  const canAdd = Boolean(data?.access.management)

  const lookups = useMemo(
    () => ({
      person: nameMap(data?.people),
      productType: nameMap(data?.productTypes),
      collection: nameMap(data?.collections),
      combination: new Map((data?.sizeRatios ?? []).map((row) => [row.id, row])),
    }),
    [data],
  )

  const entries = useMemo(
    () => samples.flatMap((sample) => sample.wishlist.map((entry) => ({ ...entry, sample }))),
    [samples],
  )
  const newlyApproved = useMemo(
    () => samples.filter((sample) => isApproved(sample) && sample.wishlist.length === 0),
    [samples],
  )
  const inWishlist = useMemo(() => samples.filter((sample) => sample.wishlist.length > 0), [samples])

  const tabs = [
    { key: 'entries', label: 'Wishlist', count: entries.length },
    (canAdd || newlyApproved.length > 0) && { key: 'new', label: 'Newly approved', count: newlyApproved.length },
    canAdd && { key: 'repeat', label: 'Add repeat' },
  ].filter(Boolean)
  const wanted = params.get('tab') ?? 'entries'
  const tab = tabs.some((item) => item.key === wanted) ? wanted : 'entries'

  const openSample = useCallback((sample) => setViewingId(sample.id), [])

  const entryColumns = useMemo(
    () => [
      { key: 'wishlist_no', header: 'WISHLIST ID', value: (row) => row.wishlist_no },
      ...sampleColumns(lookups, openSample, (row) => row.sample),
      {
        key: 'kind',
        header: 'TYPE',
        value: (row) => wishlistKind(row),
        render: (row) => (
          <span className={`badge badge--${row.repeat_no === 0 ? 'completed' : 'maybe'}`}>{wishlistKind(row)}</span>
        ),
      },
      { key: 'size', header: 'SIZE', value: (row) => lookups.combination.get(row.size_ratio_id)?.size ?? '' },
      { key: 'ratio', header: 'RATIO', value: (row) => lookups.combination.get(row.size_ratio_id)?.ratio ?? '' },
      { key: 'qty', header: 'QTY (PCS)', align: 'right', value: (row) => row.qty },
      {
        key: 'sets',
        header: 'SETS',
        value: (row) => setsText(row.qty, lookups.combination.get(row.size_ratio_id)?.pieces_per_set),
      },
      ...contextColumns(lookups, (row) => row.sample),
      { key: 'added_by', header: 'ADDED BY', value: (row) => lookups.person.get(row.created_by) ?? '' },
      {
        key: 'added_on',
        header: 'ADDED ON',
        value: (row) => formatDateTime(row.created_at),
        sortValue: (row) => row.created_at,
      },
      ...(isAdmin
        ? [
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <button type="button" className="btn btn--small" onClick={() => setCorrecting(row)}>
                  Edit
                </button>
              ),
            },
          ]
        : []),
    ],
    [lookups, openSample, isAdmin],
  )

  const newColumns = useMemo(
    () => [
      ...sampleColumns(lookups, openSample, (row) => row),
      {
        key: 'approved_on',
        header: 'FINAL APPROVAL ON',
        value: (row) => formatDate(row.approvals.final?.decided_at?.slice(0, 10)),
        sortValue: (row) => row.approvals.final?.decided_at ?? '',
      },
      { key: 'approved_by', header: 'APPROVED BY', value: (row) => lookups.person.get(row.approvals.final?.decided_by) ?? '' },
      ...contextColumns(lookups, (row) => row),
      ...(canAdd
        ? [
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <button type="button" className="btn btn--small btn--primary" onClick={() => setAdding(row)}>
                  Add to wishlist
                </button>
              ),
            },
          ]
        : []),
    ],
    [lookups, openSample, canAdd],
  )

  const repeatColumns = useMemo(
    () => [
      ...sampleColumns(lookups, openSample, (row) => row),
      { key: 'times', header: 'TIMES IN WISHLIST', align: 'right', value: (row) => row.wishlist.length },
      { key: 'last', header: 'LAST WISHLIST ID', value: (row) => row.wishlist[row.wishlist.length - 1].wishlist_no },
      {
        key: 'total',
        header: 'TOTAL QTY (PCS)',
        align: 'right',
        value: (row) => row.wishlist.reduce((sum, entry) => sum + entry.qty, 0),
      },
      ...contextColumns(lookups, (row) => row),
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <button type="button" className="btn btn--small btn--primary" onClick={() => setAdding(row)}>
            Add repeat
          </button>
        ),
      },
    ],
    [lookups, openSample],
  )

  return (
    <>
      <PageHead
        title="Wishlist"
        note="What approved samples are to be produced in: size, ratio and quantity. The first entry of a sample is NEW, every later one a repeat."
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
        label="Wishlist views"
        onChange={(key) => setParams(key === 'entries' ? {} : { tab: key }, { replace: true })}
      />
      {tab === 'entries' && (
        <DataTable
          tableId="wishlist-entries"
          title="Wishlist"
          columns={entryColumns}
          rows={entries}
          loading={loading}
          emptyText="Nothing is in the wishlist yet."
          searchPlaceholder="Search the wishlist…"
        />
      )}
      {tab === 'new' && (
        <>
          <p className="tab-note">
            Samples with final approval Yes that have not been added to the wishlist yet. A sample leaves this list
            once its first entry is added.
          </p>
          <DataTable
            tableId="wishlist-newly-approved"
            title="Newly approved samples"
            columns={newColumns}
            rows={newlyApproved}
            loading={loading}
            emptyText="No approved sample is waiting to be added to the wishlist."
            searchPlaceholder="Search samples…"
          />
        </>
      )}
      {tab === 'repeat' && (
        <>
          <p className="tab-note">Samples that are already in the wishlist. Add another entry here; it becomes a repeat.</p>
          <DataTable
            tableId="wishlist-add-repeat"
            title="Samples in the wishlist"
            columns={repeatColumns}
            rows={inWishlist}
            loading={loading}
            emptyText="No sample is in the wishlist yet."
            searchPlaceholder="Search samples…"
          />
        </>
      )}
      {adding && (
        <WishlistDialog
          sample={adding}
          data={data}
          onClose={() => setAdding(null)}
          onSaved={async (given) => {
            setAdding(null)
            setNotice(given.length ? `Added to the wishlist: ${given.join(', ')}.` : 'Added to the wishlist.')
            await reload()
          }}
        />
      )}
      {correcting && (
        <WishlistCorrectDialog
          entry={correcting}
          data={data}
          onClose={() => setCorrecting(null)}
          onSaved={async () => {
            const number = correcting.wishlist_no
            setCorrecting(null)
            setNotice(`${number} changed.`)
            await reload()
          }}
        />
      )}
      {viewing && <SampleDetail sample={viewing} data={data} onChanged={reload} onClose={() => setViewingId(null)} />}
    </>
  )
}
