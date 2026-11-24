import { useRef, useState } from 'react'
import ClickableImage from './ClickableImage.jsx'
import ImageEditor from './ImageEditor.jsx'
import VoiceRecorder from './VoiceRecorder.jsx'
import { checkImageFile, useImageUrl, useObjectUrl } from '../lib/images.js'
import { formatDateTime, friendlyError } from '../lib/format.js'
import { quickCompress } from '../lib/imageEdit.js'

// Remarks = any number of typed notes, voice notes and pictures.
// A remark looks like { key, id?, kind: 'text' | 'voice' | 'image', body?, file_path?, file? }
//   id        - set when the remark is already saved
//   file      - set when a voice note or picture has been added but not uploaded yet

// Plays a voice note, either a stored one (bucket + path) or one just recorded (file).
export function VoiceNote({ bucket, path, file }) {
  const storedUrl = useImageUrl(bucket, file ? null : path)
  const localUrl = useObjectUrl(file)
  const url = localUrl || storedUrl
  if (!url) return <span className="hint">Loading voice note…</span>
  return <audio className="voice" controls preload="metadata" src={url} />
}

function RemarkPicture({ bucket, remark, size }) {
  const localUrl = useObjectUrl(remark.file)
  return (
    <ClickableImage
      bucket={bucket}
      path={remark.file ? null : remark.file_path}
      src={localUrl}
      alt="Remark picture"
      size={size}
    />
  )
}

let nextKey = 0
const newKey = () => `new-${++nextKey}`

// The remarks part of a form. All three kinds are optional and can be added many times.
//   draft / onDraftChange - the text being typed that has not been added yet. The form
//   that owns this adds it on save, so a typed note is never lost.
export function RemarksEditor({ bucket, items, onChange, draft, onDraftChange }) {
  const fileRef = useRef(null)
  const [error, setError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [editing, setEditing] = useState(null) // the picture remark open in the editor

  const texts = items.filter((item) => item.kind === 'text')
  const voices = items.filter((item) => item.kind === 'voice')
  const pictures = items.filter((item) => item.kind === 'image')

  const add = (remarks) => onChange([...items, ...remarks])
  const remove = (key) => onChange(items.filter((item) => item.key !== key))

  const addText = () => {
    const body = draft.trim()
    if (!body) return
    add([{ key: newKey(), kind: 'text', body }])
    onDraftChange('')
  }

  // Pictures added here are compressed straight away, so several can be added in
  // one go. Each one can then be opened in the editor to rotate or crop it.
  const addPictures = async (event) => {
    const chosen = [...(event.target.files || [])]
    event.target.value = ''
    const problem = chosen.map(checkImageFile).find(Boolean)
    setError(problem || '')
    const good = chosen.filter((file) => !checkImageFile(file))
    if (good.length === 0) return
    setPreparing(true)
    try {
      const ready = await Promise.all(good.map(quickCompress))
      add(ready.map((file) => ({ key: newKey(), kind: 'image', file })))
    } catch (failure) {
      setError(friendlyError(failure))
    }
    setPreparing(false)
  }

  return (
    <div className="remarks">
      <div className="remarks-part">
        <div className="remarks-label">Text</div>
        {texts.length > 0 && (
          <ul className="remarks-list">
            {texts.map((item) => (
              <li key={item.key} className="remark-row">
                <span className="remark-text">{item.body}</span>
                <button type="button" className="btn btn--small" onClick={() => remove(item.key)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="remark-add">
          <textarea
            className="input"
            rows={2}
            placeholder="Type a remark…"
            aria-label="Text remark"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <button type="button" className="btn" disabled={!draft.trim()} onClick={addText}>
            Add text
          </button>
        </div>
      </div>

      <div className="remarks-part">
        <div className="remarks-label">Voice</div>
        {voices.length > 0 && (
          <ul className="remarks-list">
            {voices.map((item) => (
              <li key={item.key} className="remark-row">
                <VoiceNote bucket={bucket} path={item.file_path} file={item.file} />
                <button type="button" className="btn btn--small" onClick={() => remove(item.key)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <VoiceRecorder onRecorded={(file) => add([{ key: newKey(), kind: 'voice', file }])} />
      </div>

      <div className="remarks-part">
        <div className="remarks-label">Pictures</div>
        {pictures.length > 0 && (
          <ul className="remark-pictures">
            {pictures.map((item) => (
              <li key={item.key} className="remark-picture">
                <RemarkPicture bucket={bucket} remark={item} size={72} />
                {item.file && (
                  <button
                    type="button"
                    className="remark-picture-edit"
                    aria-label="Edit picture"
                    title="Rotate, crop or compress"
                    onClick={() => setEditing(item)}
                  >
                    ✎
                  </button>
                )}
                <button
                  type="button"
                  className="remark-picture-remove"
                  aria-label="Remove picture"
                  title="Remove"
                  onClick={() => remove(item.key)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addPictures} />
        <button type="button" className="btn" disabled={preparing} onClick={() => fileRef.current?.click()}>
          {preparing ? 'Preparing pictures…' : 'Add pictures'}
        </button>
        {error && <span className="hint error-text"> {error}</span>}
        {editing && (
          <ImageEditor
            file={editing.file}
            onCancel={() => setEditing(null)}
            onDone={(edited) => {
              onChange(items.map((item) => (item.key === editing.key ? { ...item, file: edited } : item)))
              setEditing(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

// Read-only display of saved remarks.
//   people - lookup of person id -> name, to show who added each remark
export function RemarksView({ bucket, remarks, people }) {
  if (!remarks.length) return <p className="hint">No remarks.</p>
  const texts = remarks.filter((item) => item.kind === 'text')
  const voices = remarks.filter((item) => item.kind === 'voice')
  const pictures = remarks.filter((item) => item.kind === 'image')
  const byLine = (item) =>
    [people?.get(item.created_by), formatDateTime(item.created_at)].filter(Boolean).join(', ')

  return (
    <div className="remarks">
      {texts.length > 0 && (
        <div className="remarks-part">
          <div className="remarks-label">Text</div>
          <ul className="remarks-list">
            {texts.map((item) => (
              <li key={item.id} className="remark-row remark-row--view">
                <span className="remark-text">{item.body}</span>
                <span className="hint">{byLine(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {voices.length > 0 && (
        <div className="remarks-part">
          <div className="remarks-label">Voice</div>
          <ul className="remarks-list">
            {voices.map((item) => (
              <li key={item.id} className="remark-row remark-row--view">
                <VoiceNote bucket={bucket} path={item.file_path} />
                <span className="hint">{byLine(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pictures.length > 0 && (
        <div className="remarks-part">
          <div className="remarks-label">Pictures</div>
          <ul className="remark-pictures">
            {pictures.map((item) => (
              <li key={item.id} className="remark-picture">
                <RemarkPicture bucket={bucket} remark={item} size={96} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
