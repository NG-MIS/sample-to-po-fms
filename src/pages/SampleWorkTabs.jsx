import { useMemo } from 'react'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import Modal from '../components/Modal.jsx'
import { formatDate } from '../lib/format.js'
import {
  BUCKET,
  ACCESSORY_STATUS_BADGE,
  ACCESSORY_STATUS_LABEL,
  decisionLabel,
  FABRIC_STATUS_BADGE,
  FABRIC_STATUS_LABEL,
  PIECE_LABEL,
  PIECE_STATUS_LABEL,
  STAGES,
  daysOut,
  latestImage,
  pieceStatus,
  stageImagePath,
} from '../lib/sampleData.js'
import { StageImageButton } from './SampleDetail.jsx'

// The work tabs of the Samples screen. Each lists only what is waiting for
// that activity, and only items the signed-in person may act on.

// ---------- columns shared by the tabs ----------

function sampleColumns(lookups, onOpen, getSample) {
  return [
    {
      key: 'sample_no',
      header: 'SAMPLE NO',
      value: (row) => getSample(row).sample_no,
      render: (row) => (
        <button type="button" className="link link--strong" onClick={() => onOpen(getSample(row))}>
          {getSample(row).sample_no}
        </button>
      ),
    },
    {
      key: 'image',
      header: 'IMAGE',
      value: (row) => latestImage(getSample(row))?.label ?? '',
      render: (row) => {
        const sample = getSample(row)
        const image = latestImage(sample)
        return (
          <ClickableImage
            bucket={BUCKET}
            path={image?.path}
            alt={`${sample.sample_no} ${image?.label.toLowerCase() ?? ''} image`}
            size={44}
          />
        )
      },
    },
  ]
}

const contextColumns = (lookups, getSample) => [
  { key: 'designer', header: 'DESIGNER', value: (row) => lookups.person.get(getSample(row).designer_id) ?? '' },
  {
    key: 'product_type',
    header: 'PRODUCT TYPE',
    value: (row) => lookups.productType.get(getSample(row).product_type_id) ?? '',
  },
  { key: 'collection', header: 'COLLECTION', value: (row) => lookups.collection.get(getSample(row).collection_id) ?? '' },
]

const describeEntry = (entry, lookups) =>
  `${PIECE_LABEL[entry.piece]}: ${lookups.process.get(entry.process_id) ?? ''} @ ${lookups.vendor.get(entry.vendor_id) ?? ''}`

// The status of the 1st and of the 2nd piece, one column each.
const pieceColumns = () =>
  [1, 2].map((piece) => ({
    key: `piece_${piece}`,
    header: piece === 1 ? '1ST PIECE' : '2ND PIECE',
    value: (row) => PIECE_STATUS_LABEL[row.statuses[piece]],
    render: (row) => (
      <span className={`badge badge--${row.statuses[piece]}`}>{PIECE_STATUS_LABEL[row.statuses[piece]]}</span>
    ),
  }))

// ---------- Process tab: send and receive ----------

export function ProcessTab({ rows, lookups, loading, onOpen, onSend, onReceive }) {
  const columns = useMemo(
    () => [
      ...sampleColumns(lookups, onOpen, (row) => row.sample),
      ...pieceColumns(),
      {
        key: 'out_at',
        header: 'OUT AT',
        value: (row) => row.open.map((entry) => describeEntry(entry, lookups)),
        render: (row) =>
          row.open.length > 0 && (
            <ul className="out-list">
              {row.open.map((entry) => (
                <li key={entry.id}>
                  {describeEntry(entry, lookups)}, since {formatDate(entry.sent_date)}
                </li>
              ))}
            </ul>
          ),
      },
      {
        key: 'days',
        header: 'DAYS OUT',
        value: (row) => (row.open.length ? Math.max(...row.open.map(daysOut)) : ''),
      },
      ...contextColumns(lookups, (row) => row.sample),
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <span className="row-actions">
            {row.sendPieces.length > 0 && (
              <button type="button" className="btn btn--small" onClick={() => onSend(row)}>
                Send
              </button>
            )}
            {row.open.length > 0 && (
              <button type="button" className="btn btn--small btn--primary" onClick={() => onReceive(row)}>
                Receive
              </button>
            )}
          </span>
        ),
      },
    ],
    [lookups, onOpen, onSend, onReceive],
  )

  return (
    <>
      <p className="tab-note">
        One row per sample that still has a piece which is not completed. Send a piece to a process, and receive it
        here when it comes back. A closed sample is listed only while a piece is still at a vendor, to be received.
      </p>
      <DataTable
        tableId="samples-process-by-sample"
        title="Samples in process"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="No sample is waiting to be sent or received."
        searchPlaceholder="Search samples…"
      />
    </>
  )
}

// Shown when more than one process is out for a sample: pick which one came back.
export function ReceiveChooser({ row, lookups, onPick, onClose }) {
  return (
    <Modal
      title={`${row.sample.sample_no}: which one came back?`}
      onClose={onClose}
      width={560}
      footer={() => (
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      )}
    >
      <ul className="remarks-list">
        {row.open.map((entry) => (
          <li key={entry.id} className="remark-row">
            <span className="remark-text">
              {describeEntry(entry, lookups)}, sent {formatDate(entry.sent_date)}
            </span>
            <button type="button" className="btn btn--small btn--primary" onClick={() => onPick(entry)}>
              Receive
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

// ---------- Mark completed tab ----------

export function CompleteTab({ rows, lookups, loading, onOpen, onComplete }) {
  const columns = useMemo(
    () => [
      ...sampleColumns(lookups, onOpen, (row) => row.sample),
      ...pieceColumns(),
      { key: 'process_count', header: 'PROCESSES DONE', value: (row) => row.processCount },
      {
        key: 'last_received',
        header: 'LAST RECD DATE',
        value: (row) => formatDate(row.lastReceived),
        sortValue: (row) => row.lastReceived,
      },
      ...contextColumns(lookups, (row) => row.sample),
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <span className="row-actions">
            {row.pending.map((piece) => (
              <button
                key={piece}
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => onComplete({ sample: row.sample, piece })}
              >
                Complete {piece === 1 ? '1st' : '2nd'}
              </button>
            ))}
          </span>
        ),
      },
    ],
    [lookups, onOpen, onComplete],
  )

  return (
    <>
      <p className="tab-note">
        One row per sample with a piece that is in-house and not yet completed. A piece that is at a vendor can be
        completed once it is received.
      </p>
      <DataTable
        tableId="samples-complete-by-sample"
        title="Samples to mark completed"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="No sample is waiting to be marked completed."
        searchPlaceholder="Search samples…"
      />
    </>
  )
}

// ---------- Images tab ----------

export function ImagesTab({ rows, lookups, loading, onOpen, onSaved, onError }) {
  const columns = useMemo(
    () => [
      {
        key: 'sample_no',
        header: 'SAMPLE NO',
        value: (row) => row.sample_no,
        render: (row) => (
          <button type="button" className="link link--strong" onClick={() => onOpen(row)}>
            {row.sample_no}
          </button>
        ),
      },
      ...STAGES.map((stage) => ({
        key: `stage_${stage.key}`,
        header: `${stage.label.toUpperCase()} IMAGE`,
        value: (row) => (stageImagePath(row, stage.key) ? 'Added' : 'Missing'),
        render: (row) =>
          stageImagePath(row, stage.key) ? (
            <ClickableImage
              bucket={BUCKET}
              path={stageImagePath(row, stage.key)}
              alt={`${row.sample_no} ${stage.label.toLowerCase()} image`}
              size={44}
            />
          ) : (
            <StageImageButton sample={row} stage={stage} label="Add" onSaved={onSaved} onError={onError} />
          ),
      })),
      ...contextColumns(lookups, (row) => row),
    ],
    [lookups, onOpen, onSaved, onError],
  )

  return (
    <>
      <p className="tab-note">
        Samples still missing a 1st sample, 2nd sample or photoshoot image. A sample leaves this list once all three
        are added.
      </p>
      <DataTable
        tableId="samples-images"
        title="Samples missing images"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="No sample is missing an image."
        searchPlaceholder="Search samples…"
      />
    </>
  )
}

// ---------- Approval tab: 1st and final together ----------

const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort()

export function FabricTab({ rows, lookups, loading, onOpen, onEdit }) {
  const columns = useMemo(
    () => [
      ...sampleColumns(lookups, onOpen, (row) => row.sample),
      {
        key: 'fabric_status',
        header: 'FABRIC STATUS',
        value: (row) => FABRIC_STATUS_LABEL[row.status],
        render: (row) => (
          <span className={`badge badge--${FABRIC_STATUS_BADGE[row.status]}`}>{FABRIC_STATUS_LABEL[row.status]}</span>
        ),
      },
      {
        key: 'fabrics',
        header: 'FABRICS',
        value: (row) => uniqueSorted(row.sample.fabrics.map((line) => lookups.fabric.get(line.fabric_id))),
      },
      {
        key: 'without_fabric',
        header: 'COMPONENTS WITHOUT FABRIC',
        value: (row) => uniqueSorted(row.missing.map((id) => lookups.component.get(id))),
      },
      {
        key: 'vendor_codes',
        header: 'VENDOR CODES',
        value: (row) => uniqueSorted(row.sample.fabrics.map((line) => lookups.fabricVendor.get(line.vendor_id))),
      },
      ...contextColumns(lookups, (row) => row.sample),
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <button
            type="button"
            className={`btn btn--small ${row.status === 'completed' ? '' : 'btn--primary'}`}
            onClick={() => onEdit(row.sample)}
          >
            {row.status === 'pending' ? 'Add fabrics' : 'Change fabrics'}
          </button>
        ),
      },
    ],
    [lookups, onOpen, onEdit],
  )

  return (
    <>
      <p className="tab-note">
        One row per open sample you look after. Pending: no fabric yet. Incomplete: some components have no fabric.
        Completed: every component has a fabric. The number on the tab counts the samples that are not completed.
      </p>
      <DataTable
        tableId="samples-fabric-status"
        title="Sample fabrics"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="There is no open sample to add fabrics to."
        searchPlaceholder="Search samples…"
      />
    </>
  )
}

export function AccessoryTab({ rows, lookups, loading, onOpen, onEdit }) {
  const columns = useMemo(
    () => [
      ...sampleColumns(lookups, onOpen, (row) => row.sample),
      {
        key: 'accessory_status',
        header: 'ACCESSORY STATUS',
        value: (row) => ACCESSORY_STATUS_LABEL[row.status],
        render: (row) => (
          <span className={`badge badge--${ACCESSORY_STATUS_BADGE[row.status]}`}>
            {ACCESSORY_STATUS_LABEL[row.status]}
          </span>
        ),
      },
      {
        key: 'accessories',
        header: 'ACCESSORIES',
        value: (row) => uniqueSorted(row.sample.accessories.map((line) => lookups.accessory.get(line.accessory_id))),
      },
      {
        key: 'vendor_codes',
        header: 'VENDOR CODES',
        value: (row) => uniqueSorted(row.sample.accessories.map((line) => lookups.accessoryVendor.get(line.vendor_id))),
      },
      ...contextColumns(lookups, (row) => row.sample),
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <button
            type="button"
            className={`btn btn--small ${row.status === 'pending' ? 'btn--primary' : ''}`}
            onClick={() => onEdit(row.sample)}
          >
            {row.status === 'pending' ? 'Add accessories' : 'Change accessories'}
          </button>
        ),
      },
    ],
    [lookups, onOpen, onEdit],
  )

  return (
    <>
      <p className="tab-note">
        One row per open sample you look after. Pending: no accessory yet. Added: it has an accessory list. The number
        on the tab counts the samples that are Pending.
      </p>
      <DataTable
        tableId="samples-accessory-status"
        title="Sample accessories"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="There is no open sample to add accessories to."
        searchPlaceholder="Search samples…"
      />
    </>
  )
}

// ---------- Design number tab ----------

export function DesignTab({ rows, lookups, loading, nextNumber, onOpen, onAssign }) {
  const columns = useMemo(
    () => [
      ...sampleColumns(lookups, onOpen, (row) => row),
      {
        key: 'approved_on',
        header: 'FINAL APPROVAL ON',
        value: (row) => formatDate(row.approvals.final?.decided_at?.slice(0, 10)),
        sortValue: (row) => row.approvals.final?.decided_at ?? '',
      },
      {
        key: 'approved_by',
        header: 'APPROVED BY',
        value: (row) => lookups.person.get(row.approvals.final?.decided_by) ?? '',
      },
      ...contextColumns(lookups, (row) => row),
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <button type="button" className="btn btn--small btn--primary" onClick={() => onAssign(row)}>
            Assign design number
          </button>
        ),
      },
    ],
    [lookups, onOpen, onAssign],
  )

  return (
    <>
      <p className="tab-note">
        Samples with final approval Yes that have no design number yet.{' '}
        {nextNumber
          ? `The next design number is ${nextNumber}.`
          : 'The starting design number has not been set yet: a person with authority All sets it in Masters, under Numbering.'}
      </p>
      <DataTable
        tableId="samples-design-number"
        title="Samples waiting for a design number"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="No sample is waiting for a design number."
        searchPlaceholder="Search samples…"
      />
    </>
  )
}

export function ApprovalTab({ rows, lookups, loading, onOpen, onApprove, onSendToCad }) {
  const columns = useMemo(
    () => [
      ...sampleColumns(lookups, onOpen, (row) => row),
      ...contextColumns(lookups, (row) => row),
      ...[1, 2].map((piece) => ({
        key: `piece_${piece}`,
        header: piece === 1 ? '1ST PIECE' : '2ND PIECE',
        value: (row) => PIECE_STATUS_LABEL[pieceStatus(row, piece)],
        render: (row) => {
          const status = pieceStatus(row, piece)
          return <span className={`badge badge--${status}`}>{PIECE_STATUS_LABEL[status]}</span>
        },
      })),
      {
        key: 'first_approval',
        header: 'INITIAL APPROVAL',
        value: (row) => (row.approvals.initial ? decisionLabel(row.approvals.initial) : 'Not given'),
        render: (row) =>
          row.approvals.initial ? (
            <span className={`badge badge--${row.approvals.initial.decision}`}>
              {decisionLabel(row.approvals.initial)}
            </span>
          ) : (
            <span className="badge badge--pending">Not given</span>
          ),
      },
      {
        key: 'sent_to_cad',
        header: 'SENT TO CAD',
        value: (row) => (row.sent_to_cad_at ? 'Sent' : 'Not sent'),
        render: (row) => <span className={`badge badge--${row.sent_to_cad_at ? 'completed' : 'pending'}`}>{row.sent_to_cad_at ? 'Sent' : 'Not sent'}</span>,
      },
      { key: 'changes_requested', header: 'CHANGES REQUESTED', value: (row) => row.approvals.changesRequested },
      { key: 'first_remarks', header: 'LATEST REMARKS', value: (row) => row.approvals.initial?.remarks ?? '' },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <span className="row-actions">
            {row.approvals.initial?.decision !== 'yes' && (
              <button type="button" className="btn btn--small" onClick={() => onApprove(row, 'initial')}>
                Initial approval
              </button>
            )}
            <button type="button" className="btn btn--small btn--primary" onClick={() => onApprove(row, 'final')}>
              Final approval
            </button>
            {!row.sent_to_cad_at && (
              <button type="button" className="btn btn--small" onClick={() => onSendToCad(row)}>
                Send to CAD
              </button>
            )}
          </span>
        ),
      },
    ],
    [lookups, onOpen, onApprove, onSendToCad],
  )

  return (
    <>
      <p className="tab-note">
        Samples with no final approval yet. Give the initial approval (again, if changes were requested), or go
        straight to the final approval. Send to CAD is for a sample that needs its CAD drawing before the final
        approval. A sample whose initial approval is No is closed and leaves this list.
      </p>
      <DataTable
        tableId="samples-approval"
        title="Samples awaiting approval"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="No sample is waiting for approval."
        searchPlaceholder="Search samples…"
      />
    </>
  )
}
