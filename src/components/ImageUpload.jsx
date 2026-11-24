import { useRef, useState } from 'react'
import ClickableImage from './ClickableImage.jsx'
import ImageEditor from './ImageEditor.jsx'
import { checkImageFile, useObjectUrl } from '../lib/images.js'

// Picture field for forms. Shows the current picture (clickable), lets the
// person choose a new one or remove it. A chosen picture first opens in the
// picture editor (rotate, crop, compress). The edited file is handed back
// through `onFileChange`; the form uploads it when it is saved.
export default function ImageUpload({ bucket, path, file, onFileChange, onRemove, alt, round = false, fallbackName, size = 72 }) {
  const inputRef = useRef(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // the picture open in the editor
  const previewUrl = useObjectUrl(file)

  const choose = (event) => {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    const problem = checkImageFile(chosen)
    setError(problem)
    if (!problem) setEditing(chosen)
  }

  const hasPicture = Boolean(file || path)

  return (
    <div className="upload">
      <ClickableImage
        bucket={bucket}
        path={file ? null : path}
        src={previewUrl}
        alt={alt}
        size={size}
        round={round}
        fallbackName={fallbackName}
      />
      <div className="upload-actions">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose} />
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
          {hasPicture ? 'Change picture' : 'Choose picture'}
        </button>
        {file && (
          <button type="button" className="btn" onClick={() => setEditing(file)}>
            Edit
          </button>
        )}
        {hasPicture && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setError('')
              onRemove()
            }}
          >
            Remove
          </button>
        )}
        <p className="hint">
          {error ? <span className="error-text">{error}</span> : 'JPG, PNG or WEBP. You can rotate, crop and compress it.'}
        </p>
      </div>
      {editing && (
        <ImageEditor
          file={editing}
          square={round}
          onCancel={() => setEditing(null)}
          onDone={(edited) => {
            setEditing(null)
            onFileChange(edited)
          }}
        />
      )}
    </div>
  )
}
