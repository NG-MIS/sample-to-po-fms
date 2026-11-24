import { PIECES, STAGES, canWorkOn, isClosed, pieceStatus, stageImagePath } from './sampleData.js'

// Which rows belong in which work tab of the Samples screen. Each tab lists only
// what is waiting for that activity, and only items the signed-in person may act on.

const LATER_STAGES = STAGES.filter((stage) => stage.key !== 'concept')

// Send and receive: every piece that is not completed, on samples the person may work on.
// On a closed sample nothing more can be sent, so only pieces still out at a vendor
// are listed, to be received back.
export function processRows(data, profile) {
  return data.samples
    .filter((sample) => canWorkOn(sample, data, profile))
    .flatMap((sample) => {
      const closed = isClosed(sample)
      return PIECES.filter((piece) => pieceStatus(sample, piece.value) !== 'completed')
        .map((piece) => ({
          id: `${sample.id}:${piece.value}`,
          sample,
          piece: piece.value,
          closed,
          status: pieceStatus(sample, piece.value),
          open: sample.entries.filter((entry) => entry.piece === piece.value && !entry.received_date),
        }))
        .filter((row) => !closed || row.open.length > 0)
    })
}

// Mark completed: pieces that are Pending (nothing out at a vendor, not completed).
export function completeRows(data) {
  if (!data.access.manages) return []
  return data.samples.filter((sample) => !isClosed(sample)).flatMap((sample) =>
    PIECES.filter((piece) => pieceStatus(sample, piece.value) === 'pending').map((piece) => {
      const done = sample.entries.filter((entry) => entry.piece === piece.value)
      return {
        id: `${sample.id}:${piece.value}`,
        sample,
        piece: piece.value,
        processCount: done.length,
        lastReceived: done.map((entry) => entry.received_date).sort().pop() ?? '',
      }
    }),
  )
}

// Images: samples still missing a 1st sample, 2nd sample or photoshoot image.
export function imageRows(data, profile) {
  return data.samples
    .filter((sample) => canWorkOn(sample, data, profile) && !isClosed(sample))
    .filter((sample) => LATER_STAGES.some((stage) => !stageImagePath(sample, stage.key)))
}

// Approval: samples that have no final approval yet and are not closed.
export function approvalRows(data) {
  if (!data.access.management) return []
  return data.samples.filter((sample) => !sample.approvals.final && !isClosed(sample))
}
