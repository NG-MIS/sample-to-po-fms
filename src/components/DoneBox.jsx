import Modal from './Modal.jsx'

// The message shown after something is created or saved, with its number in large type.
//   title  - heading of the box, e.g. "Sample created"
//   text   - the line above the number
//   number - one number, or a list of them (one per line)
//   note   - an optional line under the number
export default function DoneBox({ title, text, number, note, onClose }) {
  const numbers = Array.isArray(number) ? number : [number]
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={380}
      footer={() => (
        <button type="button" className="btn btn--primary" autoFocus onClick={onClose}>
          OK
        </button>
      )}
    >
      <div className="created-box" role="status">
        <span className="created-tick" aria-hidden="true">
          ✓
        </span>
        <p>{text}</p>
        {numbers.map((item) => (
          <p key={item} className="created-number" data-created-number>
            {item}
          </p>
        ))}
        {note && (
          <p className="created-note" data-created-note>
            {note}
          </p>
        )}
      </div>
    </Modal>
  )
}
