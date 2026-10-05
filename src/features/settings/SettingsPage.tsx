import { useThemeStore, type ThemeMode } from '@/ui/theme';

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function SettingsPage() {
  const { mode, setMode } = useThemeStore();
  return (
    <section>
      <h1>Settings</h1>
      <h2 id="appearance">Appearance</h2>
      <div className="btn-row" role="group" aria-labelledby="appearance">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="btn"
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </section>
  );
}
