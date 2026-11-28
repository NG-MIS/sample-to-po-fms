import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '../lib/escape.js'

// A floating panel anchored under a button. Used by pick-lists and column
// filters. Closes on Esc or on a click anywhere outside it.
//   overAnchor - the panel starts on top of the button, not under it, so that its
//                first line (the box to type in) sits exactly where the button is
export default function Popover({ anchorRef, onClose, width, matchAnchorWidth = false, overAnchor = false, className = '', children }) {
  const panelRef = useRef(null)
  const [position, setPosition] = useState(null)

  useEscape(onClose)

  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!anchor || !panel) return
    const panelWidth = matchAnchorWidth ? Math.max(anchor.width, 200) : width || panel.offsetWidth
    const panelHeight = panel.offsetHeight
    const gap = 4
    let left = Math.min(anchor.left, window.innerWidth - panelWidth - 8)
    left = Math.max(8, left)
    let top = overAnchor ? anchor.top : anchor.bottom + gap
    if (top + panelHeight > window.innerHeight - 8) {
      const above = anchor.top - gap - panelHeight
      top = !overAnchor && above >= 8 ? above : Math.max(8, window.innerHeight - panelHeight - 8)
    }
    setPosition({ left, top, width: panelWidth, '--anchor-height': `${anchor.height}px` })
  }, [anchorRef, width, matchAnchorWidth, overAnchor])

  return createPortal(
    <div
      className="popover-layer"
      onMouseDown={(event) => {
        event.stopPropagation()
        onClose()
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={panelRef}
        className={`popover ${className}`}
        style={position ? position : { visibility: 'hidden', width }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
