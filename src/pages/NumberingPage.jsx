import { useMemo, useState } from 'react'
import DataTable from '../components/DataTable.jsx'
import ImportButton from '../components/ImportButton.jsx'
import Modal from '../components/Modal.jsx'
import { Badge, Field, Tick } from '../components/Field.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fetchRows, nameMap, useLoad } from '../lib/data.js'
import { readYesNo } from '../lib/exportFiles.js'
import { formatDateTime, friendlyError } from '../lib/format.js'
import { nextSampleNo } from '../lib/numbering.js'
import { supabase } from '../lib/supabase.js'

const IMPORT_FIELDS = [
  { header: 'PREFIX', required: true, hint: '1 to 10 letters or digits, no spaces. Stored in capitals. Each prefix can be used once.' },
  { header: 'STARTING NUMBER', required: true, hint: 'A whole number, 1 or more. The first sample of the series gets this number.' },
  { header: 'ACTIVE', required: false, hint: 'Yes or No. Leave blank for Yes.' },
]

// Numbering master: one row per series. A sample number is PREFIX-NUMBER.
export default function NumberingPage() {
  const { isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(async () => {
    const [rows, people] = await Promise.all([fetchRows('sample_series'), fetchRows('app_users')])
    return { rows, people: nameMap(people) }
  })
  const [editing, setEditing] = useState(null)

  const rows = data?.rows ?? []
  const people = data?.people

  const prepareImport = (cells, memo) => {
    const prefix = cells.PREFIX.toUpperCase()
    if (!/^[A-Z0-9]{1,10}$/.test(prefix)) return { error: 'PREFIX must be 1 to 10 letters or digits, with no spaces.' }
    memo.seen ??= new Set()
    if (memo.seen.has(prefix)) return { error: 'This prefix is repeated in the file.' }
    memo.seen.add(prefix)
    if (rows.some((row) => row.prefix === prefix)) return { skip: 'This prefix already exists.' }
    const start = Number(cells['STARTING NUMBER'])
    if (!/^\d+$/.test(cells['STARTING NUMBER']) || start < 1) {
      return { error: 'STARTING NUMBER must be a whole number, 1 or more.' }
    }
    const isActive = readYesNo(cells.ACTIVE, true)
    if (isActive === null) return { error: 'ACTIVE must be Yes or No.' }
    return { record: { prefix, start_number: start, is_active: isActive } }
  }

  const saveImported = async (record) => {
    const { error: failure } = await supabase.from('sample_series').insert(record)
    if (failure) throw failure
  }

  const columns = useMemo(() => {
    const list = [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no, width: 90 },
      { key: 'prefix', header: 'PREFIX', value: (row) => row.prefix },
      { key: 'start_number', header: 'STARTING NUMBER', value: (row) => row.start_number },
      { key: 'last_number', header: 'LAST NUMBER USED', value: (row) => row.last_number ?? '' },
      { key: 'next', header: 'NEXT SAMPLE NO', value: (row) => nextSampleNo(row) },
      {
        key: 'status',
        header: 'STATUS',
        value: (row) => (row.is_active ? 'Active' : 'Inactive'),
        render: (row) => <Badge on={row.is_active} onText="Active" offText="Inactive" />,
      },
      { key: 'entered_by', header: 'ENTERED BY', value: (row) => people?.get(row.created_by) ?? '' },
      {
        key: 'timestamp',
        header: 'TIMESTAMP',
        value: (row) => formatDateTime(row.created_at),
        sortValue: (row) => row.created_at,
      },
    ]
    if (isAdmin) {
      list.push({
        key: 'actions',
        header: '',
        width: 80,
        align: 'right',
        render: (row) => (
          <button type="button" className="btn btn--small" onClick={() => setEditing(row)}>
            Edit
          </button>
        ),
      })
    }
    return list
  }, [people, isAdmin])

  return (
    <>
      <PageHead
        title="Numbering"
        note={
          isAdmin
            ? 'Each prefix is its own series. A sample number is the prefix, a dash, then the next number.'
            : 'Only people with authority All can add or change a series.'
        }
      />
      {error && (
        <p className="alert alert--error" role="alert">
          {friendlyError(error)}
        </p>
      )}
      <DataTable
        tableId="numbering"
        onRowClick={isAdmin ? setEditing : undefined}
        title="Numbering"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="No series has been added yet."
        toolbar={
          isAdmin && (
            <div className="toolbar-actions">
              <ImportButton
                title="Import series"
                templateTitle="Numbering"
                fields={IMPORT_FIELDS}
                prepare={prepareImport}
                saveRecord={saveImported}
                onDone={reload}
              />
              <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
                Add series
              </button>
            </div>
          )
        }
      />
      {editing && (
        <SeriesForm
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </>
  )
}

function SeriesForm({ row, onClose, onSaved }) {
  const isNew = !row.id
  const used = row.last_number !== null && row.last_number !== undefined
  const [prefix, setPrefix] = useState(row.prefix ?? '')
  const [start, setStart] = useState(row.start_number ? String(row.start_number) : '')
  const [isActive, setIsActive] = useState(row.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dirty =
    prefix !== (row.prefix ?? '') ||
    start !== (row.start_number ? String(row.start_number) : '') ||
    isActive !== (row.is_active ?? true)

  const startNumber = Number(start)
  const preview = prefix && Number.isInteger(startNumber) && startNumber >= 1 ? `${prefix}-${startNumber}` : ''

  const save = async (event) => {
    event.preventDefault()
    if (!/^[A-Z0-9]{1,10}$/.test(prefix)) return setError('Prefix must be 1 to 10 letters or digits, with no spaces.')
    if (!Number.isInteger(startNumber) || startNumber < 1) return setError('Starting number must be a whole number, 1 or more.')
    setBusy(true)
    setError('')
    const values = used ? { is_active: isActive } : { prefix, start_number: startNumber, is_active: isActive }
    const { error: failure } = isNew
      ? await supabase.from('sample_series').insert(values)
      : await supabase.from('sample_series').update(values).eq('id', row.id)
    setBusy(false)
    if (failure) setError(friendlyError(failure))
    else onSaved()
  }

  return (
    <Modal
      title={isNew ? 'Add series' : `Edit series ${row.prefix}`}
      onClose={onClose}
      dirty={dirty}
      width={440}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="series-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="series-form" onSubmit={save}>
        {used && (
          <p className="alert alert--ok">
            This series has already given out numbers, so its prefix and starting number are locked.
          </p>
        )}
        <Field label="Prefix" htmlFor="series-prefix" required hint="Letters and digits only. Stored in capitals.">
          <input
            id="series-prefix"
            className="input"
            maxLength={10}
            disabled={used}
            value={prefix}
            onChange={(event) => setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
        </Field>
        <Field
          label="Starting number"
          htmlFor="series-start"
          required
          hint={preview && !used ? `The first sample will be ${preview}.` : null}
        >
          <input
            id="series-start"
            className="input"
            inputMode="numeric"
            disabled={used}
            value={start}
            onChange={(event) => setStart(event.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Tick
          id="series-active"
          label="Active"
          checked={isActive}
          onChange={setIsActive}
          hint="An inactive prefix no longer appears on the sample form."
        />
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
