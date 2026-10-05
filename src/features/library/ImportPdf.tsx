import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '@/ui/Dialog';
import { ImportError, importPdfFile, looksLikePdf, type ImportProgress } from '../pdf/importPdf';
import { renderPdfThumbnail } from '../pdf/pdfBackground';
import { closePdf } from '../pdf/pdfDocs';
import { listPages, setThumbnail, setPageThumbnail } from '@/core';

/**
 * Import-from-device UI: a button, plus drag-and-drop handlers for the library area.
 * Returns bindings so the page can make its whole body a drop target.
 */
export function usePdfImport(folderId: string) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<{ name: string; progress: ImportProgress | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const importFiles = async (files: File[]) => {
    const pdfs = files.filter(looksLikePdf);
    if (!pdfs.length) {
      setError('Only PDF files can be imported here.');
      return;
    }
    setError(null);
    let last: string | null = null;
    for (const file of pdfs) {
      setBusy({ name: file.name, progress: null });
      try {
        const doc = await importPdfFile(file, folderId, (progress) =>
          setBusy({ name: file.name, progress }),
        );
        last = doc.id;
        // First-page thumbnail for the library card (best effort; imports never fail on this).
        try {
          const first = (await listPages(doc.id))[0];
          if (first) {
            const blob = await renderPdfThumbnail(doc.id, 0, first.width, first.height);
            if (blob) {
              await setThumbnail(doc.id, blob);
              await setPageThumbnail(doc.id, first.id, blob);
            }
          }
        } catch {
          /* ignore */
        } finally {
          await closePdf(doc.id);
        }
      } catch (e) {
        setError(e instanceof ImportError ? e.message : 'The PDF could not be imported.');
        console.error(e);
      }
    }
    setBusy(null);
    if (last && pdfs.length === 1) navigate(`/doc/${last}`);
  };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if ([...e.dataTransfer.types].includes('Files')) {
        e.preventDefault();
        setDragging(true);
      }
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void importFiles([...e.dataTransfer.files]);
    },
  };

  return { importFiles, busy, error, clearError: () => setError(null), dragging, dropProps };
}

export function ImportButton({ onFiles }: { onFiles: (f: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="btn" onClick={() => ref.current?.click()}>
        Import PDF
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        aria-label="Choose PDF files to import"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

export function ImportProgressDialog({
  busy,
}: {
  busy: { name: string; progress: ImportProgress | null } | null;
}) {
  if (!busy) return null;
  const p = busy.progress;
  return (
    <Dialog title="Importing PDF" onClose={() => undefined}>
      <p>
        {busy.name}
        <br />
        <span className="muted" role="status">
          {p ? `Reading page ${p.done} of ${p.total}…` : 'Opening…'}
        </span>
      </p>
      <progress value={p?.done ?? 0} max={p?.total ?? 1} style={{ width: '100%' }} />
    </Dialog>
  );
}
