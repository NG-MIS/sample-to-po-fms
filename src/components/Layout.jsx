import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import ClickableImage from './ClickableImage.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useEscape } from '../lib/escape.js'
import { isMasterPath } from '../lib/masters.js'
import { recall, remember } from '../lib/remember.js'
import { useIsPhone } from '../lib/screen.js'

const MENU = [
  {
    title: 'Sampling',
    links: [
      { to: '/samples', label: 'Samples' },
      { to: '/process-log', label: 'Process log' },
      { to: '/wishlist', label: 'Wishlist' },
      { to: '/cad', label: 'CAD drawings' },
      { to: '/materials', label: 'Material lists' },
      { to: '/purchase-orders', label: 'Purchase orders' },
      { to: '/fabric-receiving', label: 'Fabric receiving' },
      { to: '/accessory-receiving', label: 'Accessory receiving' },
    ],
  },
  {
    title: 'Masters',
    // one screen; every master is a tab on it
    links: [{ to: '/masters', label: 'Masters', isOn: isMasterPath }],
  },
]

// The frame around every screen: menu on the left, signed-in person on top.
// On a phone the menu is a drawer opened from the button in the top bar.
export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const isPhone = useIsPhone()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const drawerOpen = isPhone && menuOpen
  // Which menu groups the person has folded away (remembered in their browser).
  const [folded, setFolded] = useState(() => new Set(recall('menu-folded', [])))

  const toggleGroup = (title) => {
    const next = new Set(folded)
    if (next.has(title)) next.delete(title)
    else next.add(title)
    setFolded(next)
    remember('menu-folded', [...next])
  }

  useEscape(() => setMenuOpen(false), drawerOpen)

  return (
    <div className="shell">
      {drawerOpen && <div className="side-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`side ${isPhone ? 'side--drawer' : ''} ${drawerOpen ? 'side--open' : ''}`}>
        <div className="side-brand">Sample to PO FMS</div>
        <nav aria-label="Main menu">
          {MENU.map((group) => {
            const isFolded = folded.has(group.title)
            return (
              <div key={group.title} className="side-group">
                <button
                  type="button"
                  className="side-group-title"
                  aria-expanded={!isFolded}
                  onClick={() => toggleGroup(group.title)}
                >
                  <span>{group.title}</span>
                  <span className={`side-group-arrow ${isFolded ? 'side-group-arrow--folded' : ''}`} aria-hidden="true">
                    ▾
                  </span>
                </button>
                {!isFolded &&
                  group.links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) => `side-link ${(link.isOn ? link.isOn(pathname) : isActive) ? 'side-link--on' : ''}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      {link.label}
                    </NavLink>
                  ))}
              </div>
            )
          })}
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
