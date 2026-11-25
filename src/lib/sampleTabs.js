import {
  PIECES,
  STAGES,
  accessoryStatus,
  canWorkOn,
  componentsWithoutFabric,
  fabricStatus,
  isApproved,
  isClosed,
  pieceStatus,
  stageImagePath,
} from './sampleData.js'

// Which rows belong in which work tab of the Samples screen. Each tab lists only
// what is waiting for that activity, and only items the signed-in person may act on.

const LATER_STAGES = STAGES.filter((stage) => stage.key !== 'concept')

// The status of both pieces of a sample: { 1: 'pending', 2: 'at_vendor' }.
const pieceStatuses = (sample) => Object.fromEntries(PIECES.map((piece) => [piece.value, pieceStatus(sample, piece.value)]))

// Send and receive: one row per sample that still has a piece which is not
// completed, on samples the person may work on. On a closed sample nothing more
// can be sent, so it is listed only while a piece is still out at a vendor,
// to be received back.
export function processRows(data, profile) {
  return data.samples
    .filter((sample) => canWorkOn(sample, data, profile))
    .map((sample) => {
      const closed = isClosed(sample)
      const statuses = pieceStatuses(sample)
      return {
        id: sample.id,
        sample,
        closed,
        statuses,
        // pieces something can still be sent for
        sendPieces: closed ? [] : PIECES.filter((piece) => statuses[piece.value] !== 'completed'),
        // what is out at a vendor right now, 1st piece first
        open: sample.entries
          .filter((entry) => !entry.received_date)
          .sort((x, y) => x.piece - y.piece || x.sent_date.localeCompare(y.sent_date)),
      }
    })
    .filter((row) => row.sendPieces.length > 0 || row.open.length > 0)
}

// Mark completed: one row per sample with a piece that is Pending (nothing out
// at a vendor, not completed).
export function completeRows(data) {
  if (!data.access.manages) return []
  return data.samples
    .filter((sample) => !isClosed(sample))
    .map((sample) => {
      const statuses = pieceStatuses(sample)
      return {
        id: sample.id,
        sample,
        statuses,
        pending: PIECES.filter((piece) => statuses[piece.value] === 'pending').map((piece) => piece.value),
        processCount: sample.entries.length,
        lastReceived: sample.entries.map((entry) => entry.received_date).filter(Boolean).sort().pop() ?? '',
      }
    })
    .filter((row) => row.pending.length > 0)
}

// Images: samples still missing a 1st sample, 2nd sample or photoshoot image.
export function imageRows(data, profile) {
  return data.samples
    .filter((sample) => canWorkOn(sample, data, profile) && !isClosed(sample))
    .filter((sample) => LATER_STAGES.some((stage) => !stageImagePath(sample, stage.key)))
}

// Fabrics: every open sample the person may work on, one row per sample, with
// its fabric status (pending, incomplete or completed).
export function fabricRows(data, profile) {
  return data.samples
    .filter((sample) => canWorkOn(sample, data, profile) && !isClosed(sample))
    .map((sample) => ({
      id: sample.id,
      sample,
      status: fabricStatus(sample),
      missing: componentsWithoutFabric(sample),
    }))
}

// Accessories: every open sample the person may work on, one row per sample.
export function accessoryRows(data, profile) {
  return data.samples
    .filter((sample) => canWorkOn(sample, data, profile) && !isClosed(sample))
    .map((sample) => ({ id: sample.id, sample, status: accessoryStatus(sample) }))
}

// Design number: samples approved for production (final approval Yes) that
// have no design number yet, among the samples the person may work on.
export function designRows(data, profile) {
  return data.samples.filter(
    (sample) => canWorkOn(sample, data, profile) && isApproved(sample) && !sample.design_no,
  )
}

// Approval: samples that have no final approval yet and are not closed.
export function approvalRows(data) {
  if (!data.access.management) return []
  return data.samples.filter((sample) => !sample.approvals.final && !isClosed(sample))
}
