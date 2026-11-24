import { useMemo, useRef, useState } from 'react'
import DataTable from './DataTable.jsx'
import Modal from './Modal.jsx'
import { downloadTemplate, readTable } from '../lib/exportFiles.js'
import { friendlyError } from '../lib/format.js'

// Import for masters: download a template, fill it in, choose the file, check
// the preview, then import. Import only ADDS rows. Rows that already exist are
// skipped and reported; nothing existing is changed.
//
//   title        - e.g. "Import departments"
//   templateTitle- name of the template file, e.g. "Departments"
//   fields       - [{ header, required, hint }] the columns of the file
//   prepare(cells, memo) - checks one row. `cells` is { HEADER: 'text' }. `memo` is an
//                  empty object shared by all rows of one file (for spotting repeats).
//                  Gives back { record } when the row is good, { skip: 'why' } when it
//                  already exists, or { error: 'what is wrong' }.
//   saveRecord(record) - saves one good row
//   onDone()     - called after importing, to refresh the list

const STATUS_TEXT = {
  ready: 'Ready',
  skip: 'Already exists',
  problem: 'Problem',
  imported: 'Imported',
  failed: 'Failed',
}

export default function ImportButton(props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Import
      </button>
      {open && <ImportDialog {...props} onClose={() => setOpen(false)} />}
    </>
  )
}

function ImportDialog({ title, templateTitle, fields, prepare, saveRecord, onDone, onClose }) {
  const fileRef = useRef(null)
  const [stage, setStage] = useState('choose') // choose | preview | saving | done
  const [fileName, setFileName] = useState('')
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [savedCount, setSavedCount] = useState(0)

  const count = (status) => items.filter((item) => item.status === status).length
  const readyCount = count('ready')

  const chooseFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      const { headers, rows } = await readTable(file)
      const missing = fields.filter((field) => field.required && !headers.includes(field.header))
      if (missing.length) {
        throw new Error(
          `The file is missing ${missing.length === 1 ? 'this column' : 'these columns'}: ${missing
            .map((field) => field.header)
            .join(', ')}. Download the template to see the expected columns.`,
        )
      }
      if (rows.length === 0) throw new Error('The file has headings but no rows to import.')
      const memo = {}
      setItems(
        rows.map((row) => {
          const result = prepare(row.cells, memo)
          return {
            line: row.line,
            cells: row.cells,
            record: result.record,
            status: result.error ? 'problem' : result.skip ? 'skip' : 'ready',
            note: result.error || result.skip || '',
          }
        }),
      )
      setFileName(file.name)
      setStage('preview')
    } catch (failure) {
      setError(friendlyError(failure))
    }
  }

  const runImport = async () => {
    setStage('saving')
    setSavedCount(0)
    const next = [...items]
    for (let index = 0; index < next.length; index += 1) {
      if (next[index].status !== 'ready') continue
      try {
        await saveRecord(next[index].record)
        next[index] = { ...next[index], status: 'imported', note: '' }
      } catch (failure) {
        next[index] = { ...next[index], status: 'failed', note: friendlyError(failure) }
      }
      setSavedCount((value) => value + 1)
    }
    setItems(next)
    setStage('done')
    onDone()
  }

  const columns = useMemo(
    () => [
      { key: 'line', header: 'FILE ROW', value: (item) => item.line, width: 100 },
      {
        key: 'status',
        header: 'RESULT',
        value: (item) => STATUS_TEXT[item.status],
        render: (item) => <span className={`badge badge--${item.status}`}>{STATUS_TEXT[item.status]}</span>,
      },
      { key: 'note', header: 'NOTE', value: (item) => item.note },
      ...fields.map((field) => ({
        key: `field:${field.header}`,
        header: field.header,
        value: (item) => item.cells[field.header] ?? '',
      })),
    ],
    [fields],
  )

  const summary = [
    [count('ready'), 'ready to import'],
    [count('imported'), 'imported'],
    [count('skip'), 'already exist (skipped)'],
    [count('problem'), count('problem') === 1 ? 'has a problem' : 'have problems'],
    [count('failed'), 'failed'],
  ]
    .filter(([number]) => number > 0)
    .map(([number, label]) => `${number} ${label}`)
    .join(', ')

  return (
    <Modal
      title={title}
      onClose={onClose}
      dirty={stage === 'saving' || (stage === 'preview' && readyCount > 0)}
      width={stage === 'choose' ? 560 : 980}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" disabled={stage === 'saving'} onClick={requestClose}>
            {stage === 'done' ? 'Close' : 'Cancel'}
          </button>
          {(stage === 'preview' || stage === 'done') && (
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Choose another file
            </button>
          )}
          {(stage === 'preview' || stage === 'saving') && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={stage === 'saving' || readyCount === 0}
              onClick={runImport}
            >
              {stage === 'saving'
                ? `Importing ${savedCount} of ${savedCount + readyCount}…`
                : `Import ${readyCount} ${readyCount === 1 ? 'row' : 'rows'}`}
            </button>
          )}
        </>
      )}
    >
      <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" hidden onChange={chooseFile} />

      {stage === 'choose' && (
        <ol className="import-steps">
          <li>
            <strong>Download the template.</strong> It has the right column headings and a sheet explaining each one.
            <div>
              <button type="button" className="btn" onClick={() => downloadTemplate(templateTitle, fields)}>
                Download template
              </button>
            </div>
          </li>
          <li>
            <strong>Fill it in,</strong> one row per item. Keep the headings as they are.
          </li>
          <li>
            <strong>Choose the filled file.</strong> Excel (.xlsx) or CSV. You will see a check of every row before
            anything is saved.
            <div>
              <button type="button" className="btn btn--primary" onClick={() => fileRef.current?.click()}>
                Choose file
              </button>
            </div>
          </li>
        </ol>
      )}

      {stage !== 'choose' && (
        <>
          <p className="import-summary" role="status">
            <strong>{fileName}</strong>: {items.length} {items.length === 1 ? 'row' : 'rows'} read. {summary}.
          </p>
          {stage === 'preview' && count('problem') > 0 && (
            <p className="hint import-hint">
              Rows with a problem will not be imported. Fix them in the file and choose it again, or import the ready
              rows now.
            </p>
          )}
          <DataTable columns={columns} rows={items} rowKey="line" title={`${title} check`} />
        </>
      )}

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">Import only adds new rows. It never changes or removes what is already there.</p>
    </Modal>
  )
}
