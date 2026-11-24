import { useMemo, useRef, useState } from 'react'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import ImageEditor from '../components/ImageEditor.jsx'
import Modal, { ConfirmDialog } from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { RemarksView } from '../components/Remarks.jsx'
import { Field } from '../components/Field.jsx'
import { useAuth } from '../lib/auth.jsx'
import { nameMap } from '../lib/data.js'
import { formatDate, formatDateTime, friendlyError, todayLocal } from '../lib/format.js'
import { checkImageFile, uploadFile } from '../lib/images.js'
import {
  APPROVAL_STAGES,
  BUCKET,
  DECISION_LABEL,
  PIECES,
  PIECE_LABEL,
  PIECE_STATUS_LABEL,
  STAGES,
  callSampleAction as call,
  canWorkOn,
  daysOut,
  latestImage,
  pieceStatus,
  stageImagePath,
} from '../lib/sampleData.js'

const DENIM_LABEL = { denim: 'Denim', non_denim: 'Non denim' }

// Everything about one sample after it is created: details, stage images,
// the two pieces and their process log, approval and remarks.
//   onChanged - reloads the data after something was saved
//   onEdit    - optional; opens the edit form (authority All)
export default function SampleDetail({ sample, data, onChanged, onEdit, onClose }) {
  const { profile, isAdmin } = useAuth()
  const [dialog, setDialog] = useState(null)
  const [error, setError] = useState('')

  const canWork = canWorkOn(sample, data, profile)
  const canComplete = data.access.manages
  const canApprove = data.access.management

  const names = useMemo(
    () => ({
      person: nameMap(data.people),
      process: nameMap(data.processes),
      vendor: nameMap(data.vendors),
      component: nameMap(data.components),
      productType: nameMap(data.productTypes),
      collection: nameMap(data.collections),
      reference: nameMap(data.references),
    }),
    [data],
  )

  const saved = async () => {
    setDialog(null)
    setError('')
    await onChanged()
  }

  const runConfirmed = async (name, args) => {
    setDialog(null)
    try {
      await call(name, args)
      setError('')
      await onChanged()
    } catch (failure) {
      setError(friendlyError(failure))
    }
  }

  const entryColumns = useMemo(
    () => [
      { key: 'piece', header: 'PIECE', value: (entry) => PIECE_LABEL[entry.piece] },
      { key: 'process', header: 'PROCESS', value: (entry) => names.process.get(entry.process_id) ?? '' },
      { key: 'vendor', header: 'VENDOR', value: (entry) => names.vendor.get(entry.vendor_id) ?? '' },
      {
        key: 'sent_date',
        header: 'SENT DATE',
        value: (entry) => formatDate(entry.sent_date),
        sortValue: (entry) => entry.sent_date,
      },
      {
        key: 'received_date',
        header: 'RECD DATE',
        value: (entry) => formatDate(entry.received_date),
        sortValue: (entry) => entry.received_date ?? '',
      },
      {
        key: 'status',
        header: 'STATUS',
        value: (entry) => (entry.received_date ? 'Received' : 'At vendor'),
        render: (entry) => (
          <span className={`badge badge--${entry.received_date ? 'completed' : 'at_vendor'}`}>
            {entry.received_date ? 'Received' : 'At vendor'}
          </span>
        ),
      },
      { key: 'days', header: 'DAYS', value: (entry) => daysOut(entry) },
      { key: 'sent_by', header: 'SENT BY', value: (entry) => names.person.get(entry.created_by) ?? '' },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (entry) => (
          <span className="row-actions">
            {canWork && !entry.received_date && (
              <button type="button" className="btn btn--small btn--primary" onClick={() => setDialog({ type: 'receive', entry })}>
                Receive
              </button>
            )}
            {isAdmin && (
              <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'correct', entry })}>
                Correct
              </button>
            )}
          </span>
        ),
      },
    ],
    [names, canWork, isAdmin],
  )

  const componentNames = sample.component_ids
    .map((id) => names.component.get(id))
    .filter(Boolean)
    .sort()
  const referenceName = names.reference.get(sample.reference_option_id)
  const openPieces = PIECES.filter((piece) => pieceStatus(sample, piece.value) !== 'completed')

  return (
    <Modal
      title={`Sample ${sample.sample_no}`}
      onClose={onClose}
      width={1040}
      footer={() => (
        <>
          {onEdit && isAdmin && (
            <button type="button" className="btn" onClick={onEdit}>
              Edit details
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </>
      )}
    >
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      <h3 className="section-title">Details</h3>
      <dl className="details details--three">
        <Detail label="Sample no">{sample.sample_no}</Detail>
        <Detail label="Creation date">{formatDate(sample.creation_date)}</Detail>
        <Detail label="Designer">{names.person.get(sample.designer_id)}</Detail>
        <Detail label="Components">{componentNames.join(', ')}</Detail>
        <Detail label="PCS type">{componentNames.length ? `${componentNames.length}PCS` : ''}</Detail>
        <Detail label="Denim type">{DENIM_LABEL[sample.denim_type]}</Detail>
        <Detail label="Product type">{names.productType.get(sample.product_type_id)}</Detail>
        <Detail label="Collection">{names.collection.get(sample.collection_id)}</Detail>
        <Detail label="Entered by">
          {names.person.get(sample.created_by)}, {formatDateTime(sample.created_at)}
        </Detail>
        <Detail label="Reference">
          {(referenceName || sample.reference_image_path) && (
            <span className="cell-with-image">
              {sample.reference_image_path && (
                <ClickableImage
                  bucket={BUCKET}
                  path={sample.reference_image_path}
                  alt={`${sample.sample_no} reference`}
                  size={56}
                />
              )}
              {referenceName}
            </span>
          )}
        </Detail>
      </dl>

      <h3 className="section-title section-title--next">
        Stage images <span className="hint">the highest one available is shown as the sample&rsquo;s picture</span>
      </h3>
      <div className="stage-grid">
        {STAGES.map((stage) => (
          <StageTile
            key={stage.key}
            sample={sample}
            stage={stage}
            canWork={canWork}
            people={names.person}
            onSaved={saved}
            onError={setError}
          />
        ))}
      </div>

      <h3 className="section-title section-title--next">Pieces and process log</h3>
      <div className="piece-grid">
        {PIECES.map((piece) => {
          const status = pieceStatus(sample, piece.value)
          const completion = sample.completions[piece.value]
          return (
            <div key={piece.value} className="piece-card" data-piece={piece.value}>
              <div className="piece-head">
                <strong>{piece.label} piece</strong>
                <span className={`badge badge--${status}`}>{PIECE_STATUS_LABEL[status]}</span>
              </div>
              {completion && (
                <p className="hint">
                  Completed by {names.person.get(completion.completed_by)}, {formatDateTime(completion.completed_at)}
                </p>
              )}
              <div className="piece-actions">
                {canWork && status !== 'completed' && (
                  <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'send', piece: piece.value })}>
                    Send to process
                  </button>
                )}
                {canComplete && status !== 'completed' && (
                  <button
                    type="button"
                    className="btn btn--small btn--primary"
                    disabled={status === 'at_vendor'}
                    title={status === 'at_vendor' ? 'Receive it back from the vendor first' : undefined}
                    onClick={() => setDialog({ type: 'complete', piece: piece.value })}
                  >
                    Mark completed
                  </button>
                )}
                {isAdmin && status === 'completed' && (
                  <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'reopen', piece: piece.value })}>
                    Reopen
                  </button>
                )}
              </div>
              {canComplete && status === 'at_vendor' && (
                <p className="hint">It cannot be marked completed while it is at a vendor.</p>
              )}
            </div>
          )
        })}
      </div>
      <DataTable
        tableId="sample-process-entries"
        title={`${sample.sample_no} process log`}
        columns={entryColumns}
        rows={sample.entries}
        emptyText="Nothing has been sent to a process yet."
      />

      <h3 className="section-title section-title--next">Approval</h3>
      <div className="piece-grid">
        {Object.entries(APPROVAL_STAGES).map(([stage, info]) => {
          const approval = sample.approvals[stage]
          const blockedByFinal = stage === 'first' && Boolean(sample.approvals.final)
          return (
            <div key={stage} className="piece-card" data-approval={stage}>
              <div className="piece-head">
                <strong>{info.label}</strong>
                {approval ? (
                  <span className={`badge badge--${approval.decision}`}>{DECISION_LABEL[approval.decision]}</span>
                ) : (
                  <span className="badge badge--pending">Not given</span>
                )}
              </div>
              {approval && (
                <>
                  {approval.remarks && <p className="approval-remarks">{approval.remarks}</p>}
                  <p className="hint">
                    By {names.person.get(approval.decided_by)}, {formatDateTime(approval.decided_at)}
                  </p>
                </>
              )}
              {!approval && blockedByFinal && (
                <p className="hint">The final approval was given directly, so no 1st approval is needed.</p>
              )}
              <div className="piece-actions">
                {!approval && canApprove && !blockedByFinal && (
                  <button type="button" className="btn btn--small btn--primary" onClick={() => setDialog({ type: 'approval', stage })}>
                    Give {info.label.toLowerCase()}
                  </button>
                )}
                {approval && isAdmin && (
                  <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'approval', stage })}>
                    Change
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <h3 className="section-title section-title--next">Remarks</h3>
      <RemarksView bucket={BUCKET} remarks={sample.remarks} people={names.person} />

      {dialog?.type === 'send' && (
        <EntryDialog mode="send" sample={sample} data={data} piece={dialog.piece} pieces={openPieces} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'receive' && (
        <EntryDialog mode="receive" sample={sample} data={data} entry={dialog.entry} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'correct' && (
        <EntryDialog mode="correct" sample={sample} data={data} entry={dialog.entry} pieces={PIECES} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'approval' && (
        <ApprovalDialog sample={sample} stage={dialog.stage} current={sample.approvals[dialog.stage]} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'complete' && (
        <ConfirmDialog
          title={`Mark the ${PIECE_LABEL[dialog.piece]} piece completed?`}
          message="After this, nothing more can be sent to a process for this piece. Only a person with authority All can reopen it."
          confirmLabel="Mark completed"
          cancelLabel="Not yet"
          onCancel={() => setDialog(null)}
          onConfirm={() => runConfirmed('complete_sample_piece', { p_sample_id: sample.id, p_piece: dialog.piece })}
        />
      )}
      {dialog?.type === 'reopen' && (
        <ConfirmDialog
          title={`Reopen the ${PIECE_LABEL[dialog.piece]} piece?`}
          message="It will go back to Pending and can be sent to processes again."
          confirmLabel="Reopen"
          cancelLabel="Cancel"
          onCancel={() => setDialog(null)}
          onConfirm={() => runConfirmed('reopen_sample_piece', { p_sample_id: sample.id, p_piece: dialog.piece })}
        />
      )}
    </Modal>
  )
}

function Detail({ label, children }) {
  const empty = children === null || children === undefined || children === '' || children === false
  return (
    <div>
      <dt>{label}</dt>
      <dd>{empty ? <span className="hint">Not set</span> : children}</dd>
    </div>
  )
}

// One of the four stage images, with its upload button.
function StageTile({ sample, stage, canWork, people, onSaved, onError }) {
  const path = stageImagePath(sample, stage.key)
  const record = sample.stageImages[stage.key]
  const isMain = latestImage(sample)?.key === stage.key
  const canUpload = canWork && stage.key !== 'concept'

  return (
    <div className={`stage-tile ${isMain ? 'stage-tile--main' : ''}`} data-stage={stage.key}>
      <div className="stage-name">
        <strong>{stage.label}</strong>
        {isMain && <span className="badge badge--on">Main picture</span>}
      </div>
      <ClickableImage bucket={BUCKET} path={path} alt={`${sample.sample_no} ${stage.label.toLowerCase()} image`} size={132} />
      {record && (
        <p className="hint">
          {people.get(record.created_by)}, {formatDateTime(record.created_at)}
        </p>
      )}
      {!path && !canUpload && <p className="hint">Not added yet</p>}
      {canUpload && <StageImageButton sample={sample} stage={stage} onSaved={onSaved} onError={onError} />}
    </div>
  )
}

// The button that adds or replaces one stage image: choose a picture, edit it,
// upload it and save it against the sample. Used in the opened sample and in the Images tab.
export function StageImageButton({ sample, stage, onSaved, onError, label }) {
  const fileRef = useRef(null)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const path = stageImagePath(sample, stage.key)

  const choose = (event) => {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    const problem = checkImageFile(chosen)
    if (problem) onError(problem)
    else setEditing(chosen)
  }

  const upload = async (file) => {
    setEditing(null)
    setBusy(true)
    try {
      const filePath = await uploadFile(BUCKET, file, 'stage')
      await call('set_sample_stage_image', { p_sample_id: sample.id, p_stage: stage.key, p_file_path: filePath })
      await onSaved()
    } catch (failure) {
      onError(friendlyError(failure))
    }
    setBusy(false)
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose} />
      <button type="button" className="btn btn--small" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? 'Uploading…' : (label ?? (path ? 'Replace picture' : 'Add picture'))}
      </button>
      {editing && <ImageEditor file={editing} onCancel={() => setEditing(null)} onDone={upload} />}
    </>
  )
}

// Send a piece to a process, receive it back, or (authority All) correct an entry.
export function EntryDialog({ mode, sample, data, entry, piece, pieces, onClose, onSaved }) {
  const today = todayLocal()
  const names = useMemo(() => ({ process: nameMap(data.processes), vendor: nameMap(data.vendors) }), [data])
  const initial = useMemo(
    () => ({
      piece: entry?.piece ?? piece ?? pieces?.[0]?.value ?? null,
      process_id: entry?.process_id ?? null,
      vendor_id: entry?.vendor_id ?? null,
      sent_date: entry?.sent_date ?? today,
      received_date: mode === 'receive' ? today : (entry?.received_date ?? ''),
    }),
    [entry, piece, pieces, mode, today],
  )
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (value) => setForm((previous) => ({ ...previous, [key]: value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const options = (items, currentId) =>
    items
      .filter((item) => item.is_active || item.id === currentId)
      .map((item) => ({ value: item.id, label: item.is_active ? item.name : `${item.name} (inactive)` }))
      .sort((a, b) => a.label.localeCompare(b.label))

  const save = async (event) => {
    event.preventDefault()
    if (mode !== 'receive') {
      if (!form.piece) return setError('Choose the piece.')
      if (!form.process_id) return setError('Choose the process.')
      if (!form.vendor_id) return setError('Choose the vendor.')
      if (!form.sent_date) return setError('Sent date is required.')
      if (form.sent_date > today) return setError('Sent date cannot be in the future.')
    }
    if (mode === 'receive' && !form.received_date) return setError('Received date is required.')
    if (form.received_date) {
      if (form.received_date < form.sent_date) return setError('Received date cannot be before the sent date.')
      if (form.received_date > today) return setError('Received date cannot be in the future.')
    }

    setBusy(true)
    setError('')
    try {
      if (mode === 'send') {
        await call('send_sample_process', {
          p_sample_id: sample.id,
          p_piece: form.piece,
          p_process_id: form.process_id,
          p_vendor_id: form.vendor_id,
          p_sent_date: form.sent_date,
        })
      } else if (mode === 'receive') {
        await call('receive_sample_process', { p_entry_id: entry.id, p_received_date: form.received_date })
      } else {
        await call('correct_sample_process', {
          p_entry_id: entry.id,
          p_piece: form.piece,
          p_process_id: form.process_id,
          p_vendor_id: form.vendor_id,
          p_sent_date: form.sent_date,
          p_received_date: form.received_date || null,
        })
      }
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  const titles = {
    send: `Send ${sample.sample_no} to a process`,
    receive: `Receive ${sample.sample_no} back`,
    correct: `Correct a process entry of ${sample.sample_no}`,
  }
  const buttons = { send: 'Send', receive: 'Receive', correct: 'Save' }

  return (
    <Modal
      title={titles[mode]}
      onClose={onClose}
      dirty={dirty}
      width={520}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="entry-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : buttons[mode]}
          </button>
        </>
      )}
    >
      <form id="entry-form" className="form-grid" noValidate onSubmit={save}>
        {mode === 'receive' ? (
          <dl className="details form-wide">
            <Detail label="Piece">{PIECE_LABEL[entry.piece]}</Detail>
            <Detail label="Process">{names.process.get(entry.process_id)}</Detail>
            <Detail label="Vendor">{names.vendor.get(entry.vendor_id)}</Detail>
            <Detail label="Sent date">{formatDate(entry.sent_date)}</Detail>
          </dl>
        ) : (
          <>
            <Field label="Piece" htmlFor="entry-piece" required>
              <PickList id="entry-piece" clearable={false} options={pieces} value={form.piece} onChange={set('piece')} />
            </Field>
            <Field label="Sent date" htmlFor="entry-sent" required>
              <input
                id="entry-sent"
                className="input"
                type="date"
                max={today}
                value={form.sent_date}
                onChange={(event) => set('sent_date')(event.target.value)}
              />
            </Field>
            <Field label="Process" htmlFor="entry-process" required>
              <PickList
                id="entry-process"
                clearable={false}
                options={options(data.processes, entry?.process_id)}
                value={form.process_id}
                onChange={set('process_id')}
                placeholder={data.processes.some((item) => item.is_active) ? 'Select…' : 'No process in Masters yet'}
              />
            </Field>
            <Field label="Vendor" htmlFor="entry-vendor" required>
              <PickList
                id="entry-vendor"
                clearable={false}
                options={options(data.vendors, entry?.vendor_id)}
                value={form.vendor_id}
                onChange={set('vendor_id')}
                placeholder={data.vendors.some((item) => item.is_active) ? 'Select…' : 'No vendor in Masters yet'}
              />
            </Field>
          </>
        )}
        {mode !== 'send' && (
          <Field
            label="Received date"
            htmlFor="entry-received"
            required={mode === 'receive'}
            hint={mode === 'correct' ? 'Leave empty if it has not come back yet.' : null}
          >
            <input
              id="entry-received"
              className="input"
              type="date"
              min={form.sent_date}
              max={today}
              data-autofocus
              value={form.received_date}
              onChange={(event) => set('received_date')(event.target.value)}
            />
          </Field>
        )}
        {error && (
          <p className="alert alert--error form-wide" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

export function ApprovalDialog({ sample, stage, current, onClose, onSaved }) {
  const info = APPROVAL_STAGES[stage]
  const [decision, setDecision] = useState(current?.decision ?? null)
  const [remarks, setRemarks] = useState(current?.remarks ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = decision !== (current?.decision ?? null) || remarks !== (current?.remarks ?? '')

  const save = async (event) => {
    event.preventDefault()
    if (!decision) return setError(`Choose ${info.decisions.map((key) => DECISION_LABEL[key]).join(', ').replace(/, ([^,]*)$/, ' or $1')}.`)
    setBusy(true)
    setError('')
    try {
      await call('set_sample_approval', {
        p_sample_id: sample.id,
        p_stage: stage,
        p_decision: decision,
        p_remarks: remarks,
      })
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`${current ? 'Change the' : 'Give the'} ${info.label.toLowerCase()} for ${sample.sample_no}`}
      onClose={onClose}
      dirty={dirty}
      width={480}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="approval-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save approval'}
          </button>
        </>
      )}
    >
      <form id="approval-form" onSubmit={save}>
        <div className="field">
          <span className="field-label">
            Decision<span className="field-required"> *</span>
          </span>
          <div className="editor-compress" role="radiogroup" aria-label="Decision">
            {info.decisions.map((key) => (
              <label key={key} className={`editor-preset ${decision === key ? 'editor-preset--on' : ''}`}>
                <input type="radio" name="approval-decision" checked={decision === key} onChange={() => setDecision(key)} />
                <span>{DECISION_LABEL[key]}</span>
              </label>
            ))}
          </div>
        </div>
        <Field label="Remarks (optional)" htmlFor="approval-remarks">
          <textarea
            id="approval-remarks"
            className="input"
            rows={3}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </Field>
        {!current && (
          <p className="hint">Once saved, only a person with authority All can change this approval.</p>
        )}
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
