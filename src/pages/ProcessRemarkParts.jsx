import { useMemo, useState } from 'react'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { RemarksEditor, RemarksView } from '../components/Remarks.jsx'
import { Field } from '../components/Field.jsx'
import { nameMap } from '../lib/data.js'
import { remarkTags } from '../lib/remarks.js'
import { formatDateTime, friendlyError } from '../lib/format.js'
import { uploadFile } from '../lib/images.js'
import { BUCKET, callSampleAction } from '../lib/sampleData.js'

// Process remarks: instructions for production on a sample. Like the normal remarks
// (typed notes, voice notes, pictures), but tagged to the departments and the processes
// that must follow them.

// One saved process remark: its tags, who wrote it, and its notes, voice notes and pictures.
export function ProcessRemarkCard({ remark, data, canEdit, onEdit, onDelete }) {
  const tags = remarkTags(remark, data)
  const people = useMemo(() => nameMap(data.people), [data.people])
  return (
    <div className="process-remark" data-process-remark>
      <div className="process-remark-head">
        <span className="tag-list">
          {tags.departments.map((name) => (
            <span key={`d-${name}`} className="badge badge--ordered" title="Department">
              {name}
            </span>
          ))}
          {tags.processes.map((name) => (
            <span key={`p-${name}`} className="badge badge--maybe" title="Process">
              {name}
            </span>
          ))}
        </span>
        <span className="hint">
          {people.get(remark.created_by)}, {formatDateTime(remark.created_at)}
        </span>
        {canEdit && (
          <span className="row-actions">
            <button type="button" className="btn btn--small" onClick={() => onEdit(remark)}>
              Edit
            </button>
            <button type="button" className="btn btn--small" onClick={() => onDelete(remark)}>
              Delete
            </button>
          </span>
        )}
      </div>
      <RemarksView bucket={BUCKET} remarks={remark.items} />
    </div>
  )
}

let nextKey = 0
const toEditorItems = (items) => items.map((item) => ({ key: `saved-${++nextKey}`, id: item.id, kind: item.kind, body: item.body, file_path: item.file_path }))

// Adds a process remark, or changes one.
//   remark  - the remark to change, or null for a new one
//   sample  - the sample it is for; when null the sample is picked from `samples`
//   samples - the samples the person may write process remarks for
export function ProcessRemarkDialog({ remark = null, sample = null, samples = [], data, onClose, onSaved }) {
  const [sampleId, setSampleId] = useState(sample?.id ?? null)
  const [departmentIds, setDepartmentIds] = useState(remark?.department_ids ?? [])
  const [processIds, setProcessIds] = useState(remark?.process_ids ?? [])
  const [items, setItems] = useState(() => toEditorItems(remark?.items ?? []))
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const chosen = sample ?? samples.find((item) => item.id === sampleId)
  const options = (rows, picked) => rows.filter((row) => row.is_active || picked.includes(row.id)).map((row) => ({ value: row.id, label: row.name }))
  const dirty =
    sampleId !== (sample?.id ?? null) ||
    draft.trim() !== '' ||
    JSON.stringify([departmentIds, processIds]) !== JSON.stringify([remark?.department_ids ?? [], remark?.process_ids ?? []]) ||
    items.length !== (remark?.items.length ?? 0) ||
    items.some((item) => !item.id)

  const save = async (event) => {
    event.preventDefault()
    if (!chosen) return setError('Choose the sample.')
    if (departmentIds.length + processIds.length === 0) return setError('Tag the remark to at least one department or process.')
    // a note that was typed but not added yet still counts
    const all = draft.trim() ? [...items, { kind: 'text', body: draft.trim() }] : items
    if (all.length === 0) return setError('Add a note, a voice note or a picture.')
    setBusy(true)
    setError('')
    try {
      const payload = []
      for (const item of all) {
        if (item.kind === 'text') payload.push({ kind: 'text', body: item.body })
        else payload.push({ kind: item.kind, file_path: item.file ? await uploadFile(BUCKET, item.file, 'process-remarks') : item.file_path })
      }
      await callSampleAction('save_process_remark', {
        p_id: remark?.id ?? null,
        p_sample_id: chosen.id,
        p_department_ids: departmentIds,
        p_process_ids: processIds,
        p_items: payload,
      })
      await onSaved(remark ? `Process remark of ${chosen.sample_no} changed.` : `Process remark added to ${chosen.sample_no}.`)
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={remark ? `Change a process remark of ${chosen?.sample_no ?? ''}` : sample ? `Process remark for ${sample.sample_no}` : 'Add a process remark'}
      onClose={onClose}
      dirty={dirty}
      width={720}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="process-remark-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save remark'}
          </button>
        </>
      )}
    >
      <form id="process-remark-form" onSubmit={save} noValidate>
        {!sample && (
          <Field label="Sample" htmlFor="process-remark-sample" required>
            <PickList
              id="process-remark-sample"
              options={samples.map((item) => ({ value: item.id, label: item.sample_no }))}
              value={sampleId}
              clearable={false}
              onChange={setSampleId}
              placeholder={samples.length ? 'Select…' : 'No sample you can write remarks for'}
            />
          </Field>
        )}
        <div className="form-grid">
          <Field label="Departments to follow it" htmlFor="process-remark-departments">
            <PickList id="process-remark-departments" multiple options={options(data.departments, departmentIds)} value={departmentIds} onChange={setDepartmentIds} />
          </Field>
          <Field label="Processes to follow it" htmlFor="process-remark-processes">
            <PickList id="process-remark-processes" multiple options={options(data.processes, processIds)} value={processIds} onChange={setProcessIds} />
          </Field>
        </div>
        <p className="hint">Tag at least one department or process. The remark can be typed, spoken or a picture, or any mix of these.</p>
        <RemarksEditor bucket={BUCKET} items={items} onChange={setItems} draft={draft} onDraftChange={setDraft} />
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
