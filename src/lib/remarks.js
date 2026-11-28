import { nameMap } from './data.js'

// A voice note can be at most this long. People with authority All have no limit.
export const VOICE_LIMIT_SECONDS = 90

// The names of the departments and processes a remark is tagged to.
export function remarkTags(remark, data) {
  const department = nameMap(data.departments)
  const process = nameMap(data.processes)
  return {
    departments: remark.department_ids.map((id) => department.get(id)).filter(Boolean),
    processes: remark.process_ids.map((id) => process.get(id)).filter(Boolean),
  }
}

// Short text such as "2 text, 1 voice, 3 pictures" for tables.
export function remarksSummary(remarks) {
  const count = (kind) => remarks.filter((item) => item.kind === kind).length
  const parts = [
    [count('text'), 'text'],
    [count('voice'), 'voice'],
    [count('image'), count('image') === 1 ? 'picture' : 'pictures'],
  ]
  return parts
    .filter(([number]) => number > 0)
    .map(([number, label]) => `${number} ${label}`)
    .join(', ')
}
