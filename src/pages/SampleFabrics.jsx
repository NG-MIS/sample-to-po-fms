import { useMemo, useState } from 'react'
import { numberTyped } from '../lib/calc.js'
import DataTable from '../components/DataTable.jsx'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { friendlyError } from '../lib/format.js'
import { callSampleAction } from '../lib/sampleData.js'
import {
  checkFabricLines,
  cleanFabricName,
  fabricLineColumns,
  fabricPayload,
  fabricValue,
  isNewFabricValue,
  newFabricLine,
  newFabricName,
  newFabricValue,
  toFabricLines,
} from '../lib/sampleFabrics.js'

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase()

// Editor for the fabric list of a sample: any number of lines, each with a
// fabric, the components it is for, a vendor code and a rate. Used on the
// sample form and in the Fabrics popup.
//   lines            - the lines being edited (see lib/sampleFabrics.js)
//   onChange         - gets the new list of lines
//   lists            - the loaded sample data (fabrics, fabric vendors)
//   componentOptions - the components of this sample: [{ value, label }]
//   saved            - the sample's saved fabric lines, so an inactive fabric or
//                      vendor that is already on the sample stays pickable
export function FabricLinesEditor({ lines, onChange, lists, componentOptions, saved = [], idPrefix = 'fabric' }) {
  const setLine = (key, changes) => onChange(lines.map((line) => (line.key === key ? { ...line, ...changes } : line)))

  const savedFabricIds = saved.map((line) => line.fabric_id)
  const savedVendorIds = saved.map((line) => line.vendor_id)
  const typedNames = [...new Set(lines.map((line) => line.new_fabric).filter(Boolean))]

  const fabricOptions = [
    ...lists.fabrics
      .filter((fabric) => fabric.is_active || savedFabricIds.includes(fabric.id))
      .map((fabric) => ({ value: fabric.id, label: fabric.is_active ? fabric.name : `${fabric.name} (inactive)` })),
    ...typedNames.map((name) => ({ value: newFabricValue(name), label: `${name} (new)` })),
  ].sort((a, b) => a.label.localeCompare(b.label))

  const vendorOptions = lists.fabricVendors
    .filter((vendor) => vendor.is_active || savedVendorIds.includes(vendor.id))
    .map((vendor) => ({ value: vendor.id, label: vendor.is_active ? vendor.code : `${vendor.code} (inactive)` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const addLabel = (text) => {
    const name = cleanFabricName(text)
    if (!name || name.length > 80) return null
    const known =
      lists.fabrics.some((fabric) => fabric.is_active && sameText(fabric.name, name)) ||
      typedNames.some((typed) => sameText(typed, name))
    return known ? null : `Add "${name}"`
  }

  return (
    <div className="fabric-editor">
      {lines.length === 0 && <p className="hint">No fabric added.</p>}
      {lines.map((line, index) => (
        <div key={line.key} className="fabric-line" data-fabric-line={index + 1}>
          <div className="fabric-cell">
            <label className="field-label" htmlFor={`${idPrefix}-${line.key}-name`}>
              Fabric name
            </label>
            <PickList
              id={`${idPrefix}-${line.key}-name`}
              options={fabricOptions}
              value={fabricValue(line)}
              onChange={(value) =>
                setLine(
                  line.key,
                  isNewFabricValue(value)
                    ? { fabric_id: null, new_fabric: newFabricName(value) }
                    : { fabric_id: value, new_fabric: '' },
                )
              }
              onCreate={(text) => setLine(line.key, { fabric_id: null, new_fabric: cleanFabricName(text) })}
              createLabel={addLabel}
            />
          </div>
          <div className="fabric-cell">
            <label className="field-label" htmlFor={`${idPrefix}-${line.key}-components`}>
              For components
            </label>
            <PickList
              id={`${idPrefix}-${line.key}-components`}
              multiple
              options={componentOptions}
              value={line.component_ids}
              onChange={(value) => setLine(line.key, { component_ids: value })}
              disabled={componentOptions.length === 0}
              placeholder={componentOptions.length ? 'Select…' : 'Pick the sample’s components first'}
            />
          </div>
          <div className="fabric-cell">
            <label className="field-label" htmlFor={`${idPrefix}-${line.key}-vendor`}>
              Vendor code
            </label>
            <PickList
              id={`${idPrefix}-${line.key}-vendor`}
              options={vendorOptions}
              value={line.vendor_id}
              onChange={(value) => setLine(line.key, { vendor_id: value })}
              placeholder={vendorOptions.length ? 'Select…' : 'No fabric vendor in Masters'}
            />
          </div>
          <div className="fabric-cell">
            <label className="field-label" htmlFor={`${idPrefix}-${line.key}-rate`}>
              Rate
            </label>
            <input
              id={`${idPrefix}-${line.key}-rate`}
              className="input"
              inputMode="decimal"
              value={line.rate}
              onChange={(event) => setLine(line.key, { rate: numberTyped(event.target.value) })}
            />
          </div>
          <button
            type="button"
            className="btn btn--small fabric-remove"
            aria-label={`Remove fabric line ${index + 1}`}
            onClick={() => onChange(lines.filter((item) => item.key !== line.key))}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn" onClick={() => onChange([...lines, newFabricLine()])}>
        Add fabric
      </button>
    </div>
  )
}

export function FabricTable({ sample, lookups }) {
  const columns = useMemo(() => fabricLineColumns(lookups), [lookups])
  return (
    <DataTable
      tableId="sample-fabric-lines"
      title={`${sample.sample_no} fabrics`}
      columns={columns}
      rows={sample.fabrics}
      emptyText="No fabric has been added yet."
    />
  )
}

// Popup to add or change the fabric list of a sample after it was created.
export function FabricDialog({ sample, data, onClose, onSaved }) {
  const initial = useMemo(() => {
    const lines = toFabricLines(sample)
    return lines.length ? lines : [newFabricLine()]
  }, [sample])
  const [lines, setLines] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const componentOptions = data.components
    .filter((component) => sample.component_ids.includes(component.id))
    .map((component) => ({ value: component.id, label: component.name }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const dirty = JSON.stringify(fabricPayload(lines)) !== JSON.stringify(fabricPayload(toFabricLines(sample)))

  const save = async (event) => {
    event.preventDefault()
    const problem = checkFabricLines(lines)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      await callSampleAction('save_sample_fabrics', { p_sample_id: sample.id, p_lines: fabricPayload(lines) })
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Fabrics of ${sample.sample_no}`}
      onClose={onClose}
      dirty={dirty}
      width={860}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="fabrics-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save fabrics'}
          </button>
        </>
      )}
    >
      <form id="fabrics-form" onSubmit={save} noValidate>
        <p className="hint fabric-intro">
          Only the fabric name is needed on a line. Components, vendor code and rate can be filled in later.
        </p>
        <FabricLinesEditor
          lines={lines}
          onChange={setLines}
          lists={data}
          componentOptions={componentOptions}
          saved={sample.fabrics}
          idPrefix="fabric-dialog"
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
