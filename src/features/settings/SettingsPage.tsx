import { useThemeStore, type ThemeMode } from '@/ui/theme';
import { useSetting } from '@/ui/useLive';
import type { InputMode } from '@/features/editor/CanvasController';
import {
  FALLBACK_DEFAULTS,
  PAGE_DEFAULTS_KEY,
  type PageDefaults,
} from '@/features/editor/pageDefaults';
import type { TemplateKind } from '@/core';

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function SettingsPage() {
  const { mode, setMode } = useThemeStore();
  const [defaults, setDefaults] = useSetting<Partial<PageDefaults>>(PAGE_DEFAULTS_KEY, {});
  const pd = { ...FALLBACK_DEFAULTS, ...defaults };
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
      <h2 id="pages">New pages</h2>
      <div className="btn-row" role="group" aria-labelledby="pages">
        <label className="inline-field">
          Template
          <select
            value={pd.kind}
            onChange={(e) => setDefaults({ ...pd, kind: e.target.value as TemplateKind })}
          >
            {['blank', 'ruled', 'grid', 'dotted', 'cornell'].map((k) => (
              <option key={k} value={k}>
                {k[0]!.toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          Size
          <select
            value={pd.sizeName}
            onChange={(e) =>
              setDefaults({ ...pd, sizeName: e.target.value as PageDefaults['sizeName'] })
            }
          >
            <option>A4</option>
            <option>Letter</option>
            <option>A5</option>
          </select>
        </label>
        <label className="inline-field">
          Orientation
          <select
            value={pd.orientation}
            onChange={(e) =>
              setDefaults({ ...pd, orientation: e.target.value as PageDefaults['orientation'] })
            }
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
      </div>
      <p className="muted">
        Used for the first page of new notebooks. Pages you add later copy the page before them.
      </p>
    </section>
  );
}
