import { useRef, useState } from 'react';
import { rebuildTypedText } from '@/core';
import { Dialog } from '@/ui/Dialog';
import { ensureAllPdfText } from '../search/pdfText';
import { searchClient } from '../search/searchClient';
import {
  ArchiveError,
  importArchive,
  inspectArchive,
  type ArchiveInfo,
  type ExportProgress,
  type ImportMode,
  type ImportResult,
} from './archive';
import { saveLibraryBackup } from './saveArchive';

const fmtBytes = (n: number) =>
  n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Restore flow: look inside the file first, then let the user choose Merge or Replace. */
export function RestoreDialog({ file, onClose }: { file: File; onClose: () => void }) {
  const [info, setInfo] = useState<ArchiveInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [backupFirst, setBackupFirst] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const started = useRef(false);

  if (!started.current) {
    started.current = true;
    inspectArchive(file)
      .then(setInfo)
      .catch((e) =>
        setError(e instanceof ArchiveError ? e.message : 'This file could not be read.'),
      );
  }

  const run = async () => {
    if (!info) return;
    setError(null);
    try {
      if (mode === 'replace' && backupFirst) {
        setBusy('Saving a backup of your current library…');
        const saved = await saveLibraryBackup((p: ExportProgress) =>
          setBusy(`${p.phase}… ${p.done}/${p.total}`),
        );
        if (!saved) {
          setBusy(null);
          setError('The restore was cancelled because the safety backup was not saved.');
          return;
        }
      }
      setBusy('Restoring…');
      const result = await importArchive(file, mode, (p) =>
        setBusy(`${p.phase}… ${p.done}/${p.total}`),
      );
      setBusy('Updating search…');
      await rebuildTypedText();
      searchClient.rebuild();
      void ensureAllPdfText();
      setDone(result);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof ArchiveError
          ? e.message
          : 'The backup could not be restored. Nothing was changed.',
      );
    } finally {
      setBusy(null);
    }
  };

  const isDoc = info?.scope === 'document';
  return (
    <Dialog title="Restore from backup" onClose={busy ? () => undefined : onClose}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!info && !error && <p role="status">Reading the file…</p>}
      {done && (
        <>
          <p role="status">
            Done: {done.documents} notebook{done.documents === 1 ? '' : 's'}, {done.folders} folder
            {done.folders === 1 ? '' : 's'} and {done.pages} pages restored
            {done.remapped
              ? ` (${done.remapped} items already existed and were added as copies)`
              : ''}
            .
          </p>
          <div className="btn-row end">
            <button className="btn primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
      {info && !done && (
        <>
          <p>
            <strong>{file.name}</strong> ({fmtBytes(file.size)})
            <br />
            {isDoc ? 'A single notebook' : 'A full library backup'}, made{' '}
            {new Date(info.createdAt).toLocaleString()} with Notebook {info.appVersion}.
          </p>
          <ul>
            <li>{info.counts.documents} document(s)</li>
            {!isDoc && <li>{info.counts.folders} folder(s)</li>}
            <li>{info.counts.pages} page(s)</li>
            <li>
              {info.counts.assets} stored file(s) ({fmtBytes(info.counts.bytes)})
            </li>
          </ul>
          {info.titles.length > 0 && <p className="muted">Includes: {info.titles.join(', ')}…</p>}
          <fieldset className="restore-mode" disabled={!!busy}>
            <legend>How should it be restored?</legend>
            <label className="check">
              <input
                type="radio"
                name="mode"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
              />
              Merge: add to my library (anything that clashes is added as a copy)
            </label>
            <label className="check">
              <input
                type="radio"
                name="mode"
                checked={mode === 'replace'}
                disabled={isDoc}
                onChange={() => setMode('replace')}
              />
              Replace: delete my current library and use this one
            </label>
          </fieldset>
          {mode === 'replace' && (
            <div className="warn" role="alert">
              <strong>Replace deletes everything currently in your library.</strong>
              <label className="check">
                <input
                  type="checkbox"
                  checked={backupFirst}
                  onChange={(e) => setBackupFirst(e.target.checked)}
                />
                Save a backup of my current library first (recommended)
              </label>
            </div>
          )}
          {busy && <p role="status">{busy}</p>}
          <div className="btn-row end">
            <button className="btn" onClick={onClose} disabled={!!busy}>
              Cancel
            </button>
            <button
              className={mode === 'replace' ? 'btn danger' : 'btn primary'}
              onClick={() => void run()}
              disabled={!!busy}
            >
              {mode === 'replace' ? 'Replace my library' : 'Merge into my library'}
            </button>
          </div>
        </>
      )}
      {error && !info && (
        <div className="btn-row end">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </Dialog>
  );
}
