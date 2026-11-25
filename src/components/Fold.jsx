// A section that opens and closes. The heading bar always shows the title and
// a short summary, so the important things can be read while it is closed.
//   summary - what to show beside the title (text, badges)
//   action  - optional button on the right of the bar
export default function Fold({ id, title, summary, action, open, onToggle, children }) {
  return (
    <section className={`fold ${open ? 'fold--open' : ''}`} data-fold={id}>
      <div className="fold-head">
        <button type="button" className="fold-toggle" aria-expanded={open} onClick={onToggle}>
          <svg className={`chevron ${open ? 'chevron--open' : ''}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="fold-title">{title}</span>
          <span className="fold-summary">{summary}</span>
        </button>
        {action && <span className="fold-action">{action}</span>}
      </div>
      {open && <div className="fold-body">{children}</div>}
    </section>
  )
}
