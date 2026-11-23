import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { friendlyError } from '../lib/format.js'
import { Field } from '../components/Field.jsx'

const MODES = {
  signin: { title: 'Sign in', button: 'Sign in' },
  setup: { title: 'First time here', button: 'Set up my sign-in' },
  forgot: { title: 'Forgot password', button: 'Email me a reset link' },
}

export default function SignIn() {
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setRepeat('')
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    const cleanEmail = email.trim().toLowerCase()

    if (mode === 'setup') {
      if (password.length < 8) return setError('Choose a password of at least 8 characters.')
      if (password !== repeat) return setError('The two passwords do not match.')
    }

    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: failure } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        if (failure) {
          setError(
            /not confirmed/i.test(failure.message)
              ? 'Your email is not confirmed yet. Open the link in the email we sent you.'
              : /invalid login/i.test(failure.message)
                ? 'The email or password is not correct.'
                : friendlyError(failure),
          )
        }
      } else if (mode === 'setup') {
        const { data, error: failure } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin },
        })
        if (failure) {
          setError(
            /database error|not set up/i.test(failure.message)
              ? 'This email is not set up for sign-in. Ask a person with authority All to add you to the user master and switch sign-in on.'
              : friendlyError(failure),
          )
        } else if (!data.session) {
          setNotice('Almost done. Open the link in the email we just sent you, then sign in here.')
          setMode('signin')
          setPassword('')
          setRepeat('')
        }
      } else {
        const { error: failure } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        })
        if (failure) setError(friendlyError(failure))
        else setNotice('If that email can sign in, a reset link is on its way.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-brand">Sample to PO FMS</h1>
        <h2 className="auth-title">{MODES[mode].title}</h2>

        {mode === 'setup' && (
          <>
            <p className="hint">
              Use the email that is in the user master. You choose your own password, and we email you a link to
              confirm it is really you.
            </p>
            <Field label="Your name" htmlFor="auth-name">
              <input id="auth-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
          </>
        )}

        <Field label="Email" htmlFor="auth-email" required>
          <input
            id="auth-email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        {mode !== 'forgot' && (
          <Field label="Password" htmlFor="auth-password" required>
            <input
              id="auth-password"
              className="input"
              type="password"
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        )}

        {mode === 'setup' && (
          <Field label="Password again" htmlFor="auth-repeat" required>
            <input
              id="auth-repeat"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
          </Field>
        )}

        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="alert alert--ok" role="status">
            {notice}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--wide" disabled={busy}>
          {busy ? 'Please wait…' : MODES[mode].button}
        </button>

        <div className="auth-links">
          {mode !== 'signin' && (
            <button type="button" className="link" onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          )}
          {mode === 'signin' && (
            <>
              <button type="button" className="link" onClick={() => switchMode('setup')}>
                First time here?
              </button>
              <button type="button" className="link" onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}

// Shown after someone opens a password reset link from their email.
export function SetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (password.length < 8) return setError('Choose a password of at least 8 characters.')
    if (password !== repeat) return setError('The two passwords do not match.')
    setBusy(true)
    const { error: failure } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (failure) setError(friendlyError(failure))
    else onDone()
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-brand">Sample to PO FMS</h1>
        <h2 className="auth-title">Choose a new password</h2>
        <Field label="New password" htmlFor="new-password" required>
          <input
            id="new-password"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="New password again" htmlFor="new-repeat" required>
          <input
            id="new-repeat"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
        </Field>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--wide" disabled={busy}>
          {busy ? 'Please wait…' : 'Save password'}
        </button>
      </form>
    </div>
  )
}

// Shown when someone is signed in but switched off in the user master.
export function NoAccess({ onSignOut }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-brand">Sample to PO FMS</h1>
        <h2 className="auth-title">Your access is switched off</h2>
        <p className="hint">
          You are signed in, but your sign-in is switched off or you are marked inactive in the user master. Ask a
          person with authority All to switch it back on.
        </p>
        <button type="button" className="btn btn--wide" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
