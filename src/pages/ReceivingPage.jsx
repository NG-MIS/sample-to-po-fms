import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DataTable from '../components/DataTable.jsx'
import Tabs from '../components/Tabs.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useLoad } from '../lib/data.js'
import { formatDate, friendlyError, todayLocal } from '../lib/format.js'
import { formatQty, poLineName, poLookups, poVendor } from '../lib/materials.js'
import {
  LINE_STATUS_BADGE,
  LINE_STATUS_LABEL,
  PO_RECEIVE_BADGE,
  PO_RECEIVE_LABEL,
  RECEIVE_KINDS,
  canFollowUp,
  daysLate,
  lineDetails,
  lineStatus,
  poReceiveStatus,
  promisedDateOf,
  receivedName,
} from '../lib/receiving.js'
import { loadSampleData } from '../lib/sampleData.js'
import { PoTrackDialog } from './ReceivingParts.jsx'

const NOTES = {
  pending: 'POs raised and not received at all yet.',
  late: 'POs past their promised date and not fully received. The promised date is the one from the latest follow-up that gave one, otherwise the one on the PO.',
  part: 'POs of which something has come and more is expected.',
  received: 'POs fully received, or closed short.',
  lots: 'Every lot number given, colour by colour, with what was ordered and what has come.',
}

// Receiving of one kind of material: fabric or accessory. Each kind has its
// own screen and its own store department.
//   kind - 'fabric' or 'accessory'
export default function ReceivingPage({ kind }) {
  const { profile, isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [openId, setOpenId] = useState(null)
  const [notice, setNotice] = useState('')
  const [params, setParams] = useSearchParams()
  const info = RECEIVE_KINDS[kind]
  const today = todayLocal()

  const allowance = data?.purchaseSettings?.receive_allowance ?? 0
  const lookups = useMemo(() => (data ? poLookups(data) : null), [data])
  const orders = useMemo(() => (data?.purchaseOrders ?? []).filter((po) => po.kind === kind && po.status === 'raised'), [data, kind])
  const byStatus = useMemo(() => {
    const lists = { pending: [], part: [], received: [], late: [] }
    orders.forEach((po) => {
      lists[poReceiveStatus(po, allowance)].push(po)
      if (daysLate(po, allowance, today) > 0) lists.late.push(po)
    })
    return lists
  }, [orders, allowance, today])
  // one row per lot number and colour
  const lots = useMemo(
    () =>
      orders.flatMap((po) =>
        po.lines
          .filter((line) => line.lot_no)
          .flatMap((line) => lineDetails(line, allowance).map((colour) => ({ ...colour, id: `${line.id}:${colour.no}`, line, po }))),
      ),
    [orders, allowance],
  )
  const opened = orders.find((po) => po.id === openId)
  const canReceive = Boolean(data?.access.receive[kind])

  const tabs = [
    { key: 'pending', label: 'Pending', count: byStatus.pending.length },
    { key: 'late', label: 'Late', count: byStatus.late.length },
    { key: 'part', label: 'Partly received', count: byStatus.part.length },
    { key: 'received', label: 'Received', count: byStatus.received.length },
    { key: 'lots', label: 'All lots', count: lots.length },
  ]
  const wanted = params.get('tab') ?? 'pending'
  const tab = tabs.some((item) => item.key === wanted) ? wanted : 'pending'

  const poColumns = useMemo(() => {
    if (!lookups) return []
    const lastFollowup = (po) => po.followups[po.followups.length - 1]
    return [
      {
        key: 'po_no',
        header: 'PO NO',
        value: (row) => row.po_no,
        sortValue: (row) => row.sl_no,
        render: (row) => (
          <button type="button" className="link link--strong" onClick={() => setOpenId(row.id)}>
            {row.po_no}
          </button>
        ),
      },
      { key: 'order_date', header: 'ORDER DATE', value: (row) => formatDate(row.order_date), sortValue: (row) => row.order_date },
      { key: 'vendor_code', header: 'VENDOR CODE', value: (row) => poVendor(row, lookups)?.code ?? '' },
      { key: 'vendor', header: 'VENDOR NAME', value: (row) => poVendor(row, lookups)?.name ?? '' },
      { key: 'open', header: 'OPEN ORDER', value: (row) => (row.is_open ? 'Yes' : 'No') },
      { key: 'wishlist_no', header: 'WISHLIST ID', value: (row) => lookups.entry.get(row.wishlist_entry_id)?.wishlist_no ?? '' },
      { key: 'sample_no', header: 'SAMPLE NO', value: (row) => lookups.sample.get(row.sample_id)?.sample_no ?? '' },
      { key: 'design_no', header: 'DESIGN NO', value: (row) => lookups.sample.get(row.sample_id)?.design_no ?? '' },
      { key: 'items', header: 'ITEMS', value: (row) => [...new Set(row.lines.map((line) => poLineName(line, lookups)))] },
      { key: 'lots', header: 'LOT NO', value: (row) => row.lines.map((line) => line.lot_no).filter(Boolean) },
      { key: 'promised', header: 'PROMISED DATE', value: (row) => formatDate(promisedDateOf(row)), sortValue: (row) => promisedDateOf(row) ?? '' },
      { key: 'late', header: 'LATE BY (DAYS)', align: 'right', value: (row) => daysLate(row, allowance, today) || '' },
      {
        key: 'status',
        header: 'RECEIVING',
        value: (row) => PO_RECEIVE_LABEL[poReceiveStatus(row, allowance)],
        render: (row) => {
          const status = poReceiveStatus(row, allowance)
          return <span className={`badge badge--${PO_RECEIVE_BADGE[status]}`}>{PO_RECEIVE_LABEL[status]}</span>
        },
      },
      { key: 'receipts', header: 'RECEIPTS', align: 'right', value: (row) => row.receipts.length || '' },
      { key: 'followups', header: 'FOLLOW-UPS', align: 'right', value: (row) => row.followups.length || '' },
      { key: 'last_followup', header: 'LAST FOLLOW-UP', value: (row) => (lastFollowup(row) ? `${formatDate(lastFollowup(row).followup_date)}: ${lastFollowup(row).remark}` : '') },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => {
          const status = poReceiveStatus(row, allowance)
          const label = canReceive && status !== 'received' ? 'Receive' : canFollowUp(row, data, profile) && status !== 'received' ? 'Follow up' : 'Open'
          return (
            <button type="button" className={`btn btn--small ${label === 'Open' ? '' : 'btn--primary'}`} onClick={() => setOpenId(row.id)}>
              {label}
            </button>
          )
        },
      },
    ]
  }, [lookups, allowance, today, canReceive, data, profile])

  const lotColumns = useMemo(() => {
    if (!lookups) return []
    return [
      { key: 'lot', header: 'LOT NO', value: (row) => row.lot },
      {
        key: 'po_no',
        header: 'PO NO',
        value: (row) => row.po.po_no,
        render: (row) => (
          <button type="button" className="link link--strong" onClick={() => setOpenId(row.po.id)}>
            {row.po.po_no}
          </button>
        ),
      },
      { key: 'vendor_code', header: 'VENDOR CODE', value: (row) => poVendor(row.po, lookups)?.code ?? '' },
      { key: 'ordered_item', header: 'ITEM ORDERED', value: (row) => poLineName(row.line, lookups) },
      { key: 'received_item', header: 'ITEM RECEIVED', value: (row) => receivedName(row.line, lookups) },
      { key: 'dimension', header: 'DIMENSION', value: (row) => row.line.dimension ?? '' },
      { key: 'colour', header: 'COLOUR', value: (row) => row.colour },
      { key: 'ordered', header: 'ORDERED', align: 'right', value: (row) => Number(formatQty(row.ordered)) },
      { key: 'received', header: 'RECEIVED', align: 'right', value: (row) => Number(formatQty(row.received)) },
      { key: 'balance', header: 'BALANCE', align: 'right', value: (row) => Number(formatQty(row.balance)) },
      { key: 'excess', header: 'EXCESS', align: 'right', value: (row) => (row.excess > 0 ? Number(formatQty(row.excess)) : '') },
      { key: 'unit', header: 'UNIT', value: (row) => row.line.unit },
      {
        key: 'status',
        header: 'STATUS',
        value: (row) => (row.status !== 'received' && row.line.completed_at ? LINE_STATUS_LABEL.short : LINE_STATUS_LABEL[row.status]),
        render: (row) => {
          const status = row.status !== 'received' && row.line.completed_at ? 'short' : row.status
          return <span className={`badge badge--${LINE_STATUS_BADGE[status]}`}>{LINE_STATUS_LABEL[status]}</span>
        },
      },
      { key: 'item_status', header: 'ITEM STATUS', value: (row) => LINE_STATUS_LABEL[lineStatus(row.line, allowance)] },
      { key: 'wishlist_no', header: 'WISHLIST ID', value: (row) => lookups.entry.get(row.po.wishlist_entry_id)?.wishlist_no ?? '' },
      { key: 'sample_no', header: 'SAMPLE NO', value: (row) => lookups.sample.get(row.po.sample_id)?.sample_no ?? '' },
      { key: 'design_no', header: 'DESIGN NO', value: (row) => lookups.sample.get(row.po.sample_id)?.design_no ?? '' },
    ]
  }, [lookups, allowance])

  return (
    <>
      <PageHead
        title={`${info.label} receiving`}
        note={`${info.label} POs: follow-ups with the vendor, receiving in one go or in parts, and lot numbers. Material is received by the ${info.department} department; follow-ups can also be added by the people who raised the PO.`}
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
      <Tabs tabs={tabs} value={tab} label={`${info.label} receiving views`} onChange={(key) => setParams(key === 'pending' ? {} : { tab: key }, { replace: true })} />
      <p className="tab-note">{NOTES[tab]}</p>
      {tab === 'lots' ? (
        <DataTable
          tableId={`${kind}-lots`}
          title={`${info.label} lots`}
          columns={lotColumns}
          rows={lots}
          loading={loading}
          onRowClick={(row) => setOpenId(row.po.id)}
          emptyText="No lot number has been given yet."
          searchPlaceholder="Search lots…"
        />
      ) : (
        <DataTable
          key={tab}
          tableId={`${kind}-receiving-${tab}`}
          title={`${info.label} POs, ${tabs.find((item) => item.key === tab).label.toLowerCase()}`}
          columns={poColumns}
          rows={byStatus[tab]}
          loading={loading}
          onRowClick={(row) => setOpenId(row.id)}
          emptyText="Nothing is here."
          searchPlaceholder="Search POs…"
        />
      )}
      {opened && (
        <PoTrackDialog
          po={opened}
          data={data}
          profile={profile}
          isAdmin={isAdmin}
          onClose={() => setOpenId(null)}
          onChanged={async (message) => {
            await reload()
            setNotice(message)
          }}
        />
      )}
    </>
  )
}
