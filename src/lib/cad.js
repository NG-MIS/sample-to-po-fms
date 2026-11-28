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

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase()

// Options of a list that also takes typed names: the active entries, the ones
// already in use here, and the names typed on this form.
export function namedOptions(items, usedIds, typedNames) {
  return [
    ...items
      .filter((item) => item.is_active || usedIds.includes(item.id))
      .map((item) => ({ value: item.id, label: item.is_active ? item.name : `${item.name} (inactive)` })),
    ...typedNames.map((name) => ({ value: NEW + name, label: `${name} (new)` })),
  ].sort((a, b) => a.label.localeCompare(b.label))
}

// The wording of the "add" row for a typed name, or null when it is already there.
export function addLabelFor(items, typedNames) {
  return (typed) => {
    const name = tidy(typed)
    if (!name || name.length > 80) return null
    const known =
      items.some((item) => item.is_active && sameText(item.name, name)) || typedNames.some((other) => sameText(other, name))
    return known ? null : `Add "${name}"`
  }
}

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
  pcsAuto: true, // No. of pcs in layer follows the pcs in a set of the size and ratio, until it is typed
  panels: '',
  component_ids: [],
  efficiency: '',
})

// Fills No. of pcs in layer from the Sizes and ratios master (pcs in a set of the chosen
// size and ratio) on every row where it was not typed by hand.
export const withSetPcs = (rows, pieces) => rows.map((row) => (row.pcsAuto ? { ...row, pcs_in_layer: pieces ? String(pieces) : '' } : row))

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
    pcsAuto: false,
    panels: text(row.panels),
    component_ids: row.component_ids ?? [],
    efficiency: text(row.efficiency),
  }))

export const isBlankCadRow = (row) =>
  !row.particular_id &&
  !row.new_particular &&
  !row.fabric_type &&
  row.component_ids.length === 0 &&
  [row.msrmnt, row.paina, row.pcsAuto ? '' : row.pcs_in_layer, row.panels, row.efficiency].every((value) => value.trim() === '')

const decimal = (value) => /^\d{1,7}(\.\d{1,2})?$/.test(value.trim())
const whole = (value) => /^\d{1,6}$/.test(value.trim())

// The components of a row. A sample with a single component needs no picking.
export const rowComponents = (row, sampleComponentIds) =>
  row.component_ids.length === 0 && sampleComponentIds.length === 1 ? sampleComponentIds : row.component_ids

// Says what is wrong with the rows of one CAD, or '' when they can be saved.
//   sampleComponentIds - the components of the sample the CAD is for
export function checkCadRows(rows, sampleComponentIds = []) {
  const filled = rows.filter((row) => !isBlankCadRow(row))
  if (filled.length === 0) return 'A CAD needs at least one drawing row.'
  for (const row of filled) {
    if (!row.particular_id && !row.new_particular) return 'Every drawing row needs its particulars.'
    if (!row.fabric_type) return 'Choose the fabric type of every drawing row: Primary or Secondary.'
    if (rowComponents(row, sampleComponentIds).length === 0) return 'Choose the components of every drawing row.'
    // every column of a drawing row is required
    const empty = [['Msrmnt', row.msrmnt], ['Paina', row.paina], ['No. of pcs in layer', row.pcs_in_layer], ['No of panels', row.panels], ['Efficiency', row.efficiency]]
      .filter(([, value]) => value.trim() === '')
      .map(([label]) => label)
    if (empty.length) return `Every drawing row needs its ${empty.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`
    if (!decimal(row.efficiency) || Number(row.efficiency) > 100) return 'Efficiency is a percentage from 0 to 100.'
    if (!decimal(row.msrmnt)) return 'Msrmnt must be a number with at most 2 decimals.'
    if (!decimal(row.paina)) return 'Paina must be a number with at most 2 decimals.'
    if (!whole(row.pcs_in_layer)) return 'No. of pcs in layer must be a whole number.'
    if (!whole(row.panels)) return 'No. of panels must be a whole number.'
  }
  return ''
}

const orNull = (value) => (value.trim() === '' ? null : value.trim())

export const cadRowPayload = (rows, sampleComponentIds = []) =>
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
      component_ids: rowComponents(row, sampleComponentIds),
      efficiency: orNull(row.efficiency),
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

// The fabric details of a drawing row: fabric, vendor and rate. A CAD waits in
// Fabric pending until every row has all three.
export const missingFabricDetails = (row) => [!row.fabric_id && 'fabric', !row.vendor_id && 'vendor', row.rate == null && 'rate'].filter(Boolean)
export const rowsMissingFabricDetails = (cad) => cad.rows.filter((row) => missingFabricDetails(row).length > 0)
// Some fabric details are in, on any row.
export const hasFabricDetails = (cad) => cad.rows.some((row) => missingFabricDetails(row).length < 3)

// ---------- Primary accessory list ----------
// One list per sample + size (+ ratio). The qty of a line is given per group
// of sizes; a group ends at `upto` and starts where the one before it ended.

export const newPrimaryGroup = (upto) => ({ key: key('group'), upto, pcs: '', qty: '', breadth: '' })

// How an accessory is coloured:
//   general         - comes in one colour, which can be named (colour)
//   colour specific - ordered colour by colour, following the base colour of
//                     the garment or an alternate, contrasting colour (colour_follows)
export const COLOUR_FOLLOWS = [
  { value: 'base', label: 'Base colour' },
  { value: 'alternate', label: 'Alternate colour' },
  { value: 'neutral', label: 'Neutral colour' },
]
export const COLOUR_FOLLOWS_LABEL = { base: 'Base colour', alternate: 'Alternate colour', neutral: 'Neutral colour' }
const NO_COLOUR = { colour_specific: false, colour_follows: null, colour: '' }
// The colour fields of a saved line, ready for the editor.
export const colourFields = (line) => ({
  colour_specific: Boolean(line.colour_specific),
  colour_follows: line.colour_follows ?? null,
  colour: line.colour ?? '',
})
// The colour fields as they are saved.
export const colourPayload = (line) => ({
  colour_specific: line.colour_specific,
  colour_follows: line.colour_specific ? line.colour_follows : null,
  colour: line.colour_specific ? null : line.colour.trim() || null,
})
// "Colour specific, base colour", "Gold" or "".
export const colourText = (line) =>
  line.colour_specific ? `Colour specific, ${(COLOUR_FOLLOWS_LABEL[line.colour_follows] ?? 'colour not chosen').toLowerCase()}` : (line.colour ?? '')
// Every size group has the same number of pieces (and there is more than one group).
export const hasSamePcs = (groups) => groups.length > 1 && groups.every((group) => String(group.pcs) !== '' && String(group.pcs) === String(groups[0].pcs))

// A new line for an accessory picked from the primary accessory master (or typed
// new): it starts with the unit set in the master.
export const newPrimaryLine = (sizes, accessory = {}) => ({
  key: key('primary'),
  accessory_id: accessory.id ?? null,
  new_accessory: accessory.id ? '' : (accessory.name ?? ''),
  qty_type: accessory.default_qty_type ?? null,
  groups: [newPrimaryGroup(sizes[sizes.length - 1])],
  ...NO_COLOUR,
  same_pcs: false,
})

// A saved line whose details are still to be filled opens with one empty group.
export const toPrimaryLines = (lines, sizes) =>
  lines.map((line) => ({
    key: line.id,
    accessory_id: line.accessory_id,
    new_accessory: '',
    qty_type: line.qty_type,
    groups: line.groups.length
      ? line.groups.map((group) => ({
          key: key('group'),
          upto: group.upto,
          pcs: text(group.pcs),
          qty: text(group.qty),
          breadth: text(group.breadth),
        }))
      : [newPrimaryGroup(sizes[sizes.length - 1])],
    ...colourFields(line),
    same_pcs: hasSamePcs(line.groups),
  }))

// The saved lines of another size, as lines for this size: the accessories, units,
// colour choices and quantities are kept, and the size groups are fitted to the sizes
// of this size. A group keeps the sizes it shares with this size, groups that share
// none are dropped, and the last group runs to the last size.
export function linesForOtherSize(savedLines, fromSizes, sizes) {
  const last = sizes[sizes.length - 1]
  return toPrimaryLines(savedLines, fromSizes).map((line, index) => {
    const covered = groupSizes(line.groups, fromSizes)
    const kept = line.groups
      .map((group, at) => ({ group, shared: covered[at].filter((size) => sizes.includes(size)) }))
      .filter((item) => item.shared.length > 0)
      .map((item) => ({ ...item.group, key: key('group'), upto: item.shared[item.shared.length - 1] }))
    const groups = kept.length ? kept.map((group, at) => (at === kept.length - 1 ? { ...group, upto: last } : group)) : [newPrimaryGroup(last)]
    const pending = primaryDetailsPending(savedLines[index])
    return { ...line, key: key('primary'), groups: pending ? [newPrimaryGroup(last)] : groups, same_pcs: !pending && hasSamePcs(groups) }
  })
}

// The details of a line in the form are still to be filled: nothing is typed in its
// size groups. Such a line is saved as "Details pending" and filled later.
export const isPrimaryPending = (line) => line.groups.every((group) => [group.pcs, group.qty, group.breadth].every((value) => String(value ?? '').trim() === ''))

// A saved line whose details are still to be filled.
export const primaryDetailsPending = (line) => line.details_filled === false || line.groups.length === 0

// Where a saved primary accessory list stands: 'pending' (none), 'details' (some
// accessory still needs its details) or 'added'.
export const primaryListState = (lines) => (lines.length === 0 ? 'pending' : lines.some(primaryDetailsPending) ? 'details' : 'added')
export const PRIMARY_STATE_LABEL = { pending: 'Pending', details: 'Details pending', added: 'Added' }

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
export function checkPrimaryLines(lines, allowPending = false) {
  for (const line of lines) {
    if (!line.accessory_id && !line.new_accessory) return 'Every accessory line needs an accessory name.'
    if (line.colour_specific && !line.colour_follows) return 'For every colour specific accessory, choose Base colour, Alternate colour or Neutral colour.'
    // details left empty are filled later
    if (allowPending && isPrimaryPending(line)) continue
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
  lines.map((line) => {
    const pending = isPrimaryPending(line)
    return {
      accessory_id: line.accessory_id,
      new_accessory: line.accessory_id ? '' : line.new_accessory,
      qty_type: line.qty_type,
      details_pending: pending,
      groups: pending
        ? []
        : line.groups.map((group) => ({
            upto: group.upto,
            pcs: group.pcs.trim(),
            qty: line.qty_type === 'quantity' ? null : group.qty.trim(),
            breadth: line.qty_type === 'dimension' ? group.breadth.trim() : null,
          })),
      ...colourPayload(line),
    }
  })

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

// The CADs of one wishlist item: every CAD of its sample with the same size and ratio.
// A wishlist item picks these up by itself; nothing is assigned by hand.
export const cadsOfEntry = (sample, entry) => sample.cads.filter((cad) => cad.size_ratio_id === entry.size_ratio_id)

// How many times a CAD has been used: the wishlist items whose fabric material list
// was made from its drawing rows.
export const cadUsedIn = (sample, cad) => {
  const rowIds = new Set(cad.rows.map((row) => row.id))
  return sample.wishlist.filter((entry) => (entry.materials ?? []).some((item) => item.cad_row_id && rowIds.has(item.cad_row_id)))
}


// "22-38 1:1" or "22-30".
export const sizeLabel = (combination) =>
  combination ? `${combination.size}${combination.ratio ? ` ${combination.ratio}` : ''}` : ''
