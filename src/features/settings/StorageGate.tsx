import { useEffect, useState, type ReactNode } from 'react';
import { db } from '@/core';

type State = 'checking' | 'ok' | 'blocked';

/**
 * Opens the local database before the app renders. If the browser refuses (private browsing in
 * some browsers, storage blocked, disk full, another tab holding an old version open) the user
 * gets an explanation and a retry instead of a broken app.
 */
export function StorageGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking');
  const [detail, setDetail] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dead = false;
    setState('checking');
    db.open()
      .then(() => !dead && setState('ok'))
      .catch((e: unknown) => {
        console.error('Database could not be opened', e);
        if (dead) return;
        setDetail(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
        setState('blocked');
      });
    // Another tab running an older version can hold the database open.
    db.on('blocked', () => console.warn('Database upgrade is waiting for other tabs to close'));
    return () => {
      dead = true;
    };
  }, [attempt]);

  if (state === 'ok') return <>{children}</>;
  if (state === 'checking')
    return (
      <p role="status" className="fatal">
        Opening your notebooks…
      </p>
    );
  return (
    <div className="fatal" role="alert">
      <h1>Storage isn’t available</h1>
      <p>
        Notebook keeps everything on this device, but the browser wouldn’t let it open its storage.
        Common causes:
      </p>
      <ul>
        <li>Private or “lockdown” browsing modes that block local storage.</li>
        <li>The device is out of storage space.</li>
        <li>The same app is open in another tab or window that needs to be closed.</li>
      </ul>
      <p>Close other Notebook tabs, free some space or leave private browsing, then try again.</p>
      <div className="btn-row">
        <button className="btn primary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
      <details>
        <summary>Technical details</summary>
        <pre>{detail}</pre>
      </details>
    </div>
  );
}
