import { useMemo, useState } from 'react'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { Field } from '../components/Field.jsx'
import { addLabelFor, cleanName, isTypedValue, namedOptions, pickValue, sizeLabel, typedName } from '../lib/cad.js'
import { formatDate, formatDateTime, friendlyError, todayLocal } from '../lib/format.js'
import {
  LENGTH_MODES,
  PO_KINDS,
  PO_KIND_LABEL,
  checkPoLines,
  formatMoney,
  formatQty,
  newPoLine,
  orderableItems,
  poAmount,
  poLineColours,
  poLineName,
  poLookups,
  poVendor,
  poLinesForAccessoryItem,
  poLinesForFabricItem,
  poLinesPayload,
  promisedDate,
  readQty,
  withColours,
  toPoLines,
  vendorLabel,
  vendorOfItem,
} from '../lib/materials.js'
import { callSampleAction } from '../lib/sampleData.js'

const numberOnly = (value) => value.replace(/[^\d.]/g, '').replace(/^\./, '0.')
const digitsOnly = (value) => value.replace(/\D/g, '')
const TYPE_LABEL = { primary: 'Primary', secondary: 'Secondary' }

// ---------- Raising or changing a PO ----------
// Three ways in:
//   { entry, family, vendorId } - a PO from the material lists of a wishlist item
//   { open: true }              - an open order: anything, for any vendor
//   { po }                      - changing a raised PO (authority All)
export function PoForm({ entry, family, vendorId, open = false, po, data, onClose, onSaved }) {
  const lookups = useMemo(() => poLookups(data), [data])
  const editing = Boolean(po)
  const isOpen = editing ? po.is_open : open
  const fromList = !isOpen
  const linkedEntry = editing ? lookups.entry.get(po.wishlist_entry_id) : entry
  const tolerance = data.purchaseSettings?.fabric_tolerance ?? 0

  const [kind, setKind] = useState(editing ? po.kind : (family ?? 'fabric'))
  const [vendor, setVendor] = useState(editing ? (po.fabric_vendor_id ?? po.accessory_vendor_id) : (vendorId ?? null))
  const [wishlistId, setWishlistId] = useState(editing ? po.wishlist_entry_id : null)
  const [sampleId, setSampleId] = useState(editing ? po.sample_id : null)
  const [orderDate, setOrderDate] = useState(editing ? po.order_date : todayLocal())
  const [remarks, setRemarks] = useState(editing ? (po.remarks ?? '') : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // The materials this PO carries, when it comes from the lists.
  const items = useMemo(
    () => (fromList && !editing ? orderableItems(entry, family).filter((item) => vendorOfItem(item) === vendorId) : []),
    [fromList, editing, entry, family, vendorId],
  )
  const combination = linkedEntry ? lookups.combination.get(linkedEntry.size_ratio_id) : null
  const initial = useMemo(() => {
    if (editing) return toPoLines(po, lookups.item)
    if (!fromList) return [newPoLine({ unit: 'mtr' })]
    return items.flatMap((item) =>
      family === 'fabric' ? poLinesForFabricItem(item, entry, tolerance) : poLinesForAccessoryItem(item, entry, combination),
    )
    // The form starts from what is given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [lines, setLines] = useState(initial)
  const dirty = editing || isOpen ? JSON.stringify(lines) !== JSON.stringify(initial) || remarks !== (po?.remarks ?? '') : true

  const setLine = (key, changes) => setLines((previous) => previous.map((line) => (line.key === key ? { ...line, ...changes } : line)))
  // Promise days: what is typed on the first line fills the lines that have none of their own.
  const setDays = (key, value) =>
    setLines((previous) => {
      const first = previous[0].key === key
      return previous.map((line) =>
        line.key === key ? { ...line, promise_days: value, daysOwn: true } : first && !line.daysOwn ? { ...line, promise_days: value } : line,
      )
    })
  // A Length accessory: pieces of each length, or its whole length in inches.
  const setLengthMode = (itemId, mode) =>
    setLines((previous) => {
      const at = previous.findIndex((line) => line.material_item_id === itemId)
      const old = previous[at]
      const fresh = poLinesForAccessoryItem(lookups.item.get(itemId), linkedEntry, combination, mode).map((line) => ({
        ...line,
        colours: old.colours,
        promise_days: old.promise_days,
        daysOwn: old.daysOwn,
      }))
      const rest = previous.filter((line) => line.material_item_id !== itemId)
      return [...rest.slice(0, at), ...fresh, ...rest.slice(at)]
    })

  const vendors = kind === 'fabric' ? data.fabricVendors : data.accessoryVendors
  const vendorOptions = vendors
    .filter((row) => row.is_active || row.id === vendor)
    .map((row) => ({ value: row.id, label: vendorLabel(row) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const masterItems = kind === 'fabric' ? data.fabrics : data.accessories
  const typedNames = [...new Set(lines.map((line) => line.new_name).filter(Boolean))]
  const itemOptions = namedOptions(masterItems, lines.map((line) => line.fabric_id ?? line.accessory_id).filter(Boolean), typedNames)
  const addItemLabel = addLabelFor(masterItems, typedNames)
  const typedColours = [...new Set(lines.flatMap((line) => line.colours))]
  const colourOptions = [...new Set([...data.colours.filter((row) => row.is_active).map((row) => row.name), ...typedColours])]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }))
  const addColourLabel = (typed) => {
    const name = cleanName(typed)
    if (!name || name.length > 60) return null
    return colourOptions.some((option) => option.label.toLowerCase() === name.toLowerCase()) ? null : `Add "${name}"`
  }
  const entryOptions = [...lookups.entry.values()]
    .map((row) => ({ value: row.id, label: row.wishlist_no }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const sampleOptions = data.samples.map((row) => ({ value: row.id, label: row.sample_no })).sort((a, b) => a.label.localeCompare(b.label))

  const totals = lines.map((line) => readQty(line.qty_text, line.colourSpecific === false ? 0 : line.colours.length))
  const amounts = lines.map((line, index) =>
    totals[index].total !== undefined && /^\d+(\.\d+)?$/.test(line.rate.trim()) ? totals[index].total * Number(line.rate) : null,
  )
  const grandTotal = amounts.every((amount) => amount !== null) ? amounts.reduce((sum, amount) => sum + amount, 0) : null

  const save = async (event) => {
    event.preventDefault()
    if (!vendor) return setError('Choose the vendor.')
    if (!orderDate) return setError('Enter the order date.')
    if (orderDate > todayLocal()) return setError('Order date cannot be in the future.')
    const problem = checkPoLines(lines, kind, isOpen)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      const number = await callSampleAction('save_purchase_order', {
        p_id: po?.id ?? null,
        p_po: {
          kind,
          is_open: isOpen,
          wishlist_id: fromList ? entry?.id : wishlistId,
          sample_id: wishlistId ? null : sampleId,
          vendor_id: vendor,
          order_date: orderDate,
          remarks,
          lines: poLinesPayload(lines, kind),
        },
      })
      await onSaved(number)
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  const title = editing
    ? `Change ${po.po_no}`
    : isOpen
      ? 'Open order'
      : `${PO_KIND_LABEL[family]} PO: ${entry.wishlist_no}, ${vendors.find((row) => row.id === vendorId)?.code ?? ''}`

  return (
    <Modal
      title={title}
      onClose={onClose}
      dirty={dirty}
      width={1080}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="po-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Raise PO'}
          </button>
        </>
      )}
    >
      <form id="po-form" onSubmit={save} noValidate>
        {isOpen && !editing && (
          <p className="hint fabric-intro">
            An order for anything: something lost, something to reorder, or something that was never on a material list.
          </p>
        )}
        <div className="po-head">
          {isOpen && !editing ? (
            <>
              <Field label="Fabric or accessory" htmlFor="po-kind" required>
                <PickList
                  id="po-kind"
                  options={PO_KINDS}
                  value={kind}
                  clearable={false}
                  onChange={(value) => {
                    if (value === kind) return
                    setKind(value)
                    setVendor(null)
                    setLines([newPoLine({ unit: value === 'fabric' ? 'mtr' : 'pcs' })])
                  }}
                />
              </Field>
              <Field label="Vendor" htmlFor="po-vendor" required>
                <PickList id="po-vendor" options={vendorOptions} value={vendor} onChange={setVendor} />
              </Field>
              <Field label="For wishlist item" htmlFor="po-wishlist" hint="Optional.">
                <PickList
                  id="po-wishlist"
                  options={entryOptions}
                  value={wishlistId}
                  onChange={(value) => {
                    setWishlistId(value)
                    if (value) setSampleId(null)
                  }}
                />
              </Field>
              <Field label="Or for sample" htmlFor="po-sample" hint="Optional.">
                <PickList id="po-sample" options={sampleOptions} value={sampleId} disabled={Boolean(wishlistId)} onChange={setSampleId} />
              </Field>
            </>
          ) : (
            <dl className="details po-fixed">
              <div>
                <dt>Vendor</dt>
                <dd>{vendorLabel(vendors.find((row) => row.id === vendor))}</dd>
              </div>
              {linkedEntry && (
                <div>
                  <dt>Wishlist item</dt>
                  <dd>
                    {linkedEntry.wishlist_no}, {sizeLabel(combination)}, {linkedEntry.qty} pcs
                  </dd>
                </div>
              )}
              {editing && (
                <div>
                  <dt>PO</dt>
                  <dd>
                    {po.po_no}
                    {po.is_open ? ' (open order)' : ''}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <Field label="Order date" htmlFor="po-date" required>
            <input id="po-date" type="date" className="input" max={todayLocal()} value={orderDate} onChange={(event) => setOrderDate(event.target.value)} />
          </Field>
          <Field label="Remarks" htmlFor="po-remarks">
            <input id="po-remarks" className="input" value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </Field>
        </div>

        {lines.map((line, index) => {
          const fromItem = Boolean(line.material_item_id)
          const noColours = line.colourSpecific === false
          const firstOfItem = fromItem && lines.findIndex((other) => other.material_item_id === line.material_item_id) === index
          const total = totals[index]
          return (
            <div key={line.key} className="po-line" data-po-line={index + 1}>
              <div className="po-line-top">
                <div className="po-line-name">
                  {fromItem || editing ? (
                    <>
                      <strong>{poLineName(line, lookups)}</strong>
                      {line.item_type && <span className="badge badge--maybe">{TYPE_LABEL[line.item_type]}</span>}
                      {line.dimension && fromItem && <span className="po-line-dimension">{line.dimension}</span>}
                    </>
                  ) : (
                    <div className="fabric-cell">
                      <label className="field-label" htmlFor={`po-${line.key}-item`}>
                        {kind === 'fabric' ? 'Fabric name' : 'Accessory name'}
                        <span className="field-required"> *</span>
                      </label>
                      <PickList
                        id={`po-${line.key}-item`}
                        options={itemOptions}
                        value={pickValue(line.fabric_id ?? line.accessory_id, line.new_name)}
                        onChange={(value) =>
                          setLine(
                            line.key,
                            isTypedValue(value)
                              ? { fabric_id: null, accessory_id: null, new_name: typedName(value) }
                              : { fabric_id: kind === 'fabric' ? value : null, accessory_id: kind === 'accessory' ? value : null, new_name: '' },
                          )
                        }
                        onCreate={(typed) => setLine(line.key, { fabric_id: null, accessory_id: null, new_name: cleanName(typed) })}
                        createLabel={addItemLabel}
                      />
                    </div>
                  )}
                </div>
                {firstOfItem && line.lengthMode && !editing && (
                  <div className="fabric-cell po-line-mode">
                    <label className="field-label" htmlFor={`po-${line.key}-mode`}>
                      Order the length
                    </label>
                    <PickList
                      id={`po-${line.key}-mode`}
                      options={LENGTH_MODES}
                      value={line.lengthMode}
                      clearable={false}
                      onChange={(value) => value !== line.lengthMode && setLengthMode(line.material_item_id, value)}
                    />
                  </div>
                )}
                {(isOpen || editing) && lines.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--small fabric-remove"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => setLines((previous) => previous.filter((other) => other.key !== line.key))}
                  >
                    Remove
                  </button>
                )}
              </div>
              {line.required && <p className="hint po-line-required">Needed: {line.required}.</p>}
              {line.colourNote && <p className="hint po-line-required" data-colour-note>{line.colourNote}.</p>}
              <div className="po-line-fields">
                {kind === 'accessory' && (!fromItem || editing) && (
                  <div className="fabric-cell">
                    <label className="field-label" htmlFor={`po-${line.key}-dimension`}>
                      Dimension
                    </label>
                    <input
                      id={`po-${line.key}-dimension`}
                      className="input"
                      value={line.dimension}
                      onChange={(event) => setLine(line.key, { dimension: event.target.value })}
                    />
                  </div>
                )}
                {kind === 'accessory' && !fromItem && (
                  <div className="fabric-cell">
                    <label className="field-label" htmlFor={`po-${line.key}-unit`}>
                      Ordered in
                    </label>
                    <PickList
                      id={`po-${line.key}-unit`}
                      options={[
                        { value: 'pcs', label: 'Pieces' },
                        { value: 'inch', label: 'Inches' },
                      ]}
                      value={line.unit}
                      clearable={false}
                      onChange={(value) => setLine(line.key, { unit: value })}
                    />
                  </div>
                )}
                {!noColours && (
                  <div className="fabric-cell po-line-colours">
                    <label className="field-label" htmlFor={`po-${line.key}-colours`}>
                      Colours name
                      {(kind === 'fabric' || line.colourSpecific) && <span className="field-required"> *</span>}
                    </label>
                    <PickList
                      id={`po-${line.key}-colours`}
                      multiple
                      options={colourOptions}
                      value={line.colours}
                      onChange={(value) => setLine(line.key, withColours(line, value))}
                      onCreate={(typed) => setLine(line.key, withColours(line, [...line.colours, cleanName(typed)]))}
                      createLabel={addColourLabel}
                    />
                  </div>
                )}
                {!noColours && (
                  <div className="po-line-fact">
                    <span className="field-label">No. of colours</span>
                    <span data-colour-count>{line.colours.length}</span>
                  </div>
                )}
                <div className="fabric-cell">
                  <label className="field-label" htmlFor={`po-${line.key}-qty`}>
                    {line.colours.length > 1 ? "Qty per colour" : "Qty"} ({line.unit})<span className="field-required"> *</span>
                  </label>
                  <input
                    id={`po-${line.key}-qty`}
                    className="input"
                    value={line.qty_text}
                    onChange={(event) => setLine(line.key, { qty_text: event.target.value.replace(/[^\d.+\s]/g, '').replace(/(^|\+)(\s*)\./g, '$1$20.'), qtyOwn: true })}
                  />
                </div>
                <div className="po-line-fact">
                  <span className="field-label">Total qty</span>
                  <span data-total-qty>{total.total !== undefined ? `${formatQty(total.total)} ${line.unit}` : '—'}</span>
                </div>
                <div className="fabric-cell">
                  <label className="field-label" htmlFor={`po-${line.key}-rate`}>
                    Rate<span className="field-required"> *</span>
                  </label>
                  <input
                    id={`po-${line.key}-rate`}
                    className="input"
                    inputMode="decimal"
                    value={line.rate}
                    onChange={(event) => setLine(line.key, { rate: numberOnly(event.target.value) })}
                  />
                </div>
                <div className="po-line-fact">
                  <span className="field-label">Amount</span>
                  <span data-amount>{amounts[index] !== null ? formatMoney(amounts[index]) : '—'}</span>
                </div>
                <div className="fabric-cell">
                  <label className="field-label" htmlFor={`po-${line.key}-days`}>
                    Promise days
                  </label>
                  <input
                    id={`po-${line.key}-days`}
                    className="input"
                    inputMode="numeric"
                    value={line.promise_days}
                    onChange={(event) => setDays(line.key, digitsOnly(event.target.value))}
                  />
                </div>
                <div className="po-line-fact">
                  <span className="field-label">Promised date</span>
                  <span data-promised>{formatDate(promisedDate(orderDate, line.promise_days)) || '—'}</span>
                </div>
                {kind === 'fabric' && (
                  <>
                    <div className="fabric-cell">
                      <label className="field-label" htmlFor={`po-${line.key}-folds`}>
                        Folds
                      </label>
                      <input id={`po-${line.key}-folds`} className="input" value={line.folds} onChange={(event) => setLine(line.key, { folds: event.target.value })} />
                    </div>
                    <div className="fabric-cell">
                      <label className="field-label" htmlFor={`po-${line.key}-paina`}>
                        Paina
                      </label>
                      <input
                        id={`po-${line.key}-paina`}
                        className="input"
                        inputMode="decimal"
                        value={line.paina}
                        onChange={(event) => setLine(line.key, { paina: numberOnly(event.target.value) })}
                      />
                    </div>
                  </>
                )}
              </div>
              {line.qty_text.trim() !== '' && total.error && <p className="hint error-text">{total.error}</p>}
              {line.needed !== null && !line.qtyOwn && line.colours.length > 1 && (
                <p className="hint" data-qty-split>
                  {formatQty(line.needed)} {line.unit} needed, divided between the {line.colours.length} colours and rounded up to the next 5:{' '}
                  {line.qty_text} {line.unit} of each colour. Type a qty to set it yourself.
                </p>
              )}
            </div>
          )
        })}
        {isOpen && (
          <button type="button" className="btn" onClick={() => setLines((previous) => [...previous, newPoLine({ unit: kind === 'fabric' ? 'mtr' : 'pcs', promise_days: previous[0]?.promise_days ?? '' })])}>
            Add line
          </button>
        )}
        <p className="po-total">
          Total amount: <strong data-po-total>{grandTotal !== null ? formatMoney(grandTotal) : '—'}</strong>
        </p>
        <p className="hint">
          Qty is for one colour: one number is taken for every colour (100 with 3 colours = 300). Or write one number
          per colour joined with +, like 100+200+300. Until you type a qty, what is needed is divided equally between
          the colours, each share rounded up to the next 5.
        </p>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

// ---------- Cancelling a PO (authority All) ----------

function PoCancelDialog({ po, onClose, onDone }) {
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await callSampleAction('cancel_purchase_order', { p_id: po.id, p_remarks: remarks })
      await onDone()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`Cancel ${po.po_no}`}
      onClose={onClose}
      dirty={remarks.trim() !== ''}
      width={440}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Keep the PO
          </button>
          <button type="submit" form="po-cancel-form" className="btn btn--danger" disabled={busy}>
            {busy ? 'Cancelling…' : 'Cancel the PO'}
          </button>
        </>
      )}
    >
      <form id="po-cancel-form" onSubmit={save} noValidate>
        <p className="hint fabric-intro">
          A cancelled PO stays in the list, marked Cancelled, and its number is not used again. Its materials can then be
          ordered again.
        </p>
        <Field label="Why it is cancelled" htmlFor="po-cancel-remarks">
          <input id="po-cancel-remarks" className="input" value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        </Field>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

// ---------- Looking at one PO ----------

export function PoView({ po, data, isAdmin, onClose, onEdit, onChanged, onTrack }) {
  const lookups = useMemo(() => poLookups(data), [data])
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState('')
  const entry = lookups.entry.get(po.wishlist_entry_id)
  const sample = lookups.sample.get(po.sample_id)
  const fabric = po.kind === 'fabric'

  const pdf = async () => {
    setError('')
    try {
      const { exportPoPdf } = await import('../lib/poPdf.js')
      await exportPoPdf(po, lookups)
    } catch (failure) {
      setError(friendlyError(failure))
    }
  }

  return (
    <Modal
      title={`${po.po_no}${po.status === 'cancelled' ? ' (cancelled)' : ''}`}
      onClose={onClose}
      width={1080}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Close
          </button>
          {isAdmin && po.status === 'raised' && (
            <>
              <button type="button" className="btn btn--danger" onClick={() => setCancelling(true)}>
                Cancel PO
              </button>
              <button type="button" className="btn" onClick={onEdit}>
                Change
              </button>
            </>
          )}
          {onTrack && po.status === 'raised' && (
            <button type="button" className="btn" onClick={onTrack}>
              Receiving and follow-ups
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={pdf}>
            PDF
          </button>
        </>
      )}
    >
      <dl className="details">
        <div>
          <dt>PO number</dt>
          <dd>{po.po_no}</dd>
        </div>
        <div>
          <dt>Order date</dt>
          <dd>{formatDate(po.order_date)}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>
            {PO_KIND_LABEL[po.kind]}
            {po.is_open ? ', open order' : ''}
          </dd>
        </div>
        <div>
          <dt>Vendor</dt>
          <dd>{vendorLabel(poVendor(po, lookups))}</dd>
        </div>
        <div>
          <dt>Wishlist item</dt>
          <dd>{entry?.wishlist_no ?? <span className="hint">None</span>}</dd>
        </div>
        <div>
          <dt>Sample</dt>
          <dd>{sample?.sample_no ?? <span className="hint">None</span>}</dd>
        </div>
        <div>
          <dt>Raised by</dt>
          <dd>
            {lookups.person.get(po.created_by)?.name}, {formatDateTime(po.created_at)}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`badge badge--${po.status === 'raised' ? 'completed' : 'skip'}`}>{po.status === 'raised' ? 'Raised' : 'Cancelled'}</span>
            {po.status === 'cancelled' && po.cancel_remarks ? ` ${po.cancel_remarks}` : ''}
          </dd>
        </div>
        {po.remarks && (
          <div>
            <dt>Remarks</dt>
            <dd>{po.remarks}</dd>
          </div>
        )}
      </dl>
      <div className="po-view-scroll">
        <table className="cad-table po-view-table">
          <thead>
            <tr>
              <th>{fabric ? 'FABRIC NAME' : 'ACCESSORY NAME'}</th>
              <th>{fabric ? 'FABRIC TYPE' : 'TYPE'}</th>
              {!fabric && <th>DIMENSION</th>}
              <th>NO. OF COLOURS</th>
              <th>COLOURS NAME</th>
              <th>QTY</th>
              <th>TOTAL QTY</th>
              <th>RATE</th>
              <th>AMOUNT</th>
              <th>PROMISED DATE OF DELIVERY</th>
              {fabric && <th>FOLDS</th>}
              {fabric && <th>PAINA</th>}
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line) => (
              <tr key={line.id}>
                <td>{poLineName(line, lookups)}</td>
                <td>{TYPE_LABEL[line.item_type] ?? ''}</td>
                {!fabric && <td>{line.dimension ?? ''}</td>}
                <td>{line.colours.length || ''}</td>
                <td>{poLineColours(line, lookups)}</td>
                <td>{line.qty_text}</td>
                <td>
                  {formatQty(line.total_qty)} {line.unit}
                </td>
                <td>{formatMoney(line.rate)}</td>
                <td>{formatMoney(line.amount)}</td>
                <td>{formatDate(line.promised_date)}</td>
                {fabric && <td>{line.folds ?? ''}</td>}
                {fabric && <td>{line.paina === null ? '' : formatQty(line.paina)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="po-total">
        Total amount: <strong>{formatMoney(poAmount(po))}</strong>
      </p>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {cancelling && <PoCancelDialog po={po} onClose={() => setCancelling(false)} onDone={() => onChanged(`${po.po_no} cancelled.`)} />}
    </Modal>
  )
}
