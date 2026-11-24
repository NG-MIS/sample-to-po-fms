import { useMemo, useState } from 'react'
import ClickableImage from '../components/ClickableImage.jsx'
import DataTable from '../components/DataTable.jsx'
import ImageUpload from '../components/ImageUpload.jsx'
import ImportButton from '../components/ImportButton.jsx'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { Badge, Field, Tick } from '../components/Field.jsx'
import { PageHead } from '../components/Layout.jsx'
import { useAuth } from '../lib/auth.jsx'
import { fetchRows, nameMap, useLoad } from '../lib/data.js'
import { readYesNo, splitList } from '../lib/exportFiles.js'
import { formatDateTime, friendlyError } from '../lib/format.js'
import { uploadImage } from '../lib/images.js'
import { supabase } from '../lib/supabase.js'

const AUTHORITY_OPTIONS = [
  { value: 'self', label: 'Self' },
  { value: 'departments', label: 'Department(s)' },
  { value: 'all', label: 'All' },
]
const AUTHORITY_LABEL = Object.fromEntries(AUTHORITY_OPTIONS.map((option) => [option.value, option.label]))
const AUTHORITY_FROM_TEXT = {
  '': 'self',
  self: 'self',
  all: 'all',
  department: 'departments',
  departments: 'departments',
  'department(s)': 'departments',
}

const IMPORT_FIELDS = [
  { header: 'NAME', required: true, hint: 'The person\u2019s full name.' },
  { header: 'EMAIL', required: false, hint: 'Needed if the person will sign in. Each email can be used once.' },
  { header: 'PHONE', required: false, hint: 'Phone number.' },
  { header: 'DEPARTMENT', required: false, hint: 'Must match a name in the Departments list.' },
  { header: 'DESIGNATION', required: false, hint: 'Must match a name in the Designations list.' },
  { header: 'ROLES', required: false, hint: 'One or more names from the Roles list, separated by commas. Example: Designer, Merchandiser' },
  { header: 'AUTHORITY', required: false, hint: 'Self, Department(s) or All. Leave blank for Self.' },
  { header: 'AUTHORITY DEPARTMENTS', required: false, hint: 'Only when AUTHORITY is Department(s): department names separated by commas.' },
  { header: 'CAN SIGN IN', required: false, hint: 'Yes or No. Leave blank for No. Yes needs an EMAIL.' },
  { header: 'ACTIVE', required: false, hint: 'Yes or No. Leave blank for Yes.' },
]

// Lookup of lower-case name -> id, for active items only.
const idsByName = (items) =>
  new Map((items || []).filter((item) => item.is_active).map((item) => [item.name.trim().toLowerCase(), item.id]))

async function loadEverything() {
  const [people, departments, designations, roles, userRoles, authorityDepartments] = await Promise.all([
    fetchRows('app_users'),
    fetchRows('departments'),
    fetchRows('designations'),
    fetchRows('roles'),
    fetchRows('user_roles', null),
    fetchRows('user_authority_departments', null),
  ])

  const group = (links, valueKey) => {
    const byUser = new Map()
    links.forEach((link) => {
      if (!byUser.has(link.user_id)) byUser.set(link.user_id, [])
      byUser.get(link.user_id).push(link[valueKey])
    })
    return byUser
  }
  const rolesByUser = group(userRoles, 'role_id')
  const departmentsByUser = group(authorityDepartments, 'department_id')

  return {
    departments,
    designations,
    roles,
    people: people.map((person) => ({
      ...person,
      role_ids: rolesByUser.get(person.id) ?? [],
      authority_department_ids: departmentsByUser.get(person.id) ?? [],
    })),
  }
}

export default function UsersPage() {
  const { isAdmin, profile, reloadProfile } = useAuth()
  const { data, loading, error, reload } = useLoad(loadEverything)
  const [editing, setEditing] = useState(null) // null = closed, {} = new, person = edit

  const people = useMemo(() => data?.people ?? [], [data])

  const prepareImport = (cells, memo) => {
    memo.departments ??= idsByName(data.departments)
    memo.designations ??= idsByName(data.designations)
    memo.roles ??= idsByName(data.roles)
    memo.emails ??= new Set()

    const name = cells.NAME
    if (!name) return { error: 'NAME is empty.' }

    const email = (cells.EMAIL || '').toLowerCase()
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'EMAIL does not look like an email address.' }
      if (memo.emails.has(email)) return { error: 'This email is repeated in the file.' }
      memo.emails.add(email)
      if (people.some((person) => person.email === email)) return { skip: 'A person with this email already exists.' }
    } else if (people.some((person) => !person.email && person.name.trim().toLowerCase() === name.toLowerCase())) {
      return { skip: 'A person with this name and no email already exists.' }
    }

    const find = (lookup, text, listName) => {
      if (!text) return { id: null }
      const id = lookup.get(text.toLowerCase())
      return id ? { id } : { problem: `"${text}" is not an active entry in ${listName}.` }
    }
    const department = find(memo.departments, cells.DEPARTMENT, 'Departments')
    if (department.problem) return { error: department.problem }
    const designation = find(memo.designations, cells.DESIGNATION, 'Designations')
    if (designation.problem) return { error: designation.problem }

    const roleIds = []
    for (const roleName of splitList(cells.ROLES)) {
      const role = find(memo.roles, roleName, 'Roles')
      if (role.problem) return { error: role.problem }
      if (!roleIds.includes(role.id)) roleIds.push(role.id)
    }

    const authority = AUTHORITY_FROM_TEXT[(cells.AUTHORITY || '').toLowerCase()]
    if (!authority) return { error: 'AUTHORITY must be Self, Department(s) or All.' }
    const authorityDepartmentIds = []
    if (authority === 'departments') {
      for (const departmentName of splitList(cells['AUTHORITY DEPARTMENTS'])) {
        const found = find(memo.departments, departmentName, 'Departments')
        if (found.problem) return { error: found.problem }
        if (!authorityDepartmentIds.includes(found.id)) authorityDepartmentIds.push(found.id)
      }
      if (authorityDepartmentIds.length === 0) {
        return { error: 'AUTHORITY DEPARTMENTS is needed when AUTHORITY is Department(s).' }
      }
    }

    const canSignIn = readYesNo(cells['CAN SIGN IN'], false)
    if (canSignIn === null) return { error: 'CAN SIGN IN must be Yes or No.' }
    if (canSignIn && !email) return { error: 'EMAIL is needed when CAN SIGN IN is Yes.' }
    const isActive = readYesNo(cells.ACTIVE, true)
    if (isActive === null) return { error: 'ACTIVE must be Yes or No.' }

    return {
      record: {
        p_id: null,
        p_name: name,
        p_email: email,
        p_phone: cells.PHONE || '',
        p_department_id: department.id,
        p_designation_id: designation.id,
        p_authority: authority,
        p_avatar_path: null,
        p_can_sign_in: canSignIn,
        p_is_active: isActive,
        p_role_ids: roleIds,
        p_authority_department_ids: authorityDepartmentIds,
      },
    }
  }

  const saveImported = async (record) => {
    const { error: failure } = await supabase.rpc('save_app_user', record)
    if (failure) throw failure
  }

  const columns = useMemo(() => {
    const departmentName = nameMap(data?.departments)
    const designationName = nameMap(data?.designations)
    const roleName = nameMap(data?.roles)
    const personName = nameMap(data?.people)
    const names = (ids, lookup) => ids.map((id) => lookup.get(id)).filter(Boolean).sort()

    const list = [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no, width: 80 },
      {
        key: 'picture',
        header: 'PICTURE',
        width: 80,
        render: (row) => (
          <ClickableImage bucket="avatars" path={row.avatar_path} alt={row.name} fallbackName={row.name} round />
        ),
      },
      { key: 'name', header: 'NAME', value: (row) => row.name },
      { key: 'email', header: 'EMAIL', value: (row) => row.email ?? '' },
      { key: 'phone', header: 'PHONE', value: (row) => row.phone ?? '' },
      { key: 'department', header: 'DEPARTMENT', value: (row) => departmentName.get(row.department_id) ?? '' },
      { key: 'designation', header: 'DESIGNATION', value: (row) => designationName.get(row.designation_id) ?? '' },
      { key: 'roles', header: 'ROLES', value: (row) => names(row.role_ids, roleName) },
      {
        key: 'authority',
        header: 'AUTHORITY',
        value: (row) =>
          row.authority === 'departments'
            ? `Department(s): ${names(row.authority_department_ids, departmentName).join(', ')}`
            : AUTHORITY_LABEL[row.authority],
      },
      {
        key: 'sign_in',
        header: 'SIGN-IN',
        value: (row) => (!row.can_sign_in ? 'Off' : row.auth_user_id ? 'On' : 'On, not set up yet'),
        render: (row) => (
          <Badge
            on={row.can_sign_in}
            onText={row.auth_user_id ? 'On' : 'On, not set up yet'}
            offText="Off"
          />
        ),
      },
      {
        key: 'status',
        header: 'STATUS',
        value: (row) => (row.is_active ? 'Active' : 'Inactive'),
        render: (row) => <Badge on={row.is_active} onText="Active" offText="Inactive" />,
      },
      { key: 'entered_by', header: 'ENTERED BY', value: (row) => personName.get(row.created_by) ?? '' },
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
  }, [data, isAdmin])

  return (
    <>
      <PageHead
        title="User master"
        note={isAdmin ? null : 'Only people with authority All can add or change people.'}
      />
      {error && (
        <p className="alert alert--error" role="alert">
          {friendlyError(error)}
        </p>
      )}
      <DataTable
        tableId="users"
        title="User master"
        columns={columns}
        rows={people}
        loading={loading}
        emptyText="No person has been added yet."
        toolbar={
          isAdmin && (
            <div className="toolbar-actions">
              <ImportButton
                title="Import people"
                templateTitle="User master"
                fields={IMPORT_FIELDS}
                prepare={prepareImport}
                saveRecord={saveImported}
                onDone={reload}
              />
              <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
                Add person
              </button>
            </div>
          )
        }
      />
      {editing && (
        <UserForm
          person={editing}
          lists={data}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            const editedSelf = editing.id === profile.id
            setEditing(null)
            await reload()
            if (editedSelf) reloadProfile()
          }}
        />
      )}
    </>
  )
}

// Pick-list choices: active items, plus whatever is already chosen even if it is now inactive.
function toOptions(items, chosen) {
  const keep = new Set(Array.isArray(chosen) ? chosen : [chosen])
  return items
    .filter((item) => item.is_active || keep.has(item.id))
    .map((item) => ({ value: item.id, label: item.is_active ? item.name : `${item.name} (inactive)` }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function UserForm({ person, lists, onClose, onSaved }) {
  const isNew = !person.id
  const initial = useMemo(
    () => ({
      name: person.name ?? '',
      email: person.email ?? '',
      phone: person.phone ?? '',
      department_id: person.department_id ?? null,
      designation_id: person.designation_id ?? null,
      role_ids: person.role_ids ?? [],
      authority: person.authority ?? 'self',
      authority_department_ids: person.authority_department_ids ?? [],
      avatar_path: person.avatar_path ?? null,
      can_sign_in: person.can_sign_in ?? false,
      is_active: person.is_active ?? true,
    }),
    [person],
  )
  const [form, setForm] = useState(initial)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (value) => setForm((previous) => ({ ...previous, [key]: value }))
  const dirty = file !== null || JSON.stringify(form) !== JSON.stringify(initial)
  const signInIsSetUp = Boolean(person.auth_user_id)

  const save = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) return setError('Name is required.')
    if (form.can_sign_in && !form.email.trim()) return setError('Email is required when sign-in is switched on.')
    if (form.authority === 'departments' && form.authority_department_ids.length === 0) {
      return setError('Choose at least one department for this authority.')
    }

    setBusy(true)
    setError('')
    try {
      const avatarPath = file ? await uploadImage('avatars', file, 'people') : form.avatar_path
      const { error: failure } = await supabase.rpc('save_app_user', {
        p_id: person.id ?? null,
        p_name: form.name,
        p_email: form.email,
        p_phone: form.phone,
        p_department_id: form.department_id,
        p_designation_id: form.designation_id,
        p_authority: form.authority,
        p_avatar_path: avatarPath,
        p_can_sign_in: form.can_sign_in,
        p_is_active: form.is_active,
        p_role_ids: form.role_ids,
        p_authority_department_ids: form.authority === 'departments' ? form.authority_department_ids : [],
      })
      if (failure) throw failure
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isNew ? 'Add person' : `Edit ${person.name}`}
      onClose={onClose}
      dirty={dirty}
      width={640}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="user-form" className="form-grid" onSubmit={save}>
        <div className="form-wide">
          <Field label="Picture">
            <ImageUpload
              bucket="avatars"
              path={form.avatar_path}
              file={file}
              alt={form.name || 'Picture'}
              fallbackName={form.name}
              round
              onFileChange={setFile}
              onRemove={() => {
                setFile(null)
                set('avatar_path')(null)
              }}
            />
          </Field>
        </div>

        <Field label="Name" htmlFor="user-name" required>
          <input id="user-name" className="input" data-autofocus value={form.name} onChange={(event) => set('name')(event.target.value)} />
        </Field>
        <Field
          label="Email"
          htmlFor="user-email"
          required={form.can_sign_in}
          hint={signInIsSetUp ? 'Cannot be changed after the person has set up sign-in.' : 'The person signs in with this email.'}
        >
          <input
            id="user-email"
            className="input"
            type="email"
            disabled={signInIsSetUp}
            value={form.email}
            onChange={(event) => set('email')(event.target.value)}
          />
        </Field>
        <Field label="Phone" htmlFor="user-phone">
          <input id="user-phone" className="input" type="tel" value={form.phone} onChange={(event) => set('phone')(event.target.value)} />
        </Field>
        <Field label="Department" htmlFor="user-department">
          <PickList
            id="user-department"
            options={toOptions(lists.departments, form.department_id)}
            value={form.department_id}
            onChange={set('department_id')}
          />
        </Field>
        <Field label="Designation" htmlFor="user-designation">
          <PickList
            id="user-designation"
            options={toOptions(lists.designations, form.designation_id)}
            value={form.designation_id}
            onChange={set('designation_id')}
          />
        </Field>
        <Field label="Roles" htmlFor="user-roles" hint="A person can hold several roles.">
          <PickList
            id="user-roles"
            multiple
            options={toOptions(lists.roles, form.role_ids)}
            value={form.role_ids}
            onChange={set('role_ids')}
          />
        </Field>
        <Field
          label="Authority"
          htmlFor="user-authority"
          required
          hint="Self: own records. Department(s): the chosen departments. All: everything, and can manage the masters."
        >
          <PickList
            id="user-authority"
            clearable={false}
            options={AUTHORITY_OPTIONS}
            value={form.authority}
            onChange={set('authority')}
          />
        </Field>
        {form.authority === 'departments' && (
          <Field label="Departments for this authority" htmlFor="user-authority-departments" required>
            <PickList
              id="user-authority-departments"
              multiple
              options={toOptions(lists.departments, form.authority_department_ids)}
              value={form.authority_department_ids}
              onChange={set('authority_department_ids')}
            />
          </Field>
        )}

        <div className="form-wide form-ticks">
          <Tick
            id="user-sign-in"
            label="Can sign in"
            checked={form.can_sign_in}
            onChange={set('can_sign_in')}
            hint="Off: the person is only a name in pick-lists. On: they set their own password from the sign-in page."
          />
          <Tick
            id="user-active"
            label="Active"
            checked={form.is_active}
            onChange={set('is_active')}
            hint="Inactive people stay on old records but cannot sign in or be picked."
          />
        </div>

        {error && (
          <p className="alert alert--error form-wide" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
