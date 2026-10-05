import { pdfBitmaps } from './bitmapCache';

/** What the canvas controller needs to paint a PDF page behind the annotations. */
export interface PageBackground {
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, pixelScale: number): void;
  subscribe(fn: () => void): () => void;
}

export function pdfPageBackground(docId: string, index: number): PageBackground {
  return {
    draw(ctx, w, h, pixelScale) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      const bm = pdfBitmaps.request(docId, index, w, h, pixelScale);
      if (bm) ctx.drawImage(bm.canvas, 0, 0, w, h);
    },
    subscribe: (fn) => pdfBitmaps.subscribe(fn),
  };
}

/** Small PNG of a PDF page (used by the page list and the library card). */
export async function renderPdfThumbnail(
  docId: string,
  index: number,
  w: number,
  h: number,
  width = 240,
): Promise<Blob | null> {
  const entry = await pdfBitmaps.get(docId, index, w, h, width / w);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round((h * width) / w));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(entry.canvas, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
}
