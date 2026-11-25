import { fetchRows } from './data.js'
import { todayLocal } from './format.js'
import { supabase } from './supabase.js'

// Everything the sample screens need, loaded once and shared by the
// Samples screen and the Process log screen.

export const BUCKET = 'samples'

export const PIECES = [
  { value: 1, label: '1st sample' },
  { value: 2, label: '2nd sample' },
]
export const PIECE_LABEL = { 1: '1st sample', 2: '2nd sample' }
export const PIECE_STATUS_LABEL = { pending: 'Pending', at_vendor: 'At vendor', completed: 'Completed' }
export const FABRIC_STATUS_LABEL = { pending: 'Pending', incomplete: 'Incomplete', completed: 'Completed' }
// The colour of each fabric status badge.
export const FABRIC_STATUS_BADGE = { pending: 'pending', incomplete: 'maybe', completed: 'completed' }

export const ACCESSORY_STATUS_LABEL = { pending: 'Pending', added: 'Added' }
export const ACCESSORY_STATUS_BADGE = { pending: 'pending', added: 'completed' }
// Accessory status of a sample: pending while it has no accessory line.
export const accessoryStatus = (sample) => (sample.accessories.length === 0 ? 'pending' : 'added')

// Approved for production: the final approval is Yes.
export const isApproved = (sample) => sample.approvals.final?.decision === 'yes'

// The next design number that would be given, or null while the starting
// number has not been set in Masters.
export const nextDesignNumber = (series) =>
  series?.start_number ? (series.last_number ?? series.start_number - 1) + 1 : null

// The components of a sample that no fabric line is for yet.
export const componentsWithoutFabric = (sample) => {
  const covered = new Set(sample.fabrics.flatMap((line) => line.component_ids))
  return sample.component_ids.filter((id) => !covered.has(id))
}

// Fabric status of a sample:
//   pending    - no fabric at all
//   incomplete - some fabric, but at least one component has none
//   completed  - every component of the sample has a fabric
export const fabricStatus = (sample) =>
  sample.fabrics.length === 0 ? 'pending' : componentsWithoutFabric(sample).length > 0 ? 'incomplete' : 'completed'

// The four stage images, lowest priority first. The picture shown for a
// sample is always the highest one that exists.
export const STAGES = [
  { key: 'concept', label: 'Concept' },
  { key: 'first', label: '1st sample' },
  { key: 'second', label: '2nd sample' },
  { key: 'photoshoot', label: 'Photoshoot' },
]

export const DECISION_LABEL = { yes: 'Yes', no: 'No', maybe: 'Maybe' }

// A sample is closed when its latest initial approval is No. Everything stops on it.
export const isClosed = (sample) => sample.approvals.initial?.decision === 'no'
export const APPROVAL_STAGES = {
  initial: { label: 'Initial approval', decisions: ['yes', 'no', 'maybe'] },
  final: { label: 'Final approval', decisions: ['yes', 'no'] },
}

const sameName = (value, name) => (value || '').trim().toLowerCase() === name

// Pending, At vendor or Completed, for one of the two pieces of a sample.
export function pieceStatus(sample, piece) {
  if (sample.completions[piece]) return 'completed'
  return sample.entries.some((entry) => entry.piece === piece && !entry.received_date) ? 'at_vendor' : 'pending'
}

export function stageImagePath(sample, stageKey) {
  return stageKey === 'concept' ? sample.concept_image_path : (sample.stageImages[stageKey]?.file_path ?? null)
}

// The highest stage image the sample has: { key, label, path }.
export function latestImage(sample) {
  for (let index = STAGES.length - 1; index >= 0; index -= 1) {
    const path = stageImagePath(sample, STAGES[index].key)
    if (path) return { ...STAGES[index], path }
  }
  return null
}

// Whole days between the sent date and the received date (or today if still out).
export function daysOut(entry) {
  const toDay = (text) => {
    const [year, month, day] = text.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((toDay(entry.received_date || todayLocal()) - toDay(entry.sent_date)) / 86400000)
}

// Initial approval can be given several times. `initial` is the latest round,
// `rounds` is every round in order, and `changesRequested` counts the Maybe rounds.
function arrangeApprovals(rows = []) {
  const rounds = rows.filter((row) => row.stage === 'initial').sort((a, b) => a.round - b.round)
  return {
    initial: rounds[rounds.length - 1],
    final: rows.find((row) => row.stage === 'final'),
    rounds,
    changesRequested: rounds.filter((row) => row.decision === 'maybe').length,
  }
}

function groupBy(rows, key) {
  const groups = new Map()
  rows.forEach((row) => {
    if (!groups.has(row[key])) groups.set(row[key], [])
    groups.get(row[key]).push(row)
  })
  return groups
}

export async function loadSampleData(profile) {
  const [
    samples,
    remarks,
    sampleComponents,
    sampleReferences,
    sampleTags,
    sampleFabrics,
    sampleFabricComponents,
    sampleAccessories,
    wishlistEntries,
    cads,
    cadRows,
    cadWishlist,
    primaryLines,
    entries,
    completions,
    stageImages,
    approvals,
    components,
    productTypes,
    collections,
    series,
    references,
    tags,
    fabrics,
    fabricVendors,
    accessories,
    accessoryVendors,
    designSeries,
    sizeRatios,
    cadParticulars,
    processes,
    vendors,
    people,
    departments,
    roles,
    userRoles,
    authorityDepartments,
  ] = await Promise.all([
    fetchRows('samples'),
    fetchRows('sample_remarks', 'created_at'),
    fetchRows('sample_components', null),
    fetchRows('sample_references', null),
    fetchRows('sample_tags', null),
    fetchRows('sample_fabrics'),
    fetchRows('sample_fabric_components', null),
    fetchRows('sample_accessories'),
    fetchRows('wishlist_entries'),
    fetchRows('cads'),
    fetchRows('cad_rows', 'position'),
    fetchRows('cad_wishlist', null),
    fetchRows('primary_accessory_lines', 'position'),
    fetchRows('sample_process_entries'),
    fetchRows('sample_piece_completions', null),
    fetchRows('sample_stage_images', null),
    fetchRows('sample_approvals', null),
    fetchRows('components'),
    fetchRows('product_types'),
    fetchRows('collections'),
    fetchRows('sample_series'),
    fetchRows('sample_reference_options'),
    fetchRows('tags'),
    fetchRows('fabrics'),
    fetchRows('fabric_vendors'),
    fetchRows('accessories'),
    fetchRows('accessory_vendors'),
    fetchRows('design_series', null),
    fetchRows('size_ratios'),
    fetchRows('cad_particulars'),
    fetchRows('processes'),
    fetchRows('vendors'),
    fetchRows('app_users'),
    fetchRows('departments'),
    fetchRows('roles'),
    fetchRows('user_roles', null),
    fetchRows('user_authority_departments', null),
  ])

  const remarksBySample = groupBy(remarks, 'sample_id')
  const componentsBySample = groupBy(sampleComponents, 'sample_id')
  const referencesBySample = groupBy(sampleReferences, 'sample_id')
  const tagsBySample = groupBy(sampleTags, 'sample_id')
  const fabricsBySample = groupBy(sampleFabrics, 'sample_id')
  const componentsByFabricLine = groupBy(sampleFabricComponents, 'sample_fabric_id')
  const accessoriesBySample = groupBy(sampleAccessories, 'sample_id')
  const wishlistBySample = groupBy(wishlistEntries, 'sample_id')
  const cadsBySample = groupBy(cads, 'sample_id')
  const rowsByCad = groupBy(cadRows, 'cad_id')
  const wishlistByCad = groupBy(cadWishlist, 'cad_id')
  const primaryBySample = groupBy(primaryLines, 'sample_id')
  const entriesBySample = groupBy(entries, 'sample_id')
  const completionsBySample = groupBy(completions, 'sample_id')
  const imagesBySample = groupBy(stageImages, 'sample_id')
  const approvalsBySample = groupBy(approvals, 'sample_id')
  const keyed = (rows, key) => Object.fromEntries((rows ?? []).map((row) => [row[key], row]))

  // DESIGNER pick-list rule: department "Sample" + role "Designer".
  const sampleDepartment = departments.find((department) => sameName(department.name, 'sample'))?.id
  const managementDepartment = departments.find((department) => sameName(department.name, 'management'))?.id
  const cadDepartment = departments.find((department) => sameName(department.name, 'cad'))?.id
  const designerRole = roles.find((role) => sameName(role.name, 'designer'))?.id
  const designerIds = new Set(userRoles.filter((link) => link.role_id === designerRole).map((link) => link.user_id))

  // What the signed-in person may do. The database enforces the same rules.
  const isAll = profile.authority === 'all'
  const looksAfterSample =
    profile.authority === 'departments' &&
    authorityDepartments.some((link) => link.user_id === profile.id && link.department_id === sampleDepartment)

  return {
    samples: samples.map((sample) => ({
      ...sample,
      remarks: remarksBySample.get(sample.id) ?? [],
      component_ids: (componentsBySample.get(sample.id) ?? []).map((link) => link.component_id),
      reference_ids: (referencesBySample.get(sample.id) ?? []).map((link) => link.reference_id),
      tag_ids: (tagsBySample.get(sample.id) ?? []).map((link) => link.tag_id),
      fabrics: (fabricsBySample.get(sample.id) ?? []).map((line) => ({
        ...line,
        component_ids: (componentsByFabricLine.get(line.id) ?? []).map((link) => link.component_id),
      })),
      accessories: accessoriesBySample.get(sample.id) ?? [],
      // the wishlist entries of the sample: the NEW one first, then its repeats
      wishlist: [...(wishlistBySample.get(sample.id) ?? [])].sort((a, b) => a.repeat_no - b.repeat_no),
      // the CADs of the sample, each with its drawing rows and the wishlist items it is assigned to
      cads: [...(cadsBySample.get(sample.id) ?? [])]
        .sort((a, b) => a.seq - b.seq)
        .map((cad) => ({
          ...cad,
          rows: rowsByCad.get(cad.id) ?? [],
          wishlist_ids: (wishlistByCad.get(cad.id) ?? []).map((link) => link.wishlist_entry_id),
        })),
      // the lines of its primary accessory lists, for every size (+ ratio)
      primaryLines: primaryBySample.get(sample.id) ?? [],
      entries: entriesBySample.get(sample.id) ?? [],
      completions: keyed(completionsBySample.get(sample.id), 'piece'),
      stageImages: keyed(imagesBySample.get(sample.id), 'stage'),
      approvals: arrangeApprovals(approvalsBySample.get(sample.id)),
    })),
    components,
    productTypes,
    collections,
    series,
    references,
    tags,
    fabrics,
    fabricVendors,
    accessories,
    accessoryVendors,
    designSeries: designSeries[0] ?? null,
    sizeRatios,
    cadParticulars,
    processes,
    vendors,
    people,
    designerIds,
    designers: people.filter(
      (person) => person.is_active && person.department_id === sampleDepartment && designerIds.has(person.id),
    ),
    access: {
      // Looks after the Sample department: may mark pieces completed, and work on any sample.
      manages: isAll || looksAfterSample,
      // May approve samples.
      management: isAll || (Boolean(managementDepartment) && profile.department_id === managementDepartment),
      // Makes CADs, assigns them to wishlist items and sets up primary accessory lists.
      cad: isAll || (Boolean(cadDepartment) && profile.department_id === cadDepartment),
    },
  }
}

// The references of a sample, by name: [{ id, name, image_path }].
export function sampleReferences(sample, data) {
  return sample.reference_ids
    .map((id) => data.references.find((reference) => reference.id === id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// The tags of a sample as shown on screen: ["#Party wear", "#Summer"].
export function sampleTags(sample, data) {
  return sample.tag_ids
    .map((id) => data.tags.find((tag) => tag.id === id)?.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `#${name}`)
}

// May update the process log and stage images of this sample.
export function canWorkOn(sample, data, profile) {
  return data.access.manages || sample.designer_id === profile.id
}

// Runs one of the sample database routines; a refusal comes back as an error.
export async function callSampleAction(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}
