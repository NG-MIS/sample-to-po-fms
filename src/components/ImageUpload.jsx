import { useEffect, useMemo, useRef, useState } from 'react'
import ClickableImage from './ClickableImage.jsx'
import { checkImageFile } from '../lib/images.js'

// Picture field for forms. Shows the current picture (clickable), lets the
// person choose a new one or remove it. The new file is handed back through
// `onFileChange`; the form uploads it when it is saved.
export default function ImageUpload({ bucket, path, file, onFileChange, onRemove, alt, round = false, fallbackName }) {
  const inputRef = useRef(null)
  const [error, setError] = useState('')
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl])

  const choose = (event) => {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    const problem = checkImageFile(chosen)
    setError(problem)
    if (!problem) onFileChange(chosen)
  }

  const hasPicture = Boolean(file || path)

  return (
    <div className="upload">
      <ClickableImage
        bucket={bucket}
        path={file ? null : path}
        src={previewUrl}
        alt={alt}
        size={72}
        round={round}
        fallbackName={fallbackName}
      />
      <div className="upload-actions">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose} />
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
          {hasPicture ? 'Change picture' : 'Choose picture'}
        </button>
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
        <p className="hint">{error ? <span className="error-text">{error}</span> : 'JPG, PNG or WEBP, up to 5 MB'}</p>
      </div>
    </div>
  )
}
