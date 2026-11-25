// Helpers for the wishlist: what an approved sample is to be produced in.
// A wishlist entry = sample + size (+ ratio) + quantity in pieces.

let counter = 0

// The wishlist number an entry gets: the first of a sample is NEW, the rest repeats.
export const wishlistNo = (sampleNo, repeatNo) => `${sampleNo}-${repeatNo === 0 ? 'NEW' : `REPEAT-${repeatNo}`}`
export const wishlistKind = (entry) => (entry.repeat_no === 0 ? 'New' : 'Repeat')

// The numbers the next `count` entries of a sample will get.
export function nextWishlistNos(sample, count) {
  const next = sample.wishlist.length ? Math.max(...sample.wishlist.map((entry) => entry.repeat_no)) + 1 : 0
  return Array.from({ length: count }, (_, index) => wishlistNo(sample.sample_no, next + index))
}

// The sizes that can be picked: every size with an active row, plus `keep`.
export function sizeOptions(sizeRatios, keep) {
  const sizes = [...new Set(sizeRatios.filter((row) => row.is_active || row.id === keep).map((row) => row.size))]
  return sizes.sort((a, b) => a.localeCompare(b)).map((size) => ({ value: size, label: size }))
}

// The ratios of a size. Empty when the size is not made in ratios.
export function ratioOptions(sizeRatios, size, keep) {
  return sizeRatios
    .filter((row) => row.size === size && row.ratio && (row.is_active || row.id === keep))
    .sort((a, b) => a.ratio.localeCompare(b.ratio))
    .map((row) => ({ value: row.id, label: row.is_active ? row.ratio : `${row.ratio} (inactive)` }))
}

// The combination a line gets when its size is picked: 1:1 when the size has
// it, else its first ratio, else the size's one row without a ratio.
export function defaultCombination(sizeRatios, size) {
  const rows = sizeRatios.filter((row) => row.size === size && row.is_active)
  const withRatio = rows.filter((row) => row.ratio).sort((a, b) => a.ratio.localeCompare(b.ratio))
  return (withRatio.find((row) => row.ratio === '1:1') ?? withRatio[0] ?? rows[0])?.id ?? null
}

export const newWishlistLine = () => ({ key: `wish-${++counter}`, size: null, size_ratio_id: null, qty: '' })
export const isBlankWishlistLine = (line) => !line.size && line.qty.trim() === ''

// Says what is wrong with the lines, or '' when they can be saved.
export function checkWishlistLines(lines) {
  for (const line of lines) {
    if (isBlankWishlistLine(line)) continue
    if (!line.size) return 'Choose the size of every wishlist entry.'
    if (!line.size_ratio_id) return 'Choose the ratio of every wishlist entry.'
    if (!/^\d{1,9}$/.test(line.qty.trim()) || Number(line.qty) < 1) {
      return 'Quantity must be a whole number of pieces, 1 or more.'
    }
  }
  return ''
}

// The lines in the form the database expects. Empty lines are left out.
export const wishlistPayload = (lines) =>
  lines
    .filter((line) => !isBlankWishlistLine(line))
    .map((line) => ({ size_ratio_id: line.size_ratio_id, qty: Number(line.qty) }))

// "100 sets of 9" for a quantity, or a note when it is not a whole number of sets.
export function setsText(qty, piecesPerSet) {
  if (!qty || !piecesPerSet) return ''
  const sets = Number(qty) / piecesPerSet
  return Number.isInteger(sets)
    ? `${sets} ${sets === 1 ? 'set' : 'sets'} of ${piecesPerSet}`
    : `${sets.toFixed(1)} sets of ${piecesPerSet} (not a whole number of sets)`
}
