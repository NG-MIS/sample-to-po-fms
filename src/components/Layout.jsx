import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import ClickableImage from './ClickableImage.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useEscape } from '../lib/escape.js'
import { useIsPhone } from '../lib/screen.js'

const MENU = [
  {
    title: 'Sampling',
    links: [{ to: '/samples', label: 'Samples' }],
  },
  {
    title: 'Masters',
    links: [
      { to: '/users', label: 'User master' },
      { to: '/departments', label: 'Departments' },
      { to: '/designations', label: 'Designations' },
      { to: '/roles', label: 'Roles' },
      { to: '/numbering', label: 'Numbering' },
      { to: '/references', label: 'References' },
    ],
  },
]

// The frame around every screen: menu on the left, signed-in person on top.
// On a phone the menu is a drawer opened from the button in the top bar.
export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const isPhone = useIsPhone()
  const [menuOpen, setMenuOpen] = useState(false)
  const drawerOpen = isPhone && menuOpen

  useEscape(() => setMenuOpen(false), drawerOpen)

  return (
    <div className="shell">
      {drawerOpen && <div className="side-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`side ${isPhone ? 'side--drawer' : ''} ${drawerOpen ? 'side--open' : ''}`}>
        <div className="side-brand">Sample to PO FMS</div>
        <nav aria-label="Main menu">
          {MENU.map((group) => (
            <div key={group.title} className="side-group">
              <div className="side-group-title">{group.title}</div>
              {group.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => `side-link ${isActive ? 'side-link--on' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="top">
          {isPhone && (
            <>
              <button
                type="button"
                className="icon-btn menu-btn"
                aria-label="Menu"
                aria-expanded={drawerOpen}
                onClick={() => setMenuOpen(true)}
              >
                ☰
              </button>
              <span className="top-brand">Sample to PO FMS</span>
            </>
          )}
          <div className="top-user">
            <ClickableImage
              bucket="avatars"
              path={profile.avatar_path}
              alt={profile.name}
              fallbackName={profile.name}
              size={32}
              round
            />
            <span className="top-name">{profile.name}</span>
          </div>
          <button type="button" className="btn btn--small" onClick={signOut}>
            Sign out
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}

// Heading row at the top of a screen.
export function PageHead({ title, note }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {note && <p className="page-note">{note}</p>}
    </div>
  )
}
