import { useEffect, useRef, useState } from 'react';
import { getPageThumbnail, setPageThumbnail, type Page } from '@/core';
import { renderPdfThumbnail } from '../pdf/pdfBackground';

/** Saved page thumbnail. With `lazy`, waits until the element scrolls near the viewport. */
export function PageThumbImg({ page, lazy = false }: { page: Page; lazy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!lazy || !ref.current) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), {
      rootMargin: '300px',
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [lazy]);

  useEffect(() => {
    if (!visible) return;
    let current: string | null = null;
    let dead = false;
    void (async () => {
      let blob = await getPageThumbnail(page.id);
      // PDF pages have no saved thumbnail until first needed: render and keep one.
      if (!blob && page.pdf) {
        try {
          blob =
            (await renderPdfThumbnail(page.documentId, page.pdf.index, page.width, page.height)) ??
            undefined;
          if (blob) await setPageThumbnail(page.documentId, page.id, blob);
        } catch {
          /* leave the placeholder */
        }
      }
      if (dead || !blob) return;
      current = URL.createObjectURL(blob);
      setUrl(current);
    })();
    return () => {
      dead = true;
      if (current) URL.revokeObjectURL(current);
    };
    // updatedAt changes after saves, so the image refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, page.id, page.updatedAt]);

  return (
    <div
      ref={ref}
      className="page-thumb"
      style={{ aspectRatio: `${page.width} / ${page.height}`, background: page.background }}
    >
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  );
}
