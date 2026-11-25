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
  { header: 'SERIES NAME', required: true, hint: 'The name shown on the sample form. Each name can be used once.' },
  { header: 'PREFIX', required: true, hint: '1 to 10 letters or digits, no spaces. Stored in capitals. Each prefix can be used once.' },
  { header: 'STARTING NUMBER', required: true, hint: 'A whole number, 1 or more. The first sample of the series gets this number.' },
  { header: 'ACTIVE', required: false, hint: 'Yes or No. Leave blank for Yes.' },
]

// Numbering master: one row per series. A sample number is PREFIX-NUMBER.
export default function NumberingPage() {
  const { isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(async () => {
    const [rows, people, design] = await Promise.all([
      fetchRows('sample_series'),
      fetchRows('app_users'),
      fetchRows('design_series', null),
    ])
    return { rows, people: nameMap(people), design: design[0] ?? null }
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
    const name = cells['SERIES NAME']
    if (!name) return { error: 'SERIES NAME is empty.' }
    const nameKey = name.toLowerCase()
    memo.names ??= new Set()
    if (memo.names.has(nameKey)) return { error: 'This series name is repeated in the file.' }
    memo.names.add(nameKey)
    if (rows.some((row) => row.name.trim().toLowerCase() === nameKey)) return { error: 'This series name already exists.' }
    const start = Number(cells['STARTING NUMBER'])
    if (!/^\d+$/.test(cells['STARTING NUMBER']) || start < 1) {
      return { error: 'STARTING NUMBER must be a whole number, 1 or more.' }
    }
    const isActive = readYesNo(cells.ACTIVE, true)
    if (isActive === null) return { error: 'ACTIVE must be Yes or No.' }
    return { record: { name, prefix, start_number: start, is_active: isActive } }
  }

  const saveImported = async (record) => {
    const { error: failure } = await supabase.from('sample_series').insert(record)
    if (failure) throw failure
  }

  const columns = useMemo(() => {
    const list = [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no, width: 90 },
      { key: 'name', header: 'SERIES NAME', value: (row) => row.name },
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
            ? 'Each prefix is its own series. The sample form shows the series name; a sample number is the prefix, a dash, then the next number.'
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
      {data && <DesignNumbers series={data.design} isAdmin={isAdmin} onSaved={reload} />}
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

// Design numbers: one plain running series for all samples. A sample gets
// the next number from the Design no tab, after its final approval is Yes.
function DesignNumbers({ series, isAdmin, onSaved }) {
  const used = series?.last_number !== null && series?.last_number !== undefined
  const [start, setStart] = useState(series?.start_number ? String(series.start_number) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const next = series?.start_number ? (series.last_number ?? series.start_number - 1) + 1 : null

  const save = async (event) => {
    event.preventDefault()
    const number = Number(start)
    if (!/^\d{1,12}$/.test(start) || number < 1) return setError('Starting number must be a whole number, 1 or more.')
    setBusy(true)
    setError('')
    const { error: failure } = await supabase.from('design_series').update({ start_number: number }).eq('id', true)
    setBusy(false)
    if (failure) setError(friendlyError(failure))
    else onSaved()
  }

  return (
    <section className="design-box" aria-label="Design numbers">
      <h3 className="section-title">Design numbers</h3>
      <p className="hint">
        One running series of plain numbers. A sample gets the next one from the Design no tab of Samples, after its
        final approval is Yes.
      </p>
      <dl className="details">
        <div>
          <dt>Starting number</dt>
          <dd>{series?.start_number ?? <span className="hint">Not set</span>}</dd>
        </div>
        <div>
          <dt>Last number given</dt>
          <dd>{used ? series.last_number : <span className="hint">None yet</span>}</dd>
        </div>
        <div>
          <dt>Next number</dt>
          <dd>{next ?? <span className="hint">Not set</span>}</dd>
        </div>
      </dl>
      {isAdmin && !used && (
        <form className="design-form" onSubmit={save} noValidate>
          <Field label="Starting number" htmlFor="design-start">
            <input
              id="design-start"
              className="input"
              inputMode="numeric"
              value={start}
              onChange={(event) => setStart(event.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Setting…' : 'Set starting number'}
          </button>
        </form>
      )}
      {used && <p className="hint">Design numbers have already been given, so the starting number is locked.</p>}
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function SeriesForm({ row, onClose, onSaved }) {
  const isNew = !row.id
  const used = row.last_number !== null && row.last_number !== undefined
  const [name, setName] = useState(row.name ?? '')
  const [prefix, setPrefix] = useState(row.prefix ?? '')
  const [start, setStart] = useState(row.start_number ? String(row.start_number) : '')
  const [isActive, setIsActive] = useState(row.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dirty =
    name !== (row.name ?? '') ||
    prefix !== (row.prefix ?? '') ||
    start !== (row.start_number ? String(row.start_number) : '') ||
    isActive !== (row.is_active ?? true)

  const startNumber = Number(start)
  const preview = prefix && Number.isInteger(startNumber) && startNumber >= 1 ? `${prefix}-${startNumber}` : ''

  const save = async (event) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return setError('Series name is required.')
    if (!/^[A-Z0-9]{1,10}$/.test(prefix)) return setError('Prefix must be 1 to 10 letters or digits, with no spaces.')
    if (!Number.isInteger(startNumber) || startNumber < 1) return setError('Starting number must be a whole number, 1 or more.')
    setBusy(true)
    setError('')
    const values = used
      ? { name: cleanName, is_active: isActive }
      : { name: cleanName, prefix, start_number: startNumber, is_active: isActive }
    const { error: failure } = isNew
      ? await supabase.from('sample_series').insert(values)
      : await supabase.from('sample_series').update(values).eq('id', row.id)
    setBusy(false)
    if (failure) setError(friendlyError(failure))
    else onSaved()
  }

  return (
    <Modal
      title={isNew ? 'Add series' : `Edit series ${row.name}`}
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
            This series has already given out numbers, so its prefix and starting number are locked. The name can
            still be changed.
          </p>
        )}
        <Field label="Series name" htmlFor="series-name" required hint="Shown on the sample form when choosing the series.">
          <input id="series-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
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
          hint="An inactive series no longer appears on the sample form."
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
