import { NavLink } from 'react-router-dom'
import ClickableImage from './ClickableImage.jsx'
import { useAuth } from '../lib/auth.jsx'

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
export default function Layout({ children }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="shell">
      <aside className="side">
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
