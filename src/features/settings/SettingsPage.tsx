import { useThemeStore, type ThemeMode } from '@/ui/theme';
import { useSetting } from '@/ui/useLive';
import type { InputMode } from '@/features/editor/CanvasController';

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function SettingsPage() {
  const { mode, setMode } = useThemeStore();
  const [input, setInput] = useSetting<InputMode>('editor.inputMode', 'pencilAndFinger');
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
      <h2 id="drawing">Drawing</h2>
      <div className="btn-row" role="group" aria-labelledby="drawing">
        <button
          type="button"
          className="btn"
          aria-pressed={input === 'pencilOnly'}
          onClick={() => setInput('pencilOnly')}
        >
          Pencil only
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={input === 'pencilAndFinger'}
          onClick={() => setInput('pencilAndFinger')}
        >
          Pencil and finger
        </button>
      </div>
      <p className="muted">
        Pencil only: fingers just scroll and zoom. Pencil and finger: a finger can draw until an
        Apple Pencil is used, then fingers are ignored for drawing (palm rejection).
      </p>
    </section>
  );
}
