import { useMemo, useState } from 'react'
import ClickableImage from '../components/ClickableImage.jsx'
import ImageUpload from '../components/ImageUpload.jsx'
import Modal, { ConfirmDialog } from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { Field } from '../components/Field.jsx'
import { addLabelFor, cleanName, isTypedValue, namedOptions, pickValue, typedName } from '../lib/cad.js'
import { formatDate, formatDateTime, friendlyError, todayLocal } from '../lib/format.js'
import { uploadImage } from '../lib/images.js'
import { formatQty, poLineName, poLookups, poVendor, vendorLabel } from '../lib/materials.js'
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
  nextLotNo,
  poReceiveStatus,
  promisedDateOf,
  receivedName,
} from '../lib/receiving.js'
import { BUCKET, callSampleAction } from '../lib/sampleData.js'

const numberOnly = (value) => value.replace(/[^\d.]/g, '').replace(/^\./, '0.')
const decimal = (value) => /^\d{1,10}(\.\d{1,2})?$/.test(value.trim())

export function PoStandingBadge({ po, allowance }) {
  const status = poReceiveStatus(po, allowance)
  return <span className={`badge badge--${PO_RECEIVE_BADGE[status]}`}>{PO_RECEIVE_LABEL[status]}</span>
}

// ---------- Receiving material against one PO ----------
export function ReceiveDialog({ po, data, onClose, onSaved }) {
  const lookups = useMemo(() => poLookups(data), [data])
  const allowance = data.purchaseSettings?.receive_allowance ?? 0
  const kind = RECEIVE_KINDS[po.kind]
  const openLines = po.lines.filter((line) => !line.completed_at)
  const [receivedDate, setReceivedDate] = useState(todayLocal())
  const [billNo, setBillNo] = useState('')
  const [billDate, setBillDate] = useState('')
  const [photo, setPhoto] = useState(null)
  const [seriesId, setSeriesId] = useState(null)
  const [qty, setQty] = useState({}) // `${line id}:${colour no}` -> typed quantity
  const [names, setNames] = useState({}) // line id -> { item_id, new_name } when the name was changed
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const series = data.lotSeries.filter((row) => row.kind === po.kind && row.is_active)
  const seriesOptions = series.map((row) => ({ value: row.id, label: `${row.name} (next ${nextLotNo(row)})` })).sort((a, b) => a.label.localeCompare(b.label))
  const typed = (line, colour) => (qty[`${line.id}:${colour.no}`] ?? '').trim()
  const lineHasQty = (line) => lineDetails(line, allowance).some((colour) => typed(line, colour) !== '')
  // a series is needed only when a line gets its lot number in this receipt
  const newLots = openLines.filter((line) => !line.lot_no && lineHasQty(line))
  const dirty = billNo.trim() !== '' || billDate !== '' || Boolean(photo) || Object.values(qty).some((value) => value.trim() !== '')

  const masterItems = po.kind === 'fabric' ? data.fabrics : data.accessories
  const typedNames = [...new Set(Object.values(names).map((name) => name.new_name).filter(Boolean))]
  const itemOptions = namedOptions(masterItems, po.lines.map((line) => line.fabric_id ?? line.accessory_id), typedNames)
  const addItemLabel = addLabelFor(masterItems, typedNames)

  const save = async (event) => {
    event.preventDefault()
    if (!receivedDate) return setError('Enter the received date.')
    if (receivedDate > todayLocal()) return setError('Received date cannot be in the future.')
    if (receivedDate < po.order_date) return setError('Received date cannot be before the order date of the PO.')
    if (!billNo.trim()) return setError('Enter the bill number.')
    if (!billDate) return setError('Enter the bill date.')
    if (billDate > todayLocal()) return setError('Bill date cannot be in the future.')
    const items = []
    for (const line of openLines) {
      for (const colour of lineDetails(line, allowance)) {
        const value = typed(line, colour)
        if (value === '') continue
        if (!decimal(value) || Number(value) <= 0) return setError('Received quantity must be a number more than zero, with at most 2 decimals.')
        items.push({ line_id: line.id, colour_no: colour.no, qty: value })
      }
    }
    if (items.length === 0) return setError('Enter the quantity received of at least one item.')
    if (newLots.length > 0 && !seriesId) return setError('Choose the lot number series.')
    setBusy(true)
    setError('')
    try {
      const photoPath = photo ? await uploadImage(BUCKET, photo, 'receipt') : null
      const lots = await callSampleAction('save_po_receipt', {
        p_po_id: po.id,
        p_receipt: {
          received_date: receivedDate,
          bill_no: billNo,
          bill_date: billDate,
          photo_path: photoPath,
          series_id: newLots.length > 0 ? seriesId : null,
          items,
          names: newLots.filter((line) => names[line.id]).map((line) => ({ line_id: line.id, ...names[line.id] })),
        },
      })
      await onSaved(lots)
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Receive ${po.po_no}`}
      onClose={onClose}
      dirty={dirty}
      width={980}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="receive-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save receipt'}
          </button>
        </>
      )}
    >
      <form id="receive-form" onSubmit={save} noValidate>
        <dl className="details po-fixed">
          <div>
            <dt>Vendor</dt>
            <dd>{vendorLabel(poVendor(po, lookups))}</dd>
          </div>
          <div>
            <dt>Order date</dt>
            <dd>{formatDate(po.order_date)}</dd>
          </div>
          <div>
            <dt>Wishlist item</dt>
            <dd>{lookups.entry.get(po.wishlist_entry_id)?.wishlist_no ?? <span className="hint">None</span>}</dd>
          </div>
        </dl>
        <div className="po-head">
          <Field label="Received date" htmlFor="receive-date" required>
            <input id="receive-date" type="date" className="input" max={todayLocal()} value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} />
          </Field>
          <Field label="Bill number" htmlFor="receive-bill-no" required>
            <input id="receive-bill-no" className="input" value={billNo} onChange={(event) => setBillNo(event.target.value)} />
          </Field>
          <Field label="Bill date" htmlFor="receive-bill-date" required>
            <input id="receive-bill-date" type="date" className="input" max={todayLocal()} value={billDate} onChange={(event) => setBillDate(event.target.value)} />
          </Field>
          {newLots.length > 0 && (
            <Field
              label="Lot number series"
              htmlFor="receive-series"
              required
              hint={`${newLots.length === 1 ? 'One item gets its' : `${newLots.length} items get their`} lot number now.`}
            >
              <PickList
                id="receive-series"
                options={seriesOptions}
                value={seriesId}
                onChange={setSeriesId}
                placeholder={seriesOptions.length ? 'Select…' : `No ${kind.item} lot series in Masters, under Numbering`}
              />
            </Field>
          )}
        </div>
        <Field label="Photo" hint="Optional.">
          <ImageUpload bucket={BUCKET} path={null} file={photo} onFileChange={setPhoto} onRemove={() => setPhoto(null)} alt="Photo of the received material" size={64} />
        </Field>

        {po.lines.map((line, index) => {
          const closed = Boolean(line.completed_at)
          const colours = lineDetails(line, allowance)
          const ordered = poLineName(line, lookups)
          const changed = names[line.id]
          return (
            <div key={line.id} className="po-line" data-receive-line={index + 1}>
              <div className="po-line-top">
                <div className="po-line-name">
                  <strong>{ordered}</strong>
                  {line.dimension && <span className="po-line-dimension">{line.dimension}</span>}
                  {line.lot_no ? <span className="badge badge--on">Lot {line.lot_no}</span> : <span className="hint">No lot number yet</span>}
                  {line.lot_no && receivedName(line, lookups) !== ordered && <span className="hint">received as {receivedName(line, lookups)}</span>}
                  {closed && <span className="badge badge--skip">Marked complete</span>}
                </div>
                {!line.lot_no && !closed && (
                  <div className="fabric-cell receive-name">
                    <label className="field-label" htmlFor={`receive-${line.id}-name`}>
                      Item received
                    </label>
                    <PickList
                      id={`receive-${line.id}-name`}
                      options={itemOptions}
                      clearable={false}
                      value={changed ? pickValue(changed.item_id, changed.new_name) : (line.fabric_id ?? line.accessory_id)}
                      onChange={(value) =>
                        setNames((previous) => {
                          const next = { ...previous }
                          if (value === (line.fabric_id ?? line.accessory_id)) delete next[line.id]
                          else next[line.id] = isTypedValue(value) ? { item_id: null, new_name: typedName(value) } : { item_id: value, new_name: '' }
                          return next
                        })
                      }
                      onCreate={(text) => setNames((previous) => ({ ...previous, [line.id]: { item_id: null, new_name: cleanName(text) } }))}
                      createLabel={addItemLabel}
                    />
                  </div>
                )}
              </div>
              {!line.lot_no && !closed && <p className="hint po-line-required">If the vendor sent something similar instead, change the name here. It can be changed only now, at the first receipt.</p>}
              <table className="cad-table receive-table">
                <thead>
                  <tr>
                    <th>LOT</th>
                    <th>COLOUR</th>
                    <th>ORDERED</th>
                    <th>RECEIVED SO FAR</th>
                    <th>BALANCE</th>
                    <th>RECEIVING NOW ({line.unit})</th>
                  </tr>
                </thead>
                <tbody>
                  {colours.map((colour) => (
                    <tr key={colour.no} data-colour={colour.letter}>
                      <td data-label="Lot">{colour.lot || `-${colour.letter}`}</td>
                      <td data-label="Colour">{colour.colour || <span className="hint">No colour</span>}</td>
                      <td data-label="Ordered">{formatQty(colour.ordered)}</td>
                      <td data-label="Received so far">{formatQty(colour.received)}</td>
                      <td data-label="Balance">{formatQty(colour.balance)}</td>
                      <td data-label={`Receiving now (${line.unit})`}>
                        <input
                          className="input"
                          inputMode="decimal"
                          disabled={closed}
                          aria-label={`Receiving now, ${ordered}${colour.colour ? `, ${colour.colour}` : ''}`}
                          value={qty[`${line.id}:${colour.no}`] ?? ''}
                          onChange={(event) => setQty((previous) => ({ ...previous, [`${line.id}:${colour.no}`]: numberOnly(event.target.value) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
        <p className="hint">
          Fill only what came now; leave the rest empty. More than ordered is accepted and shown as excess. A colour is
          complete once what has come is within {formatQty(allowance)}% of what was ordered.
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

// ---------- A follow-up with the vendor ----------
function FollowupDialog({ po, onClose, onSaved }) {
  const [date, setDate] = useState(todayLocal())
  const [remark, setRemark] = useState('')
  const [promised, setPromised] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (event) => {
    event.preventDefault()
    if (!date) return setError('Enter the follow-up date.')
    if (date > todayLocal()) return setError('Follow-up date cannot be in the future.')
    if (!remark.trim()) return setError('Write what the vendor said.')
    setBusy(true)
    setError('')
    try {
      await callSampleAction('add_po_followup', { p_po_id: po.id, p_date: date, p_remark: remark, p_promised_date: promised || null })
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`Follow-up: ${po.po_no}`}
      onClose={onClose}
      dirty={remark.trim() !== '' || promised !== ''}
      width={460}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="followup-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save follow-up'}
          </button>
        </>
      )}
    >
      <form id="followup-form" onSubmit={save} noValidate>
        <Field label="Follow-up date" htmlFor="followup-date" required>
          <input id="followup-date" type="date" className="input" max={todayLocal()} value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="What the vendor said" htmlFor="followup-remark" required>
          <textarea id="followup-remark" className="input" rows={3} value={remark} onChange={(event) => setRemark(event.target.value)} />
        </Field>
        <Field label="New promised date" htmlFor="followup-promised" hint="Only when the vendor gave a new date. The PO is then counted late against this date.">
          <input id="followup-promised" type="date" className="input" value={promised} onChange={(event) => setPromised(event.target.value)} />
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

// ---------- Marking an item complete although it came short ----------
function CompleteDialog({ line, name, onClose, onSaved }) {
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await callSampleAction('complete_po_line', { p_line_id: line.id, p_remark: remark, p_undo: false })
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`Mark complete: ${name}`}
      onClose={onClose}
      dirty={remark.trim() !== ''}
      width={440}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="complete-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Marking…' : 'Mark complete'}
          </button>
        </>
      )}
    >
      <form id="complete-form" onSubmit={save} noValidate>
        <p className="hint fabric-intro">
          Use this when the item came short and no more is expected. Nothing more can then be received against it. Only a
          person with authority All can open it again.
        </p>
        <Field label="Remark" htmlFor="complete-remark">
          <input id="complete-remark" className="input" value={remark} onChange={(event) => setRemark(event.target.value)} />
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

// ---------- Tracking one PO: where it stands, receipts and follow-ups ----------
//   onChanged(message) - called after anything was saved; the screen loads again
export function PoTrackDialog({ po, data, profile, isAdmin, onClose, onChanged }) {
  const lookups = useMemo(() => poLookups(data), [data])
  const allowance = data.purchaseSettings?.receive_allowance ?? 0
  const [dialog, setDialog] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canReceive = data.access.receive[po.kind] && po.status === 'raised'
  const canFollow = canFollowUp(po, data, profile) && po.status === 'raised'
  const status = poReceiveStatus(po, allowance)
  const promised = promisedDateOf(po)
  const late = daysLate(po, allowance, todayLocal())
  const hasOpenLine = po.lines.some((line) => !line.completed_at)
  const done = async (message) => {
    setDialog(null)
    await onChanged(message)
  }
  const run = async (action, params, message) => {
    setBusy(true)
    setError('')
    try {
      await callSampleAction(action, params)
      await done(message)
    } catch (failure) {
      setDialog(null)
      setError(friendlyError(failure))
    }
    setBusy(false)
  }
  const person = (id) => lookups.person.get(id)?.name ?? ''

  return (
    <Modal
      title={`${po.po_no}: receiving and follow-ups`}
      onClose={onClose}
      width={1040}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Close
          </button>
          {canFollow && (
            <button type="button" className="btn" onClick={() => setDialog({ type: 'followup' })}>
              Add follow-up
            </button>
          )}
          {canReceive && hasOpenLine && (
            <button type="button" className="btn btn--primary" onClick={() => setDialog({ type: 'receive' })}>
              Receive material
            </button>
          )}
        </>
      )}
    >
      <div data-po-track={po.po_no}>
        <dl className="details">
          <div>
            <dt>Vendor</dt>
            <dd>{vendorLabel(poVendor(po, lookups))}</dd>
          </div>
          <div>
            <dt>Order date</dt>
            <dd>{formatDate(po.order_date)}</dd>
          </div>
          <div>
            <dt>Wishlist item</dt>
            <dd>{lookups.entry.get(po.wishlist_entry_id)?.wishlist_no ?? <span className="hint">None</span>}</dd>
          </div>
          <div>
            <dt>Promised date</dt>
            <dd>
              {promised ? formatDate(promised) : <span className="hint">None given</span>}
              {late > 0 && <span className="badge badge--no"> Late by {late} {late === 1 ? 'day' : 'days'}</span>}
            </dd>
          </div>
          <div>
            <dt>Receiving</dt>
            <dd>
              <span className={`badge badge--${PO_RECEIVE_BADGE[status]}`}>{PO_RECEIVE_LABEL[status]}</span>
            </dd>
          </div>
        </dl>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}

        <h3 className="section-title section-title--next">Items</h3>
        {po.lines.map((line, index) => {
          const state = lineStatus(line, allowance)
          const ordered = poLineName(line, lookups)
          return (
            <div key={line.id} className="po-line" data-track-line={index + 1}>
              <div className="po-line-top">
                <div className="po-line-name">
                  <strong>{ordered}</strong>
                  {line.dimension && <span className="po-line-dimension">{line.dimension}</span>}
                  <span className={`badge badge--${LINE_STATUS_BADGE[state]}`}>{LINE_STATUS_LABEL[state]}</span>
                  {line.lot_no && receivedName(line, lookups) !== ordered && <span className="hint">received as {receivedName(line, lookups)}</span>}
                  {line.completed_at && (
                    <span className="hint">
                      marked complete by {person(line.completed_by)}
                      {line.completed_remark ? `: ${line.completed_remark}` : ''}
                    </span>
                  )}
                </div>
                {canReceive && !line.completed_at && state === 'part' && (
                  <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'complete', line, name: ordered })}>
                    Mark complete
                  </button>
                )}
                {isAdmin && line.completed_at && (
                  <button type="button" className="btn btn--small" disabled={busy} onClick={() => run('complete_po_line', { p_line_id: line.id, p_remark: null, p_undo: true }, `${ordered} opened again.`)}>
                    Open again
                  </button>
                )}
              </div>
              <table className="cad-table receive-table">
                <thead>
                  <tr>
                    <th>LOT NO</th>
                    <th>COLOUR</th>
                    <th>ORDERED</th>
                    <th>RECEIVED</th>
                    <th>BALANCE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {lineDetails(line, allowance).map((colour) => (
                    <tr key={colour.no} data-colour={colour.letter}>
                      <td data-label="Lot no">{colour.lot || <span className="hint">Not yet</span>}</td>
                      <td data-label="Colour">{colour.colour || <span className="hint">No colour</span>}</td>
                      <td data-label="Ordered">
                        {formatQty(colour.ordered)} {line.unit}
                      </td>
                      <td data-label="Received">{formatQty(colour.received)}</td>
                      <td data-label="Balance">{formatQty(colour.balance)}</td>
                      <td data-label="Status">
                        <span className={`badge badge--${LINE_STATUS_BADGE[colour.status]}`}>{LINE_STATUS_LABEL[colour.status]}</span>
                        {colour.excess > 0 && <span className="badge badge--no"> Excess {formatQty(colour.excess)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}

        <h3 className="section-title section-title--next">Receipts</h3>
        {po.receipts.length === 0 && <p className="hint">Nothing has been received yet.</p>}
        {po.receipts.length > 0 && (
          <div className="po-view-scroll">
            <table className="cad-table po-view-table" data-receipts>
              <thead>
                <tr>
                  <th>RECEIVED DATE</th>
                  <th>BILL NO</th>
                  <th>BILL DATE</th>
                  <th>WHAT CAME</th>
                  <th>PHOTO</th>
                  <th>ENTERED BY</th>
                  {isAdmin && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {po.receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td>{formatDate(receipt.received_date)}</td>
                    <td>{receipt.bill_no}</td>
                    <td>{formatDate(receipt.bill_date)}</td>
                    <td>
                      {receipt.items
                        .map((item) => {
                          const line = po.lines.find((row) => row.id === item.po_line_id)
                          const colour = lineDetails(line, allowance).find((row) => row.no === item.colour_no)
                          return `${colour.lot}${colour.colour ? ` ${colour.colour}` : ''}: ${formatQty(item.qty)} ${line.unit}`
                        })
                        .join(', ')}
                    </td>
                    <td>{receipt.photo_path && <ClickableImage bucket={BUCKET} path={receipt.photo_path} alt={`Photo of receipt ${receipt.bill_no}`} size={40} />}</td>
                    <td>
                      {person(receipt.created_by)}, {formatDateTime(receipt.created_at)}
                    </td>
                    {isAdmin && (
                      <td>
                        <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'remove', receipt })}>
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="section-title section-title--next">Follow-ups</h3>
        {po.followups.length === 0 && <p className="hint">No follow-up has been written yet.</p>}
        {po.followups.length > 0 && (
          <div className="po-view-scroll">
            <table className="cad-table po-view-table" data-followups>
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>WHAT THE VENDOR SAID</th>
                  <th>NEW PROMISED DATE</th>
                  <th>ENTERED BY</th>
                </tr>
              </thead>
              <tbody>
                {[...po.followups].reverse().map((followup) => (
                  <tr key={followup.id}>
                    <td>{formatDate(followup.followup_date)}</td>
                    <td>{followup.remark}</td>
                    <td>{formatDate(followup.promised_date)}</td>
                    <td>
                      {person(followup.created_by)}, {formatDateTime(followup.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {dialog?.type === 'receive' && (
        <ReceiveDialog po={po} data={data} onClose={() => setDialog(null)} onSaved={(lots) => done(`${po.po_no} received. Lot ${lots}.`)} />
      )}
      {dialog?.type === 'followup' && <FollowupDialog po={po} onClose={() => setDialog(null)} onSaved={() => done(`Follow-up added to ${po.po_no}.`)} />}
      {dialog?.type === 'complete' && (
        <CompleteDialog line={dialog.line} name={dialog.name} onClose={() => setDialog(null)} onSaved={() => done(`${dialog.name} marked complete.`)} />
      )}
      {dialog?.type === 'remove' && (
        <ConfirmDialog
          title="Remove this receipt?"
          message={`The receipt of bill ${dialog.receipt.bill_no} is taken off and its quantities no longer count. Lot numbers already given stay.`}
          confirmLabel="Remove"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => run('delete_po_receipt', { p_id: dialog.receipt.id }, `Receipt of bill ${dialog.receipt.bill_no} removed.`)}
        />
      )}
    </Modal>
  )
}
