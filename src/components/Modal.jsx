import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '../lib/escape.js'

// A small yes/no question shown on top of everything else.
// Esc answers "no" (the safe choice).
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  danger = false,
  onConfirm,
  onCancel,
}) {
  useEscape(onCancel)
  const confirmRef = useRef(null)
  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return createPortal(
    <div
      className="overlay overlay--confirm"
      onMouseDown={(event) => {
        event.stopPropagation()
        onCancel()
      }}
    >
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="confirm-title">{title}</h2>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// The one popup box used by every form and detail view.
//   dirty  - true when there is unsaved work. Closing then asks "Discard changes?".
//   footer - a function that receives `requestClose`, for Cancel / Save buttons.
export default function Modal({ title, onClose, dirty = false, width = 560, footer, children }) {
  const [asking, setAsking] = useState(false)
  const boxRef = useRef(null)

  const requestClose = () => {
    if (dirty) setAsking(true)
    else onClose()
  }

  useEscape(requestClose)

  useEffect(() => {
    const box = boxRef.current
    const first =
      box?.querySelector('[data-autofocus]') ||
      box?.querySelector('input:not([type=hidden]):not([type=file]):not([disabled]), textarea, select')
    ;(first || box)?.focus()
  }, [])

  return createPortal(
    <div className="overlay" onMouseDown={requestClose}>
      <div
        ref={boxRef}
        className="modal"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={requestClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer(requestClose)}</footer>}
      </div>
      {asking && (
        <ConfirmDialog
          title="Discard changes?"
          message="You have unsaved work. If you close now, it will be lost."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          danger
          onConfirm={onClose}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>,
    document.body,
  )
}
