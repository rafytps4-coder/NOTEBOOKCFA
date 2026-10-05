import { useStorageStore } from '@/core';
import { useSetting } from '@/ui/useLive';

/** Calm, dismissible notice shown only when the browser has not granted persistent storage. */
export function PersistenceNotice() {
  const persisted = useStorageStore((s) => s.persisted);
  const [dismissed, setDismissed] = useSetting('notice.persistence.dismissed', false);
  if (persisted !== false || dismissed) return null;
  return (
    <div className="notice" role="status">
      <p>
        Your browser hasn’t promised to keep this app’s storage. If the device runs low on space or
        you don’t visit for a while, it may clear your notes. Keep regular backups so nothing is
        lost. (Backup &amp; restore is <span className="badge">Planned</span>.)
      </p>
      <button className="btn" onClick={() => setDismissed(true)}>
        Dismiss
      </button>
    </div>
  );
}
