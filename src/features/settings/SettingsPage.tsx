import { useThemeStore, type ThemeMode } from '@/ui/theme';
import { useSetting } from '@/ui/useLive';
import type { InputMode } from '@/features/editor/CanvasController';
import {
  FALLBACK_DEFAULTS,
  PAGE_DEFAULTS_KEY,
  type PageDefaults,
} from '@/features/editor/pageDefaults';
import { cleanupOrphanAssets, findOrphanAssets, type TemplateKind } from '@/core';
import { useState } from 'react';
import { BackupSettings } from '@/features/backup/BackupSettings';
import { SearchSettings } from '@/features/search/SearchSettings';
import { AboutSection } from '@/features/about/AboutSection';
import { ShortcutsHost } from '@/features/help/ShortcutsDialog';
import { FirstRunGuide } from '@/features/help/FirstRunGuide';
import { InstallGuidance } from '@/features/pwa/InstallGuidance';
import { applyTextScale, useTextScale, TEXT_SCALES } from '@/ui/textScale';

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function SettingsPage() {
  const { mode, setMode } = useThemeStore();
  const [defaults, setDefaults] = useSetting<Partial<PageDefaults>>(PAGE_DEFAULTS_KEY, {});
  // Local copy updates immediately so quick successive changes never overwrite each other.
  const [localDefaults, setLocalDefaults] = useState<Partial<PageDefaults>>({});
  const pd = { ...FALLBACK_DEFAULTS, ...defaults, ...localDefaults };
  const updateDefaults = (patch: Partial<PageDefaults>) => {
    const next = { ...pd, ...patch };
    setLocalDefaults(next);
    setDefaults(next);
  };
  const [cleanup, setCleanup] = useState<string | null>(null);
  const [introSignal, setIntroSignal] = useState(false);
  const [shortcutsSignal, setShortcutsSignal] = useState(0);
  const textScale = useTextScale((s) => s.scale);
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
      <h2 id="text-size">Text size</h2>
      <div className="btn-row" role="group" aria-labelledby="text-size">
        {TEXT_SCALES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn"
            aria-pressed={textScale === t.value}
            onClick={() => applyTextScale(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="muted">Makes text and buttons larger or smaller everywhere in the app.</p>
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
            onChange={(e) => updateDefaults({ kind: e.target.value as TemplateKind })}
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
              updateDefaults({ sizeName: e.target.value as PageDefaults['sizeName'] })
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
              updateDefaults({ orientation: e.target.value as PageDefaults['orientation'] })
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
      <BackupSettings />
      <h2 id="cleanup">Unused files</h2>
      <div className="btn-row" role="group" aria-labelledby="storage">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const { report } = await findOrphanAssets();
            if (report.count === 0)
              return setCleanup('Nothing to clean up: every stored image is in use.');
            const done = await cleanupOrphanAssets();
            setCleanup(
              `Removed ${done.count} unused image${done.count === 1 ? '' : 's'} (${(done.bytes / 1024).toFixed(0)} KB).`,
            );
          }}
        >
          Clean up storage
        </button>
      </div>
      <p className="muted" role="status">
        {cleanup ??
          'Removes images that are no longer used on any page. Close open notebooks first; things you can still undo are kept until then.'}
      </p>
      <SearchSettings />
      <InstallGuidance />
      <AboutSection
        onShowIntro={() => setIntroSignal(true)}
        onShowShortcuts={() => setShortcutsSignal((n) => n + 1)}
      />
      <ShortcutsHost openSignal={shortcutsSignal} />
      <FirstRunGuide forceOpen={introSignal} onClosed={() => setIntroSignal(false)} />
    </section>
  );
}
