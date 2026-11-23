// A labelled form row. Used by every form so labels, hints and errors look the same.
export function Field({ label, htmlFor, required = false, hint, error, children }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="field-required"> *</span>}
      </label>
      {children}
      {error ? <p className="hint error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

// A tick box with its label on the same line.
export function Tick({ id, label, checked, onChange, disabled = false, hint }) {
  return (
    <div className="field">
      <label className="tick" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

// Coloured label for yes/no values in tables.
export function Badge({ on, onText, offText }) {
  return <span className={`badge ${on ? 'badge--on' : 'badge--off'}`}>{on ? onText : offText}</span>
}
