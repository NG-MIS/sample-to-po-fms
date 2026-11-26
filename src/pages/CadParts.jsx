import { useMemo, useState } from 'react'
import ClickableImage from '../components/ClickableImage.jsx'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { Tick } from '../components/Field.jsx'
import {
  FABRIC_TYPES,
  COLOUR_FOLLOWS,
  FABRIC_TYPE_LABEL,
  colourText,
  addLabelFor,
  cadFabricPayload,
  cadRowPayload,
  cadsForEntry,
  cadsOfEntry,
  checkCadFabricRows,
  checkCadRows,
  checkPrimaryLines,
  cleanName,
  formatPrimaryQty,
  groupSizes,
  isTypedValue,
  namedOptions,
  newCadRow,
  newPrimaryLine,
  pickValue,
  primaryLinesFor,
  primaryPayload,
  rowsWithoutFabric,
  setGroupEnd,
  sizeLabel,
  sizeSpan,
  toCadFabricRows,
  toCadRows,
  toPrimaryLines,
  typedName,
} from '../lib/cad.js'
import { friendlyError } from '../lib/format.js'
import { QTY_TYPES, QTY_TYPE_LABEL } from '../lib/sampleAccessories.js'
import { BUCKET, callSampleAction, latestImage } from '../lib/sampleData.js'
import { defaultCombination, ratioOptions, sizeOptions } from '../lib/wishlist.js'

const numberOnly = (value) => value.replace(/[^\d.]/g, '')
const digitsOnly = (value) => value.replace(/\D/g, '')
const formatNumber = (value) => (value === null || value === undefined ? '' : String(Number(value)))
const componentName = (data, id) => data.components.find((component) => component.id === id)?.name ?? ''
const formatRate = (value) => (value === null || value === undefined ? '' : Number(value).toFixed(2))

// ---------- One CAD, shown as a table like the CAD sheet ----------

export function CadCard({ cad, sample, data, lookups, canCad, canFabric, onEdit, onCopy, onAssign, onFabric, onPrimary }) {
  const combination = lookups.combination.get(cad.size_ratio_id)
  const image = latestImage(sample)
  const primary = primaryLinesFor(sample, cad.size_ratio_id)
  const assigned = sample.wishlist.filter((entry) => cad.wishlist_ids.includes(entry.id))
  const missing = rowsWithoutFabric(cad).length

  return (
    <section className="cad-card" data-cad={cad.cad_no} aria-label={`CAD ${cad.cad_no}`}>
      <div className="cad-card-head">
        <h3 className="cad-no">{cad.cad_no}</h3>
        <span className="tag-list">
          {assigned.length === 0 && <span className="badge badge--pending">Not assigned to the wishlist</span>}
          {assigned.map((entry) => (
            <span key={entry.id} className="tag-chip">
              {entry.wishlist_no}
            </span>
          ))}
        </span>
        <span className="row-actions">
          {canFabric && (
            <button type="button" className={`btn btn--small ${missing ? 'btn--primary' : ''}`} onClick={() => onFabric(cad, sample)}>
              {missing ? 'Fill fabric' : 'Change fabric'}
            </button>
          )}
          {canCad && (
            <>
              <button type="button" className="btn btn--small" onClick={() => onAssign(cad, sample)}>
                Assign to wishlist
              </button>
              <button type="button" className="btn btn--small" onClick={() => onCopy(cad, sample)}>
                Copy as new CAD
              </button>
              <button type="button" className="btn btn--small" onClick={() => onEdit(cad, sample)}>
                Edit
              </button>
            </>
          )}
        </span>
      </div>
      <div className="cad-sheet">
        <div className="cad-picture">
          {image ? (
            <ClickableImage bucket={BUCKET} path={image.path} alt={`${sample.sample_no} ${image.label.toLowerCase()} image`} size={120} />
          ) : (
            <span className="hint">No picture</span>
          )}
        </div>
        <div className="cad-tables">
          <table className="cad-table cad-table--head">
            <thead>
              <tr>
                <th>SAMPLE NUMBER</th>
                <th>DESIGN NUMBER</th>
                <th>SIZE</th>
                <th>RATIO</th>
                <th>NO. OF DRAWING</th>
                <th>PRIMARY ACCESSORY</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{sample.sample_no}</td>
                <td>{sample.design_no ?? <span className="hint">Not given yet</span>}</td>
                <td>{combination?.size}</td>
                <td>{combination?.ratio ?? <span className="hint">Not applicable</span>}</td>
                <td>{cad.rows.length}</td>
                <td>
                  <button type="button" className="btn btn--small" onClick={() => onPrimary(sample, cad.size_ratio_id)}>
                    {primary.length ? `View (${primary.length})` : canCad ? 'Assign' : 'Not added yet'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <table className="cad-table">
            <thead>
              <tr>
                <th>PARTICULARS</th>
                <th>FABRIC TYPE</th>
                <th>MSRMNT</th>
                <th>PAINA</th>
                <th>NO. OF PCS IN LAYER</th>
                <th>NO OF PANELS</th>
                <th>COMPONENTS</th>
                <th>EFFICIENCY</th>
                <th>FABRIC</th>
                <th>VENDOR</th>
                <th>RATE</th>
              </tr>
            </thead>
            <tbody>
              {cad.rows.map((row) => (
                <tr key={row.id}>
                  <td>{lookups.particular.get(row.particular_id)}</td>
                  <td>{FABRIC_TYPE_LABEL[row.fabric_type]}</td>
                  <td>{formatNumber(row.msrmnt)}</td>
                  <td>{formatNumber(row.paina)}</td>
                  <td>{formatNumber(row.pcs_in_layer)}</td>
                  <td>{formatNumber(row.panels)}</td>
                  <td>{(row.component_ids ?? []).map((id) => componentName(data, id)).join(', ')}</td>
                  <td>{row.efficiency === null || row.efficiency === undefined ? '' : `${formatNumber(row.efficiency)}%`}</td>
                  <td>{lookups.fabric.get(row.fabric_id) ?? <span className="badge badge--pending">Pending</span>}</td>
                  <td>{data.fabricVendors.find((vendor) => vendor.id === row.vendor_id)?.code}</td>
                  <td>{formatRate(row.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

// ---------- The drawing rows of one CAD, as an editable table ----------

//   components - the components of the sample: [{ value, label }]
function CadRowsEditor({ rows, onChange, particulars, typedNames, idPrefix, components }) {
  const setRow = (key, changes) => onChange(rows.map((row) => (row.key === key ? { ...row, ...changes } : row)))
  const usedIds = rows.map((row) => row.particular_id).filter(Boolean)
  const options = namedOptions(particulars, usedIds, typedNames)
  const addLabel = addLabelFor(particulars, typedNames)

  return (
    <div className="cad-edit">
      <table className="cad-table cad-table--edit">
        <thead>
          <tr>
            <th>PARTICULARS *</th>
            <th>FABRIC TYPE *</th>
            <th>MSRMNT</th>
            <th>PAINA</th>
            <th>NO. OF PCS IN LAYER</th>
            <th>NO OF PANELS</th>
            <th>COMPONENTS *</th>
            <th>EFFICIENCY %</th>
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key} data-cad-row={index + 1}>
              <td data-label="Particulars">
                <PickList
                  id={`${idPrefix}-${row.key}-particular`}
                  options={options}
                  value={pickValue(row.particular_id, row.new_particular)}
                  onChange={(value) =>
                    setRow(
                      row.key,
                      isTypedValue(value)
                        ? { particular_id: null, new_particular: typedName(value) }
                        : { particular_id: value, new_particular: '' },
                    )
                  }
                  onCreate={(typed) => setRow(row.key, { particular_id: null, new_particular: cleanName(typed) })}
                  createLabel={addLabel}
                />
              </td>
              <td data-label="Fabric type">
                <PickList
                  id={`${idPrefix}-${row.key}-type`}
                  options={FABRIC_TYPES}
                  value={row.fabric_type}
                  clearable={false}
                  onChange={(value) => setRow(row.key, { fabric_type: value })}
                />
              </td>
              <td data-label="Msrmnt">
                <input className="input" inputMode="decimal" aria-label={`Msrmnt, row ${index + 1}`} value={row.msrmnt} onChange={(event) => setRow(row.key, { msrmnt: numberOnly(event.target.value) })} />
              </td>
              <td data-label="Paina">
                <input className="input" inputMode="decimal" aria-label={`Paina, row ${index + 1}`} value={row.paina} onChange={(event) => setRow(row.key, { paina: numberOnly(event.target.value) })} />
              </td>
              <td data-label="No. of pcs in layer">
                <input className="input" inputMode="numeric" aria-label={`No. of pcs in layer, row ${index + 1}`} value={row.pcs_in_layer} onChange={(event) => setRow(row.key, { pcs_in_layer: digitsOnly(event.target.value) })} />
              </td>
              <td data-label="No of panels">
                <input className="input" inputMode="numeric" aria-label={`No of panels, row ${index + 1}`} value={row.panels} onChange={(event) => setRow(row.key, { panels: digitsOnly(event.target.value) })} />
              </td>
              <td data-label="Components">
                <PickList
                  id={`${idPrefix}-${row.key}-components`}
                  multiple
                  options={components}
                  value={row.component_ids}
                  onChange={(value) => setRow(row.key, { component_ids: value })}
                  placeholder={components.length === 0 ? 'Choose the sample first' : components.length === 1 ? components[0].label : 'Select…'}
                  disabled={components.length === 0}
                />
              </td>
              <td data-label="Efficiency %">
                <input className="input" inputMode="decimal" aria-label={`Efficiency, row ${index + 1}`} value={row.efficiency} onChange={(event) => setRow(row.key, { efficiency: numberOnly(event.target.value) })} />
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn--small"
                  aria-label={`Remove drawing row ${index + 1}`}
                  onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn--small" onClick={() => onChange([...rows, newCadRow()])}>
        Add drawing row
      </button>
    </div>
  )
}

let tableCounter = 0
// A new table starts with 5 empty rows; the ones left empty are dropped when it is saved.
const blankRows = () => Array.from({ length: 5 }, newCadRow)
const newTable = (changes = {}) => ({ key: `table-${++tableCounter}`, id: null, size: null, size_ratio_id: null, rows: blankRows(), ...changes })

// ---------- New CAD (one or several tables at once), or edit one CAD ----------
//   cad    - the CAD being edited, or null for new
//   start  - for a new CAD: { sample, sizeRatioId, copyFrom } to begin from
export function CadForm({ cad, start, data, onClose, onSaved, onPrimary }) {
  const isNew = !cad
  const combinationOf = (id) => data.sizeRatios.find((row) => row.id === id)
  const approved = useMemo(
    () => data.samples.filter((sample) => sample.approvals.final?.decision === 'yes'),
    [data],
  )
  const [sampleId, setSampleId] = useState(cad?.sample_id ?? start?.sample?.id ?? null)
  const sample = data.samples.find((item) => item.id === sampleId)
  const sampleComponentIds = useMemo(() => sample?.component_ids ?? [], [sample])
  const componentOptions = sampleComponentIds
    .map((id) => ({ value: id, label: componentName(data, id) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const picture = sample ? latestImage(sample) : null

  const initial = useMemo(() => {
    if (cad) {
      return [newTable({ id: cad.id, size: combinationOf(cad.size_ratio_id)?.size ?? null, size_ratio_id: cad.size_ratio_id, rows: toCadRows(cad) })]
    }
    const from = start?.copyFrom
    const sizeRatioId = from?.size_ratio_id ?? start?.sizeRatioId ?? null
    return [
      newTable({
        size: combinationOf(sizeRatioId)?.size ?? null,
        size_ratio_id: sizeRatioId,
        rows: from ? toCadRows(from, false) : blankRows(),
      }),
    ]
    // The form starts from what it was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [tables, setTables] = useState(initial)
  const [savedKeys, setSavedKeys] = useState([]) // tables already saved, when a later one failed
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const setTable = (key, changes) => setTables((previous) => previous.map((table) => (table.key === key ? { ...table, ...changes } : table)))
  const typedNames = [...new Set(tables.flatMap((table) => table.rows.map((row) => row.new_particular)).filter(Boolean))]
  const snapshot = (list) => JSON.stringify(list.map((table) => [table.size_ratio_id, cadRowPayload(table.rows)]))
  // Components belong to a sample, so another sample starts with none picked.
  const changeSample = (id) => {
    setSampleId(id)
    setTables((previous) => previous.map((table) => ({ ...table, rows: table.rows.map((row) => ({ ...row, component_ids: [] })) })))
  }
  const dirty = sampleId !== (cad?.sample_id ?? start?.sample?.id ?? null) || snapshot(tables) !== snapshot(initial)
  const sampleOptions = approved
    .map((item) => ({ value: item.id, label: item.design_no ? `${item.sample_no} · design ${item.design_no}` : item.sample_no }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const save = async (event) => {
    event.preventDefault()
    if (!sampleId) return setError('Choose the sample.')
    for (const [index, table] of tables.entries()) {
      const name = tables.length > 1 ? `CAD ${index + 1}: ` : ''
      if (!table.size_ratio_id) return setError(`${name}Choose the size, and the ratio when the size has ratios.`)
      const problem = checkCadRows(table.rows, sampleComponentIds)
      if (problem) return setError(name + problem)
    }
    setBusy(true)
    setError('')
    const done = [...savedKeys]
    const numbers = []
    try {
      for (const table of tables) {
        if (done.includes(table.key)) continue
        const number = await callSampleAction('save_cad', {
          p_id: table.id,
          p_sample_id: sampleId,
          p_size_ratio_id: table.size_ratio_id,
          p_rows: cadRowPayload(table.rows, sampleComponentIds),
        })
        numbers.push(number)
        done.push(table.key)
      }
      await onSaved(numbers)
    } catch (failure) {
      setSavedKeys(done)
      setError(
        (numbers.length ? `Saved ${numbers.join(', ')}. The next one was not saved: ` : '') + friendlyError(failure),
      )
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isNew ? 'New CAD' : `Edit ${cad.cad_no}`}
      onClose={onClose}
      dirty={dirty}
      width={1100}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="cad-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : tables.length > 1 ? `Save ${tables.length} CADs` : 'Save CAD'}
          </button>
        </>
      )}
    >
      <form id="cad-form" onSubmit={save} noValidate>
        <div className="field cad-sample-field">
          <label className="field-label" htmlFor="cad-sample">
            Sample<span className="field-required"> *</span>
          </label>
          <PickList
            id="cad-sample"
            options={isNew ? sampleOptions : [{ value: sample.id, label: sample.sample_no }]}
            value={sampleId}
            clearable={false}
            disabled={!isNew}
            onChange={changeSample}
            placeholder={sampleOptions.length ? 'Select…' : 'No sample has its final approval yet'}
          />
          {isNew && <p className="hint">Only samples whose final approval is Yes are listed.</p>}
        </div>
        {sample && (
          <div className="cad-form-picture" data-cad-picture>
            {picture ? (
              <ClickableImage bucket={BUCKET} path={picture.path} alt={`${sample.sample_no} ${picture.label.toLowerCase()} image`} size={110} />
            ) : (
              <span className="hint">No picture</span>
            )}
            <span className="hint">
              {sample.sample_no}
              {picture ? `, ${picture.label.toLowerCase()} image` : ''}
            </span>
          </div>
        )}

        {tables.map((table, index) => {
          const ratios = table.size ? ratioOptions(data.sizeRatios, table.size, table.size_ratio_id) : []
          const locked = Boolean(cad) && cad.wishlist_ids.length > 0
          const primary = sample && table.size_ratio_id ? primaryLinesFor(sample, table.size_ratio_id) : null
          const others = sample ? sample.cads.filter((item) => item.id !== table.id) : []
          const saved = savedKeys.includes(table.key)
          return (
            <fieldset key={table.key} className="cad-form-table" data-cad-table={index + 1} disabled={saved}>
              <legend>
                {isNew ? `CAD ${index + 1}` : cad.cad_no}
                {saved && ' (saved)'}
              </legend>
              <div className="cad-form-top">
                <div className="field">
                  <label className="field-label" htmlFor={`cad-${table.key}-size`}>
                    Size<span className="field-required"> *</span>
                  </label>
                  <PickList
                    id={`cad-${table.key}-size`}
                    options={sizeOptions(data.sizeRatios, table.size_ratio_id)}
                    value={table.size}
                    clearable={false}
                    disabled={locked}
                    onChange={(size) => setTable(table.key, { size, size_ratio_id: defaultCombination(data.sizeRatios, size) })}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`cad-${table.key}-ratio`}>
                    Ratio
                  </label>
                  <PickList
                    id={`cad-${table.key}-ratio`}
                    options={ratios}
                    value={ratios.length ? table.size_ratio_id : null}
                    clearable={false}
                    disabled={locked || ratios.length === 0}
                    onChange={(value) => setTable(table.key, { size_ratio_id: value })}
                    placeholder={table.size ? 'Not applicable' : 'Pick the size first'}
                  />
                </div>
                {isNew && (
                  <div className="field">
                    <label className="field-label" htmlFor={`cad-${table.key}-copy`}>
                      Copy rows from
                    </label>
                    <PickList
                      id={`cad-${table.key}-copy`}
                      options={others.map((item) => ({
                        value: item.id,
                        label: `${item.cad_no} (${sizeLabel(combinationOf(item.size_ratio_id))})`,
                      }))}
                      value={null}
                      onChange={(id) => {
                        const from = others.find((item) => item.id === id)
                        if (from) setTable(table.key, { rows: toCadRows(from, false) })
                      }}
                      placeholder={others.length ? 'An existing CAD of this sample…' : 'This sample has no CAD yet'}
                      disabled={others.length === 0}
                    />
                  </div>
                )}
                <div className="field">
                  <span className="field-label">Primary accessory list</span>
                  {primary === null ? (
                    <p className="hint cad-primary-state">Choose the sample and size first.</p>
                  ) : (
                    <p className="cad-primary-state">
                      <span className={`badge badge--${primary.length ? 'completed' : 'pending'}`}>
                        {primary.length ? `Added (${primary.length})` : 'Not added yet'}
                      </span>{' '}
                      <button type="button" className="btn btn--small" onClick={() => onPrimary(sample, table.size_ratio_id)}>
                        {primary.length ? 'View or change' : 'Add primary accessory now'}
                      </button>
                    </p>
                  )}
                </div>
              </div>
              {locked && <p className="hint">This CAD is assigned to wishlist items, so its size and ratio are locked.</p>}
              <CadRowsEditor
                rows={table.rows}
                onChange={(rows) => setTable(table.key, { rows })}
                particulars={data.cadParticulars}
                typedNames={typedNames}
                idPrefix={`cad-${table.key}`}
                components={componentOptions}
              />
              {isNew && tables.length > 1 && !saved && (
                <button
                  type="button"
                  className="btn btn--small cad-remove-table"
                  onClick={() => setTables((previous) => previous.filter((item) => item.key !== table.key))}
                >
                  Remove CAD {index + 1}
                </button>
              )}
            </fieldset>
          )
        })}

        {isNew && (
          <button type="button" className="btn" onClick={() => setTables((previous) => [...previous, newTable()])}>
            Add another CAD for this sample
          </button>
        )}
        <p className="hint cad-form-note">
          Fabric name, vendor and rate of each row are filled in afterwards by the people who look after the sample.
        </p>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

// ---------- Fabric, vendor and rate of the rows of one CAD ----------

export function CadFabricDialog({ cad, data, lookups, onClose, onSaved }) {
  const initial = useMemo(() => toCadFabricRows(cad), [cad])
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setRow = (id, changes) => setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...changes } : row)))
  const dirty = JSON.stringify(cadFabricPayload(rows)) !== JSON.stringify(cadFabricPayload(initial))

  const typedNames = [...new Set(rows.map((row) => row.new_fabric).filter(Boolean))]
  const fabricOptions = namedOptions(data.fabrics, cad.rows.map((row) => row.fabric_id).filter(Boolean), typedNames)
  const addLabel = addLabelFor(data.fabrics, typedNames)
  const savedVendors = cad.rows.map((row) => row.vendor_id)
  const vendorOptions = data.fabricVendors
    .filter((vendor) => vendor.is_active || savedVendors.includes(vendor.id))
    .map((vendor) => ({ value: vendor.id, label: vendor.is_active ? vendor.code : `${vendor.code} (inactive)` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const save = async (event) => {
    event.preventDefault()
    const problem = checkCadFabricRows(rows)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      await callSampleAction('save_cad_fabrics', { p_cad_id: cad.id, p_rows: cadFabricPayload(rows) })
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Fabric of ${cad.cad_no}`}
      onClose={onClose}
      dirty={dirty}
      width={900}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="cad-fabric-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save fabric'}
          </button>
        </>
      )}
    >
      <form id="cad-fabric-form" onSubmit={save} noValidate>
        <table className="cad-table cad-table--edit">
          <thead>
            <tr>
              <th>PARTICULARS</th>
              <th>FABRIC TYPE</th>
              <th>FABRIC NAME</th>
              <th>VENDOR CODE</th>
              <th>RATE</th>
            </tr>
          </thead>
          <tbody>
            {cad.rows.map((saved, index) => {
              const row = rows.find((item) => item.id === saved.id)
              return (
                <tr key={saved.id} data-fabric-row={index + 1}>
                  <td data-label="Particulars">{lookups.particular.get(saved.particular_id)}</td>
                  <td data-label="Fabric type">{FABRIC_TYPE_LABEL[saved.fabric_type]}</td>
                  <td data-label="Fabric name">
                    <PickList
                      id={`cad-fabric-${saved.id}-name`}
                      options={fabricOptions}
                      value={pickValue(row.fabric_id, row.new_fabric)}
                      onChange={(value) =>
                        setRow(saved.id, isTypedValue(value) ? { fabric_id: null, new_fabric: typedName(value) } : { fabric_id: value, new_fabric: '' })
                      }
                      onCreate={(typed) => setRow(saved.id, { fabric_id: null, new_fabric: cleanName(typed) })}
                      createLabel={addLabel}
                    />
                  </td>
                  <td data-label="Vendor code">
                    <PickList
                      id={`cad-fabric-${saved.id}-vendor`}
                      options={vendorOptions}
                      value={row.vendor_id}
                      onChange={(value) => setRow(saved.id, { vendor_id: value })}
                      placeholder={vendorOptions.length ? 'Select…' : 'No fabric vendor in Masters'}
                    />
                  </td>
                  <td data-label="Rate">
                    <input className="input" inputMode="decimal" aria-label={`Rate, row ${index + 1}`} value={row.rate} onChange={(event) => setRow(saved.id, { rate: numberOnly(event.target.value) })} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

// ---------- Assigning: a CAD to wishlist items, or CADs to one wishlist item ----------
//   cad   + sample - pick the wishlist items of this CAD
//   entry + sample - pick the CADs of this wishlist item
export function CadAssignDialog({ cad, entry, sample, lookups, onClose, onSaved }) {
  const byCad = Boolean(cad)
  const initial = byCad ? cad.wishlist_ids : cadsOfEntry(sample, entry).map((item) => item.id)
  const [picked, setPicked] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = JSON.stringify([...picked].sort()) !== JSON.stringify([...initial].sort())
  const combination = lookups.combination.get(byCad ? cad.size_ratio_id : entry.size_ratio_id)

  const options = byCad
    ? sample.wishlist
        .filter((item) => item.size_ratio_id === cad.size_ratio_id)
        .map((item) => ({ value: item.id, label: `${item.wishlist_no} (${item.qty} pcs)` }))
    : cadsForEntry(sample, entry).map((item) => ({ value: item.id, label: `${item.cad_no} (${item.rows.length} drawings)` }))

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (byCad) await callSampleAction('set_cad_wishlist', { p_cad_id: cad.id, p_wishlist_ids: picked })
      else await callSampleAction('set_wishlist_cads', { p_wishlist_id: entry.id, p_cad_ids: picked })
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={byCad ? `Assign ${cad.cad_no} to the wishlist` : `Assign a CAD to ${entry.wishlist_no}`}
      onClose={onClose}
      dirty={dirty}
      width={520}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="cad-assign-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="cad-assign-form" onSubmit={save} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="cad-assign-pick">
            {byCad ? 'Wishlist items' : 'CADs'}
          </label>
          <PickList
            id="cad-assign-pick"
            multiple
            options={options}
            value={picked}
            onChange={setPicked}
            placeholder={options.length ? 'Select…' : byCad ? 'No wishlist item of this size and ratio' : 'No CAD of this size and ratio yet'}
            disabled={options.length === 0}
          />
          <p className="hint">
            Only {byCad ? 'wishlist items' : 'CADs'} of {sample.sample_no} in {sizeLabel(combination)} can be picked. One
            assigned CAD is enough for a wishlist item.
          </p>
        </div>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

// ---------- The size boxes of one group: click the last size of the group ----------

function SizeBoxes({ sizes, covered, firstFree, onPick, label, disabled }) {
  return (
    <span className="size-boxes" role="group" aria-label={label}>
      {sizes.map((size, index) => {
        const on = covered.includes(size)
        const taken = index < firstFree
        return (
          <button
            key={size}
            type="button"
            className={`size-box ${on ? 'size-box--on' : ''} ${taken ? 'size-box--taken' : ''}`}
            aria-pressed={on}
            disabled={disabled || taken}
            onClick={() => onPick(size)}
          >
            {size}
          </button>
        )
      })}
    </span>
  )
}

// ---------- One accessory with its qty type and size groups ----------
// Used for the primary accessory list and for the accessory material lists.
//   line     - { key, accessory_id, new_accessory, qty_type, groups }
//   onChange - gets the changes to the line
//   children - more fields of the line, shown under the size groups
//   colours  - the Colours list, for naming the colour of a general accessory
export function AccessoryLineEditor({ line, index, sizes, canEdit, accessoryOptions, addLabel, colours = [], onChange, onRemove, children }) {
  const covered = groupSizes(line.groups, sizes)
  // With "same pcs per size group" ticked, the pieces typed in one group go to every group.
  const setGroup = (groupKey, changes) =>
    onChange({
      groups: line.groups.map((group) =>
        group.key === groupKey ? { ...group, ...changes } : line.same_pcs && 'pcs' in changes ? { ...group, pcs: changes.pcs } : group,
      ),
    })
  const withSamePcs = (groups) => (line.same_pcs ? groups.map((group) => ({ ...group, pcs: groups[0].pcs })) : groups)
  const colourOptions = [...new Set([...colours.filter((row) => row.is_active).map((row) => row.name), line.colour].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }))
  const addColourLabel = (typed) => {
    const name = cleanName(typed)
    if (!name || name.length > 60) return null
    return colourOptions.some((option) => option.label.toLowerCase() === name.toLowerCase()) ? null : `Add "${name}"`
  }
  return (
    <div className="primary-line" data-primary-line={index + 1}>
              <div className="primary-line-top">
                <div className="fabric-cell">
                  <label className="field-label" htmlFor={`primary-${line.key}-name`}>
                    Accessory name<span className="field-required"> *</span>
                  </label>
                  <PickList
                    id={`primary-${line.key}-name`}
                    options={accessoryOptions}
                    value={pickValue(line.accessory_id, line.new_accessory)}
                    disabled={!canEdit}
                    onChange={(value) =>
                      onChange(isTypedValue(value) ? { accessory_id: null, new_accessory: typedName(value) } : { accessory_id: value, new_accessory: '' })
                    }
                    onCreate={(typed) => onChange({ accessory_id: null, new_accessory: cleanName(typed) })}
                    createLabel={addLabel}
                  />
                </div>
                <div className="fabric-cell">
                  <label className="field-label" htmlFor={`primary-${line.key}-type`}>
                    Qty type<span className="field-required"> *</span>
                  </label>
                  <PickList
                    id={`primary-${line.key}-type`}
                    options={QTY_TYPES}
                    value={line.qty_type}
                    clearable={false}
                    disabled={!canEdit}
                    onChange={(value) => onChange({ qty_type: value })}
                  />
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn--small fabric-remove"
                    aria-label={`Remove accessory ${index + 1}`}
                    onClick={onRemove}
                  >
                    Remove
                  </button>
                )}
              </div>
              {line.groups.map((group, groupIndex) => {
                const firstFree = covered.slice(0, groupIndex).reduce((sum, list) => sum + list.length, 0)
                return (
                  <div key={group.key} className="primary-group" data-primary-group={groupIndex + 1}>
                    <div className="primary-group-sizes">
                      <span className="field-label">Sizes {sizeSpan(covered[groupIndex])}</span>
                      <SizeBoxes
                        sizes={sizes}
                        covered={covered[groupIndex]}
                        firstFree={firstFree}
                        disabled={!canEdit}
                        label={`Sizes of group ${groupIndex + 1}, accessory ${index + 1}`}
                        onPick={(size) => onChange({ groups: withSamePcs(setGroupEnd(line.groups, groupIndex, size, sizes)) })}
                      />
                    </div>
                    <div className="primary-group-qty">
                      <label className="field-label" htmlFor={`primary-${group.key}-pcs`}>
                        {line.qty_type === 'quantity' || !line.qty_type ? 'Qty (pcs)' : 'No. of pcs'}
                      </label>
                      <input
                        id={`primary-${group.key}-pcs`}
                        className="input"
                        inputMode="numeric"
                        disabled={!canEdit || (line.same_pcs && groupIndex > 0)}
                        value={group.pcs}
                        onChange={(event) => setGroup(group.key, { pcs: digitsOnly(event.target.value) })}
                      />
                    </div>
                    {(line.qty_type === 'length' || line.qty_type === 'dimension') && (
                      <div className="primary-group-qty">
                        <label className="field-label" htmlFor={`primary-${group.key}-qty`}>
                          Length (inch)
                        </label>
                        <input
                          id={`primary-${group.key}-qty`}
                          className="input"
                          inputMode="decimal"
                          disabled={!canEdit}
                          value={group.qty}
                          onChange={(event) => setGroup(group.key, { qty: numberOnly(event.target.value) })}
                        />
                      </div>
                    )}
                    {line.qty_type === 'dimension' && (
                      <div className="primary-group-qty">
                        <label className="field-label" htmlFor={`primary-${group.key}-breadth`}>
                          Breadth (inch)
                        </label>
                        <input
                          id={`primary-${group.key}-breadth`}
                          className="input"
                          inputMode="decimal"
                          disabled={!canEdit}
                          value={group.breadth}
                          onChange={(event) => setGroup(group.key, { breadth: numberOnly(event.target.value) })}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
      <div className="primary-colour" data-primary-colour>
        <Tick
          id={`primary-${line.key}-same-pcs`}
          label="Same pcs per size group"
          checked={line.same_pcs}
          disabled={!canEdit}
          onChange={(value) => onChange({ same_pcs: value, groups: value ? line.groups.map((group) => ({ ...group, pcs: line.groups[0].pcs })) : line.groups })}
        />
        <Tick
          id={`primary-${line.key}-colour-specific`}
          label="Colour specific"
          checked={line.colour_specific}
          disabled={!canEdit}
          onChange={(value) => onChange({ colour_specific: value, colour_follows: value ? line.colour_follows : null, colour: value ? '' : line.colour })}
        />
        {line.colour_specific ? (
          <div className="fabric-cell">
            <label className="field-label" htmlFor={`primary-${line.key}-follows`}>
              Colour follows<span className="field-required"> *</span>
            </label>
            <PickList
              id={`primary-${line.key}-follows`}
              options={COLOUR_FOLLOWS}
              value={line.colour_follows}
              clearable={false}
              disabled={!canEdit}
              onChange={(value) => onChange({ colour_follows: value })}
            />
          </div>
        ) : (
          <div className="fabric-cell">
            <label className="field-label" htmlFor={`primary-${line.key}-colour`}>
              Colour it comes in
            </label>
            <PickList
              id={`primary-${line.key}-colour`}
              options={colourOptions}
              value={line.colour || null}
              disabled={!canEdit}
              onChange={(value) => onChange({ colour: value ?? '' })}
              onCreate={(typed) => onChange({ colour: cleanName(typed) })}
              createLabel={addColourLabel}
              placeholder="Optional"
            />
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

// ---------- The primary accessory list of a sample + size (+ ratio) ----------

export function PrimaryAccessoryDialog({ sample, sizeRatioId, data, canEdit, onClose, onSaved }) {
  const combination = data.sizeRatios.find((row) => row.id === sizeRatioId)
  const sizes = combination.sizes
  const saved = primaryLinesFor(sample, sizeRatioId)
  const initial = useMemo(() => {
    const lines = toPrimaryLines(saved)
    return lines.length || !canEdit ? lines : [newPrimaryLine(sizes)]
    // The form starts from the saved list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [lines, setLines] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setLine = (key, changes) => setLines((previous) => previous.map((line) => (line.key === key ? { ...line, ...changes } : line)))
  const dirty = JSON.stringify(primaryPayload(lines)) !== JSON.stringify(primaryPayload(toPrimaryLines(saved)))

  const typedNames = [...new Set(lines.map((line) => line.new_accessory).filter(Boolean))]
  const accessoryOptions = namedOptions(data.accessories, saved.map((line) => line.accessory_id), typedNames)
  const addLabel = addLabelFor(data.accessories, typedNames)

  const save = async (event) => {
    event.preventDefault()
    const problem = checkPrimaryLines(lines)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      await callSampleAction('save_primary_accessories', {
        p_sample_id: sample.id,
        p_size_ratio_id: sizeRatioId,
        p_lines: primaryPayload(lines),
      })
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Primary accessory list: ${sample.sample_no}, ${sizeLabel(combination)}`}
      onClose={onClose}
      dirty={canEdit && dirty}
      width={980}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button type="submit" form="primary-form" className="btn btn--primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save list'}
            </button>
          )}
        </>
      )}
    >
      <form id="primary-form" onSubmit={save} noValidate>
        <p className="hint fabric-intro">
          One list for every wishlist item of {sample.sample_no} in {sizeLabel(combination)}. The qty is for one garment
          piece. If it changes with the size, click the last size of the first group; the next group starts after it.
        </p>
        {lines.length === 0 && <p className="hint">No primary accessory has been added yet.</p>}
        {lines.map((line, index) => (
          <AccessoryLineEditor
            key={line.key}
            line={line}
            index={index}
            sizes={sizes}
            canEdit={canEdit}
            accessoryOptions={accessoryOptions}
            addLabel={addLabel}
            colours={data.colours}
            onChange={(changes) => setLine(line.key, changes)}
            onRemove={() => setLines((previous) => previous.filter((item) => item.key !== line.key))}
          />
        ))}
        {canEdit && (
          <button type="button" className="btn" onClick={() => setLines((previous) => [...previous, newPrimaryLine(sizes)])}>
            Add accessory
          </button>
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

// One line of a saved primary accessory list as text: "Chain: 22-24 2 pcs × 6 inch; 26-30 …".
export function PrimaryLineText({ line, sizes, accessoryName }) {
  const covered = groupSizes(line.groups, sizes)
  return (
    <span>
      {accessoryName} ({QTY_TYPE_LABEL[line.qty_type]}):{' '}
      {line.groups.map((group, index) => `${sizeSpan(covered[index])}: ${formatPrimaryQty(line.qty_type, group)}`).join('; ')}
      {colourText(line) ? `. ${colourText(line)}` : ''}
    </span>
  )
}

