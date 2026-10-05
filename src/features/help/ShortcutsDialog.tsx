import { useEffect, useState } from 'react';
import { Dialog } from '@/ui/Dialog';
import { SHORTCUT_GROUPS } from './shortcuts';

/** Opens with the “?” key from anywhere (except while typing), or from a button. */
export function ShortcutsHost({ openSignal }: { openSignal?: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      )
        return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  if (!open) return null;
  return (
    <Dialog title="Keyboard shortcuts" onClose={() => setOpen(false)}>
      <div className="shortcuts">
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.items.map((s) => (
                <div key={s.keys + s.action} className="shortcut-row">
                  <dt>
                    <kbd>{s.keys}</kbd>
                  </dt>
                  <dd>{s.action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="btn-row end">
        <button className="btn primary" autoFocus onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
