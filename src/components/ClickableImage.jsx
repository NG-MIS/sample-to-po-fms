import { useState } from 'react'
import ImageViewer from './ImageViewer.jsx'
import { getShareLink, useImageUrl } from '../lib/images.js'
import { initials } from '../lib/format.js'

// Every picture in the system goes through this: a thumbnail that opens the
// picture popup when clicked. Give it either a stored picture (bucket + path)
// or a direct `src`. With no picture it shows the person's initials instead.
export default function ClickableImage({ bucket, path, src, alt = '', size = 36, round = false, fallbackName }) {
  const [open, setOpen] = useState(false)
  const storedUrl = useImageUrl(bucket, path)
  const url = src || storedUrl
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) }
  const shape = round ? 'thumb thumb--round' : 'thumb'

  if (!url) {
    return (
      <span className={`${shape} thumb--empty`} style={style} aria-label={alt || fallbackName || 'No picture'}>
        {path ? '' : initials(fallbackName)}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        className={`${shape} thumb--button`}
        style={style}
        title="Click to view"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <img src={url} alt={alt} />
      </button>
      {open && (
        <ImageViewer
          src={url}
          alt={alt}
          title={alt}
          getLink={!src && bucket && path ? () => getShareLink(bucket, path) : undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
