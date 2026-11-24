import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import ImageUpload from '../components/ImageUpload.jsx'
import Modal, { ConfirmDialog } from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { RemarksEditor } from '../components/Remarks.jsx'
import Tabs from '../components/Tabs.jsx'
import { Field } from '../components/Field.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { nameMap, useLoad } from '../lib/data.js'
import { cleanTagName, formatDate, formatDateTime, friendlyError, todayLocal } from '../lib/format.js'
import { uploadFile } from '../lib/images.js'
import { nextSampleNo } from '../lib/numbering.js'
import { remarksSummary } from '../lib/remarks.js'
import {
  BUCKET,
  DECISION_LABEL,
  PIECES,
  PIECE_LABEL,
  PIECE_STATUS_LABEL,
  callSampleAction,
  isClosed,
  latestImage,
  loadSampleData,
  pieceStatus,
  sampleReferences,
  sampleTags,
} from '../lib/sampleData.js'
import { approvalRows, completeRows, imageRows, processRows } from '../lib/sampleTabs.js'
import { supabase } from '../lib/supabase.js'
import SampleDetail, { ApprovalDialog, EntryDialog } from './SampleDetail.jsx'
import { ApprovalTab, CompleteTab, ImagesTab, ProcessTab, ReceiveChooser } from './SampleWorkTabs.jsx'

// The references of a sample, each with its picture from Masters.
function ReferenceList({ references, size, stacked = false }) {
  if (!references.length) return null
  return (
    <span className={`reference-list ${stacked ? 'reference-list--stacked' : ''}`}>
      {references.map((reference) => (
        <span key={reference.id} className="reference-item">
          {reference.image_path ? (
            <ClickableImage bucket={BUCKET} path={reference.image_path} alt={`Reference ${reference.name}`} size={size} />
          ) : (
            stacked && <span className="thumb thumb--empty reference-no-picture" style={{ width: size, height: size }}>No picture</span>
          )}
          <span className="reference-name">{reference.name}</span>
        </span>
      ))}
    </span>
  )
}

function TagList({ tags }) {
  if (!tags.length) return null
  return (
    <span className="tag-list">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
        </span>
      ))}
    </span>
  )
}

const DENIM_OPTIONS = [
  { value: 'denim', label: 'Denim' },
  { value: 'non_denim', label: 'Non denim' },
]
const DENIM_LABEL = { denim: 'Denim', non_denim: 'Non denim' }
// PCS type is worked out from the number of components: 2 components = 2PCS.
const pcsType = (componentIds) => (componentIds.length ? `${componentIds.length}PCS` : '')

export default function SamplesPage() {
  const { isAdmin, profile } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [editing, setEditing] = useState(null) // null = closed, {} = new, sample = edit
  const [viewingId, setViewingId] = useState(null)
  const [notice, setNotice] = useState('')
  const [work, setWork] = useState(null) // the action open from a work tab
  const [workError, setWorkError] = useState('')
  const [params, setParams] = useSearchParams()

  const samples = useMemo(() => data?.samples ?? [], [data])
  const viewing = samples.find((sample) => sample.id === viewingId)
  const canCreate = isAdmin || Boolean(data?.designerIds.has(profile.id))

  const lookups = useMemo(
    () => ({
      person: nameMap(data?.people),
      component: nameMap(data?.components),
      productType: nameMap(data?.productTypes),
      collection: nameMap(data?.collections),
      process: nameMap(data?.processes),
      vendor: nameMap(data?.vendors),
    }),
    [data],
  )

  // ----- work tabs: what is waiting, for this person -----
  const waiting = useMemo(
    () =>
      data
        ? {
            process: processRows(data, profile),
            complete: completeRows(data),
            images: imageRows(data, profile),
            approval: approvalRows(data),
          }
        : { process: [], complete: [], images: [], approval: [] },
    [data, profile],
  )
  const worksOnSamples = Boolean(data?.access.manages || data?.designerIds.has(profile.id))
  const tabs = [
    { key: 'all', label: 'All samples', count: samples.length },
    (worksOnSamples || waiting.process.length > 0) && { key: 'process', label: 'Process', count: waiting.process.length },
    data?.access.manages && { key: 'complete', label: 'Mark completed', count: waiting.complete.length },
    (worksOnSamples || waiting.images.length > 0) && { key: 'images', label: 'Images', count: waiting.images.length },
    data?.access.management && { key: 'approval', label: 'Approval', count: waiting.approval.length },
  ].filter(Boolean)
  const wanted = params.get('tab') ?? 'all'
  const tab = tabs.some((item) => item.key === wanted) ? wanted : 'all'

  const openSample = useCallback((sample) => setViewingId(sample.id), [])
  const sendFrom = useCallback((row) => setWork({ type: 'send', sample: row.sample, piece: row.piece }), [])
  const receiveFrom = useCallback(
    (row) =>
      setWork(
        row.open.length === 1
          ? { type: 'receive', sample: row.sample, entry: row.open[0] }
          : { type: 'choose', row },
      ),
    [],
  )
  const completeFrom = useCallback((row) => setWork({ type: 'complete', sample: row.sample, piece: row.piece }), [])
  const approveFrom = useCallback((sample, stage) => setWork({ type: 'approval', sample, stage }), [])

  const workSaved = useCallback(async () => {
    setWork(null)
    setWorkError('')
    await reload()
  }, [reload])

  const confirmComplete = async () => {
    const { sample, piece } = work
    setWork(null)
    try {
      await callSampleAction('complete_sample_piece', { p_sample_id: sample.id, p_piece: piece })
      setWorkError('')
      await reload()
    } catch (failure) {
      setWorkError(friendlyError(failure))
    }
  }

  const columns = useMemo(() => {
    const { person, component, productType, collection } = lookups
    const componentNames = (row) => row.component_ids.map((id) => component.get(id)).filter(Boolean).sort()
    return [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no, width: 80 },
      {
        key: 'sample_no',
        header: 'SAMPLE NO',
        value: (row) => row.sample_no,
        render: (row) => (
          <button type="button" className="link link--strong" onClick={() => setViewingId(row.id)}>
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
        key: 'image',
        header: 'IMAGE',
        value: (row) => latestImage(row)?.label ?? '',
        render: (row) => {
          const image = latestImage(row)
          return (
            <ClickableImage
              bucket={BUCKET}
              path={image?.path}
              alt={`${row.sample_no} ${image?.label.toLowerCase() ?? ''} image`}
              size={44}
            />
          )
        },
      },
      ...[1, 2].map((piece) => ({
        key: `piece_${piece}`,
        header: piece === 1 ? '1ST PIECE' : '2ND PIECE',
        value: (row) => PIECE_STATUS_LABEL[pieceStatus(row, piece)],
        render: (row) => {
          const status = pieceStatus(row, piece)
          return <span className={`badge badge--${status}`}>{PIECE_STATUS_LABEL[status]}</span>
        },
      })),
      ...[
        ['initial', 'INITIAL APPROVAL'],
        ['final', 'FINAL APPROVAL'],
      ].flatMap(([stage, header]) => [
        {
          key: `approval_${stage}`,
          header,
          value: (row) => (row.approvals[stage] ? DECISION_LABEL[row.approvals[stage].decision] : ''),
          render: (row) =>
            row.approvals[stage] && (
              <span className={`badge badge--${row.approvals[stage].decision}`}>
                {DECISION_LABEL[row.approvals[stage].decision]}
              </span>
            ),
        },
        ...(stage === 'initial'
          ? [
              {
                key: 'changes_requested',
                header: 'CHANGES REQUESTED',
                value: (row) => (row.approvals.rounds.length ? row.approvals.changesRequested : ''),
              },
            ]
          : []),
      ]),
      {
        key: 'sample_status',
        header: 'STATUS',
        value: (row) => (isClosed(row) ? 'Closed' : 'Open'),
        render: (row) => (
          <span className={`badge badge--${isClosed(row) ? 'no' : 'pending'}`}>{isClosed(row) ? 'Closed' : 'Open'}</span>
        ),
      },
      {
        key: 'reference',
        header: 'REFERENCE',
        value: (row) => sampleReferences(row, data).map((reference) => reference.name),
        render: (row) => <ReferenceList references={sampleReferences(row, data)} size={44} />,
      },
      {
        key: 'tags',
        header: 'TAGS',
        value: (row) => sampleTags(row, data),
        render: (row) => <TagList tags={sampleTags(row, data)} />,
      },
      {
        key: 'remarks',
        header: 'REMARKS',
        value: (row) => remarksSummary(row.remarks),
        render: (row) =>
          row.remarks.length > 0 && (
            <button type="button" className="link" onClick={() => setViewingId(row.id)}>
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
            <button type="button" className="btn btn--small" onClick={() => setViewingId(row.id)}>
              Open
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
  }, [lookups, isAdmin, data])

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
      {workError && (
        <p className="alert alert--error" role="alert">
          {workError}
        </p>
      )}
      <Tabs
        tabs={tabs}
        value={tab}
        label="Sample views"
        onChange={(key) => setParams(key === 'all' ? {} : { tab: key }, { replace: true })}
      />
      {tab === 'process' && (
        <ProcessTab rows={waiting.process} lookups={lookups} loading={loading} onOpen={openSample} onSend={sendFrom} onReceive={receiveFrom} />
      )}
      {tab === 'complete' && (
        <CompleteTab rows={waiting.complete} lookups={lookups} loading={loading} onOpen={openSample} onComplete={completeFrom} />
      )}
      {tab === 'images' && (
        <ImagesTab rows={waiting.images} lookups={lookups} loading={loading} onOpen={openSample} onSaved={workSaved} onError={setWorkError} />
      )}
      {tab === 'approval' && (
        <ApprovalTab rows={waiting.approval} lookups={lookups} loading={loading} onOpen={openSample} onApprove={approveFrom} />
      )}
      {tab === 'all' && (
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
      )}
      {work?.type === 'send' && (
        <EntryDialog
          mode="send"
          sample={work.sample}
          data={data}
          piece={work.piece}
          pieces={PIECES.filter((piece) => pieceStatus(work.sample, piece.value) !== 'completed')}
          onClose={() => setWork(null)}
          onSaved={workSaved}
        />
      )}
      {work?.type === 'choose' && (
        <ReceiveChooser
          row={work.row}
          lookups={lookups}
          onClose={() => setWork(null)}
          onPick={(entry) => setWork({ type: 'receive', sample: work.row.sample, entry })}
        />
      )}
      {work?.type === 'receive' && (
        <EntryDialog mode="receive" sample={work.sample} data={data} entry={work.entry} onClose={() => setWork(null)} onSaved={workSaved} />
      )}
      {work?.type === 'approval' && (
        <ApprovalDialog
          sample={work.sample}
          stage={work.stage}
          onClose={() => setWork(null)}
          onSaved={workSaved}
        />
      )}
      {work?.type === 'complete' && (
        <ConfirmDialog
          title={`Mark the ${PIECE_LABEL[work.piece]} piece of ${work.sample.sample_no} completed?`}
          message="After this, nothing more can be sent to a process for this piece. Only a person with authority All can reopen it."
          confirmLabel="Mark completed"
          cancelLabel="Not yet"
          onCancel={() => setWork(null)}
          onConfirm={confirmComplete}
        />
      )}
      {viewing && (
        <SampleDetail
          sample={viewing}
          data={data}
          onChanged={reload}
          onEdit={() => {
            setEditing(viewing)
            setViewingId(null)
          }}
          onClose={() => setViewingId(null)}
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
      reference_ids: sample.reference_ids ?? [],
      tag_ids: sample.tag_ids ?? [],
    }),
    [sample],
  )
  const initialRemarks = useMemo(
    () => (sample.remarks ?? []).map((remark) => ({ ...remark, key: remark.id })),
    [sample],
  )

  const [form, setForm] = useState(initial)
  const [conceptFile, setConceptFile] = useState(null)
  const [newTags, setNewTags] = useState([]) // tag names typed here that are not in the list yet
  const [remarks, setRemarks] = useState(initialRemarks)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (value) => setForm((previous) => ({ ...previous, [key]: value }))

  const dirty =
    conceptFile !== null ||
    newTags.length > 0 ||
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

  // Active entries of a list, plus the ones already on this sample even if now inactive.
  const manyOptions = (items, currentIds = [], show = (name) => name) =>
    items
      .filter((option) => option.is_active || currentIds.includes(option.id))
      .map((option) => ({ value: option.id, label: option.is_active ? show(option.name) : `${show(option.name)} (inactive)` }))
      .sort((a, b) => a.label.localeCompare(b.label))

  const referenceOptions = manyOptions(lists.references, sample.reference_ids)
  const chosenReferences = sampleReferences(form, lists)

  // Tags: the list from Masters, plus the ones typed here. A typed tag is
  // added to the list when the sample is saved.
  const NEW = 'new:'
  const tagOptions = [
    ...manyOptions(lists.tags, sample.tag_ids, (name) => `#${name}`),
    ...newTags.map((name) => ({ value: NEW + name, label: `#${name} (new)` })),
  ]
  const tagValue = [...form.tag_ids, ...newTags.map((name) => NEW + name)]
  const setTags = (values) => {
    set('tag_ids')(values.filter((value) => !value.startsWith(NEW)))
    setNewTags(values.filter((value) => value.startsWith(NEW)).map((value) => value.slice(NEW.length)))
  }
  const sameTag = (a, b) => a.toLowerCase() === b.toLowerCase()
  const addTagLabel = (text) => {
    const name = cleanTagName(text)
    if (!name || name.length > 40) return null
    const known = lists.tags.some((tag) => tag.is_active && sameTag(tag.name, name)) || newTags.some((tag) => sameTag(tag, name))
    return known ? null : `Add #${name}`
  }
  const addTag = (text) => setNewTags((previous) => [...previous, cleanTagName(text)])
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
        p_reference_ids: form.reference_ids,
        p_remarks: payload,
        p_component_ids: form.component_ids,
        p_denim_type: form.denim_type,
        p_product_type_id: form.product_type_id,
        p_collection_id: form.collection_id,
        p_tag_ids: form.tag_ids,
        p_new_tags: newTags,
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
        <Field
          label="References (optional)"
          htmlFor="sample-reference"
          hint={referenceOptions.length ? 'Pick one or more. Their pictures come from Masters.' : 'No active reference yet. They are added in Masters, under References.'}
        >
          <PickList
            id="sample-reference"
            multiple
            options={referenceOptions}
            value={form.reference_ids}
            onChange={set('reference_ids')}
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

        <div className="form-wide">
          <Field
            label="Tags (optional)"
            htmlFor="sample-tags"
            hint="Pick one or more. If a tag is not in the list, type it in the search box and add it."
          >
            <PickList
              id="sample-tags"
              multiple
              options={tagOptions}
              value={tagValue}
              onChange={setTags}
              onCreate={addTag}
              createLabel={addTagLabel}
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
          <Field label="Reference pictures">
            {chosenReferences.length ? (
              <ReferenceList references={chosenReferences} size={96} stacked />
            ) : (
              <p className="hint reference-none">Pick a reference above to see its picture here.</p>
            )}
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
