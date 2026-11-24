// Picture editing done in the browser before upload: rotate, crop and compress.
// The result is always a JPG, which keeps photos small.

export const PRESETS = {
  best: { label: 'Best quality', maxSide: 2400, quality: 0.9 },
  balanced: { label: 'Balanced', maxSide: 1600, quality: 0.8 },
  small: { label: 'Smallest file', maxSide: 1000, quality: 0.65 },
}
export const DEFAULT_PRESET = 'balanced'
export const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 }
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// Opens a picture file so it can be drawn. Phone photos are turned the right way up.
export function loadPicture(file) {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

// Width and height of the picture after turning it by `rotation` degrees (0, 90, 180, 270).
export function turnedSize(picture, rotation) {
  return rotation % 180 === 0
    ? { width: picture.width, height: picture.height }
    : { width: picture.height, height: picture.width }
}

// Draws the whole turned picture onto a canvas context at the given scale.
export function drawTurned(context, picture, rotation, scale) {
  const { width, height } = turnedSize(picture, rotation)
  context.save()
  context.translate((width * scale) / 2, (height * scale) / 2)
  context.rotate((rotation * Math.PI) / 180)
  context.drawImage(
    picture,
    (-picture.width * scale) / 2,
    (-picture.height * scale) / 2,
    picture.width * scale,
    picture.height * scale,
  )
  context.restore()
}

// The largest centred square, as a crop (parts of the turned picture from 0 to 1).
export function squareCrop(picture, rotation) {
  const { width, height } = turnedSize(picture, rotation)
  if (width >= height) {
    const w = height / width
    return { x: (1 - w) / 2, y: 0, w, h: 1 }
  }
  const h = width / height
  return { x: 0, y: (1 - h) / 2, w: 1, h }
}

// Produces the finished picture: turned, cropped, made smaller and saved as JPG.
export async function renderPicture(picture, { rotation = 0, crop = FULL_CROP, preset = DEFAULT_PRESET } = {}) {
  const { maxSide, quality } = PRESETS[preset]
  const turned = turnedSize(picture, rotation)
  const cropWidth = Math.max(1, Math.round(crop.w * turned.width))
  const cropHeight = Math.max(1, Math.round(crop.h * turned.height))
  const scale = Math.min(1, maxSide / Math.max(cropWidth, cropHeight))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cropWidth * scale))
  canvas.height = Math.max(1, Math.round(cropHeight * scale))
  const context = canvas.getContext('2d')
  // JPG has no see-through areas, so those become white instead of black.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingQuality = 'high'
  context.translate(-crop.x * turned.width * scale, -crop.y * turned.height * scale)
  drawTurned(context, picture, rotation, scale)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('This picture could not be prepared.')
  return { blob, width: canvas.width, height: canvas.height }
}

export function asJpgFile(blob, originalName) {
  const base = (originalName || 'picture').replace(/\.[^.]+$/, '')
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}

// Compresses a picture with the default setting, without showing the editor.
// Used when several pictures are added at once.
export async function quickCompress(file) {
  const picture = await loadPicture(file)
  try {
    const { blob } = await renderPicture(picture)
    // A small picture can come out larger as JPG; then the original is kept.
    return blob.size < file.size || file.size > MAX_UPLOAD_BYTES ? asJpgFile(blob, file.name) : file
  } finally {
    picture.close?.()
  }
}
