import { useEffect, useState } from 'react'
import { checkConnection } from './lib/supabase.js'

const STATUS_TEXT = {
  checking: 'Checking the database connection…',
  connected: 'Connected to the database',
  failed: 'Could not reach the database',
}

export default function App() {
  const [status, setStatus] = useState('checking')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    let cancelled = false
    checkConnection()
      .then(() => !cancelled && setStatus('connected'))
      .catch((error) => {
        if (cancelled) return
        setStatus('failed')
        setDetail(error.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="starter">
      <h1>Sample to PO FMS</h1>
      <p className="starter-sub">Sample → CAD approval → Purchase order → Material receiving</p>
      <p className={`starter-status starter-status--${status}`} role="status">
        <span className="starter-dot" aria-hidden="true" />
        {STATUS_TEXT[status]}
      </p>
      {detail && <p className="starter-detail">{detail}</p>}
    </main>
  )
}
