import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DataTable from '../components/DataTable.jsx'
import Tabs from '../components/Tabs.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { nameMap, useLoad } from '../lib/data.js'
import { formatDate, formatDateTime, friendlyError } from '../lib/format.js'
import { PIECE_LABEL, daysOut, loadSampleData } from '../lib/sampleData.js'
import SampleDetail from './SampleDetail.jsx'

// Every process entry of every sample the person can see, in one list.
// Tabs: All, Completed (received back), Running (still at the vendor).
export default function ProcessLogPage() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useLoad(() => loadSampleData(profile))
  const [viewingId, setViewingId] = useState(null)

  const rows = useMemo(
    () => (data?.samples ?? []).flatMap((sample) => sample.entries.map((entry) => ({ ...entry, sample }))),
    [data],
  )
  const viewing = data?.samples.find((sample) => sample.id === viewingId)
  const [params, setParams] = useSearchParams()
  const lists = useMemo(
    () => ({ all: rows, completed: rows.filter((row) => row.received_date), running: rows.filter((row) => !row.received_date) }),
    [rows],
  )
  const tabs = [
    { key: 'all', label: 'All', count: lists.all.length },
    { key: 'completed', label: 'Completed', count: lists.completed.length },
    { key: 'running', label: 'Running', count: lists.running.length },
  ]
  const tab = lists[params.get('tab')] ? params.get('tab') : 'all'

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
      <Tabs tabs={tabs} value={tab} label="Process log views" onChange={(key) => setParams(key === 'all' ? {} : { tab: key }, { replace: true })} />
      <p className="tab-note">
        {tab === 'all' ? 'Every process entry.' : tab === 'completed' ? 'Processes that have been received back.' : 'Processes still at the vendor, not received back yet.'}
      </p>
      <DataTable
        key={tab}
        tableId="process-log"
        title={tab === 'all' ? 'Process log' : tab === 'completed' ? 'Process log, completed' : 'Process log, running'}
        columns={columns}
        rows={lists[tab]}
        loading={loading}
        onRowClick={(row) => setViewingId(row.sample.id)}
        emptyText={tab === 'all' ? 'Nothing has been sent to a process yet.' : tab === 'completed' ? 'Nothing has been received back yet.' : 'Nothing is at a vendor right now.'}
        searchPlaceholder="Search the process log…"
      />
      {viewing && (
        <SampleDetail sample={viewing} data={data} onChanged={reload} onClose={() => setViewingId(null)} />
      )}
    </>
  )
}
