// Helpers for CAD drawings and the primary accessory list.

let counter = 0
const NEW = 'new:'
const key = (prefix) => `${prefix}-${++counter}`
const text = (value) => (value === null || value === undefined ? '' : String(Number(value)))
const tidy = (value) => (value || '').trim().replace(/\s+/g, ' ')

export const cleanName = tidy
export const FABRIC_TYPES = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
]
export const FABRIC_TYPE_LABEL = { primary: 'Primary', secondary: 'Secondary' }

// A value in a pick-list that also takes typed names: an id from the list,
// or a name typed here that is not in the list yet.
export const pickValue = (id, typed) => id ?? (typed ? NEW + typed : null)
export const isTypedValue = (value) => typeof value === 'string' && value.startsWith(NEW)
export const typedName = (value) => value.slice(NEW.length)
export const typedValue = (name) => NEW + name

// ---------- CAD rows (the drawing part, filled by the CAD department) ----------

export const newCadRow = () => ({
  key: key('row'),
  id: null,
  particular_id: null,
  new_particular: '',
  fabric_type: null,
  msrmnt: '',
  paina: '',
  pcs_in_layer: '',
  panels: '',
})

// The saved rows of a CAD, ready for the editor. keepIds false = a copy for a new CAD.
export const toCadRows = (cad, keepIds = true) =>
  cad.rows.map((row) => ({
    key: keepIds ? row.id : key('row'),
    id: keepIds ? row.id : null,
    particular_id: row.particular_id,
    new_particular: '',
    fabric_type: row.fabric_type,
    msrmnt: text(row.msrmnt),
    paina: text(row.paina),
    pcs_in_layer: text(row.pcs_in_layer),
    panels: text(row.panels),
  }))

export const isBlankCadRow = (row) =>
  !row.particular_id &&
  !row.new_particular &&
  !row.fabric_type &&
  [row.msrmnt, row.paina, row.pcs_in_layer, row.panels].every((value) => value.trim() === '')

const decimal = (value) => /^\d{1,7}(\.\d{1,2})?$/.test(value.trim())
const whole = (value) => /^\d{1,6}$/.test(value.trim())

// Says what is wrong with the rows of one CAD, or '' when they can be saved.
export function checkCadRows(rows) {
  const filled = rows.filter((row) => !isBlankCadRow(row))
  if (filled.length === 0) return 'A CAD needs at least one drawing row.'
  for (const row of filled) {
    if (!row.particular_id && !row.new_particular) return 'Every drawing row needs its particulars.'
    if (!row.fabric_type) return 'Choose the fabric type of every drawing row: Primary or Secondary.'
    if (row.msrmnt.trim() !== '' && !decimal(row.msrmnt)) return 'Msrmnt must be a number with at most 2 decimals.'
    if (row.paina.trim() !== '' && !decimal(row.paina)) return 'Paina must be a number with at most 2 decimals.'
    if (row.pcs_in_layer.trim() !== '' && !whole(row.pcs_in_layer)) return 'No. of pcs in layer must be a whole number.'
    if (row.panels.trim() !== '' && !whole(row.panels)) return 'No. of panels must be a whole number.'
  }
  return ''
}

const orNull = (value) => (value.trim() === '' ? null : value.trim())

export const cadRowPayload = (rows) =>
  rows
    .filter((row) => !isBlankCadRow(row))
    .map((row) => ({
      id: row.id,
      particular_id: row.particular_id,
      new_particular: row.particular_id ? '' : row.new_particular,
      fabric_type: row.fabric_type,
      msrmnt: orNull(row.msrmnt),
      paina: orNull(row.paina),
      pcs_in_layer: orNull(row.pcs_in_layer),
      panels: orNull(row.panels),
    }))

// ---------- Fabric of the CAD rows (filled by the people who look after the sample) ----------

export const toCadFabricRows = (cad) =>
  cad.rows.map((row) => ({
    id: row.id,
    fabric_id: row.fabric_id,
    new_fabric: '',
    vendor_id: row.vendor_id,
    rate: text(row.rate),
  }))

export function checkCadFabricRows(rows) {
  for (const row of rows) {
    if (row.rate.trim() !== '' && !/^\d{1,10}(\.\d{1,2})?$/.test(row.rate.trim())) {
      return 'Rate must be a number, 0 or more, with at most 2 decimals.'
    }
  }
  return ''
}

export const cadFabricPayload = (rows) =>
  rows.map((row) => ({
    id: row.id,
    fabric_id: row.fabric_id,
    new_fabric: row.fabric_id ? '' : row.new_fabric,
    vendor_id: row.vendor_id,
    rate: orNull(row.rate),
  }))

// The rows of a CAD that still have no fabric.
export const rowsWithoutFabric = (cad) => cad.rows.filter((row) => !row.fabric_id)

// ---------- Primary accessory list ----------
// One list per sample + size (+ ratio). The qty of a line is given per group
// of sizes; a group ends at `upto` and starts where the one before it ended.

export const newPrimaryGroup = (upto) => ({ key: key('group'), upto, pcs: '', qty: '', breadth: '' })

export const newPrimaryLine = (sizes) => ({
  key: key('primary'),
  accessory_id: null,
  new_accessory: '',
  qty_type: null,
  groups: [newPrimaryGroup(sizes[sizes.length - 1])],
})

export const toPrimaryLines = (lines) =>
  lines.map((line) => ({
    key: line.id,
    accessory_id: line.accessory_id,
    new_accessory: '',
    qty_type: line.qty_type,
    groups: line.groups.map((group) => ({
      key: key('group'),
      upto: group.upto,
      pcs: text(group.pcs),
      qty: text(group.qty),
      breadth: text(group.breadth),
    })),
  }))

// The single sizes each group of a line covers: [['22','24'], ['26','28','30'], ...].
export function groupSizes(groups, sizes) {
  let start = 0
  return groups.map((group) => {
    const end = sizes.indexOf(group.upto)
    const covered = end >= start ? sizes.slice(start, end + 1) : []
    start = Math.max(start, end + 1)
    return covered
  })
}

// Ends a group at another size. Later groups that no longer fit are dropped,
// and a last group is added when the sizes no longer reach the end.
export function setGroupEnd(groups, index, upto, sizes) {
  const at = sizes.indexOf(upto)
  const kept = groups
    .map((group, position) => (position === index ? { ...group, upto } : group))
    .filter((group, position) => position <= index || sizes.indexOf(group.upto) > at)
  const last = sizes[sizes.length - 1]
  return kept[kept.length - 1].upto === last ? kept : [...kept, newPrimaryGroup(last)]
}

// Says what is wrong with the lines, or '' when they can be saved.
export function checkPrimaryLines(lines) {
  for (const line of lines) {
    if (!line.accessory_id && !line.new_accessory) return 'Every accessory line needs an accessory name.'
    if (!line.qty_type) return 'Choose the qty type of every accessory: Quantity, Length or Dimension.'
    for (const group of line.groups) {
      if (!/^\d{1,6}$/.test(group.pcs.trim()) || Number(group.pcs) < 1) {
        return line.qty_type === 'quantity'
          ? 'Enter the quantity in pieces, a whole number of 1 or more, for every size group.'
          : 'Enter the number of pieces, a whole number of 1 or more, for every size group.'
      }
      if (line.qty_type !== 'quantity' && (!decimal(group.qty) || Number(group.qty) <= 0)) {
        return 'Enter the length in inches, more than zero, for every size group.'
      }
      if (line.qty_type === 'dimension' && (!decimal(group.breadth) || Number(group.breadth) <= 0)) {
        return 'Enter the breadth in inches, more than zero, for every size group.'
      }
    }
  }
  return ''
}

export const primaryPayload = (lines) =>
  lines.map((line) => ({
    accessory_id: line.accessory_id,
    new_accessory: line.accessory_id ? '' : line.new_accessory,
    qty_type: line.qty_type,
    groups: line.groups.map((group) => ({
      upto: group.upto,
      pcs: group.pcs.trim(),
      qty: line.qty_type === 'quantity' ? null : group.qty.trim(),
      breadth: line.qty_type === 'dimension' ? group.breadth.trim() : null,
    })),
  }))

// The qty of one saved group as shown on screen: "6 pcs", "2 pcs × 6 inch", "3 pcs × 10 × 4 inch".
export function formatPrimaryQty(qtyType, group) {
  if (qtyType === 'quantity') return `${text(group.pcs)} pcs`
  if (qtyType === 'length') return `${text(group.pcs)} pcs × ${text(group.qty)} inch`
  return `${text(group.pcs)} pcs × ${text(group.qty)} × ${text(group.breadth)} inch`
}

// "22-24" for a group of sizes, or "22" for a single one.
export const sizeSpan = (covered) =>
  covered.length === 0 ? '' : covered.length === 1 ? covered[0] : `${covered[0]}-${covered[covered.length - 1]}`

// ---------- Where a sample stands ----------

// The primary accessory lines of a sample for one size (+ ratio).
export const primaryLinesFor = (sample, sizeRatioId) =>
  sample.primaryLines.filter((line) => line.size_ratio_id === sizeRatioId)

// The CADs assigned to one wishlist item.
export const cadsOfEntry = (sample, entry) => sample.cads.filter((cad) => cad.wishlist_ids.includes(entry.id))

// The CADs that could be assigned to a wishlist item: same sample, size and ratio.
export const cadsForEntry = (sample, entry) => sample.cads.filter((cad) => cad.size_ratio_id === entry.size_ratio_id)

// "22-38 1:1" or "22-30".
export const sizeLabel = (combination) =>
  combination ? `${combination.size}${combination.ratio ? ` ${combination.ratio}` : ''}` : ''
