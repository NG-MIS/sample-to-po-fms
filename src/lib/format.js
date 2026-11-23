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
