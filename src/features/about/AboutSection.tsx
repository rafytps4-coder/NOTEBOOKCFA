import { useState } from 'react';
import licenses from '@/generated/licenses.json';

export const CFA_DISCLAIMER =
  'Independent study tool. Not affiliated with or endorsed by CFA Institute. CFA® and Chartered Financial Analyst® are trademarks owned by CFA Institute.';

interface Props {
  onShowIntro: () => void;
  onShowShortcuts: () => void;
}

export function AboutSection({ onShowIntro, onShowShortcuts }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <h2 id="about">About</h2>
      <p>
        <strong>Notebook</strong> · version {__APP_VERSION__}
      </p>
      <p>
        <strong>Privacy:</strong> Nothing leaves your device. Notebook has no accounts, no
        analytics, no ads and no tracking. Your notes, PDFs and images are stored in this browser
        only; backups are files you save yourself. It works offline once it has loaded.
      </p>
      <p className="muted">{CFA_DISCLAIMER}</p>
      <div className="btn-row">
        <button className="btn" onClick={onShowIntro}>
          Show the intro again
        </button>
        <button className="btn" onClick={onShowShortcuts}>
          Keyboard shortcuts
        </button>
      </div>
      <details className="licenses">
        <summary>Open-source licences ({licenses.length} packages)</summary>
        <p className="muted">Notebook is built with the following open-source software.</p>
        <ul>
          {licenses.map((l) => {
            const id = `${l.name}@${l.version}`;
            return (
              <li key={id}>
                <button
                  className="link-btn"
                  aria-expanded={open === id}
                  onClick={() => setOpen(open === id ? null : id)}
                >
                  {l.name} {l.version} — {l.license}
                </button>
                {open === id && (
                  <pre className="license-text">
                    {l.text || 'No licence file included; see the package.'}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </>
  );
}
