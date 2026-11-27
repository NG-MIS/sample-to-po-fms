import { useMemo, useState } from 'react'
import DataTable from '../components/DataTable.jsx'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { friendlyError } from '../lib/format.js'
import {
  QTY_TYPES,
  accessoryLineColumns,
  accessoryPayload,
  accessoryValue,
  checkAccessoryLines,
  cleanAccessoryName,
  isNewAccessoryValue,
  newAccessoryLine,
  newAccessoryName,
  newAccessoryValue,
  toAccessoryLines,
} from '../lib/sampleAccessories.js'
import { callSampleAction } from '../lib/sampleData.js'

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase()
const numberOnly = (value) => value.replace(/[^\d.]/g, '').replace(/^\./, '0.')

// Editor for the accessory list of a sample: any number of lines, each with
// an accessory, how it is measured and how much, a vendor code, a rate and
// remarks. Used on the sample form and in the Accessories popup.
//   lines    - the lines being edited (see lib/sampleAccessories.js)
//   onChange - gets the new list of lines
//   lists    - the loaded sample data (accessories, accessory vendors)
//   saved    - the sample's saved lines, so an inactive accessory or vendor
//              that is already on the sample stays pickable
export function AccessoryLinesEditor({ lines, onChange, lists, saved = [], idPrefix = 'accessory' }) {
  const setLine = (key, changes) => onChange(lines.map((line) => (line.key === key ? { ...line, ...changes } : line)))

  const savedAccessoryIds = saved.map((line) => line.accessory_id)
  const savedVendorIds = saved.map((line) => line.vendor_id)
  const typedNames = [...new Set(lines.map((line) => line.new_accessory).filter(Boolean))]

  const accessoryOptions = [
    ...lists.accessories
      .filter((accessory) => accessory.is_active || savedAccessoryIds.includes(accessory.id))
      .map((accessory) => ({
        value: accessory.id,
        label: accessory.is_active ? accessory.name : `${accessory.name} (inactive)`,
      })),
    ...typedNames.map((name) => ({ value: newAccessoryValue(name), label: `${name} (new)` })),
  ].sort((a, b) => a.label.localeCompare(b.label))

  const vendorOptions = lists.accessoryVendors
    .filter((vendor) => vendor.is_active || savedVendorIds.includes(vendor.id))
    .map((vendor) => ({ value: vendor.id, label: vendor.is_active ? vendor.code : `${vendor.code} (inactive)` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const addLabel = (text) => {
    const name = cleanAccessoryName(text)
    if (!name || name.length > 80) return null
    const known =
      lists.accessories.some((accessory) => accessory.is_active && sameText(accessory.name, name)) ||
      typedNames.some((typed) => sameText(typed, name))
    return known ? null : `Add "${name}"`
  }

  return (
    <div className="fabric-editor">
      {lines.length === 0 && <p className="hint">No accessory added.</p>}
      {lines.map((line, index) => {
        const id = (part) => `${idPrefix}-${line.key}-${part}`
        return (
          <div key={line.key} className="fabric-line accessory-line" data-accessory-line={index + 1}>
            <div className="fabric-cell">
              <label className="field-label" htmlFor={id('name')}>
                Accessory name
              </label>
              <PickList
                id={id('name')}
                options={accessoryOptions}
                value={accessoryValue(line)}
                onChange={(value) =>
                  setLine(
                    line.key,
                    isNewAccessoryValue(value)
                      ? { accessory_id: null, new_accessory: newAccessoryName(value) }
                      : { accessory_id: value, new_accessory: '' },
                  )
                }
                onCreate={(text) => setLine(line.key, { accessory_id: null, new_accessory: cleanAccessoryName(text) })}
                createLabel={addLabel}
              />
            </div>
            <div className="fabric-cell">
              <label className="field-label" htmlFor={id('type')}>
                Qty type
              </label>
              <PickList
                id={id('type')}
                options={QTY_TYPES}
                value={line.qty_type}
                onChange={(value) =>
                  setLine(line.key, {
                    qty_type: value,
                    qty: value ? line.qty : '',
                    breadth: value === 'dimension' ? line.breadth : '',
                  })
                }
              />
            </div>
            <div className="fabric-cell">
              <label className="field-label" htmlFor={id('qty')}>
                {line.qty_type === 'quantity'
                  ? 'Qty (pcs)'
                  : line.qty_type === 'length'
                    ? 'Length (inch)'
                    : line.qty_type === 'dimension'
                      ? 'Length × breadth (inch)'
                      : 'Qty'}
              </label>
              <span className="qty-inputs">
                <input
                  id={id('qty')}
                  className="input"
                  inputMode="decimal"
                  disabled={!line.qty_type}
                  placeholder={line.qty_type ? '' : 'Pick the qty type'}
                  value={line.qty}
                  onChange={(event) => setLine(line.key, { qty: numberOnly(event.target.value) })}
                />
                {line.qty_type === 'dimension' && (
                  <>
                    <span aria-hidden="true">×</span>
                    <input
                      className="input"
                      inputMode="decimal"
                      aria-label="Breadth (inch)"
                      value={line.breadth}
                      onChange={(event) => setLine(line.key, { breadth: numberOnly(event.target.value) })}
                    />
                  </>
                )}
              </span>
            </div>
            <div className="fabric-cell">
              <label className="field-label" htmlFor={id('vendor')}>
                Vendor code
              </label>
              <PickList
                id={id('vendor')}
                options={vendorOptions}
                value={line.vendor_id}
                onChange={(value) => setLine(line.key, { vendor_id: value })}
                placeholder={vendorOptions.length ? 'Select…' : 'No accessory vendor in Masters'}
              />
            </div>
            <div className="fabric-cell">
              <label className="field-label" htmlFor={id('rate')}>
                Rate
              </label>
              <input
                id={id('rate')}
                className="input"
                inputMode="decimal"
                value={line.rate}
                onChange={(event) => setLine(line.key, { rate: numberOnly(event.target.value) })}
              />
            </div>
            <button
              type="button"
              className="btn btn--small fabric-remove"
              aria-label={`Remove accessory line ${index + 1}`}
              onClick={() => onChange(lines.filter((item) => item.key !== line.key))}
            >
              Remove
            </button>
            <div className="fabric-cell accessory-remarks">
              <label className="field-label" htmlFor={id('remarks')}>
                Remarks
              </label>
              <input
                id={id('remarks')}
                className="input"
                maxLength={500}
                value={line.remarks}
                onChange={(event) => setLine(line.key, { remarks: event.target.value })}
              />
            </div>
          </div>
        )
      })}
      <button type="button" className="btn" onClick={() => onChange([...lines, newAccessoryLine()])}>
        Add accessory
      </button>
    </div>
  )
}

export function AccessoryTable({ sample, lookups }) {
  const columns = useMemo(() => accessoryLineColumns(lookups), [lookups])
  return (
    <DataTable
      tableId="sample-accessory-lines"
      title={`${sample.sample_no} accessories`}
      columns={columns}
      rows={sample.accessories}
      emptyText="No accessory has been added yet."
    />
  )
}

// Popup to add or change the accessory list of a sample after it was created.
export function AccessoryDialog({ sample, data, onClose, onSaved }) {
  const initial = useMemo(() => {
    const lines = toAccessoryLines(sample)
    return lines.length ? lines : [newAccessoryLine()]
  }, [sample])
  const [lines, setLines] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dirty = JSON.stringify(accessoryPayload(lines)) !== JSON.stringify(accessoryPayload(toAccessoryLines(sample)))

  const save = async (event) => {
    event.preventDefault()
    const problem = checkAccessoryLines(lines)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      await callSampleAction('save_sample_accessories', { p_sample_id: sample.id, p_lines: accessoryPayload(lines) })
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Accessories of ${sample.sample_no}`}
      onClose={onClose}
      dirty={dirty}
      width={980}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="accessories-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save accessories'}
          </button>
        </>
      )}
    >
      <form id="accessories-form" onSubmit={save} noValidate>
        <p className="hint fabric-intro">
          Only the accessory name is needed on a line. Qty, vendor code, rate and remarks can be filled in later.
        </p>
        <AccessoryLinesEditor
          lines={lines}
          onChange={setLines}
          lists={data}
          saved={sample.accessories}
          idPrefix="accessory-dialog"
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
