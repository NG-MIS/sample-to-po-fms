import { useMemo, useState } from 'react'
import Modal from '../components/Modal.jsx'
import PickList from '../components/PickList.jsx'
import { friendlyError } from '../lib/format.js'
import { callSampleAction } from '../lib/sampleData.js'
import {
  checkWishlistLines,
  defaultCombination,
  newWishlistLine,
  nextWishlistNos,
  ratioOptions,
  setsText,
  sizeOptions,
  wishlistPayload,
} from '../lib/wishlist.js'

// Editor for wishlist entries of one sample: any number of lines, each with a
// size, a ratio (only for a size that is made in ratios) and a quantity in
// pieces. Used when giving the final approval and in the Add to wishlist popup.
//   lines      - the lines being edited (see lib/wishlist.js)
//   onChange   - gets the new list of lines
//   sizeRatios - the Sizes and ratios master
//   sample     - the sample, to show the wishlist number each line will get
//   minLines   - lines that cannot be removed (1 when at least one is needed)
export function WishlistLinesEditor({ lines, onChange, sizeRatios, sample, minLines = 0, idPrefix = 'wish' }) {
  const setLine = (key, changes) => onChange(lines.map((line) => (line.key === key ? { ...line, ...changes } : line)))
  const numbers = nextWishlistNos(sample, lines.length)
  const sizes = sizeOptions(sizeRatios)

  return (
    <div className="fabric-editor">
      {lines.map((line, index) => {
        const ratios = line.size ? ratioOptions(sizeRatios, line.size) : []
        const combination = sizeRatios.find((row) => row.id === line.size_ratio_id)
        const id = (part) => `${idPrefix}-${line.key}-${part}`
        return (
          <div key={line.key} className="fabric-line wishlist-line" data-wishlist-line={index + 1}>
            <div className="wishlist-no">{numbers[index]}</div>
            <div className="fabric-cell">
              <label className="field-label" htmlFor={id('size')}>
                Size<span className="field-required"> *</span>
              </label>
              <PickList
                id={id('size')}
                options={sizes}
                value={line.size}
                clearable={false}
                onChange={(size) => setLine(line.key, { size, size_ratio_id: defaultCombination(sizeRatios, size) })}
                placeholder={sizes.length ? 'Select…' : 'No size in Masters'}
              />
            </div>
            <div className="fabric-cell">
              <label className="field-label" htmlFor={id('ratio')}>
                Ratio{ratios.length > 0 && <span className="field-required"> *</span>}
              </label>
              <PickList
                id={id('ratio')}
                options={ratios}
                value={ratios.length ? line.size_ratio_id : null}
                clearable={false}
                disabled={ratios.length === 0}
                onChange={(value) => setLine(line.key, { size_ratio_id: value })}
                placeholder={line.size ? 'Not applicable' : 'Pick the size first'}
              />
            </div>
            <div className="fabric-cell">
              <label className="field-label" htmlFor={id('qty')}>
                Quantity (pcs)<span className="field-required"> *</span>
              </label>
              <input
                id={id('qty')}
                className="input"
                inputMode="numeric"
                value={line.qty}
                onChange={(event) => setLine(line.key, { qty: event.target.value.replace(/\D/g, '') })}
              />
            </div>
            {lines.length > minLines && (
              <button
                type="button"
                className="btn btn--small fabric-remove"
                aria-label={`Remove wishlist entry ${index + 1}`}
                onClick={() => onChange(lines.filter((item) => item.key !== line.key))}
              >
                Remove
              </button>
            )}
            {combination && line.qty && (
              <p className="hint wishlist-sets">{setsText(line.qty, combination.pieces_per_set)}</p>
            )}
          </div>
        )
      })}
      <button type="button" className="btn" onClick={() => onChange([...lines, newWishlistLine()])}>
        {lines.length ? 'Add another entry' : 'Add wishlist entry'}
      </button>
    </div>
  )
}

// Popup to add an approved sample to the wishlist: its first entry (NEW), or repeats.
export function WishlistDialog({ sample, data, onClose, onSaved }) {
  const initial = useMemo(() => [newWishlistLine()], [])
  const [lines, setLines] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isRepeat = sample.wishlist.length > 0
  const dirty = wishlistPayload(lines).length > 0 || lines.some((line) => line.size)

  const save = async (event) => {
    event.preventDefault()
    const problem = checkWishlistLines(lines)
    if (problem) return setError(problem)
    const entries = wishlistPayload(lines)
    if (entries.length === 0) return setError('Add at least one wishlist entry.')
    setBusy(true)
    setError('')
    try {
      const given = await callSampleAction('add_wishlist_entries', { p_sample_id: sample.id, p_entries: entries })
      await onSaved(given ?? [])
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isRepeat ? `Add a repeat of ${sample.sample_no}` : `Add ${sample.sample_no} to the wishlist`}
      onClose={onClose}
      dirty={dirty}
      width={760}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="wishlist-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add to wishlist'}
          </button>
        </>
      )}
    >
      <form id="wishlist-form" onSubmit={save} noValidate>
        <p className="hint fabric-intro">
          {isRepeat
            ? `${sample.sample_no} is already in the wishlist ${sample.wishlist.length} ${sample.wishlist.length === 1 ? 'time' : 'times'}. Each entry added here is a repeat.`
            : 'The first entry is the NEW one. Any further entry is a repeat.'}{' '}
          Ratio is asked only for a size that is made in ratios.
        </p>
        <WishlistLinesEditor
          lines={lines}
          onChange={setLines}
          sizeRatios={data.sizeRatios}
          sample={sample}
          minLines={1}
          idPrefix="wishlist-dialog"
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

// Popup for authority All to correct the size, ratio or quantity of an entry.
export function WishlistCorrectDialog({ entry, data, onClose, onSaved }) {
  const saved = data.sizeRatios.find((row) => row.id === entry.size_ratio_id)
  const [size, setSize] = useState(saved?.size ?? null)
  const [combinationId, setCombinationId] = useState(entry.size_ratio_id)
  const [qty, setQty] = useState(String(entry.qty))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = combinationId !== entry.size_ratio_id || qty !== String(entry.qty)
  const ratios = size ? ratioOptions(data.sizeRatios, size, entry.size_ratio_id) : []
  const combination = data.sizeRatios.find((row) => row.id === combinationId)

  const save = async (event) => {
    event.preventDefault()
    if (!combinationId) return setError('Choose the size, and the ratio when the size has ratios.')
    if (!/^\d{1,9}$/.test(qty) || Number(qty) < 1) return setError('Quantity must be a whole number of pieces, 1 or more.')
    setBusy(true)
    setError('')
    try {
      await callSampleAction('correct_wishlist_entry', {
        p_id: entry.id,
        p_size_ratio_id: combinationId,
        p_qty: Number(qty),
      })
      await onSaved()
    } catch (failure) {
      setError(friendlyError(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Change ${entry.wishlist_no}`}
      onClose={onClose}
      dirty={dirty}
      width={520}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" form="wishlist-correct-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="wishlist-correct-form" className="form-grid" onSubmit={save} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="wishlist-correct-size">
            Size<span className="field-required"> *</span>
          </label>
          <PickList
            id="wishlist-correct-size"
            options={sizeOptions(data.sizeRatios, entry.size_ratio_id)}
            value={size}
            clearable={false}
            onChange={(value) => {
              setSize(value)
              setCombinationId(defaultCombination(data.sizeRatios, value))
            }}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="wishlist-correct-ratio">
            Ratio
          </label>
          <PickList
            id="wishlist-correct-ratio"
            options={ratios}
            value={ratios.length ? combinationId : null}
            clearable={false}
            disabled={ratios.length === 0}
            onChange={setCombinationId}
            placeholder="Not applicable"
          />
        </div>
        <div className="field form-wide">
          <label className="field-label" htmlFor="wishlist-correct-qty">
            Quantity (pcs)<span className="field-required"> *</span>
          </label>
          <input
            id="wishlist-correct-qty"
            className="input"
            inputMode="numeric"
            value={qty}
            onChange={(event) => setQty(event.target.value.replace(/\D/g, ''))}
          />
          {combination && qty && <p className="hint">{setsText(qty, combination.pieces_per_set)}</p>}
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
