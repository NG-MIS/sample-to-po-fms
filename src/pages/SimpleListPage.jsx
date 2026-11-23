import { useMemo, useState } from 'react'
import DataTable from '../components/DataTable.jsx'
import Modal from '../components/Modal.jsx'
import { Badge, Field, Tick } from '../components/Field.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fetchRows, nameMap, useLoad } from '../lib/data.js'
import { formatDateTime, friendlyError } from '../lib/format.js'
import { supabase } from '../lib/supabase.js'

// One screen for every simple list (departments, designations, roles).
// The list is only a name plus active/inactive.
//   table    - where the list is stored
//   title    - heading, e.g. "Departments"
//   singular - one item, e.g. "department"
export default function SimpleListPage({ table, title, singular }) {
  const { isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(async () => {
    const [rows, people] = await Promise.all([fetchRows(table), fetchRows('app_users')])
    return { rows, people: nameMap(people) }
  })
  const [editing, setEditing] = useState(null) // null = closed, {} = new, row = edit

  const rows = data?.rows ?? []
  const people = data?.people

  const columns = useMemo(() => {
    const list = [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no, width: 90 },
      { key: 'name', header: 'NAME', value: (row) => row.name },
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
      <PageHead title={title} note={isAdmin ? null : 'Only people with authority All can add or change this list.'} />
      {error && (
        <p className="alert alert--error" role="alert">
          {friendlyError(error)}
        </p>
      )}
      <DataTable
        tableId={table}
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText={`No ${singular} has been added yet.`}
        toolbar={
          isAdmin && (
            <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
              Add {singular}
            </button>
          )
        }
      />
      {editing && (
        <SimpleListForm
          table={table}
          singular={singular}
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

function SimpleListForm({ table, singular, row, onClose, onSaved }) {
  const isNew = !row.id
  const [name, setName] = useState(row.name ?? '')
  const [isActive, setIsActive] = useState(row.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dirty = name !== (row.name ?? '') || isActive !== (row.is_active ?? true)

  const save = async (event) => {
    event.preventDefault()
    const clean = name.trim()
    if (!clean) return setError('Name is required.')
    setBusy(true)
    setError('')
    const values = { name: clean, is_active: isActive }
    const { error: failure } = isNew
      ? await supabase.from(table).insert(values)
      : await supabase.from(table).update(values).eq('id', row.id)
    setBusy(false)
    if (failure) setError(friendlyError(failure))
    else onSaved()
  }

  const formId = `${table}-form`

  return (
    <Modal
      title={isNew ? `Add ${singular}` : `Edit ${singular}`}
      onClose={onClose}
      dirty={dirty}
      width={440}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id={formId} onSubmit={save}>
        <Field label="Name" htmlFor={`${formId}-name`} required>
          <input
            id={`${formId}-name`}
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Tick
          id={`${formId}-active`}
          label="Active"
          checked={isActive}
          onChange={setIsActive}
          hint="Inactive items stay on old records but no longer appear in pick-lists."
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
