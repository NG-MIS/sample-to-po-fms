// Helpers for receiving material against purchase orders: what was ordered
// and received of each colour, lot numbers, and where a PO stands.

const round2 = (value) => Math.round(value * 100) / 100

export const RECEIVE_KINDS = {
  fabric: { label: 'Fabric', department: 'Fabric store', item: 'fabric' },
  accessory: { label: 'Accessory', department: 'Accessory store', item: 'accessory' },
}

// 1 -> A, 2 -> B ... 26 -> Z, 27 -> AA.
export function lotLetter(number) {
  let letters = ''
  for (let rest = number; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters
  }
  return letters
}

// The colours of one PO line, each with what was ordered of it:
//   [{ no, letter, colour, ordered }]
// A line with no colours has one row, lettered A. One typed qty is for every
// colour; quantities joined with + are one per colour.
export function lineColours(line) {
  const parts = String(line.qty_text).split('+').map(Number)
  if (line.colours.length === 0) return [{ no: 1, letter: 'A', colour: '', ordered: Number(line.total_qty) }]
  return line.colours.map((colour, index) => ({
    no: index + 1,
    letter: lotLetter(index + 1),
    colour,
    ordered: parts.length === 1 ? parts[0] : (parts[index] ?? 0),
  }))
}

// How much has come of each colour of a line: Map colour no -> qty.
export function receivedByColour(line) {
  const received = new Map()
  ;(line.receiptItems ?? []).forEach((item) => received.set(item.colour_no, round2((received.get(item.colour_no) ?? 0) + Number(item.qty))))
  return received
}

// One colour of a line: pending (nothing came), part, or received (within the
// allowance of what was ordered). excess = more than the allowance over.
export function colourStanding(ordered, received, allowance) {
  const share = Number(allowance ?? 0) / 100
  const status = received <= 0 ? 'pending' : received >= ordered * (1 - share) - 1e-9 ? 'received' : 'part'
  return { status, balance: Math.max(round2(ordered - received), 0), excess: received > ordered * (1 + share) + 1e-9 ? round2(received - ordered) : 0 }
}

// The colours of a line with everything known about them.
export function lineDetails(line, allowance) {
  const received = receivedByColour(line)
  return lineColours(line).map((colour) => {
    const came = received.get(colour.no) ?? 0
    return { ...colour, received: came, lot: line.lot_no ? `${line.lot_no}-${colour.letter}` : '', ...colourStanding(colour.ordered, came, allowance) }
  })
}

// Where one PO line stands:
//   pending  - nothing has come
//   part     - something has come, more is expected
//   received - every colour is within the allowance of what was ordered
//   short    - marked complete although it came short
export function lineStatus(line, allowance) {
  const colours = lineDetails(line, allowance)
  if (colours.every((colour) => colour.status === 'received')) return 'received'
  if (line.completed_at) return 'short'
  return colours.some((colour) => colour.received > 0) ? 'part' : 'pending'
}
export const lineDone = (line, allowance) => ['received', 'short'].includes(lineStatus(line, allowance))
export const lineHasExcess = (line, allowance) => lineDetails(line, allowance).some((colour) => colour.excess > 0)

export const LINE_STATUS_LABEL = { pending: 'Pending', part: 'Partly received', received: 'Received', short: 'Short received' }
export const LINE_STATUS_BADGE = { pending: 'pending', part: 'maybe', received: 'completed', short: 'skip' }

// Where a whole PO stands: cancelled, pending, part or received.
export function poReceiveStatus(po, allowance) {
  if (po.status === 'cancelled') return 'cancelled'
  if (po.lines.every((line) => lineDone(line, allowance))) return 'received'
  return po.lines.some((line) => lineStatus(line, allowance) !== 'pending') ? 'part' : 'pending'
}
export const PO_RECEIVE_LABEL = { cancelled: 'Cancelled', pending: 'Pending', part: 'Partly received', received: 'Received' }
export const PO_RECEIVE_BADGE = { cancelled: 'skip', pending: 'pending', part: 'maybe', received: 'completed' }

// The date the vendor has promised: the one given in the latest follow-up
// that has one, otherwise the latest promised date written on the PO.
export function promisedDateOf(po) {
  const revised = [...(po.followups ?? [])].sort((a, b) => b.sl_no - a.sl_no).find((followup) => followup.promised_date)
  if (revised) return revised.promised_date
  const dates = po.lines.map((line) => line.promised_date).filter(Boolean).sort()
  return dates.length ? dates[dates.length - 1] : null
}

// Days past the promised date, for a PO that is not fully received. 0 = not late.
export function daysLate(po, allowance, today) {
  const status = poReceiveStatus(po, allowance)
  const promised = promisedDateOf(po)
  if (!promised || status === 'received' || status === 'cancelled' || today <= promised) return 0
  return Math.round((Date.parse(today) - Date.parse(promised)) / 86400000)
}

// The next lot number a series would give.
export const nextLotNo = (series) => `${series.prefix}-${(series.last_number ?? series.start_number - 1) + 1}`

// May this person add a follow-up to this PO: the store people of its kind,
// whoever raised it, and the people who may raise POs for its sample.
export function canFollowUp(po, data, profile) {
  if (data.access.receive[po.kind] || po.created_by === profile.id) return true
  const sample = data.samples.find((item) => item.id === po.sample_id)
  if (sample) return data.access.manages || sample.designer_id === profile.id
  return data.access.manages || data.samples.some((item) => item.designer_id === profile.id)
}

// The name of what actually came on a line (it can differ from what was ordered).
export const receivedName = (line, lookups) =>
  (line.received_fabric_id
    ? lookups.fabric.get(line.received_fabric_id)?.name
    : line.received_accessory_id
      ? lookups.accessory.get(line.received_accessory_id)?.name
      : '') ?? ''
