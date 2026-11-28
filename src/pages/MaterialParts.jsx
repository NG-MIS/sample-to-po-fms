import { useMemo, useState } from 'react'
import { digitsTyped, numberTyped } from '../lib/calc.js'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { Field } from '../components/Field.jsx'
import {
  addLabelFor,
  cadsOfEntry,
  checkPrimaryLines,
  colourText,
  formatPrimaryQty,
  isTypedValue,
  namedOptions,
  pickValue,
  primaryDetailsPending,
  primaryLinesFor,
  sizeLabel,
  typedName,
  typedValue,
} from '../lib/cad.js'
import { friendlyError } from '../lib/format.js'
import {
  KIND_LABEL,
  LIST_STATUS_BADGE,
  LIST_STATUS_LABEL,
  NOT_REQUIRED_LABEL,
  NOT_REQUIRED_REASONS,
  accessoryGroupsText,
  accessoryItemFromPrimaryLine,
  accessoryItemsPayload,
  accessoryRequiredText,
  cadRowsToBring,
  drawingOfItems,
  checkAccessoryRates,
  checkFabricItems,
  fabricItemFromCadRow,
  fabricItemsPayload,
  fabricRequired,
  familyOf,
  formatQty,
  isConfirmed,
  isFabricKind,
  itemState,
  itemsOf,
  levelOf,
  listProgress,
  listStatus,
  newAccessoryItem,
  newFabricItem,
  orderableItems,
  toAccessoryItems,
  toFabricItems,
  vendorOfItem,
} from '../lib/materials.js'
import { QTY_TYPE_LABEL } from '../lib/sampleAccessories.js'
import { callSampleAction } from '../lib/sampleData.js'
import { AccessoryLineEditor } from './CadParts.jsx'

const numberOnly = numberTyped
const digitsOnly = digitsTyped

// The status of one material list as a coloured label.
export function ListStatusBadge({ entry, kind }) {
  const status = listStatus(entry, kind)
  return <span className={`badge badge--${LIST_STATUS_BADGE[status]}`}>{LIST_STATUS_LABEL[status]}</span>
}

// Where one material stands: its PO, or why it is not required.
function ItemStanding({ item }) {
  const state = itemState(item)
  if (state === 'ordered') return <span className="badge badge--completed">{item.orders.map((order) => order.po_no).join(', ')}</span>
  if (state === 'not_required') {
    return (
      <span className="badge badge--skip" title={item.not_required_remark ?? ''}>
        {NOT_REQUIRED_LABEL[item.not_required]}
      </span>
    )
  }
  return <span className="hint">To order</span>
}

// ---------- Marking one material not required ----------

function NotRequiredDialog({ item, name, onClose, onDone }) {
  const [reason, setReason] = useState(null)
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (event) => {
    event.preventDefault()
    if (!reason) return setError('Choose the reason.')
    setBusy(true)
    setError('')
    try {
      await callSampleAction('mark_material_not_required', { p_item_id: item.id, p_reason: reason, p_remark: remark })
      await onDone()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Not required: ${name}`}
      onClose={onClose}
      dirty={Boolean(reason) || remark.trim() !== ''}
      width={440}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="not-required-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Marking…' : 'Mark not required'}
          </button>
        </>
      )}
    >
      <form id="not-required-form" onSubmit={save} noValidate>
        <p className="hint fabric-intro">No PO will be raised for this material. Only a person with authority All can take the mark off again.</p>
        <Field label="Reason" htmlFor="not-required-reason" required>
          <PickList id="not-required-reason" options={NOT_REQUIRED_REASONS} value={reason} onChange={setReason} clearable={false} />
        </Field>
        <Field label="Remark" htmlFor="not-required-remark">
          <input id="not-required-remark" className="input" value={remark} onChange={(event) => setRemark(event.target.value)} />
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

// ---------- One material list of a wishlist item ----------
//   entry / sample - the wishlist item and its sample
//   kind           - which of the four lists
//   canEdit        - may change the list, mark not required and raise POs
//   onChanged      - called after every save; the screen then loads again
//   onRaise        - called with { family, vendorId } to raise a PO
export function MaterialListDialog({ entry, sample, kind, data, canEdit, isAdmin, onClose, onChanged, onRaise }) {
  const fabric = isFabricKind(kind)
  const combination = data.sizeRatios.find((row) => row.id === entry.size_ratio_id)
  const sizes = combination.sizes
  const saved = itemsOf(entry, kind)
  const savedById = new Map(saved.map((item) => [item.id, item]))
  const confirmed = isConfirmed(entry, kind)
  const tolerance = data.purchaseSettings?.fabric_tolerance ?? 0

  const toLines = fabric ? toFabricItems : toAccessoryItems
  const payload = fabric ? fabricItemsPayload : accessoryItemsPayload
  // The form starts from the saved list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => toLines(saved), [])
  const [lines, setLines] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [marking, setMarking] = useState(null)
  const setLine = (key, changes) => setLines((previous) => previous.map((line) => (line.key === key ? { ...line, ...changes } : line)))
  const removeLine = (key) => setLines((previous) => previous.filter((line) => line.key !== key))
  const dirty = JSON.stringify(payload(lines)) !== JSON.stringify(payload(initial))
  const locked = (line) => Boolean(line.id) && itemState(savedById.get(line.id)) !== 'open'

  const fabricName = (id) => data.fabrics.find((row) => row.id === id)?.name ?? ''
  const accessoryName = (id) => data.accessories.find((row) => row.id === id)?.name ?? ''
  const vendors = fabric ? data.fabricVendors : data.accessoryVendors
  const vendorCode = (id) => vendors.find((row) => row.id === id)?.code ?? ''
  const usedVendors = saved.map(vendorOfItem)
  const vendorOptions = vendors
    .filter((vendor) => vendor.is_active || usedVendors.includes(vendor.id))
    .map((vendor) => ({ value: vendor.id, label: vendor.is_active ? vendor.code : `${vendor.code} (inactive)` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const fabricOptions = namedOptions(data.fabrics, saved.map((item) => item.fabric_id), [])
  const typedNames = fabric ? [] : [...new Set(lines.map((line) => line.new_accessory).filter(Boolean))]
  const accessoryOptions = namedOptions(data.accessories, saved.map((item) => item.accessory_id), typedNames)
  const addLabel = addLabelFor(data.accessories, typedNames)
  // Secondary accessories are ticked first, from the whole accessories master (a new name
  // can be typed), and then one table opens for each of them, all at once.
  const tickValue = (line) => pickValue(line.accessory_id, line.new_accessory)
  const tickedValues = fabric ? [] : [...new Set(lines.map(tickValue).filter((value) => value !== null))]
  const setTicked = (values) =>
    setLines((previous) => {
      // a table already ordered or marked not required stays, whatever is unticked
      const kept = previous.filter((line) => tickValue(line) === null || locked(line) || values.includes(tickValue(line)))
      const have = kept.map(tickValue)
      const added = values
        .filter((value) => !have.includes(value))
        .map((value) => {
          const accessory = isTypedValue(value) ? null : data.accessories.find((item) => item.id === value)
          return newAccessoryItem(sizes, accessory ? { accessory_id: accessory.id, qty_type: accessory.default_qty_type ?? null, ticked: true } : { new_accessory: typedName(value), ticked: true })
        })
      return [...kept, ...added]
    })
  const tickTyped = (typed) => {
    const name = typed.trim().replace(/\s+/g, ' ')
    const known = data.accessories.find((item) => item.name.toLowerCase() === name.toLowerCase())
    setTicked([...tickedValues, known ? known.id : typedValue(name)])
  }
  const tickedName = (line) => (line.accessory_id ? (data.accessories.find((item) => item.id === line.accessory_id)?.name ?? '') : line.new_accessory)

  // What can be brought in instead of typing.
  const assignedCads = cadsOfEntry(sample, entry)
  // A drawing is a complete fabric list, so the rows come from one CAD only.
  // The secondary fabric list follows the drawing of the primary fabric list.
  const primaryDrawing = kind === 'secondary_fabric' ? drawingOfItems(assignedCads, itemsOf(entry, 'primary_fabric')) : null
  const otherDrawing = kind === 'primary_fabric' ? drawingOfItems(assignedCads, itemsOf(entry, 'secondary_fabric')) : null
  const [pickedDrawing, setPickedDrawing] = useState(() => drawingOfItems(assignedCads, saved) ?? otherDrawing)
  const drawingId = assignedCads.length === 1 ? assignedCads[0].id : (primaryDrawing ?? pickedDrawing)
  const drawing = assignedCads.find((cad) => cad.id === drawingId) ?? null
  const cadOfRow = (rowId) => assignedCads.find((cad) => cad.rows.some((row) => row.id === rowId))
  // rows that came from another drawing than the chosen one
  const fromOther = (line) => Boolean(line.cad_row_id) && Boolean(drawing) && cadOfRow(line.cad_row_id) && cadOfRow(line.cad_row_id).id !== drawing.id
  const staleLines = fabric ? lines.filter(fromOther) : []
  // a row of a drawing already ordered or marked not required keeps the list on that drawing
  const drawingFixed = fabric && lines.some((line) => line.cad_row_id && locked(line))
  // Takes the rows of one drawing: open rows of the other drawings go, its own rows come in.
  const takeDrawing = (cad) => {
    setPickedDrawing(cad.id)
    setLines((previous) => {
      const kept = previous.filter((line) => !line.cad_row_id || locked(line) || cadOfRow(line.cad_row_id)?.id === cad.id || !cadOfRow(line.cad_row_id))
      return [...kept, ...cadRowsToBring([cad], levelOf(kind), kept).ready.map(fabricItemFromCadRow)]
    })
  }
  const cadRows = fabric ? cadRowsToBring(drawing ? [drawing] : [], levelOf(kind), lines) : null
  const cadRowById = new Map(assignedCads.flatMap((cad) => cad.rows.map((row) => [row.id, { ...row, cad_no: cad.cad_no }])))
  const particular = (id) => data.cadParticulars.find((row) => row.id === id)?.name ?? ''
  const primaryList = primaryLinesFor(sample, entry.size_ratio_id)
  // An accessory can be on the CAD list more than once: of each accessory, as many
  // lines are left to bring in as are not here yet.
  const leftToBring = (list) => {
    const here = new Map()
    lines.forEach((item) => item.accessory_id && here.set(item.accessory_id, (here.get(item.accessory_id) ?? 0) + 1))
    return list.filter((line) => {
      const have = here.get(line.accessory_id) ?? 0
      if (have > 0) here.set(line.accessory_id, have - 1)
      return have === 0
    })
  }
  const primaryToBring =
    kind === 'primary_accessory'
      ? leftToBring(primaryList.filter((line) => !primaryDetailsPending(line)))
      : []
  // accessories on the CAD list whose details are still to be filled there: they cannot be brought in yet
  const primaryWaiting =
    kind === 'primary_accessory'
      ? primaryList.filter(primaryDetailsPending)
      : []
  // Shown on top of the secondary accessory list, to look at only.
  const primaryShown =
    kind === 'secondary_accessory'
      ? itemsOf(entry, 'primary_accessory').length
        ? itemsOf(entry, 'primary_accessory')
        : primaryList
      : []

  const save = async (confirm) => {
    const problem = fabric
      ? checkFabricItems(lines)
      : checkPrimaryLines(lines.filter((line) => !locked(line))) || checkAccessoryRates(lines)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      await callSampleAction('save_material_list', {
        p_wishlist_id: entry.id,
        p_kind: kind,
        p_items: payload(lines),
        p_confirm: confirm,
      })
      // the secondary fabric list follows the drawing of the primary one
      const follow =
        kind === 'primary_fabric' && drawing && otherDrawing && otherDrawing !== drawing.id && lines.some((line) => line.cad_row_id)
          ? ` The secondary fabric list still has rows of ${assignedCads.find((cad) => cad.id === otherDrawing).cad_no}: open it to take the rows of ${drawing.cad_no}.`
          : ''
      await onChanged((confirm ? `${KIND_LABEL[kind]} list of ${entry.wishlist_no} confirmed.` : `${KIND_LABEL[kind]} list of ${entry.wishlist_no} saved.`) + follow)
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  const undoNotRequired = async (item) => {
    setBusy(true)
    setError('')
    try {
      await callSampleAction('mark_material_not_required', { p_item_id: item.id, p_reason: null, p_remark: null })
      await onChanged('The Not required mark was taken off.')
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  // The buttons of one saved material: Not required, or (authority All) taking the mark off.
  const itemButtons = (line, name) => {
    const item = line.id ? savedById.get(line.id) : null
    if (!item) return null
    const state = itemState(item)
    if (state === 'not_required' && isAdmin) {
      return (
        <button type="button" className="btn btn--small" disabled={busy} onClick={() => undoNotRequired(item)}>
          Undo not required
        </button>
      )
    }
    if (state === 'open' && canEdit && confirmed) {
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={dirty}
          title={dirty ? 'Save your changes first' : ''}
          onClick={() => setMarking({ item, name })}
        >
          Not required
        </button>
      )
    }
    return null
  }

  // One PO per vendor: the vendors that still have something to order.
  const family = familyOf(kind)
  const open = orderableItems(entry, family)
  const byVendor = new Map()
  open.forEach((item) => {
    const vendor = vendorOfItem(item)
    if (vendor) byVendor.set(vendor, (byVendor.get(vendor) ?? 0) + 1)
  })
  const withoutVendor = saved.filter((item) => itemState(item) === 'open' && !vendorOfItem(item)).length
  const allVendors = family === 'fabric' ? data.fabricVendors : data.accessoryVendors

  return (
    <Modal
      title={`${KIND_LABEL[kind]} list: ${entry.wishlist_no}`}
      onClose={onClose}
      dirty={canEdit && dirty}
      width={1080}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button type="button" className="btn" disabled={busy || (!dirty && Boolean(entry.lists[kind]))} onClick={() => save(false)}>
              {busy ? 'Saving…' : confirmed ? 'Save changes' : 'Save draft'}
            </button>
          )}
          {canEdit && !confirmed && (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => save(true)}>
              Confirm list
            </button>
          )}
        </>
      )}
    >
      <div data-material-list={kind}>
        <dl className="details material-head">
          <div>
            <dt>Sample</dt>
            <dd>{sample.sample_no}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{sizeLabel(combination)}</dd>
          </div>
          <div>
            <dt>Qty</dt>
            <dd>{entry.qty} pcs</dd>
          </div>
          <div>
            <dt>List</dt>
            <dd>
              <ListStatusBadge entry={entry} kind={kind} /> <span className="hint">{listProgress(entry, kind)}</span>
            </dd>
          </div>
        </dl>
        <p className="hint fabric-intro">
          {confirmed
            ? 'This list is confirmed. A material can still be changed until it is on a PO or marked not required.'
            : 'Fill the list, then press Confirm list. POs can be raised only from a confirmed list. A list with nothing in it can be confirmed too, when there is nothing to order.'}
        </p>

        {primaryShown.length > 0 && (
          <section className="material-view" aria-label="Primary accessory list, to look at only">
            <h3 className="section-title">Primary accessory list (view only)</h3>
            <ul className="material-view-list">
              {primaryShown.map((line) => (
                <li key={line.id}>
                  <strong>{accessoryName(line.accessory_id)}</strong>
                  {primaryDetailsPending(line) ? (
                    <>
                      : <span className="badge badge--pending">Details pending</span>
                    </>
                  ) : (
                    <>
                      {' '}
                      ({QTY_TYPE_LABEL[line.qty_type]}): {accessoryGroupsText(line, sizes, formatPrimaryQty)}
                      {colourText(line) ? `. ${colourText(line)}` : ''}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {fabric && assignedCads.length > 0 && (
          <div className="material-drawing" data-material-drawing>
            <label className="field-label" htmlFor="material-drawing">
              Drawing
            </label>
            {canEdit && !primaryDrawing && assignedCads.length > 1 ? (
              <PickList
                id="material-drawing"
                options={assignedCads.map((cad) => ({ value: cad.id, label: `${cad.cad_no} (${cad.rows.length} ${cad.rows.length === 1 ? 'row' : 'rows'})` }))}
                value={drawingId}
                clearable={false}
                disabled={drawingFixed}
                onChange={(id) => takeDrawing(assignedCads.find((cad) => cad.id === id))}
                placeholder="Choose the drawing…"
              />
            ) : (
              <strong data-drawing-fixed>{drawing ? drawing.cad_no : 'Not chosen yet'}</strong>
            )}
            <span className="hint">
              {assignedCads.length === 1
                ? ''
                : primaryDrawing
                ? 'Same drawing as the primary fabric list.'
                : drawingFixed
                  ? 'A row of this drawing is already ordered or marked not required, so the drawing cannot be changed.'
                  : 'This item has more than one drawing. Each is a complete fabric list, so the rows are taken from one drawing only.'}
            </span>
          </div>
        )}
        {canEdit && fabric && staleLines.length > 0 && (
          <p className="alert alert--error" role="alert" data-drawing-stale>
            {staleLines.length} {staleLines.length === 1 ? 'row is' : 'rows are'} from another drawing than {drawing.cad_no}.{' '}
            {staleLines.every((line) => !locked(line)) ? (
              <button type="button" className="link link--strong" onClick={() => takeDrawing(drawing)}>
                Replace with the rows of {drawing.cad_no}
              </button>
            ) : (
              'Some of them are already ordered or marked not required and stay.'
            )}
          </p>
        )}
        {canEdit && fabric && (
          <div className="material-bring">
            <button
              type="button"
              className="btn"
              disabled={cadRows.ready.length === 0}
              onClick={() => setLines((previous) => [...previous, ...cadRows.ready.map(fabricItemFromCadRow)])}
            >
              Bring in from {drawing && assignedCads.length > 1 ? drawing.cad_no : 'CADs'}{cadRows.ready.length ? ` (${cadRows.ready.length})` : ''}
            </button>
            <span className="hint">
              {assignedCads.length === 0
                ? 'No CAD has been made for this sample, size and ratio yet.'
                : !drawing
                  ? 'Choose the drawing first.'
                  : cadRows.ready.length === 0
                  ? `Every ${levelOf(kind)} drawing row that has a fabric is already here.`
                  : `${levelOf(kind) === 'primary' ? 'Primary' : 'Secondary'} drawing rows of ${drawing.cad_no}.`}
              {cadRows.withoutFabric > 0 && ` ${cadRows.withoutFabric} drawing ${cadRows.withoutFabric === 1 ? 'row has' : 'rows have'} no fabric yet and cannot be brought in.`}
            </span>
          </div>
        )}
        {canEdit && kind === 'primary_accessory' && (
          <div className="material-bring">
            <button
              type="button"
              className="btn"
              disabled={primaryToBring.length === 0}
              onClick={() => setLines((previous) => [...previous, ...primaryToBring.map((line) => accessoryItemFromPrimaryLine(line, sizes))])}
            >
              Bring in primary accessory list{primaryToBring.length ? ` (${primaryToBring.length})` : ''}
            </button>
            <span className="hint">
              {primaryList.length === 0
                ? 'No primary accessory list has been set up with the CADs for this size yet.'
                : primaryToBring.length === 0
                  ? 'Everything on the primary accessory list is already here.'
                  : 'The list set up with the CADs. Review it, then add the vendor and rate.'}
              {primaryWaiting.length > 0 && (
                <strong data-primary-waiting>
                  {' '}
                  {primaryWaiting.length} {primaryWaiting.length === 1 ? 'accessory has' : 'accessories have'} details pending on the CAD list and
                  cannot be brought in yet: {primaryWaiting.map((line) => data.accessories.find((item) => item.id === line.accessory_id)?.name).join(', ')}.
                </strong>
              )}
            </span>
          </div>
        )}

        {lines.length === 0 && <p className="hint">Nothing is on this list yet.</p>}

        {fabric && lines.length > 0 && (
          <table className="cad-table cad-table--edit material-table">
            <thead>
              <tr>
                <th>FABRIC NAME</th>
                <th>PARTICULARS</th>
                <th>MSRMNT</th>
                <th>PCS IN LAYER</th>
                <th>PAINA</th>
                <th title="Cloth one garment needs besides the drawing, such as a flower or piping. It comes from the by-products of the CAD row.">BY-PRODUCT (MTR / PC)</th>
                <th>VENDOR CODE</th>
                <th>RATE</th>
                <th>TO ORDER (MTR)</th>
                <th>STATUS</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const fixed = !canEdit || locked(line)
                const row = cadRowById.get(line.cad_row_id)
                const needed = fabricRequired(line, entry.qty, tolerance)
                const item = line.id ? savedById.get(line.id) : null
                return (
                  <tr key={line.key} data-material-item={index + 1}>
                    <td data-label="Fabric name">
                      {fixed ? (
                        fabricName(line.fabric_id)
                      ) : (
                        <PickList
                          id={`material-${line.key}-fabric`}
                          options={fabricOptions}
                          value={line.fabric_id}
                          clearable={false}
                          onChange={(value) => setLine(line.key, { fabric_id: value })}
                        />
                      )}
                    </td>
                    <td data-label="Particulars">{row ? particular(row.particular_id) : line.cad_row_id ? 'CAD' : 'Added by hand'}</td>
                    {[
                      ['msrmnt', 'Msrmnt', numberOnly],
                      ['pcs_in_layer', 'Pcs in layer', digitsOnly],
                      ['paina', 'Paina', numberOnly],
                      ['by_product', 'By-product', numberOnly],
                    ].map(([field, label, clean]) => (
                      <td key={field} data-label={label}>
                        {fixed ? (
                          line[field]
                        ) : (
                          <input
                            className="input"
                            inputMode="decimal"
                            aria-label={`${label}, line ${index + 1}`}
                            value={line[field]}
                            onChange={(event) => setLine(line.key, { [field]: clean(event.target.value) })}
                          />
                        )}
                      </td>
                    ))}
                    <td data-label="Vendor code">
                      {fixed ? (
                        vendorCode(line.vendor_id)
                      ) : (
                        <PickList
                          id={`material-${line.key}-vendor`}
                          options={vendorOptions}
                          value={line.vendor_id}
                          onChange={(value) => setLine(line.key, { vendor_id: value })}
                          placeholder={vendorOptions.length ? 'Select…' : 'No fabric vendor in Masters'}
                        />
                      )}
                    </td>
                    <td data-label="Rate">
                      {fixed ? (
                        line.rate
                      ) : (
                        <input
                          className="input"
                          inputMode="decimal"
                          aria-label={`Rate, line ${index + 1}`}
                          value={line.rate}
                          onChange={(event) => setLine(line.key, { rate: numberOnly(event.target.value) })}
                        />
                      )}
                    </td>
                    <td data-label="To order (mtr)" data-to-order title={needed ? `${formatQty(needed.base)} mtr before the extra${needed.byProduct ? `, of which ${formatQty(needed.byProduct)} mtr for by-products` : ''}` : ''}>
                      {needed ? needed.order : <span className="hint">—</span>}
                    </td>
                    <td data-label="Status">{item ? <ItemStanding item={item} /> : <span className="hint">Not saved</span>}</td>
                    <td className="material-actions">
                      {itemButtons(line, fabricName(line.fabric_id))}
                      {!fixed && (
                        <button type="button" className="btn btn--small" aria-label={`Remove line ${index + 1}`} onClick={() => removeLine(line.key)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {fabric && (
          <p className="hint">
            To order = Msrmnt ÷ No. of pcs in layer × {entry.qty} pcs
            {Number(tolerance) ? `, plus ${formatQty(tolerance)}% more,` : ','} rounded up to the next 10.
          </p>
        )}

        {kind === 'secondary_accessory' && canEdit && (
          <div className="primary-pick" data-secondary-pick>
            <label className="field-label" htmlFor="secondary-pick">
              Secondary accessories of this item
            </label>
            <PickList
              id="secondary-pick"
              multiple
              options={accessoryOptions}
              value={tickedValues}
              onChange={setTicked}
              onCreate={tickTyped}
              createLabel={addLabel}
              placeholder="Tick the accessories…"
            />
            <span className="hint">
              Tick them from the accessories master, or type a new name to add it. A table opens below for each one to fill
              its details.
            </span>
          </div>
        )}
        {!fabric &&
          lines.map((line, index) => {
            const fixed = !canEdit || locked(line)
            const item = line.id ? savedById.get(line.id) : null
            const whole = line.qty_type && !checkPrimaryLines([line])
            return (
              <AccessoryLineEditor
                key={line.key}
                line={line}
                index={index}
                sizes={sizes}
                canEdit={!fixed}
                fixedName={kind === 'secondary_accessory' && (line.ticked || line.id) ? tickedName(line) : null}
                accessoryOptions={accessoryOptions}
                addLabel={addLabel}
                colours={data.colours}
                onChange={(changes) => setLine(line.key, changes)}
                onRemove={() => removeLine(line.key)}
              >
                <div className="material-extra" data-material-item={index + 1}>
                  <div className="fabric-cell">
                    <label className="field-label" htmlFor={`material-${line.key}-vendor`}>
                      Vendor code
                    </label>
                    <PickList
                      id={`material-${line.key}-vendor`}
                      options={vendorOptions}
                      value={line.vendor_id}
                      disabled={fixed}
                      onChange={(value) => setLine(line.key, { vendor_id: value })}
                      placeholder={vendorOptions.length ? 'Select…' : 'No accessory vendor in Masters'}
                    />
                  </div>
                  <div className="fabric-cell">
                    <label className="field-label" htmlFor={`material-${line.key}-rate`}>
                      Rate
                    </label>
                    <input
                      id={`material-${line.key}-rate`}
                      className="input"
                      inputMode="decimal"
                      disabled={fixed}
                      value={line.rate}
                      onChange={(event) => setLine(line.key, { rate: numberOnly(event.target.value) })}
                    />
                  </div>
                  <div className="material-need">
                    <span className="field-label">Needed for {entry.qty} pcs</span>
                    <span data-needed>{whole ? accessoryRequiredText(line, combination, entry.qty) : <span className="hint">—</span>}</span>
                  </div>
                  <div className="material-need">
                    <span className="field-label">Status</span>
                    {item ? <ItemStanding item={item} /> : <span className="hint">Not saved</span>}
                  </div>
                  <div className="material-actions">{itemButtons(line, accessoryName(line.accessory_id))}</div>
                </div>
              </AccessoryLineEditor>
            )
          })}

        {canEdit && (
          <button
            type="button"
            className="btn"
            onClick={() => setLines((previous) => [...previous, fabric ? newFabricItem() : newAccessoryItem(sizes)])}
          >
            {fabric ? 'Add fabric' : 'Add accessory'}
          </button>
        )}

        {confirmed && canEdit && (
          <section className="material-orders" aria-label="Purchase orders">
            <h3 className="section-title">Raise purchase orders</h3>
            {byVendor.size === 0 && <p className="hint">Nothing is waiting for a PO.</p>}
            {byVendor.size > 0 && (
              <p className="hint">
                One PO per vendor. It carries every {family} of this wishlist item that is confirmed and still to order from
                that vendor.
              </p>
            )}
            <div className="material-order-buttons">
              {[...byVendor.entries()].map(([vendorId, count]) => {
                const vendor = allVendors.find((row) => row.id === vendorId)
                return (
                  <button
                    key={vendorId}
                    type="button"
                    className="btn btn--primary"
                    disabled={dirty}
                    title={dirty ? 'Save your changes first' : ''}
                    onClick={() => onRaise({ family, vendorId })}
                  >
                    Raise PO to {vendor?.code} ({count} {count === 1 ? 'item' : 'items'})
                  </button>
                )
              })}
            </div>
            {withoutVendor > 0 && (
              <p className="hint">
                {withoutVendor} {withoutVendor === 1 ? 'material has' : 'materials have'} no vendor yet. Choose the vendor
                to raise its PO, or mark it not required.
              </p>
            )}
            {dirty && byVendor.size > 0 && <p className="hint">Save your changes first, then raise the PO.</p>}
          </section>
        )}

        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </div>
      {marking && (
        <NotRequiredDialog
          item={marking.item}
          name={marking.name}
          onClose={() => setMarking(null)}
          onDone={() => onChanged(`${marking.name} marked not required.`)}
        />
      )}
    </Modal>
  )
}
