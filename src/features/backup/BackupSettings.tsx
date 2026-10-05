import { Suspense, lazy, useEffect, useState } from 'react';
import { useStorageStore, requestPersistence } from '@/core';
import { useSetting } from '@/ui/useLive';
// The restore flow (and the archive reader/validator behind it) loads only when someone restores.
const RestoreDialog = lazy(() =>
  import('./RestoreDialog').then((m) => ({ default: m.RestoreDialog })),
);
import { LAST_BACKUP_KEY, saveLibraryBackup } from './saveArchive';

const fmtBytes = (n: number) =>
  n > 1073741824
    ? `${(n / 1073741824).toFixed(2)} GB`
    : n > 1048576
      ? `${(n / 1048576).toFixed(1)} MB`
      : `${Math.round(n / 1024)} KB`;

export function BackupSettings() {
  const persisted = useStorageStore((s) => s.persisted);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [last] = useSetting<number | null>(LAST_BACKUP_KEY, null);
  const [days, setDays] = useSetting<number>('backup.reminderDays', 0);
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const refreshUsage = () =>
    void navigator.storage
      ?.estimate?.()
      .then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }));
  useEffect(refreshUsage, []);

  return (
    <>
      <h2 id="storage-backup">Storage &amp; backup</h2>
      <p>
        {usage
          ? `Using ${fmtBytes(usage.used)} of about ${fmtBytes(usage.quota)} available to this app.`
          : 'Storage use is not available in this browser.'}{' '}
        {persisted === null
          ? ''
          : persisted
            ? 'The browser has promised to keep your data.'
            : 'The browser has not promised to keep your data, so back up regularly.'}
      </p>
      <div className="btn-row">
        {persisted === false && (
          <button className="btn" onClick={() => void requestPersistence()}>
            Ask the browser to keep my data
          </button>
        )}
        <button
          className="btn primary"
          disabled={progress !== null}
          onClick={async () => {
            setMsg(null);
            try {
              const ok = await saveLibraryBackup((p) =>
                setProgress(`${p.phase}… ${p.done}/${p.total}`),
              );
              setMsg(ok ? 'Backup saved.' : 'Backup cancelled.');
            } catch (e) {
              console.error(e);
              setMsg('The backup could not be saved. Your library is unchanged.');
            } finally {
              setProgress(null);
              refreshUsage();
            }
          }}
        >
          Export everything
        </button>
        <label className="btn file-btn">
          Restore from backup…
          <input
            type="file"
            accept=".notebook,application/x-notebook,application/zip"
            hidden
            aria-label="Choose a backup file to restore"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setRestoreFile(f);
            }}
          />
        </label>
      </div>
      <p className="muted" role="status">
        {progress ??
          msg ??
          (last
            ? `Last backup: ${new Date(last).toLocaleString()}`
            : 'You have not made a backup yet.')}
      </p>
      <label className="inline-field">
        Remind me to back up
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={0}>Never</option>
          <option value={7}>Every week</option>
          <option value={14}>Every 2 weeks</option>
          <option value={30}>Every month</option>
        </select>
      </label>
      {restoreFile && (
        <Suspense fallback={<p role="status">Loading…</p>}>
          <RestoreDialog file={restoreFile} onClose={() => setRestoreFile(null)} />
        </Suspense>
      )}
    </>
  );
}
