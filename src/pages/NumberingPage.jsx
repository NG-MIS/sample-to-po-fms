import { useMemo, useState } from 'react'
import { digitsTyped, numberTyped } from '../lib/calc.js'
import DataTable from '../components/DataTable.jsx'
import ImportButton from '../components/ImportButton.jsx'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
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
    const [rows, people, design, purchase, lotSeries] = await Promise.all([
      fetchRows('sample_series'),
      fetchRows('app_users'),
      fetchRows('design_series', null),
      fetchRows('purchase_settings', null),
      fetchRows('lot_series'),
    ])
    return { rows, people: nameMap(people), design: design[0] ?? null, purchase: purchase[0] ?? null, lotSeries }
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
      {data && <PurchaseSettings settings={data.purchase} isAdmin={isAdmin} onSaved={reload} />}
      {data && <LotSeries rows={data.lotSeries} isAdmin={isAdmin} onSaved={reload} />}
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
              onChange={(event) => setStart(digitsTyped(event.target.value))}
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

// Purchase orders: one running series of PO numbers (PO-1001, PO-1002, ...),
// and how much more fabric is ordered than the drawing needs.
function PurchaseSettings({ settings, isAdmin, onSaved }) {
  const used = settings?.po_last_number !== null && settings?.po_last_number !== undefined
  const [start, setStart] = useState(settings?.po_start_number ? String(settings.po_start_number) : '')
  const [tolerance, setTolerance] = useState(settings ? String(Number(settings.fabric_tolerance)) : '0')
  const [allowance, setAllowance] = useState(settings ? String(Number(settings.receive_allowance ?? 10)) : '10')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const next = settings?.po_start_number ? (settings.po_last_number ?? settings.po_start_number - 1) + 1 : null

  const update = async (which, values) => {
    setBusy(which)
    setError('')
    const { error: failure } = await supabase.from('purchase_settings').update(values).eq('id', true)
    setBusy('')
    if (failure) setError(friendlyError(failure))
    else onSaved()
  }
  const saveStart = (event) => {
    event.preventDefault()
    if (!/^\d{1,12}$/.test(start) || Number(start) < 1) return setError('Starting PO number must be a whole number, 1 or more.')
    update('start', { po_start_number: Number(start) })
  }
  const saveTolerance = (event) => {
    event.preventDefault()
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(tolerance) || Number(tolerance) > 100) {
      return setError('Fabric tolerance must be a percentage from 0 to 100, with at most 2 decimals.')
    }
    update('tolerance', { fabric_tolerance: Number(tolerance) })
  }

  const saveAllowance = (event) => {
    event.preventDefault()
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(allowance) || Number(allowance) > 100) {
      return setError('Receiving allowance must be a percentage from 0 to 100, with at most 2 decimals.')
    }
    update('allowance', { receive_allowance: Number(allowance) })
  }

  return (
    <section className="design-box purchase-box" aria-label="Purchase orders">
      <h3 className="section-title">Purchase orders</h3>
      <p className="hint">
        PO numbers are one running series: PO- and the next number. Fabric tolerance is how much more fabric is ordered
        than the drawing needs, for emergencies; the quantity is then rounded up to the next 10.
      </p>
      <dl className="details">
        <div>
          <dt>Starting PO number</dt>
          <dd>{settings?.po_start_number ? `PO-${settings.po_start_number}` : <span className="hint">Not set</span>}</dd>
        </div>
        <div>
          <dt>Last PO given</dt>
          <dd>{used ? `PO-${settings.po_last_number}` : <span className="hint">None yet</span>}</dd>
        </div>
        <div>
          <dt>Next PO</dt>
          <dd>{next ? `PO-${next}` : <span className="hint">Not set</span>}</dd>
        </div>
        <div>
          <dt>Fabric tolerance</dt>
          <dd>{settings ? `${Number(settings.fabric_tolerance)}%` : ''}</dd>
        </div>
        <div>
          <dt>Receiving allowance</dt>
          <dd>{settings ? `${Number(settings.receive_allowance ?? 10)}%` : ''}</dd>
        </div>
      </dl>
      {isAdmin && !used && (
        <form className="design-form" onSubmit={saveStart} noValidate>
          <Field label="Starting PO number" htmlFor="po-start">
            <input id="po-start" className="input" inputMode="numeric" value={start} onChange={(event) => setStart(digitsTyped(event.target.value))} />
          </Field>
          <button type="submit" className="btn btn--primary" disabled={busy !== ''}>
            {busy === 'start' ? 'Setting…' : 'Set starting PO number'}
          </button>
        </form>
      )}
      {used && <p className="hint">PO numbers have already been given, so the starting number is locked.</p>}
      {isAdmin && (
        <form className="design-form" onSubmit={saveTolerance} noValidate>
          <Field label="Fabric tolerance (%)" htmlFor="fabric-tolerance">
            <input
              id="fabric-tolerance"
              className="input"
              inputMode="decimal"
              value={tolerance}
              onChange={(event) => setTolerance(numberTyped(event.target.value))}
            />
          </Field>
          <button type="submit" className="btn btn--primary" disabled={busy !== ''}>
            {busy === 'tolerance' ? 'Setting…' : 'Set fabric tolerance'}
          </button>
        </form>
      )}
      {isAdmin && (
        <form className="design-form" onSubmit={saveAllowance} noValidate>
          <Field label="Receiving allowance (%)" htmlFor="receive-allowance">
            <input
              id="receive-allowance"
              className="input"
              inputMode="decimal"
              value={allowance}
              onChange={(event) => setAllowance(numberTyped(event.target.value))}
            />
          </Field>
          <button type="submit" className="btn btn--primary" disabled={busy !== ''}>
            {busy === 'allowance' ? 'Setting…' : 'Set receiving allowance'}
          </button>
        </form>
      )}
      <p className="hint">
        Receiving allowance: an ordered colour counts as fully received once what has come is within this much of what
        was ordered. More than this much over is shown as excess.
      </p>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

const LOT_KINDS = [
  { value: 'fabric', label: 'Fabric' },
  { value: 'accessory', label: 'Accessory' },
]
const LOT_KIND_LABEL = { fabric: 'Fabric', accessory: 'Accessory' }
const nextLot = (row) => `${row.prefix}-${(row.last_number ?? row.start_number - 1) + 1}`

// Lot number series: the numbers given to material when it is received.
// Fabric and accessories have their own series; the person receiving picks one.
function LotSeries({ rows, isAdmin, onSaved }) {
  const [editing, setEditing] = useState(null)
  const columns = useMemo(() => {
    const list = [
      { key: 'kind', header: 'FOR', value: (row) => LOT_KIND_LABEL[row.kind] },
      { key: 'name', header: 'SERIES NAME', value: (row) => row.name },
      { key: 'prefix', header: 'PREFIX', value: (row) => row.prefix },
      { key: 'start_number', header: 'STARTING NUMBER', value: (row) => row.start_number },
      { key: 'last_number', header: 'LAST NUMBER USED', value: (row) => row.last_number ?? '' },
      { key: 'next', header: 'NEXT LOT NO', value: (row) => nextLot(row) },
      {
        key: 'status',
        header: 'STATUS',
        value: (row) => (row.is_active ? 'Active' : 'Inactive'),
        render: (row) => <Badge on={row.is_active} onText="Active" offText="Inactive" />,
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
  }, [isAdmin])

  return (
    <section className="design-box lot-box" aria-label="Lot number series">
      <h3 className="section-title">Lot number series</h3>
      <p className="hint">
        Used only for received material. Every PO item gets one lot number at its first receipt, from the series the
        person picks, and each colour gets a letter: FB-1234-A, FB-1234-B. Fabric and accessories have separate series.
      </p>
      <DataTable
        tableId="lot-series"
        title="Lot number series"
        columns={columns}
        rows={rows}
        onRowClick={isAdmin ? setEditing : undefined}
        emptyText="No lot number series has been added yet."
        toolbar={
          isAdmin && (
            <div className="toolbar-actions">
              <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
                Add lot series
              </button>
            </div>
          )
        }
      />
      {editing && (
        <LotSeriesForm
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onSaved()
          }}
        />
      )}
    </section>
  )
}

function LotSeriesForm({ row, onClose, onSaved }) {
  const isNew = !row.id
  const used = row.last_number !== null && row.last_number !== undefined
  const [kind, setKind] = useState(row.kind ?? null)
  const [name, setName] = useState(row.name ?? '')
  const [prefix, setPrefix] = useState(row.prefix ?? '')
  const [start, setStart] = useState(row.start_number ? String(row.start_number) : '')
  const [isActive, setIsActive] = useState(row.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty =
    kind !== (row.kind ?? null) ||
    name !== (row.name ?? '') ||
    prefix !== (row.prefix ?? '') ||
    start !== (row.start_number ? String(row.start_number) : '') ||
    isActive !== (row.is_active ?? true)
  const startNumber = Number(start)
  const preview = prefix && Number.isInteger(startNumber) && startNumber >= 1 ? `${prefix}-${startNumber}-A` : ''

  const save = async (event) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!kind) return setError('Choose what the series is for: Fabric or Accessory.')
    if (!cleanName) return setError('Series name is required.')
    if (!/^[A-Z0-9]{1,10}$/.test(prefix)) return setError('Prefix must be 1 to 10 letters or digits, with no spaces.')
    if (!Number.isInteger(startNumber) || startNumber < 1) return setError('Starting number must be a whole number, 1 or more.')
    setBusy(true)
    setError('')
    const values = used
      ? { name: cleanName, is_active: isActive }
      : { kind, name: cleanName, prefix, start_number: startNumber, is_active: isActive }
    const { error: failure } = isNew
      ? await supabase.from('lot_series').insert(values)
      : await supabase.from('lot_series').update(values).eq('id', row.id)
    setBusy(false)
    if (failure) setError(friendlyError(failure))
    else onSaved()
  }

  return (
    <Modal
      title={isNew ? 'Add lot series' : `Edit lot series ${row.name}`}
      onClose={onClose}
      dirty={dirty}
      width={440}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="lot-series-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="lot-series-form" onSubmit={save} noValidate>
        {used && (
          <p className="alert alert--ok">
            This series has already given out lot numbers, so what it is for, its prefix and its starting number are
            locked. The name can still be changed.
          </p>
        )}
        <Field label="For" htmlFor="lot-series-kind" required>
          <PickList id="lot-series-kind" options={LOT_KINDS} value={kind} onChange={setKind} clearable={false} disabled={used} />
        </Field>
        <Field label="Series name" htmlFor="lot-series-name" required hint="Shown when choosing the series while receiving.">
          <input id="lot-series-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Prefix" htmlFor="lot-series-prefix" required hint="Letters and digits only. Stored in capitals.">
          <input
            id="lot-series-prefix"
            className="input"
            maxLength={10}
            disabled={used}
            value={prefix}
            onChange={(event) => setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
        </Field>
        <Field label="Starting number" htmlFor="lot-series-start" required hint={preview && !used ? `The first lot will be ${preview}.` : null}>
          <input
            id="lot-series-start"
            className="input"
            inputMode="numeric"
            disabled={used}
            value={start}
            onChange={(event) => setStart(digitsTyped(event.target.value))}
          />
        </Field>
        <Tick id="lot-series-active" label="Active" checked={isActive} onChange={setIsActive} hint="An inactive series can no longer be picked while receiving." />
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
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
            onChange={(event) => setStart(digitsTyped(event.target.value))}
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
