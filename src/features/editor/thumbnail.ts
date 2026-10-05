import { drawPaper, drawStrokes } from '@/engines/drawing';
import type { PageInk, PageTemplate } from '@/core';
import { pdfBitmaps } from '../pdf/bitmapCache';
import { preloadImages } from './imageCache';
import { drawObjects } from './objectRender';

const THUMB_W = 240;

export interface ThumbLook {
  pdf?: { index: number };
  width: number;
  height: number;
  template: PageTemplate;
  background: string;
}

/** Render a small PNG of a page: paper, template and ink. */
export async function renderThumbnail(
  content: PageInk,
  page: ThumbLook,
  documentId?: string,
): Promise<Blob | null> {
  await preloadImages(content.objects.flatMap((o) => (o.type === 'image' ? [o.assetId] : [])));
  const scale = THUMB_W / page.width;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = Math.max(1, Math.round(page.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  if (page.pdf && documentId) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, page.width, page.height);
    const bm = await pdfBitmaps.get(documentId, page.pdf.index, page.width, page.height, scale);
    ctx.drawImage(bm.canvas, 0, 0, page.width, page.height);
  } else {
    drawPaper(ctx, page.width, page.height, page.template, page.background);
  }
  drawObjects(ctx, content.objects);
  drawStrokes(ctx, content.strokes, { x: 0, y: 0, w: page.width, h: page.height });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
