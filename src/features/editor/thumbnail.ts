import { drawStrokes } from '@/engines/drawing';
import type { Stroke } from '@/core';

const THUMB_W = 320;

/** Render a small PNG of a page's ink on white paper. */
export function renderThumbnail(
  strokes: Stroke[],
  page: { width: number; height: number },
): Promise<Blob | null> {
  const scale = THUMB_W / page.width;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = Math.round(page.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  drawStrokes(ctx, strokes, { x: 0, y: 0, w: page.width, h: page.height });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
