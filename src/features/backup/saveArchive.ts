import { getSetting, setSetting } from '@/core';
import { safeFilename, saveBlob } from '@/ui/saveFile';
import type { ExportProgress } from './archive';

export const LAST_BACKUP_KEY = 'backup.lastAt';

type FsWritable = {
  write(b: Blob | Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?: () => Promise<void>;
};
type FsPicker = (o: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<FsWritable> }>;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Save a built archive: stream it straight to a file when the File System Access API is available
 * (nothing is held in memory), otherwise build a Blob and download it. Returns false if the user
 * cancelled the save dialog.
 */
async function saveArchiveVia(
  filename: string,
  build: (opts: {
    sink?: (p: Uint8Array | Blob) => Promise<void>;
    onProgress?: (p: ExportProgress) => void;
  }) => Promise<Blob | null>,
  onProgress?: (p: ExportProgress) => void,
): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: FsPicker }).showSaveFilePicker;
  if (picker) {
    let writable: FsWritable | null = null;
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [
          { description: 'Notebook backup', accept: { 'application/x-notebook': ['.notebook'] } },
        ],
      });
      writable = await handle.createWritable();
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return false;
      // Any other failure: fall back to a normal download below.
    }
    if (writable) {
      const w = writable;
      try {
        await build({ sink: (p) => w.write(p), onProgress });
        await w.close();
        return true;
      } catch (e) {
        await w.abort?.().catch(() => undefined);
        throw e;
      }
    }
  }
  const blob = await build({ onProgress });
  if (!blob) throw new Error('Export produced no file.');
  await saveBlob(blob, filename);
  return true;
}

/** Export the whole library to a `.notebook` file and remember when. */
export async function saveLibraryBackup(
  onProgress?: (p: ExportProgress) => void,
): Promise<boolean> {
  const ok = await saveArchiveVia(
    `Notebook-backup-${today()}.notebook`,
    async (o) => (await import('./archive')).exportLibrary(o),
    onProgress,
  );
  if (ok) await setSetting(LAST_BACKUP_KEY, Date.now());
  return ok;
}

export async function saveDocumentFile(
  documentId: string,
  title: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<boolean> {
  return saveArchiveVia(
    `${safeFilename(title)}.notebook`,
    async (o) => (await import('./archive')).exportDocument(documentId, o),
    onProgress,
  );
}

export async function lastBackupAt(): Promise<number | null> {
  return getSetting<number | null>(LAST_BACKUP_KEY, null);
}

/** True when a reminder should show: enabled, and the last backup (or first run) is too old. */
export function reminderDue(opts: {
  days: number;
  lastBackupAt: number | null;
  firstRunAt: number;
  dismissedAt: number | null;
  now?: number;
}): boolean {
  if (opts.days <= 0) return false;
  const now = opts.now ?? Date.now();
  const since = opts.lastBackupAt ?? opts.firstRunAt;
  if (now - since < opts.days * 86_400_000) return false;
  // A dismissed reminder stays quiet for a day.
  return !(opts.dismissedAt && now - opts.dismissedAt < 86_400_000);
}
