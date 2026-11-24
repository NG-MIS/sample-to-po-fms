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
    entries,
    completions,
    stageImages,
    approvals,
    components,
    productTypes,
    collections,
    series,
    references,
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
    fetchRows('sample_process_entries'),
    fetchRows('sample_piece_completions', null),
    fetchRows('sample_stage_images', null),
    fetchRows('sample_approvals', null),
    fetchRows('components'),
    fetchRows('product_types'),
    fetchRows('collections'),
    fetchRows('sample_series'),
    fetchRows('sample_reference_options'),
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
  const entriesBySample = groupBy(entries, 'sample_id')
  const completionsBySample = groupBy(completions, 'sample_id')
  const imagesBySample = groupBy(stageImages, 'sample_id')
  const approvalsBySample = groupBy(approvals, 'sample_id')
  const keyed = (rows, key) => Object.fromEntries((rows ?? []).map((row) => [row[key], row]))

  // DESIGNER pick-list rule: department "Sample" + role "Designer".
  const sampleDepartment = departments.find((department) => sameName(department.name, 'sample'))?.id
  const managementDepartment = departments.find((department) => sameName(department.name, 'management'))?.id
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
    },
  }
}

// May update the process log and stage images of this sample.
export function canWorkOn(sample, data, profile) {
  return data.access.manages || sample.designer_id === profile.id
}

// Runs one of the sample database routines; a refusal comes back as an error.
export async function callSampleAction(name, args) {
  const { error } = await supabase.rpc(name, args)
  if (error) throw error
}
