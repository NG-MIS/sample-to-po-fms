// Helpers for the material lists of a wishlist item and for purchase orders.
// A wishlist item has four lists: primary fabric, secondary fabric,
// primary accessory and secondary accessory.

import { COLOUR_FOLLOWS_LABEL, colourFields, colourPayload, groupSizes, hasSamePcs, newPrimaryGroup, sizeSpan } from './cad.js'

let counter = 0
const key = (prefix) => `${prefix}-${++counter}`
const text = (value) => (value === null || value === undefined ? '' : String(Number(value)))
const orNull = (value) => (String(value ?? '').trim() === '' ? null : String(value).trim())

export const KINDS = [
  { key: 'primary_fabric', label: 'Primary fabric', short: 'PRIMARY FABRIC' },
  { key: 'primary_accessory', label: 'Primary accessory', short: 'PRIMARY ACCESSORY' },
  { key: 'secondary_fabric', label: 'Secondary fabric', short: 'SECONDARY FABRIC' },
  { key: 'secondary_accessory', label: 'Secondary accessory', short: 'SECONDARY ACCESSORY' },
]
export const KIND_LABEL = Object.fromEntries(KINDS.map((kind) => [kind.key, kind.label]))
export const isFabricKind = (kind) => kind === 'primary_fabric' || kind === 'secondary_fabric'
// 'fabric' or 'accessory': what a PO for this list is.
export const familyOf = (kind) => (isFabricKind(kind) ? 'fabric' : 'accessory')
// 'primary' or 'secondary'.
export const levelOf = (kind) => kind.split('_')[0]

export const NOT_REQUIRED_REASONS = [
  { value: 'in_house', label: 'Already in-house' },
  { value: 'not_needed', label: 'Not required at all' },
]
export const NOT_REQUIRED_LABEL = { in_house: 'Already in-house', not_needed: 'Not required at all' }

export const LIST_STATUS_LABEL = { pending: 'Pending', updated: 'Updated', ordered: 'Ordered', received: 'Received' }
export const LIST_STATUS_BADGE = { pending: 'pending', updated: 'maybe', ordered: 'ordered', received: 'completed' }

export const UNIT_LABEL = { mtr: 'mtr', pcs: 'pcs', inch: 'inch' }

// ---------- Where a list stands ----------

export const itemsOf = (entry, kind) => entry.materials.filter((item) => item.kind === kind)
export const isConfirmed = (entry, kind) => Boolean(entry.lists[kind]?.confirmed_at)

// 'ordered' (on a raised PO), 'not_required', or 'open' (still to be dealt with).
export const itemState = (item) => (item.not_required ? 'not_required' : item.orders.length ? 'ordered' : 'open')
export const isLocked = (item) => itemState(item) !== 'open'

// Pending - the list has not been confirmed yet.
// Updated - confirmed, with at least one item still to order.
// Ordered - confirmed, and every item has a PO or is marked not required.
// Received - ordered, and everything on a PO has come (or was closed short).
export function listStatus(entry, kind) {
  if (!isConfirmed(entry, kind)) return 'pending'
  const items = itemsOf(entry, kind)
  if (!items.every(isLocked)) return 'updated'
  const onOrder = items.filter((item) => itemState(item) === 'ordered')
  return onOrder.length > 0 && onOrder.every((item) => item.orders.every((order) => order.received)) ? 'received' : 'ordered'
}
// Ordered or received: nothing on the list still waits for a PO.
export const listOrdered = (entry, kind) => ['ordered', 'received'].includes(listStatus(entry, kind))

// "2 of 3 dealt with", for a confirmed list.
export function listProgress(entry, kind) {
  const items = itemsOf(entry, kind)
  if (!isConfirmed(entry, kind)) return items.length ? `${items.length} in draft` : ''
  if (items.length === 0) return 'Nothing to order'
  return `${items.filter(isLocked).length} of ${items.length} dealt with`
}

// ---------- Quantities ----------

// How many garment pieces of each single size a wishlist quantity makes.
// 900 pcs in 22-38 at 1:1 -> 100 of each of the 9 sizes.
export function piecesBySize(combination, qty) {
  const shares = combination.size_pieces ?? combination.sizes.map(() => 1)
  const perSet = shares.reduce((sum, share) => sum + share, 0)
  return shares.map((share) => Math.ceil((Number(qty) * share) / perSet - 1e-9))
}

// Fabric to order for a wishlist quantity, in metres:
//   Msrmnt ÷ No. of pcs in layer × quantity, plus the tolerance, rounded up to the next 10.
// Gives null when the measurement or the pieces are missing.
export function fabricRequired(item, qty, tolerance) {
  const msrmnt = Number(item.msrmnt)
  const pieces = Number(item.pcs_in_layer)
  if (!msrmnt || !pieces) return null
  const base = (msrmnt / pieces) * Number(qty)
  const withTolerance = base * (1 + Number(tolerance || 0) / 100)
  return { base, withTolerance, order: Math.ceil(withTolerance / 10 - 1e-9) * 10 }
}

const round2 = (value) => Math.round(value * 100) / 100
export const formatQty = (value) => (value === null || value === undefined ? '' : String(round2(Number(value))))
export const formatMoney = (value) =>
  value === null || value === undefined ? '' : Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// What an accessory comes to for a wishlist quantity, one part per different
// size: [{ dimension, pieces, inches }].
//   quantity  - one part: the pieces
//   length    - one part per length: pieces, and the whole length in inches
//   dimension - one part per length × breadth: pieces
export function accessoryParts(item, combination, qty) {
  const perSize = piecesBySize(combination, qty)
  const covered = groupSizes(item.groups, combination.sizes)
  const parts = new Map()
  item.groups.forEach((group, index) => {
    const garments = covered[index].reduce((sum, size) => sum + perSize[combination.sizes.indexOf(size)], 0)
    const pieces = garments * Number(group.pcs)
    const dimension =
      item.qty_type === 'quantity'
        ? ''
        : item.qty_type === 'length'
          ? `${text(group.qty)} inch`
          : `${text(group.qty)} × ${text(group.breadth)} inch`
    const part = parts.get(dimension) ?? { dimension, pieces: 0, inches: 0 }
    part.pieces += pieces
    part.inches += item.qty_type === 'length' ? pieces * Number(group.qty) : 0
    parts.set(dimension, part)
  })
  return [...parts.values()]
}

// The same as a sentence: "5400 pcs", "400 pcs of 6 inch + 1400 pcs of 10 inch (16400 inch)".
export function accessoryRequiredText(item, combination, qty) {
  const parts = accessoryParts(item, combination, qty)
  if (item.qty_type === 'quantity') return `${parts[0].pieces} pcs`
  const each = parts.map((part) => `${part.pieces} pcs of ${part.dimension}`).join(' + ')
  if (item.qty_type !== 'length') return each
  return `${each} (${formatQty(parts.reduce((sum, part) => sum + part.inches, 0))} inch in all)`
}

// The qty of one colour when what is needed is divided equally between the colours:
// each share is rounded up to the next 5 (700 in 3 colours = 235 each). With one
// colour, or none, it is what is needed as it is.
export const shareQty = (needed, colourCount) =>
  colourCount < 2 ? round2(needed) : Math.ceil(round2(needed / colourCount) / 5 - 1e-9) * 5

// What was typed as the qty of a PO line: one number (for every colour), or one
// number per colour joined with +. Gives { total } or { error }.
export function readQty(typed, colourCount) {
  const clean = (typed || '').replace(/\s/g, '')
  if (!/^\d+(\.\d{1,2})?(\+\d+(\.\d{1,2})?)*$/.test(clean)) {
    return { error: 'Qty must be a number, or numbers joined with +, for example 100+200+300.' }
  }
  const parts = clean.split('+').map(Number)
  if (parts.length === 1) {
    const total = round2(parts[0] * Math.max(colourCount, 1))
    return total > 0 ? { total } : { error: 'Qty must be more than zero.' }
  }
  if (parts.length !== colourCount) {
    return { error: `${parts.length} quantities are written but ${colourCount} ${colourCount === 1 ? 'colour is' : 'colours are'} named. They must be equal.` }
  }
  return { total: round2(parts.reduce((sum, part) => sum + part, 0)) }
}

// The colours of a line were changed. Until the qty is typed by hand, it is what is
// needed divided between the colours; what is needed is the qty the line started with.
export function withColours(line, colours) {
  if (line.qtyOwn) return { ...line, colours }
  const needed = line.needed ?? (/^\d+(\.\d+)?$/.test(line.qty_text.trim()) ? Number(line.qty_text) : null)
  if (!(needed > 0)) return { ...line, colours }
  return { ...line, colours, needed, qty_text: formatQty(shareQty(needed, colours.length)) }
}

// The promised date: order date + promise days.
export function promisedDate(orderDate, days) {
  if (!orderDate || String(days ?? '').trim() === '' || !/^\d{1,4}$/.test(String(days).trim())) return ''
  const [year, month, day] = orderDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + Number(days)))
  return date.toISOString().slice(0, 10)
}

// ---------- The fabric list editor ----------

export const newFabricItem = (changes = {}) => ({
  key: key('fabric-item'),
  id: null,
  fabric_id: null,
  cad_row_id: null,
  msrmnt: '',
  pcs_in_layer: '',
  paina: '',
  vendor_id: null,
  rate: '',
  ...changes,
})

export const toFabricItems = (items) =>
  items.map((item) => ({
    key: item.id,
    id: item.id,
    fabric_id: item.fabric_id,
    cad_row_id: item.cad_row_id,
    msrmnt: text(item.msrmnt),
    pcs_in_layer: text(item.pcs_in_layer),
    paina: text(item.paina),
    vendor_id: item.fabric_vendor_id,
    rate: text(item.rate),
  }))

const decimal = (value) => /^\d{1,8}(\.\d{1,2})?$/.test(String(value).trim())

export function checkFabricItems(lines) {
  for (const line of lines) {
    if (!line.fabric_id) return 'Every fabric line needs a fabric name.'
    if (line.msrmnt.trim() !== '' && !decimal(line.msrmnt)) return 'Msrmnt must be a number with at most 2 decimals.'
    if (line.pcs_in_layer.trim() !== '' && (!/^\d{1,6}$/.test(line.pcs_in_layer.trim()) || Number(line.pcs_in_layer) < 1)) {
      return 'No. of pcs in layer must be a whole number, 1 or more.'
    }
    if (line.paina.trim() !== '' && !decimal(line.paina)) return 'Paina must be a number with at most 2 decimals.'
    if (line.rate.trim() !== '' && !decimal(line.rate)) return 'Rate must be a number with at most 2 decimals.'
  }
  return ''
}

export const fabricItemsPayload = (lines) =>
  lines.map((line) => ({
    id: line.id,
    fabric_id: line.fabric_id,
    cad_row_id: line.cad_row_id,
    msrmnt: orNull(line.msrmnt),
    pcs_in_layer: orNull(line.pcs_in_layer),
    paina: orNull(line.paina),
    vendor_id: line.vendor_id,
    rate: orNull(line.rate),
  }))

// The CAD a fabric list was made from: the CAD of its rows that came from a drawing.
// A drawing is a complete fabric list, so a list takes its rows from one CAD only.
export const drawingOfItems = (cads, items) => {
  const used = new Set(items.map((item) => item.cad_row_id).filter(Boolean))
  return cads.find((cad) => cad.rows.some((row) => used.has(row.id)))?.id ?? null
}

// The drawing rows of the wishlist item's CADs that can still be brought in to a
// fabric list: rows of that type (primary / secondary) not in the list yet.
// Gives { ready, withoutFabric }: rows with a fabric, and how many have none.
export function cadRowsToBring(cads, level, lines) {
  const present = new Set(lines.map((line) => line.cad_row_id).filter(Boolean))
  const rows = cads.flatMap((cad) => cad.rows.filter((row) => row.fabric_type === level).map((row) => ({ ...row, cad_no: cad.cad_no })))
  return {
    ready: rows.filter((row) => row.fabric_id && !present.has(row.id)),
    withoutFabric: rows.filter((row) => !row.fabric_id).length,
  }
}

export const fabricItemFromCadRow = (row) =>
  newFabricItem({
    fabric_id: row.fabric_id,
    cad_row_id: row.id,
    msrmnt: text(row.msrmnt),
    pcs_in_layer: text(row.pcs_in_layer),
    paina: text(row.paina),
    vendor_id: row.vendor_id,
    rate: text(row.rate),
  })

// ---------- The accessory list editor ----------

const editorGroups = (groups) =>
  groups.map((group) => ({
    key: key('group'),
    upto: group.upto,
    pcs: text(group.pcs),
    qty: text(group.qty),
    breadth: text(group.breadth),
  }))

export const newAccessoryItem = (sizes, changes = {}) => ({
  key: key('accessory-item'),
  id: null,
  accessory_id: null,
  new_accessory: '',
  qty_type: null,
  groups: [newPrimaryGroup(sizes[sizes.length - 1])],
  colour_specific: false,
  colour_follows: null,
  colour: '',
  same_pcs: false,
  vendor_id: null,
  rate: '',
  ...changes,
})

export const toAccessoryItems = (items) =>
  items.map((item) => ({
    key: item.id,
    id: item.id,
    accessory_id: item.accessory_id,
    new_accessory: '',
    qty_type: item.qty_type,
    groups: editorGroups(item.groups),
    ...colourFields(item),
    same_pcs: hasSamePcs(item.groups),
    vendor_id: item.accessory_vendor_id,
    rate: text(item.rate),
  }))

// A line of the primary accessory list set up with the CADs, as a new item.
export const accessoryItemFromPrimaryLine = (line, sizes) =>
  newAccessoryItem(sizes, {
    accessory_id: line.accessory_id,
    qty_type: line.qty_type,
    groups: editorGroups(line.groups),
    ...colourFields(line),
    same_pcs: hasSamePcs(line.groups),
  })

export function checkAccessoryRates(lines) {
  for (const line of lines) {
    if (line.rate.trim() !== '' && !decimal(line.rate)) return 'Rate must be a number with at most 2 decimals.'
  }
  return ''
}

export const accessoryItemsPayload = (lines) =>
  lines.map((line) => ({
    id: line.id,
    accessory_id: line.accessory_id,
    new_accessory: line.accessory_id ? '' : line.new_accessory,
    qty_type: line.qty_type,
    groups: line.groups.map((group) => ({
      upto: group.upto,
      pcs: group.pcs.trim(),
      qty: line.qty_type === 'quantity' ? null : group.qty.trim(),
      breadth: line.qty_type === 'dimension' ? group.breadth.trim() : null,
    })),
    ...colourPayload(line),
    vendor_id: line.vendor_id,
    rate: orNull(line.rate),
  }))

// One saved accessory item as text: "22-24: 2 pcs × 6 inch; 26-38: 2 pcs × 10 inch".
export function accessoryGroupsText(item, sizes, formatGroup) {
  const covered = groupSizes(item.groups, sizes)
  return item.groups.map((group, index) => `${sizeSpan(covered[index])}: ${formatGroup(item.qty_type, group)}`).join('; ')
}

// ---------- Purchase orders ----------

export const PO_KINDS = [
  { value: 'fabric', label: 'Fabric' },
  { value: 'accessory', label: 'Accessory' },
]
export const PO_KIND_LABEL = { fabric: 'Fabric', accessory: 'Accessory' }
export const LENGTH_MODES = [
  { value: 'pcs', label: 'In pieces' },
  { value: 'inch', label: 'Whole length' },
]

export const newPoLine = (changes = {}) => ({
  key: key('po-line'),
  material_item_id: null,
  fabric_id: null,
  accessory_id: null,
  new_name: '',
  item_type: null,
  dimension: '',
  colours: [],
  qty_text: '',
  unit: 'pcs',
  rate: '',
  promise_days: '',
  daysOwn: false, // true once the promise days of this line were typed here
  qtyOwn: false, // true once the qty was typed here: it is then no longer divided between the colours
  needed: null, // the qty the line needs in all, kept while the qty is divided between the colours
  folds: '',
  paina: '',
  required: '', // what the material list says is needed, shown beside the qty
  colourSpecific: null, // for a line from an accessory list: must it name colours
  colourNote: '', // how the accessory is coloured, said in words
  lengthMode: null, // for a Length accessory: 'pcs' or 'inch'
  ...changes,
})

// The PO lines one fabric item starts with.
export function poLinesForFabricItem(item, entry, tolerance) {
  const needed = fabricRequired(item, entry.qty, tolerance)
  return [
    newPoLine({
      material_item_id: item.id,
      fabric_id: item.fabric_id,
      item_type: levelOf(item.kind),
      unit: 'mtr',
      qty_text: needed ? String(needed.order) : '',
      rate: text(item.rate),
      paina: text(item.paina),
      required: needed
        ? `${formatQty(needed.base)} mtr for ${entry.qty} pcs${Number(tolerance) ? `, ${formatQty(needed.withTolerance)} with ${text(tolerance)}% more` : ''}, rounded up to ${needed.order}`
        : 'Msrmnt or No. of pcs in layer is missing, so enter the qty',
    }),
  ]
}

// How an accessory of a material list is coloured, in words.
export const itemColourNote = (item) =>
  item.colour_specific
    ? item.colour_follows
      ? `Colour specific: the colours follow the ${COLOUR_FOLLOWS_LABEL[item.colour_follows].toLowerCase()}`
      : 'Colour specific'
    : item.colour
      ? `General, comes in ${item.colour}`
      : ''

// The colours of a PO line as shown on the PO: the colours ordered (with what
// they follow), or the one colour a general accessory comes in.
export function poLineColours(line, lookups) {
  const item = lookups.item.get(line.material_item_id)
  if (line.colours.length) {
    const follows = item?.colour_specific && item.colour_follows ? ` (${COLOUR_FOLLOWS_LABEL[item.colour_follows].toLowerCase()})` : ''
    return line.colours.join(', ') + follows
  }
  return item?.colour ?? ''
}

// The PO lines one accessory item starts with. A Length accessory is ordered
// as pieces of each length (mode 'pcs') or as its whole length in inches.
export function poLinesForAccessoryItem(item, entry, combination, mode = 'pcs') {
  const parts = accessoryParts(item, combination, entry.qty)
  const shared = {
    material_item_id: item.id,
    accessory_id: item.accessory_id,
    item_type: levelOf(item.kind),
    rate: text(item.rate),
    colourSpecific: item.colour_specific,
    colourNote: itemColourNote(item),
    lengthMode: item.qty_type === 'length' ? mode : null,
    required: accessoryRequiredText(item, combination, entry.qty),
  }
  if (item.qty_type === 'length' && mode === 'inch') {
    return [newPoLine({ ...shared, unit: 'inch', qty_text: formatQty(parts.reduce((sum, part) => sum + part.inches, 0)) })]
  }
  return parts.map((part) => newPoLine({ ...shared, unit: 'pcs', dimension: part.dimension, qty_text: String(part.pieces) }))
}

// The lines of a saved PO, ready for the form.
export const toPoLines = (po, itemsById) =>
  po.lines.map((line) => {
    const item = itemsById.get(line.material_item_id)
    return newPoLine({
      material_item_id: line.material_item_id,
      fabric_id: line.fabric_id,
      accessory_id: line.accessory_id,
      item_type: line.item_type,
      dimension: line.dimension ?? '',
      colours: line.colours,
      qty_text: line.qty_text,
      qtyOwn: true,
      unit: line.unit,
      rate: text(line.rate),
      promise_days: text(line.promise_days),
      daysOwn: true,
      folds: line.folds ?? '',
      paina: text(line.paina),
      colourSpecific: item && po.kind === 'accessory' ? item.colour_specific : null,
      colourNote: item && po.kind === 'accessory' ? itemColourNote(item) : '',
    })
  })

// Says what is wrong with the lines of a PO, or '' when it can be raised.
export function checkPoLines(lines, kind, isOpen) {
  if (lines.length === 0) return 'A PO needs at least one line.'
  for (const [index, line] of lines.entries()) {
    const where = `Line ${index + 1}: `
    if (isOpen && !line.material_item_id && !line.fabric_id && !line.accessory_id && !line.new_name) return `${where}choose the item.`
    if (kind === 'fabric' && line.colours.length === 0) return `${where}name the colours of the fabric.`
    if (line.colourSpecific === true && line.colours.length === 0) return `${where}this accessory is colour specific, so name its colours.`
    const qty = readQty(line.qty_text, line.colours.length)
    if (qty.error) return where + qty.error
    if (!decimal(line.rate)) return `${where}enter the rate.`
    if (line.promise_days.trim() !== '' && !/^\d{1,4}$/.test(line.promise_days.trim())) return `${where}promise days must be a whole number.`
    if (kind === 'fabric' && line.paina.trim() !== '' && !decimal(line.paina)) return `${where}paina must be a number.`
  }
  return ''
}

export const poLinesPayload = (lines, kind) =>
  lines.map((line) => ({
    material_item_id: line.material_item_id,
    fabric_id: line.material_item_id ? null : line.fabric_id,
    accessory_id: line.material_item_id ? null : line.accessory_id,
    new_name: line.material_item_id || line.fabric_id || line.accessory_id ? '' : line.new_name,
    item_type: line.item_type,
    dimension: kind === 'accessory' ? orNull(line.dimension) : null,
    colours: line.colourSpecific === false ? [] : line.colours,
    qty_text: line.qty_text.replace(/\s/g, ''),
    unit: kind === 'fabric' ? 'mtr' : line.unit,
    rate: line.rate.trim(),
    promise_days: orNull(line.promise_days),
    folds: kind === 'fabric' ? orNull(line.folds) : null,
    paina: kind === 'fabric' ? orNull(line.paina) : null,
  }))

// The amount of a whole PO.
export const poAmount = (po) => po.lines.reduce((sum, line) => sum + Number(line.amount), 0)

// The items of a wishlist item that one PO to this vendor would carry: every
// item of the fabric (or accessory) lists that is confirmed, still open, and
// has this vendor.
export function orderableItems(entry, family) {
  return entry.materials.filter(
    (item) => familyOf(item.kind) === family && isConfirmed(entry, item.kind) && itemState(item) === 'open',
  )
}
export const vendorOfItem = (item) => item.fabric_vendor_id ?? item.accessory_vendor_id

// Names used on every PO screen.
export function poLookups(data) {
  const byId = (rows) => new Map(rows.map((row) => [row.id, row]))
  const entries = data.samples.flatMap((sample) => sample.wishlist.map((entry) => ({ ...entry, sample })))
  return {
    fabric: byId(data.fabrics),
    accessory: byId(data.accessories),
    fabricVendor: byId(data.fabricVendors),
    accessoryVendor: byId(data.accessoryVendors),
    person: byId(data.people),
    sample: byId(data.samples),
    entry: byId(entries),
    item: byId(entries.flatMap((entry) => entry.materials)),
    combination: byId(data.sizeRatios),
  }
}

export const poVendor = (po, lookups) =>
  po.kind === 'fabric' ? lookups.fabricVendor.get(po.fabric_vendor_id) : lookups.accessoryVendor.get(po.accessory_vendor_id)
export const poLineName = (line, lookups) =>
  (line.fabric_id ? lookups.fabric.get(line.fabric_id)?.name : lookups.accessory.get(line.accessory_id)?.name) ?? ''
export const vendorLabel = (vendor) => (vendor ? `${vendor.code} – ${vendor.name}` : '')

