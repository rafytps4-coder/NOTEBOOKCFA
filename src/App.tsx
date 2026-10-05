import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Planned } from './ui/Planned';
import { SettingsPage } from './features/settings/SettingsPage';
import { PersistenceNotice } from './features/settings/PersistenceNotice';
import { LibraryPage } from './features/library/LibraryPage';
import { RecentPage } from './features/library/RecentPage';
import { EditorPage } from './features/editor/EditorPage';

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
        <PersistenceNotice />
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage mode="folder" />} />
          <Route path="/library/f/:folderId" element={<LibraryPage mode="folder" />} />
          <Route path="/library/favorites" element={<LibraryPage mode="favorites" />} />
          <Route path="/library/trash" element={<LibraryPage mode="trash" />} />
          <Route path="/recent" element={<RecentPage />} />
          <Route path="/doc/:id" element={<EditorPage />} />
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
