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
import { supabase } from '../lib/supabase.js'

const IMPORT_FIELDS = [
  { header: 'SIZE', required: true, hint: 'For example 22-38.' },
  { header: 'RATIO', required: false, hint: 'Two numbers with a colon, for example 1:1. Leave empty for a size that is not made in ratios.' },
  { header: 'PCS IN A SET', required: true, hint: 'A whole number, 1 or more.' },
  { header: 'ACTIVE', required: false, hint: 'Yes or No. Empty means Yes.' },
]

const RATIO = /^\d{1,2}:\d{1,2}$/
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Says why a size + ratio cannot be saved next to the rows already there, or ''.
function clash(rows, size, ratio, ownId) {
  const others = rows.filter((row) => row.id !== ownId && same(row.size, size))
  if (others.some((row) => (row.ratio ?? '') === (ratio ?? ''))) {
    return ratio ? `Size ${size} with ratio ${ratio} is already in the list.` : `Size ${size} is already in the list.`
  }
  if (others.some((row) => Boolean(row.ratio) !== Boolean(ratio))) {
    return ratio
      ? `Size ${size} is already in the list without a ratio. A size is either made in ratios or not.`
      : `Size ${size} is already in the list with ratios. A size is either made in ratios or not.`
  }
  return ''
}

// Sizes and ratios master: every size a sample can go to the wishlist in, and
// for a size that is made in ratios, every ratio allowed for it.
export default function SizeRatiosPage() {
  const { isAdmin } = useAuth()
  const { data, loading, error, reload } = useLoad(async () => {
    const [rows, people] = await Promise.all([fetchRows('size_ratios'), fetchRows('app_users')])
    return { rows, people: nameMap(people) }
  })
  const [editing, setEditing] = useState(null)

  const rows = useMemo(() => data?.rows ?? [], [data])
  const people = data?.people

  const prepareImport = (cells, memo) => {
    const size = cells.SIZE
    if (!size) return { error: 'SIZE is empty.' }
    const ratio = cells.RATIO || null
    if (ratio && !RATIO.test(ratio)) return { error: 'RATIO must be two numbers with a colon, for example 1:1.' }
    if (!/^\d+$/.test(cells['PCS IN A SET']) || Number(cells['PCS IN A SET']) < 1) {
      return { error: 'PCS IN A SET must be a whole number, 1 or more.' }
    }
    const isActive = readYesNo(cells.ACTIVE, true)
    if (isActive === null) return { error: 'ACTIVE must be Yes or No.' }
    memo.rows ??= []
    const problem = clash([...rows, ...memo.rows], size, ratio, null)
    if (problem) return rows.some((row) => same(row.size, size) && (row.ratio ?? '') === (ratio ?? '')) ? { skip: 'Already in the list.' } : { error: problem }
    memo.rows.push({ id: `file-${memo.rows.length}`, size, ratio })
    return { record: { size, ratio, pieces_per_set: Number(cells['PCS IN A SET']), is_active: isActive } }
  }

  const saveImported = async (record) => {
    const { error: failure } = await supabase.from('size_ratios').insert(record)
    if (failure) throw failure
  }

  const columns = useMemo(() => {
    const list = [
      { key: 'sl_no', header: 'SL NO', value: (row) => row.sl_no },
      { key: 'size', header: 'SIZE', value: (row) => row.size },
      { key: 'ratio', header: 'RATIO', value: (row) => row.ratio ?? '' },
      { key: 'pieces', header: 'PCS IN A SET', align: 'right', value: (row) => row.pieces_per_set },
      {
        key: 'status',
        header: 'STATUS',
        value: (row) => (row.is_active ? 'Active' : 'Inactive'),
        render: (row) => <Badge on={row.is_active} />,
      },
      { key: 'entered_by', header: 'ENTERED BY', value: (row) => people?.get(row.created_by) ?? '' },
      {
        key: 'created_at',
        header: 'TIMESTAMP',
        value: (row) => formatDateTime(row.created_at),
        sortValue: (row) => row.created_at,
      },
    ]
    if (isAdmin) {
      list.push({
        key: 'actions',
        header: '',
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
        title="Sizes and ratios"
        note={
          isAdmin
            ? 'One row per size a sample can go to the wishlist in. A size made in ratios has one row per ratio; the ratio is then asked on the wishlist, starting at 1:1.'
            : 'Only people with authority All can add or change this list.'
        }
      />
      {error && (
        <p className="alert alert--error" role="alert">
          {friendlyError(error)}
        </p>
      )}
      <DataTable
        tableId="size-ratios"
        onRowClick={isAdmin ? setEditing : undefined}
        title="Sizes and ratios"
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="No size has been added yet."
        toolbar={
          isAdmin && (
            <div className="toolbar-actions">
              <ImportButton
                title="Import sizes and ratios"
                templateTitle="Sizes and ratios"
                fields={IMPORT_FIELDS}
                prepare={prepareImport}
                saveRecord={saveImported}
                onDone={reload}
              />
              <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
                Add size
              </button>
            </div>
          )
        }
      />
      {editing && (
        <SizeRatioForm
          row={editing}
          rows={rows}
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

function SizeRatioForm({ row, rows, onClose, onSaved }) {
  const isNew = !row.id
  const [size, setSize] = useState(row.size ?? '')
  const [ratio, setRatio] = useState(row.ratio ?? '')
  const [pieces, setPieces] = useState(row.pieces_per_set ? String(row.pieces_per_set) : '')
  const [isActive, setIsActive] = useState(row.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dirty =
    size !== (row.size ?? '') ||
    ratio !== (row.ratio ?? '') ||
    pieces !== (row.pieces_per_set ? String(row.pieces_per_set) : '') ||
    isActive !== (row.is_active ?? true)

  const save = async (event) => {
    event.preventDefault()
    const cleanSize = size.trim()
    const cleanRatio = ratio.trim() || null
    if (!cleanSize) return setError('Size is required.')
    if (cleanRatio && !RATIO.test(cleanRatio)) return setError('Ratio must be two numbers with a colon, for example 1:1.')
    if (!/^\d+$/.test(pieces) || Number(pieces) < 1) return setError('Pcs in a set must be a whole number, 1 or more.')
    const problem = clash(rows, cleanSize, cleanRatio, row.id)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    const values = { size: cleanSize, ratio: cleanRatio, pieces_per_set: Number(pieces), is_active: isActive }
    const { error: failure } = isNew
      ? await supabase.from('size_ratios').insert(values)
      : await supabase.from('size_ratios').update(values).eq('id', row.id)
    setBusy(false)
    if (failure) setError(friendlyError(failure))
    else onSaved()
  }

  return (
    <Modal
      title={isNew ? 'Add size' : `Edit size ${row.size}${row.ratio ? ` ${row.ratio}` : ''}`}
      onClose={onClose}
      dirty={dirty}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="size-ratio-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="size-ratio-form" onSubmit={save} noValidate>
        <Field label="Size" htmlFor="size-ratio-size" required hint="For example 22-38.">
          <input id="size-ratio-size" className="input" data-autofocus value={size} onChange={(event) => setSize(event.target.value)} />
        </Field>
        <Field
          label="Ratio"
          htmlFor="size-ratio-ratio"
          hint="Only for a size that is made in ratios, for example 1:1. Leave empty otherwise. For another ratio of the same size, add one more row."
        >
          <input
            id="size-ratio-ratio"
            className="input"
            value={ratio}
            onChange={(event) => setRatio(event.target.value.replace(/[^\d:]/g, ''))}
          />
        </Field>
        <Field label="Pcs in a set" htmlFor="size-ratio-pieces" required hint="How many pieces one set of this size and ratio has.">
          <input
            id="size-ratio-pieces"
            className="input"
            inputMode="numeric"
            value={pieces}
            onChange={(event) => setPieces(event.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Tick
          id="size-ratio-active"
          label="Active"
          hint="An inactive size or ratio no longer appears when adding to the wishlist."
          checked={isActive}
          onChange={setIsActive}
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
