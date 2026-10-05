import { useState } from 'react';
import { rebuildTypedText } from '@/core';
import { reextractAllPdfText, usePdfTextStatus } from './pdfText';
import { searchClient, useSearchStatus } from './searchClient';

/** "Rebuild search index": throws the derived search data away and recomputes it from your notes. */
export function SearchSettings() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const status = useSearchStatus();
  const pdf = usePdfTextStatus((s) => s.active);
  const pdfPages = Object.values(pdf).reduce(
    (n, p) => ({ done: n.done + p.done, total: n.total + p.total }),
    {
      done: 0,
      total: 0,
    },
  );

  return (
    <>
      <h2 id="search">Search</h2>
      <div className="btn-row">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg('Rebuilding typed-text index…');
            try {
              await rebuildTypedText((d, t) => setMsg(`Reading pages… ${d}/${t}`));
              searchClient.rebuild();
              setMsg('Reading text from PDFs…');
              await reextractAllPdfText();
              searchClient.rebuild();
              setMsg('The search index was rebuilt.');
            } catch (e) {
              console.error(e);
              setMsg('The search index could not be rebuilt. Your notes are not affected.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Rebuild search index
        </button>
      </div>
      <p className="muted" role="status">
        {status.progress
          ? `Index: ${status.progress.done}/${status.progress.total} documents`
          : pdfPages.total
            ? `Reading PDF text: ${pdfPages.done}/${pdfPages.total} pages`
            : (msg ??
              'Search works from a local index of titles, typed text and PDF text. It can always be rebuilt; it never changes your notes.')}
      </p>
    </>
  );
}
