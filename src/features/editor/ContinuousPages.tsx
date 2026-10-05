import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { NotebookDocument, Page } from '@/core';
import type { NavRequest } from './CanvasController';
import { PageThumbImg } from './PageThumbImg';
import { PageView } from './PageView';

const GAP = 16;
const MOUNT_MARGIN = 1; // live canvases for visible pages ± this many neighbours
const THUMB_MARGIN = 6;
const SETTLE_MS = 120;

export function pageOffsets(pages: Page[], zoom: number): number[] {
  const out: number[] = [];
  let y = GAP;
  for (const p of pages) {
    out.push(y);
    y += p.height * zoom + GAP;
  }
  return out;
}

/** Largest index whose offset is <= y (binary search). */
function indexAt(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid]! <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

interface Props {
  doc: NotebookDocument;
  pages: Page[];
  zoom: number;
  scrollerRef: RefObject<HTMLDivElement | null>;
  onCurrent: (index: number) => void;
  onNavigate: (pageId: string, n: NavRequest) => void;
}

/**
 * Vertical scrolling list. Every page has a fixed-size wrapper (cheap), but only pages near the
 * viewport get a live canvas; nearby others show their saved thumbnail; the rest stay empty.
 */
export function ContinuousPages({ doc, pages, zoom, scrollerRef, onCurrent, onNavigate }: Props) {
  const offsets = useMemo(() => pageOffsets(pages, zoom), [pages, zoom]);
  const [range, setRange] = useState({ first: 0, last: 0 }); // immediate: drives thumbnails
  const [liveRange, setLiveRange] = useState({ first: 0, last: 0 }); // settled: drives live canvases

  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    let raf = 0;
    let settle = 0;
    const update = () => {
      raf = 0;
      if (!offsets.length) return;
      const top = sc.scrollTop;
      const first = indexAt(offsets, top);
      const last = indexAt(offsets, top + sc.clientHeight);
      setRange((r) => (r.first === first && r.last === last ? r : { first, last }));
      // Live canvases are costly to build, so wait until scrolling slows down.
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        setLiveRange((r) => (r.first === first && r.last === last ? r : { first, last }));
      }, SETTLE_MS);
      onCurrent(indexAt(offsets, top + sc.clientHeight / 2));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    sc.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(sc);
    return () => {
      sc.removeEventListener('scroll', onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [offsets, scrollerRef, onCurrent]);

  return (
    <div className="pages-list">
      {pages.map((page, i) => {
        const live = i >= liveRange.first - MOUNT_MARGIN && i <= liveRange.last + MOUNT_MARGIN;
        const near = i >= range.first - THUMB_MARGIN && i <= range.last + THUMB_MARGIN;
        return (
          <div
            key={page.id}
            id={`page-${page.id}`}
            className="page-wrap"
            onPointerDown={() => {
              // Touched before its canvas was ready (just after a fast scroll): make it live now.
              if (!live) setLiveRange({ first: i, last: i });
            }}
            style={{
              width: page.width * zoom,
              height: page.height * zoom,
              background: page.background,
            }}
          >
            {live ? (
              <PageView
                doc={doc}
                page={page}
                pageNumber={i + 1}
                pageCount={pages.length}
                fixedScale={zoom}
                onNavigate={onNavigate}
              />
            ) : near ? (
              <PageThumbImg page={page} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
