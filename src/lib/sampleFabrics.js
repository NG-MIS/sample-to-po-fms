// Helpers for the fabric list of a sample: the lines as they are edited on
// screen, and the form in which they are sent to the database.

let counter = 0
const NEW = 'new:'

export const cleanFabricName = (text) => (text || '').trim().replace(/\s+/g, ' ')

// An empty line for the editor.
export const newFabricLine = () => ({
  key: `line-${++counter}`,
  id: null,
  fabric_id: null,
  new_fabric: '',
  component_ids: [],
  vendor_id: null,
  rate: '',
})

// The saved fabric lines of a sample, ready for the editor.
export const toFabricLines = (sample) =>
  (sample.fabrics ?? []).map((line) => ({
    key: line.id,
    id: line.id,
    fabric_id: line.fabric_id,
    new_fabric: '',
    component_ids: line.component_ids,
    vendor_id: line.vendor_id,
    rate: line.rate === null || line.rate === undefined ? '' : String(line.rate),
  }))

export const isBlankLine = (line) =>
  !line.fabric_id && !line.new_fabric && line.component_ids.length === 0 && !line.vendor_id && line.rate.trim() === ''

// Says what is wrong with the lines, or '' when they can be saved.
export function checkFabricLines(lines) {
  for (const line of lines) {
    if (isBlankLine(line)) continue
    if (!line.fabric_id && !line.new_fabric) return 'Every fabric line needs a fabric name.'
    if (line.rate.trim() !== '' && !/^\d{1,10}(\.\d{1,2})?$/.test(line.rate.trim())) {
      return 'Rate must be a number, 0 or more, with at most 2 decimals.'
    }
  }
  return ''
}

// The lines in the form the database expects. Empty lines are left out.
export const fabricPayload = (lines) =>
  lines
    .filter((line) => !isBlankLine(line))
    .map((line) => ({
      id: line.id,
      fabric_id: line.fabric_id,
      new_fabric: line.fabric_id ? '' : line.new_fabric,
      component_ids: line.component_ids,
      vendor_id: line.vendor_id,
      rate: line.rate.trim() === '' ? null : line.rate.trim(),
    }))

// The value the fabric pick-list holds for a line: a fabric from the list,
// or a name typed here that is not in the list yet.
export const fabricValue = (line) => line.fabric_id ?? (line.new_fabric ? NEW + line.new_fabric : null)
export const isNewFabricValue = (value) => typeof value === 'string' && value.startsWith(NEW)
export const newFabricName = (value) => value.slice(NEW.length)
export const newFabricValue = (name) => NEW + name

export const formatRate = (rate) => (rate === null || rate === undefined || rate === '' ? '' : Number(rate).toFixed(2))

// The fabric lines of a sample, for reading: one row per line.
export function fabricLineColumns(lookups) {
  return [
    { key: 'fabric', header: 'FABRIC', value: (line) => lookups.fabric.get(line.fabric_id) ?? '' },
    {
      key: 'fabric_components',
      header: 'FOR COMPONENTS',
      value: (line) => line.component_ids.map((id) => lookups.component.get(id)).filter(Boolean).sort(),
    },
    { key: 'vendor_code', header: 'VENDOR CODE', value: (line) => lookups.fabricVendor.get(line.vendor_id) ?? '' },
    {
      key: 'rate',
      header: 'RATE',
      align: 'right',
      value: (line) => formatRate(line.rate),
      sortValue: (line) => (line.rate === null ? -1 : Number(line.rate)),
    },
  ]
}
