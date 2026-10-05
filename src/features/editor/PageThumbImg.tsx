import { useEffect, useRef, useState } from 'react';
import { getPageThumbnail, type Page } from '@/core';

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
    void getPageThumbnail(page.id).then((blob) => {
      if (dead || !blob) return;
      current = URL.createObjectURL(blob);
      setUrl(current);
    });
    return () => {
      dead = true;
      if (current) URL.revokeObjectURL(current);
    };
    // updatedAt changes after saves, so the image refreshes
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
