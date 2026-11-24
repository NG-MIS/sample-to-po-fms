import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '../lib/escape.js'

// The one picture popup used everywhere: full screen, copy link, open in new tab, close.
// The picture always fills the space available (it is enlarged if it is small),
// without being cut or stretched.
//   src     - the picture to show
//   getLink - optional function that gives a shareable link (defaults to src)
export default function ImageViewer({ src, alt = '', title, getLink, onClose }) {
  const frameRef = useRef(null)
  const [isFull, setIsFull] = useState(false)
  const [note, setNote] = useState('')

  useEscape(onClose)

  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === frameRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (!note) return undefined
    const timer = setTimeout(() => setNote(''), 2500)
    return () => clearTimeout(timer)
  }, [note])

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else frameRef.current?.requestFullscreen?.()
  }

  const copyLink = async () => {
    try {
      const link = getLink ? await getLink() : src
      await navigator.clipboard.writeText(link)
      setNote('Link copied')
    } catch {
      setNote('Could not copy the link')
    }
  }

  // The picture element covers the whole stage; the picture itself is drawn inside it.
  // A click on the empty space beside the picture closes the popup, like a click outside.
  const clickPicture = (event) => {
    event.stopPropagation()
    const image = event.currentTarget
    const box = image.getBoundingClientRect()
    if (!image.naturalWidth || !image.naturalHeight) return
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight)
    const shownWidth = image.naturalWidth * scale
    const shownHeight = image.naturalHeight * scale
    const insideX = Math.abs(event.clientX - (box.left + box.width / 2)) <= shownWidth / 2
    const insideY = Math.abs(event.clientY - (box.top + box.height / 2)) <= shownHeight / 2
    if (!insideX || !insideY) onClose()
  }

  const openInTab = async () => {
    const link = getLink ? await getLink().catch(() => src) : src
    window.open(link, '_blank', 'noopener')
  }

  return createPortal(
    <div
      className="overlay overlay--viewer"
      onMouseDown={(event) => {
        event.stopPropagation()
        onClose()
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={frameRef}
        className="viewer"
        role="dialog"
        aria-modal="true"
        aria-label={title || alt || 'Picture'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="viewer-bar">
          <span className="viewer-title">{title || alt}</span>
          <span className="viewer-note" role="status">
            {note}
          </span>
          <button type="button" className="btn btn--dark" onClick={toggleFull}>
            {isFull ? 'Exit full screen' : 'Full screen'}
          </button>
          <button type="button" className="btn btn--dark" onClick={copyLink}>
            Copy link
          </button>
          <button type="button" className="btn btn--dark" onClick={openInTab}>
            Open in new tab
          </button>
          <button type="button" className="btn btn--dark" onClick={onClose} title="Close (Esc)">
            Close
          </button>
        </header>
        <div className="viewer-stage" onMouseDown={onClose}>
          <img src={src} alt={alt} onMouseDown={clickPicture} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
