import { useEffect, useState } from 'react';
import { getThumbnail, type NotebookDocument } from '@/core';

/** Page thumbnail if one exists, otherwise a placeholder glyph. Re-checks when the doc changes. */
export function DocThumb({ doc, glyph }: { doc: NotebookDocument; glyph: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    void getThumbnail(doc.id).then((blob) => {
      if (revoked || !blob) return;
      current = URL.createObjectURL(blob);
      setUrl(current);
    });
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [doc.id, doc.updatedAt]);
  return (
    <span className="thumb" aria-hidden="true">
      {url ? <img src={url} alt="" className="thumb-img" /> : glyph}
    </span>
  );
}
