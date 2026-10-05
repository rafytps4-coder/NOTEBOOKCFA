import { openPdf } from './pdfDocs';

/** Pixel scales (page points → canvas px) we render at, so zooming reuses cached bitmaps. */
const BUCKETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
const MAX_PIXELS = 16_000_000; // one canvas, iPad Safari friendly
export const DEFAULT_CACHE_BYTES = 128 * 1024 * 1024;

interface Entry {
  canvas: HTMLCanvasElement;
  bytes: number;
  scale: number;
}

type Key = string;
const keyOf = (docId: string, index: number, bucket: number): Key => `${docId}|${index}|${bucket}`;

/** Smallest bucket ≥ `want` whose bitmap still fits the canvas limit. */
export function pickBucket(want: number, w: number, h: number): number {
  const cap = Math.sqrt(MAX_PIXELS / (w * h));
  let best = BUCKETS[0]!;
  for (const b of BUCKETS) {
    if (b > cap) break;
    best = b;
    if (b >= want) break;
  }
  return best;
}

/**
 * Size-bounded LRU of rendered PDF pages. Evicted canvases are shrunk to zero so the browser can
 * free their memory straight away. Renders run one at a time (pdf.js paints on the main thread).
 */
export class PdfBitmapCache {
  private entries = new Map<Key, Entry>(); // insertion order == LRU order
  private bytes = 0;
  private inflight = new Map<Key, Promise<void>>();
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(private maxBytes = DEFAULT_CACHE_BYTES) {}

  get totalBytes() {
    return this.bytes;
  }
  get count() {
    return this.entries.size;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private touch(key: Key, e: Entry) {
    this.entries.delete(key);
    this.entries.set(key, e);
  }

  private evict() {
    for (const [k, e] of this.entries) {
      if (this.bytes <= this.maxBytes || this.entries.size <= 1) break;
      this.entries.delete(k);
      this.bytes -= e.bytes;
      e.canvas.width = e.canvas.height = 0;
    }
  }

  /** Best cached bitmap for the page (highest resolution available), without starting a render. */
  peek(docId: string, index: number): Entry | null {
    let best: { key: Key; e: Entry } | null = null;
    for (const b of BUCKETS) {
      const key = keyOf(docId, index, b);
      const e = this.entries.get(key);
      if (e && (!best || b > best.e.scale)) best = { key, e };
    }
    if (best) this.touch(best.key, best.e);
    return best?.e ?? null;
  }

  /**
   * Returns the best bitmap now (maybe lower resolution than wanted, or null) and, if a better one
   * is needed, schedules a render. Subscribers are notified when it lands.
   */
  request(docId: string, index: number, w: number, h: number, pixelScale: number): Entry | null {
    const bucket = pickBucket(pixelScale, w, h);
    const key = keyOf(docId, index, bucket);
    const exact = this.entries.get(key);
    if (exact) {
      this.touch(key, exact);
      return exact;
    }
    if (!this.inflight.has(key)) {
      const job = this.queue
        .then(() => this.render(key, docId, index, bucket))
        .finally(() => {
          this.inflight.delete(key);
        });
      this.queue = job.catch(() => undefined);
      this.inflight.set(key, job);
    }
    return this.peek(docId, index);
  }

  /** Render and wait (used for thumbnails and export checks). */
  async get(
    docId: string,
    index: number,
    w: number,
    h: number,
    pixelScale: number,
  ): Promise<Entry> {
    const bucket = pickBucket(pixelScale, w, h);
    const key = keyOf(docId, index, bucket);
    this.request(docId, index, w, h, pixelScale);
    await this.inflight.get(key);
    const e = this.entries.get(key);
    if (!e) throw new Error('Page render failed');
    return e;
  }

  private async render(key: Key, docId: string, index: number, scale: number): Promise<void> {
    if (this.entries.has(key)) return;
    const pdf = await openPdf(docId);
    const page = await pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    page.cleanup();
    const e: Entry = { canvas, bytes: canvas.width * canvas.height * 4, scale };
    this.entries.set(key, e);
    this.bytes += e.bytes;
    this.evict();
    this.listeners.forEach((l) => l());
  }

  /** Drop everything for one document (e.g. when its editor closes). */
  release(docId: string): void {
    for (const [k, e] of this.entries) {
      if (k.startsWith(`${docId}|`)) {
        this.entries.delete(k);
        this.bytes -= e.bytes;
        e.canvas.width = e.canvas.height = 0;
      }
    }
  }
}

export const pdfBitmaps = new PdfBitmapCache();
