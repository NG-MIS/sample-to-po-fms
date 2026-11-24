import { useMemo, useState } from 'react'
import DataTable from '../components/DataTable.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { nameMap, useLoad } from '../lib/data.js'
import { formatDate, formatDateTime, friendlyError } from '../lib/format.js'
import { PIECE_LABEL, daysOut, loadSampleData } from '../lib/sampleData.js'
import SampleDetail from './SampleDetail.jsx'

// Every process entry of every sample the person can see, in one list.
// Filter STATUS to "At vendor" to see everything that is out right now.
export default function ProcessLogPage() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [viewingId, setViewingId] = useState(null)

  const rows = useMemo(
    () => (data?.samples ?? []).flatMap((sample) => sample.entries.map((entry) => ({ ...entry, sample }))),
    [data],
  )
  const viewing = data?.samples.find((sample) => sample.id === viewingId)

  const columns = useMemo(() => {
    const person = nameMap(data?.people)
    const process = nameMap(data?.processes)
    const vendor = nameMap(data?.vendors)
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
      { key: 'piece', header: 'PIECE', value: (row) => PIECE_LABEL[row.piece] },
      { key: 'process', header: 'PROCESS', value: (row) => process.get(row.process_id) ?? '' },
      { key: 'vendor', header: 'VENDOR', value: (row) => vendor.get(row.vendor_id) ?? '' },
      {
        key: 'sent_date',
        header: 'SENT DATE',
        value: (row) => formatDate(row.sent_date),
        sortValue: (row) => row.sent_date,
      },
      {
        key: 'received_date',
        header: 'RECD DATE',
        value: (row) => formatDate(row.received_date),
        sortValue: (row) => row.received_date ?? '',
      },
      {
        key: 'status',
        header: 'STATUS',
        value: (row) => (row.received_date ? 'Received' : 'At vendor'),
        render: (row) => (
          <span className={`badge badge--${row.received_date ? 'completed' : 'at_vendor'}`}>
            {row.received_date ? 'Received' : 'At vendor'}
          </span>
        ),
      },
      { key: 'days', header: 'DAYS', value: (row) => daysOut(row) },
      { key: 'designer', header: 'DESIGNER', value: (row) => person.get(row.sample.designer_id) ?? '' },
      { key: 'sent_by', header: 'SENT BY', value: (row) => person.get(row.created_by) ?? '' },
      { key: 'received_by', header: 'RECD BY', value: (row) => person.get(row.received_by) ?? '' },
      {
        key: 'timestamp',
        header: 'TIMESTAMP',
        value: (row) => formatDateTime(row.created_at),
        sortValue: (row) => row.created_at,
      },
    ]
  }, [data])

  return (
    <>
      <PageHead title="Process log" note="Open a sample to send it to a process, receive it back or mark a piece completed." />
      {error && (
        <p className="alert alert--error" role="alert">
          {friendlyError(error)}
        </p>
      )}
      <DataTable
        tableId="process-log"
        title="Process log"
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(row) => setViewingId(row.sample.id)}
        emptyText="Nothing has been sent to a process yet."
        searchPlaceholder="Search the process log…"
      />
      {viewing && (
        <SampleDetail sample={viewing} data={data} onChanged={reload} onClose={() => setViewingId(null)} />
      )}
    </>
  )
}
