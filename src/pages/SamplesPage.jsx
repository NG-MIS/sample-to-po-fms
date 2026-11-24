import { useMemo, useState } from 'react'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import ImageUpload from '../components/ImageUpload.jsx'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { RemarksEditor, RemarksView } from '../components/Remarks.jsx'
import { Field } from '../components/Field.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fetchRows, nameMap, useLoad } from '../lib/data.js'
import { formatDate, formatDateTime, friendlyError, todayLocal } from '../lib/format.js'
import { uploadFile } from '../lib/images.js'
import { nextSampleNo } from '../lib/numbering.js'
import { remarksSummary } from '../lib/remarks.js'
import { supabase } from '../lib/supabase.js'

const BUCKET = 'samples'
const sameName = (value, name) => (value || '').trim().toLowerCase() === name

async function loadEverything() {
  const [samples, remarks, series, references, people, departments, roles, userRoles] = await Promise.all([
    fetchRows('samples'),
    fetchRows('sample_remarks', 'created_at'),
    fetchRows('sample_series'),
    fetchRows('sample_reference_options'),
    fetchRows('app_users'),
    fetchRows('departments'),
    fetchRows('roles'),
    fetchRows('user_roles', null),
  ])

  const remarksBySample = new Map()
  remarks.forEach((remark) => {
    if (!remarksBySample.has(remark.sample_id)) remarksBySample.set(remark.sample_id, [])
    remarksBySample.get(remark.sample_id).push(remark)
  })

  // DESIGNER pick-list rule: department "Sample" + role "Designer".
  const sampleDepartment = departments.find((department) => sameName(department.name, 'sample'))?.id
  const designerRole = roles.find((role) => sameName(role.name, 'designer'))?.id
  const designerIds = new Set(userRoles.filter((link) => link.role_id === designerRole).map((link) => link.user_id))

  return {
    samples: samples.map((sample) => ({ ...sample, remarks: remarksBySample.get(sample.id) ?? [] })),
    series,
    references,
    people,
    designerIds,
    designers: people.filter(
      (person) => person.is_active && person.department_id === sampleDepartment && designerIds.has(person.id),
    ),
  }
}

export default function SamplesPage() {
  const { isAdmin, profile } = useAuth()
  const { data, loading, error, reload } = useLoad(loadEverything)
  const [editing, setEditing] = useState(null) // null = closed, {} = new, sample = edit
  const [viewing, setViewing] = useState(null)
  const [notice, setNotice] = useState('')

  const samples = useMemo(() => data?.samples ?? [], [data])
  const canCreate = isAdmin || Boolean(data?.designerIds.has(profile.id))

  const lookups = useMemo(
    () => ({ person: nameMap(data?.people), reference: nameMap(data?.references) }),
    [data],
  )

  const columns = useMemo(() => {
    const { person, reference } = lookups
    return [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no, width: 80 },
      {
        key: 'sample_no',
        header: 'SAMPLE NO',
        value: (row) => row.sample_no,
        render: (row) => (
          <button type="button" className="link link--strong" onClick={() => setViewing(row)}>
            {row.sample_no}
          </button>
        ),
      },
      {
        key: 'creation_date',
        header: 'CREATION DATE',
        value: (row) => formatDate(row.creation_date),
        sortValue: (row) => row.creation_date,
      },
      { key: 'designer', header: 'DESIGNER', value: (row) => person.get(row.designer_id) ?? '' },
      {
        key: 'concept_image',
        header: 'CONCEPT IMAGE',
        render: (row) => (
          <ClickableImage bucket={BUCKET} path={row.concept_image_path} alt={`${row.sample_no} concept`} size={44} />
        ),
      },
      {
        key: 'reference',
        header: 'REFERENCE',
        value: (row) => reference.get(row.reference_option_id) ?? '',
        render: (row) =>
          (row.reference_image_path || reference.get(row.reference_option_id)) && (
          <span className="cell-with-image">
            {row.reference_image_path && (
              <ClickableImage
                bucket={BUCKET}
                path={row.reference_image_path}
                alt={`${row.sample_no} reference`}
                size={44}
              />
            )}
            {reference.get(row.reference_option_id) ?? ''}
          </span>
          ),
      },
      {
        key: 'remarks',
        header: 'REMARKS',
        value: (row) => remarksSummary(row.remarks),
        render: (row) =>
          row.remarks.length > 0 && (
            <button type="button" className="link" onClick={() => setViewing(row)}>
              {remarksSummary(row.remarks)}
            </button>
          ),
      },
      { key: 'entered_by', header: 'ENTERED BY', value: (row) => person.get(row.created_by) ?? '' },
      {
        key: 'timestamp',
        header: 'TIMESTAMP',
        value: (row) => formatDateTime(row.created_at),
        sortValue: (row) => row.created_at,
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <span className="row-actions">
            <button type="button" className="btn btn--small" onClick={() => setViewing(row)}>
              View
            </button>
            {isAdmin && (
              <button type="button" className="btn btn--small" onClick={() => setEditing(row)}>
                Edit
              </button>
            )}
          </span>
        ),
      },
    ]
  }, [lookups, isAdmin])

  return (
    <>
      <PageHead
        title="Samples"
        note={canCreate || loading ? null : 'Only people with the role Designer or authority All can create a sample.'}
      />
      {error && (
        <p className="alert alert--error" role="alert">
          {friendlyError(error)}
        </p>
      )}
      {notice && (
        <p className="alert alert--ok" role="status">
          {notice}
        </p>
      )}
      <DataTable
        tableId="samples"
        title="Samples"
        columns={columns}
        rows={samples}
        loading={loading}
        emptyText="No sample has been created yet."
        searchPlaceholder="Search samples…"
        toolbar={
          canCreate && (
            <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
              New sample
            </button>
          )
        }
      />
      {viewing && (
        <SampleView
          sample={viewing}
          lookups={lookups}
          canEdit={isAdmin}
          onEdit={() => {
            setEditing(viewing)
            setViewing(null)
          }}
          onClose={() => setViewing(null)}
        />
      )}
      {editing && (
        <SampleForm
          sample={editing}
          lists={data}
          onClose={() => setEditing(null)}
          onSaved={async (sampleNo) => {
            const wasNew = !editing.id
            setEditing(null)
            setNotice(wasNew ? `Sample ${sampleNo} created.` : `Sample ${sampleNo} updated.`)
            await reload()
          }}
        />
      )}
    </>
  )
}

function SampleView({ sample, lookups, canEdit, onEdit, onClose }) {
  const referenceName = lookups.reference.get(sample.reference_option_id)
  return (
    <Modal
      title={`Sample ${sample.sample_no}`}
      onClose={onClose}
      width={680}
      footer={() => (
        <>
          {canEdit && (
            <button type="button" className="btn" onClick={onEdit}>
              Edit
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </>
      )}
    >
      <dl className="details">
        <div>
          <dt>Sample no</dt>
          <dd>{sample.sample_no}</dd>
        </div>
        <div>
          <dt>Creation date</dt>
          <dd>{formatDate(sample.creation_date)}</dd>
        </div>
        <div>
          <dt>Designer</dt>
          <dd>{lookups.person.get(sample.designer_id)}</dd>
        </div>
        <div>
          <dt>Entered by</dt>
          <dd>
            {lookups.person.get(sample.created_by)}, {formatDateTime(sample.created_at)}
          </dd>
        </div>
        <div>
          <dt>Concept image</dt>
          <dd>
            <ClickableImage
              bucket={BUCKET}
              path={sample.concept_image_path}
              alt={`${sample.sample_no} concept`}
              size={140}
            />
          </dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>
            {!referenceName && !sample.reference_image_path && <span className="hint">None</span>}
            {referenceName && <div>{referenceName}</div>}
            {sample.reference_image_path && (
              <ClickableImage
                bucket={BUCKET}
                path={sample.reference_image_path}
                alt={`${sample.sample_no} reference`}
                size={140}
              />
            )}
          </dd>
        </div>
      </dl>
      <h3 className="section-title">Remarks</h3>
      <RemarksView bucket={BUCKET} remarks={sample.remarks} people={lookups.person} />
    </Modal>
  )
}

function SampleForm({ sample, lists, onClose, onSaved }) {
  const isNew = !sample.id
  const initial = useMemo(
    () => ({
      series_id: null,
      creation_date: sample.creation_date ?? todayLocal(),
      designer_id: sample.designer_id ?? null,
      concept_image_path: sample.concept_image_path ?? null,
      reference_option_id: sample.reference_option_id ?? null,
      reference_image_path: sample.reference_image_path ?? null,
    }),
    [sample],
  )
  const initialRemarks = useMemo(
    () => (sample.remarks ?? []).map((remark) => ({ ...remark, key: remark.id })),
    [sample],
  )

  const [form, setForm] = useState(initial)
  const [conceptFile, setConceptFile] = useState(null)
  const [referenceFile, setReferenceFile] = useState(null)
  const [remarks, setRemarks] = useState(initialRemarks)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (value) => setForm((previous) => ({ ...previous, [key]: value }))

  const dirty =
    conceptFile !== null ||
    referenceFile !== null ||
    draft.trim() !== '' ||
    JSON.stringify(form) !== JSON.stringify(initial) ||
    remarks.length !== initialRemarks.length ||
    remarks.some((remark) => !remark.id)

  const seriesOptions = lists.series
    .filter((series) => series.is_active)
    .map((series) => ({ value: series.id, label: series.prefix }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const chosenSeries = lists.series.find((series) => series.id === form.series_id)

  // On edit, the current designer stays pickable even if they no longer qualify.
  const designerOptions = lists.people
    .filter((person) => lists.designers.includes(person) || person.id === sample.designer_id)
    .map((person) => ({ value: person.id, label: person.name }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const referenceOptions = lists.references
    .filter((option) => option.is_active || option.id === sample.reference_option_id)
    .map((option) => ({ value: option.id, label: option.name }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const save = async (event) => {
    event.preventDefault()
    if (isNew && !form.series_id) return setError('Choose a prefix.')
    if (!form.creation_date) return setError('Creation date is required.')
    if (form.creation_date > todayLocal()) return setError('Creation date cannot be in the future.')
    if (!form.designer_id) return setError('Choose a designer.')
    if (!conceptFile && !form.concept_image_path) return setError('Add the concept image.')

    setBusy(true)
    setError('')
    try {
      const conceptPath = conceptFile ? await uploadFile(BUCKET, conceptFile, 'concept') : form.concept_image_path
      const referencePath = referenceFile
        ? await uploadFile(BUCKET, referenceFile, 'reference')
        : form.reference_image_path

      // A note that was typed but not added yet still counts.
      const all = draft.trim() ? [...remarks, { kind: 'text', body: draft.trim() }] : remarks
      const payload = []
      for (const remark of all) {
        if (remark.id) payload.push({ id: remark.id })
        else if (remark.kind === 'text') payload.push({ kind: 'text', body: remark.body })
        else payload.push({ kind: remark.kind, file_path: await uploadFile(BUCKET, remark.file, 'remarks') })
      }

      const { data: sampleNo, error: failure } = await supabase.rpc('save_sample', {
        p_id: sample.id ?? null,
        p_series_id: form.series_id,
        p_creation_date: form.creation_date,
        p_designer_id: form.designer_id,
        p_concept_image_path: conceptPath,
        p_reference_option_id: form.reference_option_id,
        p_reference_image_path: referencePath,
        p_remarks: payload,
      })
      if (failure) throw failure
      await onSaved(sampleNo)
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isNew ? 'New sample' : `Edit sample ${sample.sample_no}`}
      onClose={onClose}
      dirty={dirty}
      width={720}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="sample-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create sample' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="sample-form" className="form-grid" onSubmit={save}>
        {isNew ? (
          <Field
            label="Prefix"
            htmlFor="sample-prefix"
            required
            hint={
              chosenSeries
                ? `Next number in this series: ${nextSampleNo(chosenSeries)}. The number is fixed when you save.`
                : 'The sample number is made automatically from the prefix.'
            }
          >
            <PickList
              id="sample-prefix"
              options={seriesOptions}
              value={form.series_id}
              onChange={set('series_id')}
              placeholder={seriesOptions.length ? 'Select…' : 'No active prefix in the Numbering master'}
            />
          </Field>
        ) : (
          <Field label="Sample no" htmlFor="sample-no" hint="The sample number never changes.">
            <input id="sample-no" className="input" value={sample.sample_no} disabled readOnly />
          </Field>
        )}
        <Field label="Creation date" htmlFor="sample-date" required>
          <input
            id="sample-date"
            className="input"
            type="date"
            max={todayLocal()}
            value={form.creation_date}
            onChange={(event) => set('creation_date')(event.target.value)}
          />
        </Field>
        <Field
          label="Designer"
          htmlFor="sample-designer"
          required
          hint={designerOptions.length ? null : 'Nobody qualifies yet: a designer is an active person in department Sample with the role Designer.'}
        >
          <PickList
            id="sample-designer"
            clearable={false}
            options={designerOptions}
            value={form.designer_id}
            onChange={set('designer_id')}
          />
        </Field>
        <div />

        <Field label="Concept image" required>
          <ImageUpload
            bucket={BUCKET}
            path={form.concept_image_path}
            file={conceptFile}
            alt="Concept image"
            onFileChange={setConceptFile}
            onRemove={() => {
              setConceptFile(null)
              set('concept_image_path')(null)
            }}
          />
        </Field>
        <div>
          <Field label="Reference" htmlFor="sample-reference" hint="Optional.">
            <PickList
              id="sample-reference"
              options={referenceOptions}
              value={form.reference_option_id}
              onChange={set('reference_option_id')}
            />
          </Field>
          <Field label="Reference image" hint={null}>
            <ImageUpload
              bucket={BUCKET}
              path={form.reference_image_path}
              file={referenceFile}
              alt="Reference image"
              onFileChange={setReferenceFile}
              onRemove={() => {
                setReferenceFile(null)
                set('reference_image_path')(null)
              }}
            />
          </Field>
        </div>

        <div className="form-wide">
          <h3 className="section-title">
            Remarks <span className="hint">optional, add as many as you need</span>
          </h3>
          <RemarksEditor bucket={BUCKET} items={remarks} onChange={setRemarks} draft={draft} onDraftChange={setDraft} />
        </div>

        {error && (
          <p className="alert alert--error form-wide" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
