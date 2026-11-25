// Helpers for the accessory list of a sample: the lines as they are edited
// on screen, and the form in which they are sent to the database.

let counter = 0
const NEW = 'new:'

export const cleanAccessoryName = (text) => (text || '').trim().replace(/\s+/g, ' ')

// How the qty of an accessory is measured.
export const QTY_TYPES = [
  { value: 'quantity', label: 'Quantity (pcs)', unit: 'pcs' },
  { value: 'length', label: 'Length (inch)', unit: 'inch' },
  { value: 'dimension', label: 'Dimension (L × B, inch)', unit: 'inch' },
]
export const QTY_TYPE_LABEL = { quantity: 'Quantity', length: 'Length', dimension: 'Dimension' }

const text = (value) => (value === null || value === undefined ? '' : String(Number(value)))

// An empty line for the editor.
export const newAccessoryLine = () => ({
  key: `accessory-${++counter}`,
  id: null,
  accessory_id: null,
  new_accessory: '',
  qty_type: null,
  qty: '',
  breadth: '',
  vendor_id: null,
  rate: '',
  remarks: '',
})

// The saved accessory lines of a sample, ready for the editor.
export const toAccessoryLines = (sample) =>
  (sample.accessories ?? []).map((line) => ({
    key: line.id,
    id: line.id,
    accessory_id: line.accessory_id,
    new_accessory: '',
    qty_type: line.qty_type,
    qty: text(line.qty),
    breadth: text(line.breadth),
    vendor_id: line.vendor_id,
    rate: text(line.rate),
    remarks: line.remarks ?? '',
  }))

export const isBlankAccessoryLine = (line) =>
  !line.accessory_id &&
  !line.new_accessory &&
  !line.qty_type &&
  line.qty.trim() === '' &&
  line.breadth.trim() === '' &&
  !line.vendor_id &&
  line.rate.trim() === '' &&
  line.remarks.trim() === ''

const isNumber = (value) => /^\d{1,10}(\.\d{1,2})?$/.test(value.trim())

// Says what is wrong with the lines, or '' when they can be saved.
export function checkAccessoryLines(lines) {
  for (const line of lines) {
    if (isBlankAccessoryLine(line)) continue
    if (!line.accessory_id && !line.new_accessory) return 'Every accessory line needs an accessory name.'
    const qty = line.qty.trim()
    const breadth = line.breadth.trim()
    if (qty !== '' && !line.qty_type) return 'Choose the qty type before entering a qty.'
    if (line.qty_type === 'quantity' && qty !== '' && !/^\d{1,10}$/.test(qty)) {
      return 'A quantity in pieces must be a whole number.'
    }
    if (line.qty_type !== 'quantity' && qty !== '' && !isNumber(qty)) {
      return 'Length must be a number, 0 or more, with at most 2 decimals.'
    }
    if (line.qty_type === 'dimension' && breadth !== '' && !isNumber(breadth)) {
      return 'Breadth must be a number, 0 or more, with at most 2 decimals.'
    }
    if (line.rate.trim() !== '' && !isNumber(line.rate)) {
      return 'Rate must be a number, 0 or more, with at most 2 decimals.'
    }
    if (line.remarks.trim().length > 500) return 'Remarks on an accessory can be at most 500 characters long.'
  }
  return ''
}

const orNull = (value) => (value.trim() === '' ? null : value.trim())

// The lines in the form the database expects. Empty lines are left out.
export const accessoryPayload = (lines) =>
  lines
    .filter((line) => !isBlankAccessoryLine(line))
    .map((line) => ({
      id: line.id,
      accessory_id: line.accessory_id,
      new_accessory: line.accessory_id ? '' : line.new_accessory,
      qty_type: line.qty_type,
      qty: orNull(line.qty),
      breadth: line.qty_type === 'dimension' ? orNull(line.breadth) : null,
      vendor_id: line.vendor_id,
      rate: orNull(line.rate),
      remarks: orNull(line.remarks),
    }))

// The value the accessory pick-list holds for a line: one from the list, or
// a name typed here that is not in the list yet.
export const accessoryValue = (line) => line.accessory_id ?? (line.new_accessory ? NEW + line.new_accessory : null)
export const isNewAccessoryValue = (value) => typeof value === 'string' && value.startsWith(NEW)
export const newAccessoryName = (value) => value.slice(NEW.length)
export const newAccessoryValue = (name) => NEW + name

// The qty of a saved line as shown on screen: "6 pcs", "14.5 inch", "10 × 4 inch".
export function formatAccessoryQty(line) {
  if (!line.qty_type) return ''
  const qty = text(line.qty)
  if (line.qty_type === 'quantity') return qty === '' ? '' : `${qty} pcs`
  if (line.qty_type === 'length') return qty === '' ? '' : `${qty} inch`
  const breadth = text(line.breadth)
  return qty === '' && breadth === '' ? '' : `${qty || '?'} × ${breadth || '?'} inch`
}

const formatRate = (rate) => (rate === null || rate === undefined || rate === '' ? '' : Number(rate).toFixed(2))

// The accessory lines of a sample, for reading: one row per line.
export function accessoryLineColumns(lookups) {
  return [
    { key: 'accessory', header: 'ACCESSORY', value: (line) => lookups.accessory.get(line.accessory_id) ?? '' },
    { key: 'qty_type', header: 'QTY TYPE', value: (line) => QTY_TYPE_LABEL[line.qty_type] ?? '' },
    { key: 'qty', header: 'QTY', value: (line) => formatAccessoryQty(line) },
    { key: 'vendor_code', header: 'VENDOR CODE', value: (line) => lookups.accessoryVendor.get(line.vendor_id) ?? '' },
    {
      key: 'rate',
      header: 'RATE',
      align: 'right',
      value: (line) => formatRate(line.rate),
      sortValue: (line) => (line.rate === null ? -1 : Number(line.rate)),
    },
    { key: 'remarks', header: 'REMARKS', value: (line) => line.remarks ?? '' },
  ]
}
