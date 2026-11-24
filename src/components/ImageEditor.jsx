import { useEffect, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import {
  DEFAULT_PRESET,
  FULL_CROP,
  MAX_UPLOAD_BYTES,
  PRESETS,
  asJpgFile,
  drawTurned,
  formatBytes,
  loadPicture,
  renderPicture,
  squareCrop,
  turnedSize,
} from '../lib/imageEdit.js'

// The one picture editor, shown whenever a picture is chosen for upload:
// rotate, crop (drag the box or its corners) and compress.
//   file    - the chosen picture
//   square  - start with a square crop (used for round avatars)
//   onDone(editedFile) / onCancel()

const PREVIEW_SIDE = 900
const MIN_CROP = 0.08
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const sameCrop = (a, b) => ['x', 'y', 'w', 'h'].every((key) => Math.abs(a[key] - b[key]) < 0.001)

export default function ImageEditor({ file, square = false, onDone, onCancel }) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const dragRef = useRef(null)
  const [picture, setPicture] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [crop, setCrop] = useState(FULL_CROP)
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [result, setResult] = useState(null) // { blob, width, height }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Open the picture.
  useEffect(() => {
    let closed = false
    let opened = null
    loadPicture(file)
      .then((loaded) => {
        if (closed) {
          loaded.close?.()
          return
        }
        opened = loaded
        setPicture(loaded)
        if (square) setCrop(squareCrop(loaded, 0))
      })
      .catch(() => !closed && setError('This picture could not be opened. Choose a JPG, PNG or WEBP picture.'))
    return () => {
      closed = true
      opened?.close?.()
    }
  }, [file, square])

  // Draw the preview whenever the picture is turned.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!picture || !canvas) return
    const turned = turnedSize(picture, rotation)
    const scale = Math.min(1, PREVIEW_SIDE / Math.max(turned.width, turned.height))
    canvas.width = Math.round(turned.width * scale)
    canvas.height = Math.round(turned.height * scale)
    drawTurned(canvas.getContext('2d'), picture, rotation, scale)
  }, [picture, rotation])

  // Work out the finished picture (and its file size) shortly after each change.
  useEffect(() => {
    if (!picture) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      renderPicture(picture, { rotation, crop, preset })
        .then((next) => !cancelled && setResult(next))
        .catch((failure) => !cancelled && setError(failure.message))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [picture, rotation, crop, preset])

  const turn = (degrees) => {
    const next = (rotation + degrees + 360) % 360
    setRotation(next)
    setCrop(square ? squareCrop(picture, next) : FULL_CROP)
    setResult(null)
  }

  // ----- dragging the crop box -----
  const startDrag = (mode) => (event) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { mode, startX: event.clientX, startY: event.clientY, crop }
  }

  const moveDrag = (event) => {
    const drag = dragRef.current
    const stage = stageRef.current?.getBoundingClientRect()
    if (!drag || !stage) return
    const dx = (event.clientX - drag.startX) / stage.width
    const dy = (event.clientY - drag.startY) / stage.height
    const start = drag.crop
    let { x, y, w, h } = start

    if (drag.mode === 'move') {
      x = clamp(start.x + dx, 0, 1 - start.w)
      y = clamp(start.y + dy, 0, 1 - start.h)
    } else {
      const right = start.x + start.w
      const bottom = start.y + start.h
      if (drag.mode.includes('w')) {
        x = clamp(start.x + dx, 0, right - MIN_CROP)
        w = right - x
      }
      if (drag.mode.includes('e')) w = clamp(start.w + dx, MIN_CROP, 1 - start.x)
      if (drag.mode.includes('n')) {
        y = clamp(start.y + dy, 0, bottom - MIN_CROP)
        h = bottom - y
      }
      if (drag.mode.includes('s')) h = clamp(start.h + dy, MIN_CROP, 1 - start.y)
    }
    setCrop({ x, y, w, h })
    setResult(null)
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const confirmPicture = async () => {
    setBusy(true)
    setError('')
    try {
      const finished = result ?? (await renderPicture(picture, { rotation, crop, preset }))
      if (finished.blob.size > MAX_UPLOAD_BYTES) {
        setError('The picture is still larger than 5 MB. Choose "Smallest file" or crop it.')
        setBusy(false)
        return
      }
      onDone(asJpgFile(finished.blob, file.name))
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  const startCrop = picture ? (square ? squareCrop(picture, rotation) : FULL_CROP) : FULL_CROP
  const changed = rotation !== 0 || preset !== DEFAULT_PRESET || !sameCrop(crop, startCrop)
  const percent = (value) => `${value * 100}%`

  return (
    <Modal
      title="Edit picture"
      onClose={onCancel}
      dirty={changed}
      width={720}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={!picture || busy} onClick={confirmPicture}>
            {busy ? 'Preparing…' : 'Use picture'}
          </button>
        </>
      )}
    >
      <div className="editor-tools">
        <button type="button" className="btn btn--small" disabled={!picture} onClick={() => turn(-90)}>
          ⟲ Rotate left
        </button>
        <button type="button" className="btn btn--small" disabled={!picture} onClick={() => turn(90)}>
          ⟳ Rotate right
        </button>
        <button
          type="button"
          className="btn btn--small"
          disabled={!picture}
          onClick={() => {
            setCrop(squareCrop(picture, rotation))
            setResult(null)
          }}
        >
          Square crop
        </button>
        <button
          type="button"
          className="btn btn--small"
          disabled={!picture || sameCrop(crop, FULL_CROP)}
          onClick={() => {
            setCrop(FULL_CROP)
            setResult(null)
          }}
        >
          Whole picture
        </button>
      </div>

      <div className="editor-area">
        {!picture && !error && <p className="hint">Opening picture…</p>}
        <div
          ref={stageRef}
          className="editor-stage"
          style={{ visibility: picture ? 'visible' : 'hidden' }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <canvas ref={canvasRef} className="editor-canvas" />
          <div className="crop-shade-clip" aria-hidden="true">
            <div
              className="crop-shade"
              style={{ left: percent(crop.x), top: percent(crop.y), width: percent(crop.w), height: percent(crop.h) }}
            />
          </div>
          <div
            className="crop-box"
            style={{ left: percent(crop.x), top: percent(crop.y), width: percent(crop.w), height: percent(crop.h) }}
            onPointerDown={startDrag('move')}
          >
            {['nw', 'ne', 'sw', 'se'].map((corner) => (
              <span
                key={corner}
                className={`crop-handle crop-handle--${corner}`}
                data-corner={corner}
                onPointerDown={startDrag(corner)}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="hint editor-hint">Drag the box to move the crop, or drag a corner to change its size.</p>

      <div className="editor-compress" role="radiogroup" aria-label="Compression">
        {Object.entries(PRESETS).map(([key, option]) => (
          <label key={key} className={`editor-preset ${preset === key ? 'editor-preset--on' : ''}`}>
            <input
              type="radio"
              name="picture-preset"
              checked={preset === key}
              onChange={() => {
                setPreset(key)
                setResult(null)
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <p className="editor-size" role="status">
        Original: <strong>{formatBytes(file.size)}</strong>
        {'  →  '}
        After editing:{' '}
        <strong>{result ? `${formatBytes(result.blob.size)} (${result.width} × ${result.height})` : 'working…'}</strong>
      </p>

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}
