import { NavLink, Navigate, Route, Routes, useMatch } from 'react-router-dom';
import { SettingsPage } from './features/settings/SettingsPage';
import { PersistenceNotice } from './features/settings/PersistenceNotice';
import { BackupReminder } from './features/backup/BackupReminder';
import { LibraryPage } from './features/library/LibraryPage';
import { RecentPage } from './features/library/RecentPage';
import { EditorPage } from './features/editor/EditorPage';
import { SearchPage } from './features/search/SearchPage';
import { UpdatePrompt } from './features/pwa/UpdatePrompt';
import { FirstRunGuide } from './features/help/FirstRunGuide';
import { ShortcutsHost } from './features/help/ShortcutsDialog';
import { ErrorBoundary } from './ui/ErrorBoundary';

// "Helpers" (optional subject modules) is not listed until one exists: no placeholder screens.
const NAV = [
  { to: '/library', label: 'Library', icon: '▤' },
  { to: '/recent', label: 'Recent', icon: '◷' },
  { to: '/search', label: 'Search', icon: '⌕' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
] as const;

export function App() {
  const inEditor = useMatch('/doc/:id') !== null;
  return (
    <div className={inEditor ? 'shell shell-editor' : 'shell'}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
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
      <main className="main" id="main" tabIndex={-1}>
        {!inEditor && <PersistenceNotice />}
        {!inEditor && <BackupReminder />}
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route path="/library" element={<LibraryPage mode="folder" />} />
            <Route path="/library/f/:folderId" element={<LibraryPage mode="folder" />} />
            <Route path="/library/favorites" element={<LibraryPage mode="favorites" />} />
            <Route path="/library/trash" element={<LibraryPage mode="trash" />} />
            <Route path="/recent" element={<RecentPage />} />
            <Route path="/doc/:id" element={<EditorPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/library" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      {!inEditor && <ShortcutsHost />}
      {!inEditor && <FirstRunGuide />}
      <UpdatePrompt />
    </div>
  );
}
