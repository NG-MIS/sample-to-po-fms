import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Search box on top of the side menu: finds any screen by name.
// Ctrl+K (Cmd+K on a Mac) jumps to it from anywhere.
//   screens - [{ to, label, group }]
//   onFocusRequest - called when the shortcut is pressed (opens the menu drawer on a phone)
//   onGo - called after moving to a screen
export default function ScreenSearch({ screens, onFocusRequest, onGo }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onFocusRequest?.()
        inputRef.current?.focus()
        inputRef.current?.select()
        // on a phone the drawer opens first; focus again once it is on screen
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFocusRequest])

  // Every word typed must be in the name; names that start with what was typed come first.
  const found = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []
    const first = query.trim().toLowerCase()
    return screens
      .filter((screen) => words.every((word) => `${screen.label} ${screen.group}`.toLowerCase().includes(word)))
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(first)) - Number(a.label.toLowerCase().startsWith(first)) || a.label.localeCompare(b.label))
  }, [query, screens])

  const go = (screen) => {
    setQuery('')
    setActive(0)
    inputRef.current?.blur()
    navigate(screen.to)
    onGo?.()
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, found.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && found[active]) {
      event.preventDefault()
      go(found[active])
    } else if (event.key === 'Escape' && (query || document.activeElement === inputRef.current)) {
      event.stopPropagation()
      setQuery('')
      inputRef.current?.blur()
    }
  }

  return (
    <div className="side-search">
      <div className="side-search-box">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          className="side-search-input"
          placeholder="Search screens…"
          aria-label="Search screens"
          aria-controls="side-search-results"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        {!query && <kbd className="side-search-key">Ctrl K</kbd>}
      </div>
      {query.trim() !== '' && (
        <ul id="side-search-results" className="side-search-results" role="listbox" aria-label="Screens found">
          {found.map((screen, index) => (
            <li key={screen.to} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`side-search-result ${index === active ? 'side-search-result--on' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(screen)}
              >
                <span>{screen.label}</span>
                <span className="side-search-group">{screen.group}</span>
              </button>
            </li>
          ))}
          {found.length === 0 && <li className="side-search-none">No screen found.</li>}
        </ul>
      )}
    </div>
  )
}
