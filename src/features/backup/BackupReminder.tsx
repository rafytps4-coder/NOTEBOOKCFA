import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '@/core';
import { useSetting } from '@/ui/useLive';
import { LAST_BACKUP_KEY, reminderDue, saveLibraryBackup } from './saveArchive';

const FIRST_RUN_KEY = 'app.firstRunAt';
const DISMISSED_KEY = 'backup.reminderDismissedAt';

/** Gentle, dismissible reminder. Off unless the user turns it on in Settings. */
export function BackupReminder() {
  const [days] = useSetting<number>('backup.reminderDays', 0);
  const [last] = useSetting<number | null>(LAST_BACKUP_KEY, null);
  const [dismissed, setDismissed] = useSetting<number | null>(DISMISSED_KEY, null);
  const [firstRun, setFirstRun] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      let t = await getSetting<number | null>(FIRST_RUN_KEY, null);
      if (t === null) {
        t = Date.now();
        await setSetting(FIRST_RUN_KEY, t);
      }
      setFirstRun(t);
    })();
  }, []);

  if (
    firstRun === null ||
    !reminderDue({ days, lastBackupAt: last, firstRunAt: firstRun, dismissedAt: dismissed })
  ) {
    return null;
  }
  return (
    <div className="notice" role="status">
      <p>
        {last
          ? `Your last backup was ${new Date(last).toLocaleDateString()}.`
          : 'You haven’t backed up your notebooks yet.'}{' '}
        A backup file is the only way to get your notes back if this device’s storage is cleared.
      </p>
      <button
        className="btn primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await saveLibraryBackup();
          } finally {
            setBusy(false);
          }
        }}
      >
        Back up now
      </button>
      <button className="btn" onClick={() => setDismissed(Date.now())}>
        Not now
      </button>
    </div>
  );
}
