// Small per-person screen choices (such as which columns are shown).
// They are kept with the person in the database, so they survive a refresh,
// another browser or a phone, and also in this browser as a fallback.
// Nothing important is kept here: if saving fails, the default is used.
import { supabase } from './supabase.js'

let personId = null
const saved = new Map()

// Loads the choices of the signed-in person. Called once, before the screens are drawn.
export async function loadRemembered(id) {
  personId = id
  saved.clear()
  try {
    const { data } = await supabase.from('user_preferences').select('*').eq('user_id', id)
    ;(data ?? []).forEach((row) => saved.set(row.key, row.value))
  } catch {
    // The browser's own copy is used instead.
  }
}

export function recall(key, fallback) {
  if (saved.has(key)) return saved.get(key)
  try {
    const stored = window.localStorage.getItem(key)
    return stored === null ? fallback : JSON.parse(stored)
  } catch {
    return fallback
  }
}

export function remember(key, value) {
  saved.set(key, value)
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not being able to remember a preference is not worth interrupting anyone for.
  }
  if (!personId) return
  supabase
    .from('user_preferences')
    .upsert({ user_id: personId, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' })
    .then(
      () => {},
      () => {},
    )
}
