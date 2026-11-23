import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Pictures are kept private. A picture is shown through a temporary link
// that only signed-in people can ask for.
const VIEW_SECONDS = 60 * 60
const SHARE_SECONDS = 60 * 60 * 24 * 7
const MAX_BYTES = 5 * 1024 * 1024
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
  if (file.size > MAX_BYTES) return 'The picture must be 5 MB or smaller.'
  return ''
}

// Uploads a picture and gives back where it was stored.
export async function uploadImage(bucket, file, folder) {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
  const path = `${folder}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type })
  if (error) throw error
  return path
}
