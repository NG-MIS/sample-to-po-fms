import { useMemo, useState } from 'react'
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
import { QTY_TYPES, QTY_TYPE_LABEL } from '../lib/sampleAccessories.js'
import { supabase } from '../lib/supabase.js'

// The primary accessory master: the accessories offered when a primary accessory
// list is set up with a CAD, each with the unit its table starts with.
// They are kept in the one accessories list, marked as primary, so a name is never
// in the system twice. Adding a name that is already an accessory marks that one.

const UNIT_WORDS = 'Quantity, Length or Dimension'
const readUnit = (cell) => QTY_TYPES.find((type) => type.label.toLowerCase() === String(cell ?? '').trim().toLowerCase())?.value ?? null

const IMPORT_FIELDS = [
  { header: 'NAME', required: true, hint: 'The accessory name. A name already in the accessories list is marked as primary.' },
  { header: 'DEFAULT UNIT', required: true, hint: `${UNIT_WORDS}.` },
  { header: 'ACTIVE', required: false, hint: 'Yes or No. Leave blank for Yes.' },
]

export default function PrimaryAccessoriesPage() {
  const { isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(async () => {
    const [accessories, people] = await Promise.all([fetchRows('accessories'), fetchRows('app_users')])
    return { accessories, people: nameMap(people) }
  })
  const [editing, setEditing] = useState(null) // null = closed, {} = new, row = edit

  const all = useMemo(() => data?.accessories ?? [], [data])
  const rows = useMemo(() => all.filter((row) => row.is_primary), [all])
  const people = data?.people

  const columns = useMemo(() => {
    const list = [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no, width: 90 },
      { key: 'name', header: 'NAME', value: (row) => row.name },
      {
        key: 'default_unit',
        header: 'DEFAULT UNIT',
        value: (row) => QTY_TYPE_LABEL[row.default_qty_type] ?? 'Not set',
        render: (row) => QTY_TYPE_LABEL[row.default_qty_type] ?? <span className="badge badge--pending">Not set</span>,
      },
      {
        key: 'status',
        header: 'STATUS',
        value: (row) => (row.is_active ? 'Active' : 'Inactive'),
        render: (row) => <Badge on={row.is_active} onText="Active" offText="Inactive" />,
      },
      { key: 'entered_by', header: 'ENTERED BY', value: (row) => people?.get(row.created_by) ?? '' },
      { key: 'timestamp', header: 'TIMESTAMP', value: (row) => formatDateTime(row.created_at), sortValue: (row) => row.created_at },
    ]
    if (isAdmin) {
      list.push({
        key: 'actions',
        header: '',
        width: 80,
        render: (row) => (
          <button type="button" className="btn btn--small" onClick={() => setEditing(row)}>
            Edit
          </button>
        ),
      })
    }
    return list
  }, [people, isAdmin])

  const prepareImport = (cells, memo) => {
    const name = (cells.NAME ?? '').trim().replace(/\s+/g, ' ')
    if (!name) return { error: 'NAME is empty.' }
    const key = name.toLowerCase()
    memo.seen ??= new Set()
    if (memo.seen.has(key)) return { error: 'This name is repeated in the file.' }
    memo.seen.add(key)
    const unit = readUnit(cells['DEFAULT UNIT'])
    if (!unit) return { error: `DEFAULT UNIT must be ${UNIT_WORDS}.` }
    const isActive = readYesNo(cells.ACTIVE, true)
    if (isActive === null) return { error: 'ACTIVE must be Yes or No.' }
    const known = all.find((row) => row.name.trim().toLowerCase() === key)
    if (known?.is_primary) return { skip: 'Already in the list.' }
    return { record: { id: known?.id ?? null, name, default_qty_type: unit, is_active: isActive } }
  }

  const saveImported = async ({ id, ...values }) => {
    const { error: failure } = id
      ? await supabase.from('accessories').update({ is_primary: true, default_qty_type: values.default_qty_type }).eq('id', id)
      : await supabase.from('accessories').insert({ ...values, is_primary: true })
    if (failure) throw failure
  }

  return (
    <>
      <PageHead
        title="Primary accessories"
        note={
          isAdmin
            ? 'The accessories offered when a primary accessory list is set up with a CAD, each with the unit its table starts with.'
            : 'Only people with authority All can add or change this list.'
        }
      />
      {error && (
        <p className="alert alert--error" role="alert">
          {friendlyError(error)}
        </p>
      )}
      <DataTable
        tableId="primary-accessories"
        onRowClick={isAdmin ? setEditing : undefined}
        title="Primary accessories"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="No primary accessory has been added yet."
        toolbar={
          isAdmin && (
            <div className="toolbar-actions">
              <ImportButton
                title="Import primary accessories"
                templateTitle="Primary accessories"
                fields={IMPORT_FIELDS}
                prepare={prepareImport}
                saveRecord={saveImported}
                onDone={reload}
              />
              <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
                Add primary accessory
              </button>
            </div>
          )
        }
      />
      {editing && (
        <PrimaryAccessoryForm
          row={editing}
          all={all}
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

function PrimaryAccessoryForm({ row, all, onClose, onSaved }) {
  const isNew = !row.id
  const [name, setName] = useState(row.name ?? '')
  const [unit, setUnit] = useState(row.default_qty_type ?? null)
  const [isActive, setIsActive] = useState(row.is_active ?? true)
  const [isPrimary, setIsPrimary] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dirty = name !== (row.name ?? '') || unit !== (row.default_qty_type ?? null) || isActive !== (row.is_active ?? true) || !isPrimary
  const clean = name.trim().replace(/\s+/g, ' ')
  // typed while adding: an accessory of this name that is not yet primary
  const known = isNew ? all.find((item) => item.name.trim().toLowerCase() === clean.toLowerCase()) : null

  const save = async (event) => {
    event.preventDefault()
    if (!clean) return setError('Name is required.')
    if (known?.is_primary) return setError('This accessory is already in the primary accessory master.')
    if (isPrimary && !unit) return setError(`Choose the default unit: ${UNIT_WORDS}.`)
    setBusy(true)
    setError('')
    try {
      const { error: failure } = isNew
        ? known
          ? await supabase.from('accessories').update({ is_primary: true, default_qty_type: unit }).eq('id', known.id)
          : await supabase.from('accessories').insert({ name: clean, is_active: isActive, is_primary: true, default_qty_type: unit })
        : await supabase.from('accessories').update({ name: clean, is_active: isActive, is_primary: isPrimary, default_qty_type: unit }).eq('id', row.id)
      if (failure) throw failure
      onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isNew ? 'Add primary accessory' : 'Edit primary accessory'}
      onClose={onClose}
      dirty={dirty}
      width={440}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="primary-accessory-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="primary-accessory-form" onSubmit={save}>
        <Field
          label="Name"
          htmlFor="primary-accessory-name"
          required
          hint={known && !known.is_primary ? `"${known.name}" is already in the accessories list. Saving marks it as a primary accessory.` : null}
        >
          <input id="primary-accessory-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Default unit" htmlFor="primary-accessory-unit" required hint="The unit its table starts with on a primary accessory list. It can be changed there.">
          <PickList id="primary-accessory-unit" options={QTY_TYPES} value={unit} clearable={false} onChange={setUnit} />
        </Field>
        {!(isNew && known) && (
          <Tick
            id="primary-accessory-active"
            label="Active"
            checked={isActive}
            onChange={setIsActive}
            hint="Inactive items stay on old records but no longer appear in pick-lists."
          />
        )}
        {!isNew && (
          <Tick
            id="primary-accessory-primary"
            label="Primary accessory"
            checked={isPrimary}
            onChange={setIsPrimary}
            hint="Untick to take it out of this master. It stays in the accessories list and on lists already made."
          />
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
