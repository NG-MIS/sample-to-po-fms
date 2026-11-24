const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

export function formatDateTime(value) {
  if (!value) return ''
  return dateTime.format(new Date(value))
}

const dateOnly = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

// For plain dates stored as YYYY-MM-DD (no time of day).
export function formatDate(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return dateOnly.format(new Date(year, month - 1, day))
}

// Today's date on this computer, as YYYY-MM-DD.
export function todayLocal() {
  const now = new Date()
  const pad = (number) => String(number).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function initials(name) {
  return (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

// Turns a database or sign-in error into a sentence a person can act on.
export function friendlyError(error) {
  if (!error) return ''
  const message = error.message || String(error)
  if (error.code === '23505') {
    return message.includes('email')
      ? 'That email is already in the user master.'
      : message.includes('prefix')
        ? 'That prefix already exists.'
        : message.includes('_code_key')
          ? 'That code already exists.'
          : 'That name already exists.'
  }
  if (error.code === '42501' || /row-level security/i.test(message)) {
    return 'You do not have permission to do this.'
  }
  if (/Failed to fetch|NetworkError/i.test(message)) {
    return 'Could not reach the database. Check the internet connection and try again.'
  }
  return message
}

// A tag is kept without its # sign: "#Party  wear" is saved as "Party wear".
export const cleanTagName = (text) => (text || '').trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
