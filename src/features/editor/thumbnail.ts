import { drawPaper, drawStrokes } from '@/engines/drawing';
import type { PageTemplate, Stroke } from '@/core';

const THUMB_W = 240;

export interface ThumbLook {
  width: number;
  height: number;
  template: PageTemplate;
  background: string;
}

/** Render a small PNG of a page: paper, template and ink. */
export function renderThumbnail(strokes: Stroke[], page: ThumbLook): Promise<Blob | null> {
  const scale = THUMB_W / page.width;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = Math.max(1, Math.round(page.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.scale(scale, scale);
  drawPaper(ctx, page.width, page.height, page.template, page.background);
  drawStrokes(ctx, strokes, { x: 0, y: 0, w: page.width, h: page.height });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
