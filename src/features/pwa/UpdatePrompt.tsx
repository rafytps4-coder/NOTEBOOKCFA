import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useState } from 'react';
import { flushAllPages } from '../editor/pageRegistry';

/**
 * New versions download quietly in the background and wait. Nothing reloads until the user taps
 * "Update now", and pending ink is saved first, so an update can never interrupt writing.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (e) => console.warn('Service worker registration failed', e),
  });
  const [busy, setBusy] = useState(false);

  // "Ready offline" is good news, not a task: let it fade away on its own.
  useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const t = window.setTimeout(() => setOfflineReady(false), 8000);
    return () => window.clearTimeout(t);
  }, [offlineReady, needRefresh, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {needRefresh ? (
        <>
          <span>A new version of Notebook is ready.</span>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await flushAllPages(); // never lose the last strokes to a reload
              await updateServiceWorker(true);
            }}
          >
            Update now
          </button>
          <button className="btn" onClick={() => setNeedRefresh(false)}>
            Later
          </button>
        </>
      ) : (
        <>
          <span>Notebook is ready to work offline.</span>
          <button className="btn" onClick={() => setOfflineReady(false)}>
            OK
          </button>
        </>
      )}
    </div>
  );
}
