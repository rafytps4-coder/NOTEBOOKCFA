import { drawStrokes, type PageObject, type Rect, type Stroke } from '@/engines/drawing';
import { preloadImages } from './imageCache';
import { drawObjects } from './objectRender';

const PAD = 12;
const MAX_W = 900;

/** Render the selected strokes and objects (no page background) as a PNG on white. */
export async function renderSelectionPng(sel: {
  strokes: Stroke[];
  objects: PageObject[];
  bounds: Rect;
}): Promise<Blob | null> {
  await preloadImages(sel.objects.flatMap((o) => (o.type === 'image' ? [o.assetId] : [])));
  const { bounds } = sel;
  const w = bounds.w + PAD * 2;
  const h = bounds.h + PAD * 2;
  const scale = Math.min(2, MAX_W / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(PAD - bounds.x, PAD - bounds.y);
  drawObjects(ctx, sel.objects);
  drawStrokes(ctx, sel.strokes, { x: bounds.x - PAD, y: bounds.y - PAD, w, h });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
