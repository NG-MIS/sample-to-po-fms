import { useMemo, useRef, useState } from 'react'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import Fold from '../components/Fold.jsx'
import { ProcessRemarkCard, ProcessRemarkDialog } from './ProcessRemarkParts.jsx'
import ImageEditor from '../components/ImageEditor.jsx'
import Modal, { ConfirmDialog } from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { RemarksView } from '../components/Remarks.jsx'
import { checkWishlistLines, wishlistPayload } from '../lib/wishlist.js'
import { AccessoryDialog, AccessoryTable } from './SampleAccessories.jsx'
import { WishlistLinesEditor } from './WishlistParts.jsx'
import { FabricDialog, FabricTable } from './SampleFabrics.jsx'
import { Field } from '../components/Field.jsx'
import { useAuth } from '../lib/auth.jsx'
import { nameMap } from '../lib/data.js'
import { formatDate, formatDateTime, friendlyError, todayLocal } from '../lib/format.js'
import { checkImageFile, uploadFile } from '../lib/images.js'
import {
  APPROVAL_STAGES,
  BUCKET,
  DECISION_LABEL,
  decisionLabel,
  isApproved,
  PIECES,
  PIECE_LABEL,
  PIECE_STATUS_LABEL,
  STAGES,
  callSampleAction as call,
  canWorkOn,
  daysOut,
  isClosed,
  latestImage,
  ACCESSORY_STATUS_BADGE,
  ACCESSORY_STATUS_LABEL,
  FABRIC_STATUS_BADGE,
  FABRIC_STATUS_LABEL,
  accessoryStatus,
  fabricStatus,
  pieceStatus,
  sampleReferences,
  sampleTags,
  stageImagePath,
} from '../lib/sampleData.js'

const DENIM_LABEL = { denim: 'Denim', non_denim: 'Non denim' }

// One sample in a popup. Used by the screens that are not the sample list.
//   onChanged - reloads the data after something was saved
//   onEdit    - optional; opens the edit form (authority All)
export default function SampleDetail({ sample, data, onChanged, onEdit, onClose }) {
  const { isAdmin } = useAuth()
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
      <SampleBody sample={sample} data={data} onChanged={onChanged} />
    </Modal>
  )
}

const REMARK_WORDS = { text: ['text', 'text'], voice: ['voice note', 'voice notes'], image: ['picture', 'pictures'] }

// Everything about one sample after it is created, as sections that open and
// close: details, stage images, fabrics, accessories, the two pieces and their
// process log, approval and remarks. Every section starts closed; its bar
// shows the important things. Shown in the popup and inside the sample list.
export function SampleBody({ sample, data, onChanged }) {
  const { profile, isAdmin } = useAuth()
  const [dialog, setDialog] = useState(null)
  const [error, setError] = useState('')
  const [openFolds, setOpenFolds] = useState(() => new Set())
  const fold = (id) => ({
    id,
    open: openFolds.has(id),
    onToggle: () =>
      setOpenFolds((previous) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
  })

  const closed = isClosed(sample)
  const mayWork = canWorkOn(sample, data, profile)
  // On a closed sample everything stops; a piece already at a vendor can still be received back.
  const canWork = mayWork && !closed
  const canReceive = mayWork
  const canComplete = data.access.manages && !closed
  const canApprove = data.access.management && !closed

  const names = useMemo(
    () => ({
      person: nameMap(data.people),
      process: nameMap(data.processes),
      vendor: nameMap(data.vendors),
      component: nameMap(data.components),
      productType: nameMap(data.productTypes),
      collection: nameMap(data.collections),
      fabric: nameMap(data.fabrics),
      fabricVendor: new Map(data.fabricVendors.map((vendor) => [vendor.id, vendor.code])),
      accessory: nameMap(data.accessories),
      accessoryVendor: new Map(data.accessoryVendors.map((vendor) => [vendor.id, vendor.code])),
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
            {canReceive && !entry.received_date && (
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
    [names, canReceive, isAdmin],
  )

  const componentNames = sample.component_ids
    .map((id) => names.component.get(id))
    .filter(Boolean)
    .sort()
  const references = sampleReferences(sample, data)
  const tags = sampleTags(sample, data)
  const openPieces = PIECES.filter((piece) => pieceStatus(sample, piece.value) !== 'completed')

  const atVendor = sample.entries.filter((entry) => !entry.received_date).length
  const remarkCounts = ['text', 'voice', 'image']
    .map((kind) => [kind, sample.remarks.filter((remark) => remark.kind === kind).length])
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${REMARK_WORDS[kind][count === 1 ? 0 : 1]}`)
  const count = (number, one, many) => `${number} ${number === 1 ? one : many}`

  return (
    <div className="sample-body" data-sample-body={sample.sample_no}>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      {closed && (
        <p className="alert alert--closed" role="status">
          <strong>This sample is closed.</strong> Its initial approval is No, so nothing more can be done on it.
          {sample.entries.some((entry) => !entry.received_date) && ' A piece that is still at a vendor can be received back.'}
        </p>
      )}

      <Fold
        {...fold('details')}
        title="Details"
        summary={[names.person.get(sample.designer_id), names.productType.get(sample.product_type_id), names.collection.get(sample.collection_id), componentNames.join(', ')]
          .filter(Boolean)
          .join(' · ')}
      >
      <dl className="details details--three">
        <Detail label="Sample no">{sample.sample_no}</Detail>
        <Detail label="Design no">{sample.design_no}</Detail>
        <Detail label="Wishlist">
          {sample.wishlist.length > 0 && (
            <span className="tag-list">
              {sample.wishlist.map((entry) => (
                <span key={entry.id} className="tag-chip">
                  {entry.wishlist_no}
                </span>
              ))}
            </span>
          )}
        </Detail>
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
        <Detail label="Tags">
          {tags.length > 0 && (
            <span className="tag-list">
              {tags.map((tag) => (
                <span key={tag} className="tag-chip">
                  {tag}
                </span>
              ))}
            </span>
          )}
        </Detail>
        <Detail label="References">
          {references.length > 0 && (
            <span className="reference-list">
              {references.map((reference) => (
                <span key={reference.id} className="reference-item">
                  {reference.image_path && (
                    <ClickableImage
                      bucket={BUCKET}
                      path={reference.image_path}
                      alt={`Reference ${reference.name}`}
                      size={56}
                    />
                  )}
                  <span className="reference-name">{reference.name}</span>
                </span>
              ))}
            </span>
          )}
        </Detail>
      </dl>
      </Fold>

      <Fold
        {...fold('images')}
        title="Stage images"
        summary={STAGES.map((stage) => (
          <span key={stage.key} className={`badge badge--${stageImagePath(sample, stage.key) ? 'completed' : 'pending'}`}>
            {stage.label}
            {stageImagePath(sample, stage.key) ? '' : ': none'}
          </span>
        ))}
      >
      <p className="hint">The highest one available is shown as the sample&rsquo;s picture.</p>
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
      </Fold>

      <Fold
        {...fold('fabrics')}
        title="Fabrics"
        summary={
          <>
            <span className={`badge badge--${FABRIC_STATUS_BADGE[fabricStatus(sample)]}`}>
              {FABRIC_STATUS_LABEL[fabricStatus(sample)]}
            </span>
            {sample.fabrics.length > 0 && count(sample.fabrics.length, 'fabric', 'fabrics')}
          </>
        }
        action={
          canWork && (
            <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'fabrics' })}>
              {sample.fabrics.length ? 'Change fabrics' : 'Add fabrics'}
            </button>
          )
        }
      >
      <FabricTable sample={sample} lookups={names} />
      </Fold>

      <Fold
        {...fold('accessories')}
        title="Accessories"
        summary={
          <>
            <span className={`badge badge--${ACCESSORY_STATUS_BADGE[accessoryStatus(sample)]}`}>
              {ACCESSORY_STATUS_LABEL[accessoryStatus(sample)]}
            </span>
            {sample.accessories.length > 0 && count(sample.accessories.length, 'accessory', 'accessories')}
          </>
        }
        action={
          canWork && (
            <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'accessories' })}>
              {sample.accessories.length ? 'Change accessories' : 'Add accessories'}
            </button>
          )
        }
      >
      <AccessoryTable sample={sample} lookups={names} />
      </Fold>

      <Fold
        {...fold('pieces')}
        title="Pieces and process log"
        summary={
          <>
            {PIECES.map((piece) => (
              <span key={piece.value} className={`badge badge--${pieceStatus(sample, piece.value)}`}>
                {piece.label}: {PIECE_STATUS_LABEL[pieceStatus(sample, piece.value)]}
              </span>
            ))}
            {sample.entries.length > 0 && count(sample.entries.length, 'process', 'processes')}
            {atVendor > 0 && `, ${atVendor} at vendor`}
          </>
        }
      >
      <div className="piece-grid">
        {PIECES.map((piece) => {
          const status = pieceStatus(sample, piece.value)
          const completion = sample.completions[piece.value]
          // The pieces are completed in order: the 2nd only after the 1st, and reopened the other way round.
          const firstNotDone = piece.value === 2 && status !== 'completed' && !sample.completions[1]
          const secondDone = piece.value === 1 && Boolean(sample.completions[2])
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
                    disabled={status === 'at_vendor' || firstNotDone}
                    title={status === 'at_vendor' ? 'Receive it back from the vendor first' : firstNotDone ? 'Complete the 1st sample first' : undefined}
                    onClick={() => setDialog({ type: 'complete', piece: piece.value })}
                  >
                    Mark completed
                  </button>
                )}
                {isAdmin && status === 'completed' && (
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={secondDone}
                    title={secondDone ? 'Reopen the 2nd sample first' : undefined}
                    onClick={() => setDialog({ type: 'reopen', piece: piece.value })}
                  >
                    Reopen
                  </button>
                )}
              </div>
              {canComplete && status === 'at_vendor' && (
                <p className="hint">It cannot be marked completed while it is at a vendor.</p>
              )}
              {canComplete && status !== 'at_vendor' && firstNotDone && (
                <p className="hint" data-first-needed>
                  The 2nd sample can be marked completed only after the 1st sample is completed.
                </p>
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
      </Fold>

      <Fold
        {...fold('approval')}
        title="Approval"
        summary={
          <>
            {Object.entries(APPROVAL_STAGES).map(([stage, info]) => {
              const approval = sample.approvals[stage]
              return (
                <span key={stage} className={`badge badge--${approval ? approval.decision : 'pending'}`}>
                  {info.label.replace(' approval', '')}: {approval ? decisionLabel(approval) : 'Not given'}
                </span>
              )
            })}
            {sample.sent_to_cad_at && !isApproved(sample) && <span className="badge badge--completed">Sent to CAD</span>}
            {sample.approvals.changesRequested > 0 && `Changes requested: ${sample.approvals.changesRequested}`}
          </>
        }
      >
      <div className="piece-grid">
        {Object.entries(APPROVAL_STAGES).map(([stage, info]) => {
          const approval = sample.approvals[stage]
          const rounds = stage === 'initial' ? sample.approvals.rounds : []
          const hasFinal = Boolean(sample.approvals.final)
          const blockedByFinal = stage === 'initial' && hasFinal
          // Initial approval can be given again while the latest one is Maybe.
          const canGive =
            canApprove && !hasFinal && (stage === 'final' ? true : !approval || approval.decision === 'maybe')
          return (
            <div key={stage} className="piece-card" data-approval={stage}>
              <div className="piece-head">
                <strong>{info.label}</strong>
                {approval ? (
                  <span className={`badge badge--${approval.decision}`}>{decisionLabel(approval)}</span>
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
              {stage === 'initial' && rounds.length > 0 && (
                <p className="approval-count">
                  Changes requested: <strong>{sample.approvals.changesRequested}</strong>
                  {' · '}
                  {rounds.length} {rounds.length === 1 ? 'round' : 'rounds'}
                </p>
              )}
              {rounds.length > 1 && (
                <ol className="approval-rounds">
                  {rounds.map((round) => (
                    <li key={round.id}>
                      <span className={`badge badge--${round.decision}`}>{decisionLabel(round)}</span>
                      <span className="approval-round-text">
                        {round.remarks && <span className="approval-remarks">{round.remarks}</span>}
                        <span className="hint">
                          {names.person.get(round.decided_by)}, {formatDateTime(round.decided_at)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {!approval && blockedByFinal && (
                <p className="hint">The final approval was given directly, so no initial approval is needed.</p>
              )}
              {stage === 'final' && !approval && closed && (
                <p className="hint">Not needed: the sample was closed at the initial approval.</p>
              )}
              <div className="piece-actions">
                {canGive && (
                  <button type="button" className="btn btn--small btn--primary" onClick={() => setDialog({ type: 'approval', stage })}>
                    Give {info.label.toLowerCase()}
                    {approval ? ' again' : ''}
                  </button>
                )}
                {approval && isAdmin && (
                  <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'approval', stage, correct: true })}>
                    Change
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {/* Send to CAD: its own step, for a sample that needs its drawing before the final approval. */}
        <div className="piece-card" data-approval="cad">
          <div className="piece-head">
            <strong>Send to CAD</strong>
            {isApproved(sample) ? (
              <span className="badge badge--completed">With CAD</span>
            ) : sample.sent_to_cad_at ? (
              <span className="badge badge--completed">Sent to CAD</span>
            ) : (
              <span className="badge badge--pending">Not sent</span>
            )}
          </div>
          {isApproved(sample) ? (
            <p className="hint">The final approval is Yes, so the sample is with CAD already.</p>
          ) : sample.sent_to_cad_at ? (
            <p className="hint">
              By {names.person.get(sample.sent_to_cad_by)}, {formatDateTime(sample.sent_to_cad_at)}. CAD can make the drawing before the final approval.
            </p>
          ) : (
            <p className="hint">For a sample that is not final approved yet but needs its CAD drawing. It then shows in Pending drawing.</p>
          )}
          <div className="piece-actions">
            {!closed && !isApproved(sample) && !sample.sent_to_cad_at && (canApprove || isAdmin) && (
              <button type="button" className="btn btn--small btn--primary" onClick={() => setDialog({ type: 'to-cad' })}>
                Send to CAD
              </button>
            )}
            {!isApproved(sample) && sample.sent_to_cad_at && isAdmin && (
              <button type="button" className="btn btn--small" onClick={() => setDialog({ type: 'from-cad' })}>
                Take back
              </button>
            )}
          </div>
        </div>
      </div>
      </Fold>

      <Fold {...fold('remarks')} title="Remarks" summary={remarkCounts.length ? remarkCounts.join(', ') : 'None'}>
      <RemarksView bucket={BUCKET} remarks={sample.remarks} people={names.person} />
      </Fold>

      <Fold
        {...fold('process-remarks')}
        title="Process remarks"
        summary={sample.processRemarks.length ? `${sample.processRemarks.length} for production` : 'None'}
        action={
          mayWork && (
            <button type="button" className="btn btn--small btn--primary" onClick={() => setDialog({ type: 'process-remark' })}>
              Add process remark
            </button>
          )
        }
      >
        {sample.processRemarks.length === 0 && <p className="hint">No process remark. These tell production what to follow, by department and process.</p>}
        {sample.processRemarks.map((remark) => (
          <ProcessRemarkCard
            key={remark.id}
            remark={remark}
            data={data}
            canEdit={mayWork}
            onEdit={(item) => setDialog({ type: 'process-remark', remark: item })}
            onDelete={(item) => setDialog({ type: 'process-remark-delete', remark: item })}
          />
        ))}
      </Fold>

      {dialog?.type === 'send' && (
        <EntryDialog mode="send" sample={sample} data={data} piece={dialog.piece} pieces={openPieces} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'receive' && (
        <EntryDialog mode="receive" sample={sample} data={data} entry={dialog.entry} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'correct' && (
        <EntryDialog mode="correct" sample={sample} data={data} entry={dialog.entry} pieces={PIECES} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'accessories' && (
        <AccessoryDialog sample={sample} data={data} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'fabrics' && (
        <FabricDialog sample={sample} data={data} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'approval' && (
        <ApprovalDialog sample={sample} stage={dialog.stage} correct={Boolean(dialog.correct)} sizeRatios={data.sizeRatios} onClose={() => setDialog(null)} onSaved={saved} />
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
      {dialog?.type === 'process-remark' && (
        <ProcessRemarkDialog remark={dialog.remark ?? null} sample={sample} data={data} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.type === 'process-remark-delete' && (
        <ConfirmDialog
          title={`Delete this process remark of ${sample.sample_no}?`}
          message="Its notes, voice notes and pictures are removed. This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onCancel={() => setDialog(null)}
          onConfirm={() => runConfirmed('delete_process_remark', { p_id: dialog.remark.id })}
        />
      )}
      {dialog?.type === 'to-cad' && (
        <ConfirmDialog
          title={`Send ${sample.sample_no} to CAD?`}
          message="The CAD team can then make its drawing and primary accessory list, before the final approval."
          confirmLabel="Send to CAD"
          cancelLabel="Cancel"
          onCancel={() => setDialog(null)}
          onConfirm={() => runConfirmed('send_sample_to_cad', { p_sample_id: sample.id, p_undo: false })}
        />
      )}
      {dialog?.type === 'from-cad' && (
        <ConfirmDialog
          title={`Take ${sample.sample_no} back from CAD?`}
          message="It leaves Pending drawing until it is sent again or gets its final approval."
          confirmLabel="Take back"
          cancelLabel="Cancel"
          onCancel={() => setDialog(null)}
          onConfirm={() => runConfirmed('send_sample_to_cad', { p_sample_id: sample.id, p_undo: true })}
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
    </div>
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

// Give an approval, or (correct = true, authority All) change the latest one.
// sizeRatios: the Sizes and ratios master. When given, a final approval of Yes
// can add the sample to the wishlist in the same step.
export function ApprovalDialog({ sample, stage, correct = false, sizeRatios, onClose, onSaved }) {
  const info = APPROVAL_STAGES[stage]
  const latest = sample.approvals[stage]
  const current = correct ? latest : null
  const [decision, setDecision] = useState(current?.decision ?? null)
  const [remarks, setRemarks] = useState(current?.remarks ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wishLines, setWishLines] = useState([])
  const offersWishlist = Boolean(sizeRatios) && !correct && stage === 'final' && decision === 'yes'
  const dirty =
    decision !== (current?.decision ?? null) || remarks !== (current?.remarks ?? '') || wishLines.length > 0

  const save = async (event) => {
    event.preventDefault()
    if (!decision) return setError(`Choose ${info.decisions.map((key) => DECISION_LABEL[key]).join(', ').replace(/, ([^,]*)$/, ' or $1')}.`)
    const wishProblem = offersWishlist ? checkWishlistLines(wishLines) : ''
    if (wishProblem) return setError(wishProblem)
    const wishEntries = offersWishlist ? wishlistPayload(wishLines) : []
    setBusy(true)
    setError('')
    try {
      if (wishEntries.length > 0) {
        await call('approve_final_with_wishlist', {
          p_sample_id: sample.id,
          p_remarks: remarks,
          p_entries: wishEntries,
        })
      } else {
        await call('set_sample_approval', {
          p_sample_id: sample.id,
          p_stage: stage,
          p_decision: decision,
          p_remarks: remarks,
          p_correct: correct,
        })
      }
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`${correct ? 'Change the' : 'Give the'} ${info.label.toLowerCase()} for ${sample.sample_no}`}
      onClose={onClose}
      dirty={dirty}
      width={offersWishlist ? 760 : 480}
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
        {!correct && stage === 'initial' && (
          <p className="hint">
            {latest ? `Changes were requested ${sample.approvals.changesRequested} ${sample.approvals.changesRequested === 1 ? 'time' : 'times'} so far. ` : ''}
            Maybe asks for changes and lets you approve again later. No closes the sample: everything on it stops.
          </p>
        )}
        {!correct && stage === 'final' && (
          <p className="hint">Once saved, only a person with authority All can change the final approval.</p>
        )}
        {offersWishlist && (
          <div className="approval-wishlist">
            <h3 className="section-title section-title--next">
              Add to wishlist now <span className="hint">optional</span>
            </h3>
            <p className="hint fabric-intro">
              Add the size, ratio and quantity to produce. Without it, the sample waits under Wishlist, Newly approved.
            </p>
            <WishlistLinesEditor
              lines={wishLines}
              onChange={setWishLines}
              sizeRatios={sizeRatios}
              sample={sample}
              idPrefix="approval-wish"
            />
          </div>
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
