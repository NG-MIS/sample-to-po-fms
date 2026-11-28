import { useEffect, useMemo, useRef, useState } from 'react'
import Popover from './Popover.jsx'

// The one pick-list used everywhere. It is typed into directly: clicking the box, or
// typing while it has the cursor, turns the box into a line to type in, with the
// matching names under it. Enter or Tab takes the first match, or adds what was typed
// where adding is allowed.
//   options  - [{ value, label }]
//   multiple - false: `value` is one value or null. true: `value` is a list (tick boxes).
//   onCreate - optional. Lets a value that is not in the list be added on the spot:
//              `createLabel(text)` gives the wording of the "add" row for what was
//              typed in the search box (or null when it cannot be added), and
//              `onCreate(text)` is called when that row is picked.
// Moves the cursor to the field after this one, as Tab does.
function focusAfter(element) {
  const fields = [...document.querySelectorAll('input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])')].filter(
    (field) => !field.disabled && field.tabIndex !== -1 && field.offsetParent !== null && !field.closest('.popover'),
  )
  const next = fields[fields.indexOf(element) + 1]
  setTimeout(() => (next ?? element)?.focus(), 0)
}

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
  const searchRef = useRef(null)

  // The cursor goes into the line to type in as soon as the list is open. (The panel is
  // put in place a moment after it first appears, and only then can it take the cursor.)
  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => {
      const line = searchRef.current
      if (!line || document.activeElement === line) return
      line.focus()
      line.setSelectionRange(line.value.length, line.value.length)
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

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
    if (multiple) setQuery('')
    else close()
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
        onKeyDown={(event) => {
          // typing with the cursor on the box starts the search with that letter
          if (event.key.length !== 1 || (event.key === ' ' && !open) || event.ctrlKey || event.metaKey || event.altKey) return
          event.preventDefault()
          // a letter typed before the line to type in has the cursor is not lost
          setQuery((previous) => previous + event.key)
          setOpen(true)
        }}
      >
        <span className="picklist-text">{summary.length ? summary.join(', ') : placeholder}</span>
        <span className="picklist-arrow" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <Popover anchorRef={buttonRef} onClose={close} matchAnchorWidth overAnchor className="popover--list popover--over">
          <input
            className="input popover-search"
            aria-label={onCreate ? 'Type to search, or to add a new one' : 'Type to search'}
            placeholder={summary.length ? summary.join(', ') : onCreate ? 'Type to search, or add a new one…' : 'Type to search…'}
            value={query}
            ref={searchRef}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter and Tab both take what was typed: the new name when nothing
              // matches, otherwise the first match. Tab then moves to the next field.
              if (event.key !== 'Enter' && (event.key !== 'Tab' || event.shiftKey)) return
              const byTab = event.key === 'Tab'
              const from = buttonRef.current
              event.preventDefault()
              if (createText && shown.length === 0) create()
              else if (!multiple && query.trim() !== '' && shown.length > 0) pick(shown[0].value)
              if (byTab) {
                setOpen(false)
                setQuery('')
                focusAfter(from)
              }
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
