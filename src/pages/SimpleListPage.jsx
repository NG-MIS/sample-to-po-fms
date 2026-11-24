import { useMemo, useState } from 'react'
import ClickableImage from '../components/ClickableImage.jsx'
import ImageUpload from '../components/ImageUpload.jsx'
import DataTable from '../components/DataTable.jsx'
import ImportButton from '../components/ImportButton.jsx'
import Modal from '../components/Modal.jsx'
import { Badge, Field, Tick } from '../components/Field.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fetchRows, nameMap, useLoad } from '../lib/data.js'
import { readYesNo } from '../lib/exportFiles.js'
import { cleanTagName, formatDateTime, friendlyError } from '../lib/format.js'
import { uploadFile } from '../lib/images.js'
import { supabase } from '../lib/supabase.js'

const IMPORT_FIELDS = [
  { header: 'NAME', required: true, hint: 'The name exactly as it should appear. Each name can be used once.' },
  { header: 'ACTIVE', required: false, hint: 'Yes or No. Leave blank for Yes.' },
]

// One screen for every simple list (departments, designations, roles).
// The list is only a name plus active/inactive.
//   table    - where the list is stored
//   title    - heading, e.g. "Departments"
//   singular - one item, e.g. "department"
//   picture  - optional { bucket, folder }: every item also carries one picture
//   hash     - optional: names are tags, shown with a # in front
export default function SimpleListPage({ table, title, singular, picture, hash = false }) {
  const { isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(async () => {
    const [rows, people] = await Promise.all([fetchRows(table), fetchRows('app_users')])
    return { rows, people: nameMap(people) }
  })
  const [editing, setEditing] = useState(null) // null = closed, {} = new, row = edit

  const rows = data?.rows ?? []
  const people = data?.people

  const prepareImport = (cells, memo) => {
    const name = hash ? cleanTagName(cells.NAME) : cells.NAME
    if (!name) return { error: 'NAME is empty.' }
    const key = name.toLowerCase()
    memo.seen ??= new Set()
    if (memo.seen.has(key)) return { error: 'This name is repeated in the file.' }
    memo.seen.add(key)
    if (rows.some((row) => row.name.trim().toLowerCase() === key)) return { skip: 'Already in the list.' }
    const isActive = readYesNo(cells.ACTIVE, true)
    if (isActive === null) return { error: 'ACTIVE must be Yes or No.' }
    return { record: { name, is_active: isActive } }
  }

  const saveImported = async (record) => {
    const { error: failure } = await supabase.from(table).insert(record)
    if (failure) throw failure
  }

  const columns = useMemo(() => {
    const list = [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no, width: 90 },
      { key: 'name', header: 'NAME', value: (row) => (hash ? `#${row.name}` : row.name) },
      ...(picture
        ? [
            {
              key: 'picture',
              header: 'PICTURE',
              value: (row) => (row.image_path ? 'Yes' : 'No picture'),
              render: (row) =>
                row.image_path ? (
                  <ClickableImage bucket={picture.bucket} path={row.image_path} alt={row.name} size={44} />
                ) : (
                  <span className="hint">No picture</span>
                ),
            },
          ]
        : []),
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
  }, [people, isAdmin, picture, hash])

  const importFields = picture
    ? IMPORT_FIELDS.map((field) =>
        field.header === 'NAME'
          ? { ...field, hint: `${field.hint} The picture is added afterwards, by opening the ${singular}.` }
          : field,
      )
    : IMPORT_FIELDS

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
        onRowClick={isAdmin ? setEditing : undefined}
        title={title}
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText={`No ${singular} has been added yet.`}
        toolbar={
          isAdmin && (
            <div className="toolbar-actions">
              <ImportButton
                title={`Import ${title.toLowerCase()}`}
                templateTitle={title}
                fields={importFields}
                prepare={prepareImport}
                saveRecord={saveImported}
                onDone={reload}
              />
              <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
                Add {singular}
              </button>
            </div>
          )
        }
      />
      {editing && (
        <SimpleListForm
          table={table}
          singular={singular}
          picture={picture}
          hash={hash}
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

function SimpleListForm({ table, singular, picture, hash, row, onClose, onSaved }) {
  const isNew = !row.id
  const [name, setName] = useState(row.name ?? '')
  const [imagePath, setImagePath] = useState(row.image_path ?? null)
  const [imageFile, setImageFile] = useState(null)
  const [isActive, setIsActive] = useState(row.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dirty =
    name !== (row.name ?? '') ||
    isActive !== (row.is_active ?? true) ||
    imageFile !== null ||
    imagePath !== (row.image_path ?? null)

  const save = async (event) => {
    event.preventDefault()
    const clean = hash ? cleanTagName(name) : name.trim()
    if (!clean) return setError('Name is required.')
    if (picture && !imageFile && !imagePath) return setError('Add the picture.')
    setBusy(true)
    setError('')
    try {
      const values = { name: clean, is_active: isActive }
      if (picture) values.image_path = imageFile ? await uploadFile(picture.bucket, imageFile, picture.folder) : imagePath
      const { error: failure } = isNew
        ? await supabase.from(table).insert(values)
        : await supabase.from(table).update(values).eq('id', row.id)
      if (failure) throw failure
      onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
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
        <Field label="Name" htmlFor={`${formId}-name`} required hint={hash ? 'With or without the # sign.' : null}>
          <input
            id={`${formId}-name`}
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {picture && (
          <Field label="Picture" required hint={`Shown wherever this ${singular} is picked.`}>
            <ImageUpload
              bucket={picture.bucket}
              path={imagePath}
              file={imageFile}
              alt={name || 'Picture'}
              size={96}
              onFileChange={setImageFile}
              onRemove={() => {
                setImageFile(null)
                setImagePath(null)
              }}
            />
          </Field>
        )}
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
