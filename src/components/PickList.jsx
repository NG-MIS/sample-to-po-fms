import { useMemo, useRef, useState } from 'react'
import Popover from './Popover.jsx'

// The one pick-list used everywhere. Values are picked, never typed.
//   options  - [{ value, label }]
//   multiple - false: `value` is one value or null. true: `value` is a list (tick boxes).
//   onCreate - optional. Lets a value that is not in the list be added on the spot:
//              `createLabel(text)` gives the wording of the "add" row for what was
//              typed in the search box (or null when it cannot be added), and
//              `onCreate(text)` is called when that row is picked.
export default function PickList({
  id,
  options,
  value,
  onChange,
  multiple = false,
  placeholder = 'Select…',
  disabled = false,
  clearable = true,
  onCreate,
  createLabel = (text) => `Add "${text}"`,
}) {
  const buttonRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => new Set(multiple ? value || [] : value === null || value === undefined ? [] : [value]),
    [multiple, value],
  )
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options
  }, [options, query])

  const typed = query.trim()
  const createText = onCreate && typed ? createLabel(typed) : null
  const create = () => {
    onCreate(typed)
    setQuery('')
  }

  const summary = options.filter((option) => selected.has(option.value)).map((option) => option.label)

  const close = () => {
    setOpen(false)
    setQuery('')
    buttonRef.current?.focus()
  }

  const pick = (optionValue) => {
    if (multiple) {
      const next = new Set(selected)
      if (next.has(optionValue)) next.delete(optionValue)
      else next.add(optionValue)
      onChange(options.filter((option) => next.has(option.value)).map((option) => option.value))
    } else {
      onChange(optionValue)
      close()
    }
  }

  return (
    <>
      <button
        type="button"
        id={id}
        ref={buttonRef}
        className={`picklist ${summary.length ? '' : 'picklist--empty'}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="picklist-text">{summary.length ? summary.join(', ') : placeholder}</span>
        <span className="picklist-arrow" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <Popover anchorRef={buttonRef} onClose={close} matchAnchorWidth className="popover--list">
          <input
            className="input popover-search"
            placeholder={onCreate ? 'Search, or type a new one…' : 'Search…'}
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              if (createText && shown.length === 0) create()
            }}
          />
          <ul className="option-list" role="listbox" aria-multiselectable={multiple}>
            {shown.length === 0 && !createText && <li className="option-empty">Nothing matches</li>}
            {shown.map((option) => {
              const isOn = selected.has(option.value)
              return (
                <li key={option.value} role="option" aria-selected={isOn}>
                  <button
                    type="button"
                    className={`option ${isOn ? 'option--on' : ''}`}
                    onClick={() => pick(option.value)}
                  >
                    {multiple && <input type="checkbox" checked={isOn} readOnly tabIndex={-1} />}
                    <span>{option.label}</span>
                    {!multiple && isOn && <span aria-hidden="true">✓</span>}
                  </button>
                </li>
              )
            })}
            {createText && (
              <li>
                <button type="button" className="option option--create" onClick={create}>
                  <span>{createText}</span>
                </button>
              </li>
            )}
          </ul>
          <div className="popover-foot">
            {clearable && selected.size > 0 && (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => {
                  onChange(multiple ? [] : null)
                  if (!multiple) close()
                }}
              >
                Clear
              </button>
            )}
            {multiple && (
              <button type="button" className="btn btn--small btn--primary" onClick={close}>
                Done
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  )
}
