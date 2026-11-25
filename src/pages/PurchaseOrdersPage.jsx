import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DataTable from '../components/DataTable.jsx'
import Tabs from '../components/Tabs.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useLoad } from '../lib/data.js'
import { formatDate, formatDateTime, friendlyError } from '../lib/format.js'
import { PO_KIND_LABEL, formatQty, poAmount, poLineName, poLookups, poVendor } from '../lib/materials.js'
import { loadSampleData } from '../lib/sampleData.js'
import { PoForm, PoView } from './PoParts.jsx'

const STATUS_LABEL = { raised: 'Raised', cancelled: 'Cancelled' }
const TYPE_LABEL = { primary: 'Primary', secondary: 'Secondary' }
const money = (value) => Math.round(Number(value) * 100) / 100

// Purchase orders: every PO raised from the material lists, and open orders.
//   Purchase orders - one row per PO
//   PO lines        - one row per line, for filtering by item, colour or date
export default function PurchaseOrdersPage() {
  const { profile, isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [viewingId, setViewingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const [params, setParams] = useSearchParams()

  const orders = useMemo(() => data?.purchaseOrders ?? [], [data])
  const lookups = useMemo(() => (data ? poLookups(data) : null), [data])
  const lines = useMemo(() => orders.flatMap((po) => po.lines.map((line) => ({ ...line, po }))), [orders])
  // An open order can be raised by the people who look after samples, and by the designer of any sample.
  const canOpen = Boolean(data) && (data.access.manages || data.samples.some((sample) => sample.designer_id === profile.id))
  const viewing = orders.find((po) => po.id === viewingId)
  const editing = orders.find((po) => po.id === editingId)

  const tabs = [
    { key: 'orders', label: 'Purchase orders', count: orders.length },
    { key: 'lines', label: 'PO lines', count: lines.length },
  ]
  const tab = params.get('tab') === 'lines' ? 'lines' : 'orders'

  const poColumns = useMemo(() => {
    const po = (row) => row.po ?? row
    return [
      {
        key: 'po_no',
        header: 'PO NO',
        value: (row) => po(row).po_no,
        sortValue: (row) => po(row).sl_no,
        render: (row) => (
          <button type="button" className="link link--strong" onClick={() => setViewingId(po(row).id)}>
            {po(row).po_no}
          </button>
        ),
      },
      { key: 'order_date', header: 'ORDER DATE', value: (row) => formatDate(po(row).order_date), sortValue: (row) => po(row).order_date },
      { key: 'kind', header: 'FABRIC / ACCESSORY', value: (row) => PO_KIND_LABEL[po(row).kind] },
      { key: 'open', header: 'OPEN ORDER', value: (row) => (po(row).is_open ? 'Yes' : 'No') },
      { key: 'vendor_code', header: 'VENDOR CODE', value: (row) => poVendor(po(row), lookups)?.code ?? '' },
      { key: 'vendor', header: 'VENDOR NAME', value: (row) => poVendor(po(row), lookups)?.name ?? '' },
      { key: 'wishlist_no', header: 'WISHLIST ID', value: (row) => lookups.entry.get(po(row).wishlist_entry_id)?.wishlist_no ?? '' },
      { key: 'sample_no', header: 'SAMPLE NO', value: (row) => lookups.sample.get(po(row).sample_id)?.sample_no ?? '' },
      { key: 'design_no', header: 'DESIGN NO', value: (row) => lookups.sample.get(po(row).sample_id)?.design_no ?? '' },
    ]
  }, [lookups])

  const orderColumns = useMemo(
    () => [
      ...poColumns,
      { key: 'items', header: 'LINES', align: 'right', value: (row) => row.lines.length },
      { key: 'amount', header: 'AMOUNT', align: 'right', value: (row) => money(poAmount(row)) },
      {
        key: 'status',
        header: 'STATUS',
        value: (row) => STATUS_LABEL[row.status],
        render: (row) => <span className={`badge badge--${row.status === 'raised' ? 'completed' : 'skip'}`}>{STATUS_LABEL[row.status]}</span>,
      },
      { key: 'remarks', header: 'REMARKS', value: (row) => row.remarks ?? '' },
      { key: 'raised_by', header: 'RAISED BY', value: (row) => lookups.person.get(row.created_by)?.name ?? '' },
      { key: 'raised_on', header: 'RAISED ON', value: (row) => formatDateTime(row.created_at), sortValue: (row) => row.created_at },
    ],
    [poColumns, lookups],
  )

  const lineColumns = useMemo(
    () => [
      ...poColumns,
      { key: 'item', header: 'ITEM NAME', value: (row) => poLineName(row, lookups) },
      { key: 'item_type', header: 'TYPE', value: (row) => TYPE_LABEL[row.item_type] ?? '' },
      { key: 'dimension', header: 'DIMENSION', value: (row) => row.dimension ?? '' },
      { key: 'colour_count', header: 'NO. OF COLOURS', align: 'right', value: (row) => row.colours.length || '' },
      { key: 'colours', header: 'COLOURS NAME', value: (row) => row.colours },
      { key: 'qty', header: 'QTY', value: (row) => row.qty_text },
      { key: 'total_qty', header: 'TOTAL QTY', align: 'right', value: (row) => Number(formatQty(row.total_qty)) },
      { key: 'unit', header: 'UNIT', value: (row) => row.unit },
      { key: 'rate', header: 'RATE', align: 'right', value: (row) => money(row.rate) },
      { key: 'amount', header: 'AMOUNT', align: 'right', value: (row) => money(row.amount) },
      { key: 'promise_days', header: 'PROMISE DAYS', align: 'right', value: (row) => row.promise_days ?? '' },
      { key: 'promised', header: 'PROMISED DATE OF DELIVERY', value: (row) => formatDate(row.promised_date), sortValue: (row) => row.promised_date ?? '' },
      { key: 'folds', header: 'FOLDS', value: (row) => row.folds ?? '' },
      { key: 'paina', header: 'PAINA', align: 'right', value: (row) => (row.paina === null ? '' : Number(row.paina)) },
      { key: 'status', header: 'STATUS', value: (row) => STATUS_LABEL[row.po.status] },
    ],
    [poColumns, lookups],
  )

  const openButton = canOpen && (
    <div className="toolbar-actions">
      <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
        Open order
      </button>
    </div>
  )

  return (
    <>
      <PageHead
        title="Purchase orders"
        note="POs raised from the material lists, one per wishlist item and vendor, and open orders. A PO is raised from Material lists; only a person with authority All can change or cancel one."
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
      <Tabs tabs={tabs} value={tab} label="Purchase order views" onChange={(key) => setParams(key === 'orders' ? {} : { tab: key }, { replace: true })} />
      {tab === 'orders' && (
        <DataTable
          tableId="purchase-orders"
          title="Purchase orders"
          columns={orderColumns}
          rows={orders}
          loading={loading}
          onRowClick={(row) => setViewingId(row.id)}
          emptyText="No PO has been raised yet."
          searchPlaceholder="Search POs…"
          toolbar={openButton}
        />
      )}
      {tab === 'lines' && (
        <DataTable
          tableId="purchase-order-lines"
          title="PO lines"
          columns={lineColumns}
          rows={lines}
          loading={loading}
          onRowClick={(row) => setViewingId(row.po.id)}
          emptyText="No PO has been raised yet."
          searchPlaceholder="Search PO lines…"
          toolbar={openButton}
        />
      )}
      {viewing && !editing && (
        <PoView
          po={viewing}
          data={data}
          isAdmin={isAdmin}
          onClose={() => setViewingId(null)}
          onEdit={() => setEditingId(viewing.id)}
          onChanged={async (message) => {
            await reload()
            setViewingId(null)
            setNotice(message)
          }}
        />
      )}
      {editing && (
        <PoForm
          po={editing}
          data={data}
          onClose={() => setEditingId(null)}
          onSaved={async (number) => {
            await reload()
            setEditingId(null)
            setNotice(`${number} changed.`)
          }}
        />
      )}
      {adding && (
        <PoForm
          open
          data={data}
          onClose={() => setAdding(false)}
          onSaved={async (number) => {
            await reload()
            setAdding(false)
            setNotice(`${number} raised.`)
          }}
        />
      )}
    </>
  )
}
