import { PIECES, STAGES, canWorkOn, pieceStatus, stageImagePath } from './sampleData.js'

// Which rows belong in which work tab of the Samples screen. Each tab lists only
// what is waiting for that activity, and only items the signed-in person may act on.

const LATER_STAGES = STAGES.filter((stage) => stage.key !== 'concept')

// Send and receive: every piece that is not completed, on samples the person may work on.
export function processRows(data, profile) {
  return data.samples
    .filter((sample) => canWorkOn(sample, data, profile))
    .flatMap((sample) =>
      PIECES.filter((piece) => pieceStatus(sample, piece.value) !== 'completed').map((piece) => ({
        id: `${sample.id}:${piece.value}`,
        sample,
        piece: piece.value,
        status: pieceStatus(sample, piece.value),
        open: sample.entries.filter((entry) => entry.piece === piece.value && !entry.received_date),
      })),
    )
}

// Mark completed: pieces that are Pending (nothing out at a vendor, not completed).
export function completeRows(data) {
  if (!data.access.manages) return []
  return data.samples.flatMap((sample) =>
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
    .filter((sample) => canWorkOn(sample, data, profile))
    .filter((sample) => LATER_STAGES.some((stage) => !stageImagePath(sample, stage.key)))
}

// Approval: samples that have no final approval yet.
export function approvalRows(data) {
  if (!data.access.management) return []
  return data.samples.filter((sample) => !sample.approvals.final)
}
