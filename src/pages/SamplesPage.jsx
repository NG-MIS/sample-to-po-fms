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
const DENIM_OPTIONS = [
  { value: 'denim', label: 'Denim' },
  { value: 'non_denim', label: 'Non denim' },
]
const DENIM_LABEL = { denim: 'Denim', non_denim: 'Non denim' }
// PCS type is worked out from the number of components: 2 components = 2PCS.
const pcsType = (componentIds) => (componentIds.length ? `${componentIds.length}PCS` : '')
const sameName = (value, name) => (value || '').trim().toLowerCase() === name

async function loadEverything() {
  const [
    samples,
    remarks,
    sampleComponents,
    components,
    productTypes,
    collections,
    series,
    references,
    people,
    departments,
    roles,
    userRoles,
  ] = await Promise.all([
      fetchRows('samples'),
      fetchRows('sample_remarks', 'created_at'),
      fetchRows('sample_components', null),
      fetchRows('components'),
      fetchRows('product_types'),
      fetchRows('collections'),
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

  const componentsBySample = new Map()
  sampleComponents.forEach((link) => {
    if (!componentsBySample.has(link.sample_id)) componentsBySample.set(link.sample_id, [])
    componentsBySample.get(link.sample_id).push(link.component_id)
  })

  // DESIGNER pick-list rule: department "Sample" + role "Designer".
  const sampleDepartment = departments.find((department) => sameName(department.name, 'sample'))?.id
  const designerRole = roles.find((role) => sameName(role.name, 'designer'))?.id
  const designerIds = new Set(userRoles.filter((link) => link.role_id === designerRole).map((link) => link.user_id))

  return {
    samples: samples.map((sample) => ({
      ...sample,
      remarks: remarksBySample.get(sample.id) ?? [],
      component_ids: componentsBySample.get(sample.id) ?? [],
    })),
    components,
    productTypes,
    collections,
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
    () => ({
      person: nameMap(data?.people),
      reference: nameMap(data?.references),
      component: nameMap(data?.components),
      productType: nameMap(data?.productTypes),
      collection: nameMap(data?.collections),
    }),
    [data],
  )

  const columns = useMemo(() => {
    const { person, reference, component, productType, collection } = lookups
    const componentNames = (row) => row.component_ids.map((id) => component.get(id)).filter(Boolean).sort()
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
      { key: 'components', header: 'COMPONENTS', value: componentNames },
      { key: 'pcs_type', header: 'PCS TYPE', value: (row) => pcsType(row.component_ids) },
      { key: 'denim_type', header: 'DENIM TYPE', value: (row) => DENIM_LABEL[row.denim_type] ?? '' },
      { key: 'product_type', header: 'PRODUCT TYPE', value: (row) => productType.get(row.product_type_id) ?? '' },
      { key: 'collection', header: 'COLLECTION', value: (row) => collection.get(row.collection_id) ?? '' },
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
          <dt>Components</dt>
          <dd>
            {sample.component_ids
              .map((id) => lookups.component.get(id))
              .filter(Boolean)
              .sort()
              .join(', ') || <span className="hint">None</span>}
          </dd>
        </div>
        <div>
          <dt>PCS type</dt>
          <dd>{pcsType(sample.component_ids) || <span className="hint">None</span>}</dd>
        </div>
        <div>
          <dt>Denim type</dt>
          <dd>{DENIM_LABEL[sample.denim_type] ?? <span className="hint">Not set</span>}</dd>
        </div>
        <div>
          <dt>Product type</dt>
          <dd>{lookups.productType.get(sample.product_type_id) ?? <span className="hint">Not set</span>}</dd>
        </div>
        <div>
          <dt>Collection</dt>
          <dd>{lookups.collection.get(sample.collection_id) ?? <span className="hint">Not set</span>}</dd>
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
      component_ids: sample.component_ids ?? [],
      denim_type: sample.denim_type ?? null,
      product_type_id: sample.product_type_id ?? null,
      collection_id: sample.collection_id ?? null,
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

  // Active components, plus any already on this sample even if now inactive.
  const componentOptions = lists.components
    .filter((item) => item.is_active || (sample.component_ids ?? []).includes(item.id))
    .map((item) => ({ value: item.id, label: item.is_active ? item.name : `${item.name} (inactive)` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  // Active entries of a list, plus the one already on this sample even if now inactive.
  const listOptions = (items, currentId) =>
    items
      .filter((option) => option.is_active || option.id === currentId)
      .map((option) => ({ value: option.id, label: option.is_active ? option.name : `${option.name} (inactive)` }))
      .sort((a, b) => a.label.localeCompare(b.label))

  const referenceOptions = listOptions(lists.references, sample.reference_option_id)
  const productTypeOptions = listOptions(lists.productTypes, sample.product_type_id)
  const collectionOptions = listOptions(lists.collections, sample.collection_id)

  const save = async (event) => {
    event.preventDefault()
    if (isNew && !form.series_id) return setError('Choose a prefix.')
    if (!form.creation_date) return setError('Creation date is required.')
    if (form.creation_date > todayLocal()) return setError('Creation date cannot be in the future.')
    if (!form.designer_id) return setError('Choose a designer.')
    if (form.component_ids.length === 0) return setError('Choose at least one component.')
    if (!form.denim_type) return setError('Choose the denim type.')
    if (!form.product_type_id) return setError('Choose the product type.')
    if (!form.collection_id) return setError('Choose the collection.')
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
        p_component_ids: form.component_ids,
        p_denim_type: form.denim_type,
        p_product_type_id: form.product_type_id,
        p_collection_id: form.collection_id,
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
        <h3 className="section-title form-wide">Sample details</h3>
        {isNew ? (
          <Field
            label="Prefix"
            htmlFor="sample-prefix"
            required
            hint={
              chosenSeries
                ? `Next number: ${nextSampleNo(chosenSeries)}`
                : 'The sample number is made from the prefix.'
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
          <Field label="Sample no" htmlFor="sample-no" hint="Never changes.">
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
          hint={designerOptions.length ? null : 'Nobody qualifies yet. A designer is an active person in department Sample with the role Designer.'}
        >
          <PickList
            id="sample-designer"
            clearable={false}
            options={designerOptions}
            value={form.designer_id}
            onChange={set('designer_id')}
          />
        </Field>
        <Field label="Reference (optional)" htmlFor="sample-reference">
          <PickList
            id="sample-reference"
            options={referenceOptions}
            value={form.reference_option_id}
            onChange={set('reference_option_id')}
          />
        </Field>

        <div className="form-wide">
          <Field
            label="Components"
            htmlFor="sample-components"
            required
            hint={componentOptions.length ? 'Pick one or more.' : 'No active component yet. Add them in Masters, under Components.'}
          >
            <PickList
              id="sample-components"
              multiple
              options={componentOptions}
              value={form.component_ids}
              onChange={set('component_ids')}
            />
          </Field>
        </div>

        <h3 className="section-title section-title--next form-wide">Category details</h3>
        <Field label="PCS type" htmlFor="sample-pcs" hint="Worked out from the number of components.">
          <input
            id="sample-pcs"
            className="input"
            value={pcsType(form.component_ids) || 'Pick components first'}
            disabled
            readOnly
          />
        </Field>
        <Field label="Denim type" htmlFor="sample-denim" required>
          <PickList
            id="sample-denim"
            clearable={false}
            options={DENIM_OPTIONS}
            value={form.denim_type}
            onChange={set('denim_type')}
          />
        </Field>
        <Field label="Product type" htmlFor="sample-product-type" required>
          <PickList
            id="sample-product-type"
            clearable={false}
            options={productTypeOptions}
            value={form.product_type_id}
            onChange={set('product_type_id')}
          />
        </Field>
        <Field label="Collection" htmlFor="sample-collection" required>
          <PickList
            id="sample-collection"
            clearable={false}
            options={collectionOptions}
            value={form.collection_id}
            onChange={set('collection_id')}
          />
        </Field>

        <h3 className="section-title section-title--next form-wide">Pictures</h3>
        <div className="picture-box">
          <Field label="Concept image" required>
            <ImageUpload
              bucket={BUCKET}
              path={form.concept_image_path}
              file={conceptFile}
              alt="Concept image"
              size={96}
              onFileChange={setConceptFile}
              onRemove={() => {
                setConceptFile(null)
                set('concept_image_path')(null)
              }}
            />
          </Field>
        </div>
        <div className="picture-box">
          <Field label="Reference image (optional)">
            <ImageUpload
              bucket={BUCKET}
              path={form.reference_image_path}
              file={referenceFile}
              alt="Reference image"
              size={96}
              onFileChange={setReferenceFile}
              onRemove={() => {
                setReferenceFile(null)
                set('reference_image_path')(null)
              }}
            />
          </Field>
        </div>

        <div className="form-wide">
          <h3 className="section-title section-title--next">
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
