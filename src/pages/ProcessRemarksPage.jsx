import { useMemo, useState } from 'react'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import { ConfirmDialog } from '../components/Modal.jsx'
import { VoiceNote } from '../components/Remarks.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { nameMap, useLoad } from '../lib/data.js'
import { formatDateTime, friendlyError } from '../lib/format.js'
import { BUCKET, callSampleAction, canWorkOn, latestImage, loadSampleData } from '../lib/sampleData.js'
import { remarkTags } from '../lib/remarks.js'
import { ProcessRemarkDialog } from './ProcessRemarkParts.jsx'
import SampleDetail from './SampleDetail.jsx'

// Process remarks of every sample the person can see, in one list: what production must
// follow, tagged to departments and processes. Filter the DEPARTMENTS or PROCESSES column
// to pull out everything for one of them.
export default function ProcessRemarksPage() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [viewingId, setViewingId] = useState(null)
  const [form, setForm] = useState(null) // null, {} for a new remark, or { remark, sample }
  const [deleting, setDeleting] = useState(null)
  const [notice, setNotice] = useState('')
  const [problem, setProblem] = useState('')

  const rows = useMemo(
    () => (data?.samples ?? []).flatMap((sample) => sample.processRemarks.map((remark) => ({ ...remark, sample, tags: remarkTags(remark, data) }))),
    [data],
  )
  const writable = useMemo(() => (data?.samples ?? []).filter((sample) => canWorkOn(sample, data, profile)), [data, profile])
  const viewing = data?.samples.find((sample) => sample.id === viewingId)

  const columns = useMemo(() => {
    const person = nameMap(data?.people)
    const texts = (row) => row.items.filter((item) => item.kind === 'text').map((item) => item.body)
    const voices = (row) => row.items.filter((item) => item.kind === 'voice')
    const pictures = (row) => row.items.filter((item) => item.kind === 'image')
    return [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no, width: 80 },
      {
        key: 'sample_no',
        header: 'SAMPLE NO',
        value: (row) => row.sample.sample_no,
        render: (row) => (
          <button type="button" className="link link--strong" onClick={() => setViewingId(row.sample.id)}>
            {row.sample.sample_no}
          </button>
        ),
      },
      { key: 'design_no', header: 'DESIGN NO', value: (row) => row.sample.design_no ?? '' },
      {
        key: 'image',
        header: 'IMAGE',
        value: (row) => latestImage(row.sample)?.label ?? '',
        render: (row) => {
          const image = latestImage(row.sample)
          return image && <ClickableImage bucket={BUCKET} path={image.path} alt={`${row.sample.sample_no} image`} size={44} />
        },
      },
      { key: 'departments', header: 'DEPARTMENTS', value: (row) => row.tags.departments },
      { key: 'processes', header: 'PROCESSES', value: (row) => row.tags.processes },
      { key: 'remark', header: 'REMARK', value: (row) => texts(row).join(' | '), render: (row) => texts(row).map((body, index) => <p key={index} className="process-remark-text">{body}</p>) },
      {
        key: 'voice',
        header: 'VOICE',
        value: (row) => (voices(row).length ? `${voices(row).length} voice` : ''),
        render: (row) => voices(row).map((item) => <VoiceNote key={item.id} bucket={BUCKET} path={item.file_path} />),
      },
      {
        key: 'pictures',
        header: 'PICTURES',
        value: (row) => (pictures(row).length ? `${pictures(row).length} ${pictures(row).length === 1 ? 'picture' : 'pictures'}` : ''),
        render: (row) => (
          <span className="tag-list">
            {pictures(row).map((item) => (
              <ClickableImage key={item.id} bucket={BUCKET} path={item.file_path} alt="Process remark picture" size={44} />
            ))}
          </span>
        ),
      },
      { key: 'entered_by', header: 'ENTERED BY', value: (row) => person.get(row.created_by) ?? '' },
      { key: 'timestamp', header: 'TIMESTAMP', value: (row) => formatDateTime(row.created_at), sortValue: (row) => row.created_at },
      {
        key: 'actions',
        header: '',
        render: (row) =>
          canWorkOn(row.sample, data, profile) && (
            <span className="row-actions">
              <button type="button" className="btn btn--small" onClick={() => setForm({ remark: row, sample: row.sample })}>
                Edit
              </button>
              <button type="button" className="btn btn--small" onClick={() => setDeleting(row)}>
                Delete
              </button>
            </span>
          ),
      },
    ]
  }, [data, profile])

  const remove = async () => {
    const row = deleting
    setDeleting(null)
    try {
      await callSampleAction('delete_process_remark', { p_id: row.id })
      setProblem('')
      setNotice(`Process remark of ${row.sample.sample_no} deleted.`)
      await reload()
    } catch (failure) {
      setProblem(friendlyError(failure))
    }
  }

  return (
    <>
      <PageHead
        title="Process remarks"
        note="What production must follow on a sample, tagged to the departments and processes it is for. Filter the DEPARTMENTS or PROCESSES column to see everything for one of them."
      />
      {(error || problem) && (
        <p className="alert alert--error" role="alert">
          {problem || friendlyError(error)}
        </p>
      )}
      {notice && (
        <p className="alert alert--ok" role="status">
          {notice}
        </p>
      )}
      <DataTable
        tableId="process-remarks"
        title="Process remarks"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="No process remark has been added yet."
        searchPlaceholder="Search process remarks…"
        toolbar={
          writable.length > 0 && (
            <button type="button" className="btn btn--primary" onClick={() => setForm({})}>
              Add process remark
            </button>
          )
        }
      />
      {form && (
        <ProcessRemarkDialog
          remark={form.remark ?? null}
          sample={form.sample ?? null}
          samples={writable}
          data={data}
          onClose={() => setForm(null)}
          onSaved={async (message) => {
            setForm(null)
            setProblem('')
            setNotice(message)
            await reload()
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete this process remark of ${deleting.sample.sample_no}?`}
          message="Its notes, voice notes and pictures are removed. This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
      {viewing && <SampleDetail sample={viewing} data={data} onChanged={reload} onClose={() => setViewingId(null)} />}
    </>
  )
}
