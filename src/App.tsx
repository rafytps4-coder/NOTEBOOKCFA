import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Planned } from './ui/Planned';
import { SettingsPage } from './features/settings/SettingsPage';

const NAV = [
  { to: '/library', label: 'Library', icon: '▤' },
  { to: '/recent', label: 'Recent', icon: '◷' },
  { to: '/search', label: 'Search', icon: '⌕' },
  { to: '/helpers', label: 'Helpers', icon: '✦' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
] as const;

export function App() {
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="nav-title">Notebook</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to}>
            <span className="icon" aria-hidden="true">
              {n.icon}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route
            path="/library"
            element={<Planned title="Library" text="Folders and notebooks are coming next." />}
          />
          <Route
            path="/recent"
            element={<Planned title="Recent" text="Recently opened documents will appear here." />}
          />
          <Route
            path="/search"
            element={<Planned title="Search" text="Search across your notes is not built yet." />}
          />
          <Route
            path="/helpers"
            element={
              <Planned
                title="Helpers"
                text="Optional subject modules will live here. None are available yet."
              />
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </main>
    </div>
  );
}
