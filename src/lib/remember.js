// Small per-person, per-browser conveniences (such as which columns are shown).
// Nothing important is kept here: if the browser refuses, the default is used.
export function recall(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key)
    return stored === null ? fallback : JSON.parse(stored)
  } catch {
    return fallback
  }
}

export function remember(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not being able to remember a preference is not worth interrupting anyone for.
  }
}
