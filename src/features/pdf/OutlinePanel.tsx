import { useEffect, useState } from 'react';
import { loadOutline, type OutlineItem } from './pdfDocs';

/** The PDF's own table of contents (bookmarks), shown only if the file has one. */
export function OutlinePanel({
  documentId,
  onJump,
}: {
  documentId: string;
  onJump: (pdfPageIndex: number) => void;
}) {
  const [items, setItems] = useState<OutlineItem[] | null>(null);
  useEffect(() => {
    let dead = false;
    void loadOutline(documentId)
      .then((o) => !dead && setItems(o))
      .catch(() => !dead && setItems([]));
    return () => {
      dead = true;
    };
  }, [documentId]);

  if (items === null) return <p className="muted pad">Loading outline…</p>;
  if (items.length === 0) return <p className="muted pad">This PDF has no outline.</p>;
  const render = (list: OutlineItem[], depth = 0): React.ReactNode => (
    <ul className="outline" style={{ paddingLeft: depth ? 12 : 0 }}>
      {list.map((it, i) => (
        <li key={`${depth}-${i}-${it.title}`}>
          <button
            type="button"
            className="outline-item"
            disabled={it.pageIndex === null}
            onClick={() => it.pageIndex !== null && onJump(it.pageIndex)}
          >
            {it.title}
            {it.pageIndex !== null && <span className="muted"> · p.{it.pageIndex + 1}</span>}
          </button>
          {it.items.length > 0 && render(it.items, depth + 1)}
        </li>
      ))}
    </ul>
  );
  return <nav aria-label="PDF outline">{render(items)}</nav>;
}

export async function hasOutline(documentId: string): Promise<boolean> {
  try {
    return (await loadOutline(documentId)).length > 0;
  } catch {
    return false;
  }
}
