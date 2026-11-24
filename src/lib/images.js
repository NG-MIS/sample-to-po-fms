import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Pictures and voice notes are kept private. A file is shown through a
// temporary link that only signed-in people can ask for.
const VIEW_SECONDS = 60 * 60
const SHARE_SECONDS = 60 * 60 * 24 * 7
// A chosen picture may be large (a phone photo); it is made smaller before upload.
const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const cache = new Map()

export async function getImageUrl(bucket, path) {
  const key = `${bucket}/${path}`
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.url
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, VIEW_SECONDS)
  if (error) throw error
  cache.set(key, { url: data.signedUrl, expires: Date.now() + (VIEW_SECONDS - 300) * 1000 })
  return data.signedUrl
}

// A link that keeps working for 7 days, for "Copy link".
export async function getShareLink(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SHARE_SECONDS)
  if (error) throw error
  return data.signedUrl
}

export function useImageUrl(bucket, path) {
  const [state, setState] = useState({ key: null, url: null })
  const key = bucket && path ? `${bucket}/${path}` : null

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    getImageUrl(bucket, path)
      .then((url) => !cancelled && setState({ key, url }))
      .catch(() => !cancelled && setState({ key, url: null }))
    return () => {
      cancelled = true
    }
  }, [key, bucket, path])

  return state.key === key ? state.url : null
}

export function checkImageFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Choose a JPG, PNG or WEBP picture.'
  if (file.size > MAX_BYTES) return 'The picture must be 25 MB or smaller.'
  return ''
}

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
}

// Uploads a picture or voice note and gives back where it was stored.
export async function uploadFile(bucket, file, folder) {
  const type = file.type.split(';')[0]
  const extension = EXTENSIONS[type]
  if (!extension) throw new Error('This kind of file cannot be stored.')
  const path = `${folder}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: type })
  if (error) throw error
  return path
}

export const uploadImage = uploadFile

// A temporary address for a file that has been chosen but not uploaded yet.
export function useObjectUrl(file) {
  const [state, setState] = useState({ file: null, url: null })

  useEffect(() => {
    if (!file) return undefined
    // The address is created and released together, so it is never used after release.
    const url = URL.createObjectURL(file)
    // eslint-disable-next-line react/set-state-in-effect
    setState({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])

  return state.file === file ? state.url : null
}
