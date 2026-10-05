import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePdfTextStatus } from './pdfText';
import { searchClient, useSearchStatus } from './searchClient';
import type { SearchHit, Segment } from './searchIndex';

interface Group {
  documentId: string;
  title: string;
  docHit: SearchHit | null;
  pages: SearchHit[];
  score: number;
}

/** Group page hits under their document, keeping the best-scoring group first. */
export function groupHits(hits: SearchHit[]): { folders: SearchHit[]; groups: Group[] } {
  const folders = hits.filter((h) => h.kind === 'folder');
  const map = new Map<string, Group>();
  for (const h of hits) {
    if (h.kind === 'folder' || !h.documentId) continue;
    let g = map.get(h.documentId);
    if (!g)
      map.set(
        h.documentId,
        (g = { documentId: h.documentId, title: h.title, docHit: null, pages: [], score: h.score }),
      );
    g.score = Math.max(g.score, h.score);
    if (h.kind === 'document') g.docHit = h;
    else if (!g.pages.some((p) => p.pageId === h.pageId)) g.pages.push(h);
  }
  for (const g of map.values()) g.pages.sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
  return { folders, groups: [...map.values()].sort((a, b) => b.score - a.score) };
}

function Snippet({ segments }: { segments: Segment[] }) {
  return (
    <span className="snippet">
      {segments.map((s, i) =>
        s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>,
      )}
    </span>
  );
}

const MAX_PAGES_SHOWN = 5;

export function SearchPage() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState('');
  const status = useSearchStatus();
  const pdfActive = usePdfTextStatus((s) => s.active);
  const seq = useRef(0);

  useEffect(() => {
    searchClient.start();
  }, []);

  // Instant results as you type (short debounce), and again when the index finishes building.
  useEffect(() => {
    const my = ++seq.current;
    const t = window.setTimeout(() => {
      void searchClient.search(q).then((h) => {
        if (my === seq.current) {
          setHits(h);
          setSearched(q.trim());
        }
      });
    }, 60);
    return () => window.clearTimeout(t);
  }, [q, status.ready, status.version]);

  const { folders, groups } = useMemo(() => groupHits(hits), [hits]);
  const indexing = Object.values(pdfActive);
  const pdfDone = indexing.reduce((a, b) => a + b.done, 0);
  const pdfTotal = indexing.reduce((a, b) => a + b.total, 0);

  return (
    <section>
      <h1>Search</h1>
      <input
        type="search"
        className="search-box"
        placeholder="Search titles, folders, typed text and PDF text"
        aria-label="Search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="muted" role="status">
        {status.progress
          ? `Building search index… ${status.progress.done}/${status.progress.total} documents`
          : pdfTotal
            ? `Reading PDF text for search… ${pdfDone}/${pdfTotal} pages`
            : 'Handwriting is not searchable yet: this finds typed text, titles and PDF text.'}
      </p>
      {!searched && <p className="empty">Type to search across all your notebooks and PDFs.</p>}
      {searched && hits.length === 0 && (
        <p className="empty">
          No results for “{searched}”. {status.ready ? '' : 'The index is still being built.'}
        </p>
      )}
      {folders.length > 0 && (
        <ul className="results">
          {folders.map((f) => (
            <li key={f.id}>
              <Link to={`/library/f/${f.folderId}`} className="result-doc">
                <span aria-hidden="true">📁</span> {f.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ul className="results">
        {groups.map((g) => (
          <li key={g.documentId} className="result-group">
            <Link to={`/doc/${g.documentId}`} className="result-doc">
              <span aria-hidden="true">📓</span> {g.title}
            </Link>
            <ul>
              {g.pages.slice(0, MAX_PAGES_SHOWN).map((p) => (
                <li key={p.id}>
                  <Link to={`/doc/${g.documentId}?page=${p.pageId}`} className="result-page">
                    <span className="result-pageno">p. {p.pageNumber}</span>
                    {p.snippet && <Snippet segments={p.snippet} />}
                  </Link>
                </li>
              ))}
              {g.pages.length > MAX_PAGES_SHOWN && (
                <li className="muted">+ {g.pages.length - MAX_PAGES_SHOWN} more pages</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
