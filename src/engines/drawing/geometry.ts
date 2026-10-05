import type { Rect, Stroke, Vec } from './types';

const boundsCache = new WeakMap<Stroke, Rect>();

/** Bounding box including half the stroke width. Cached: strokes are immutable. */
export function strokeBounds(s: Stroke): Rect {
  const hit = boundsCache.get(s);
  if (hit) return hit;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of s.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = s.width / 2 + 1;
  const r: Rect = Number.isFinite(minX)
    ? { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }
    : { x: 0, y: 0, w: 0, h: 0 };
  boundsCache.set(s, r);
  return r;
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function pointInRect(p: Vec, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** True if a circle (stroke eraser) touches the stroke's centre line, allowing for its width. */
export function strokeHitsCircle(s: Stroke, cx: number, cy: number, r: number): boolean {
  const b = strokeBounds(s);
  if (cx < b.x - r || cx > b.x + b.w + r || cy < b.y - r || cy > b.y + b.h + r) return false;
  const reach = r + s.width / 2;
  const pts = s.points;
  if (pts.length === 1) return Math.hypot(cx - pts[0]!.x, cy - pts[0]!.y) <= reach;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const c = pts[i]!;
    if (distToSegment(cx, cy, a.x, a.y, c.x, c.y) <= reach) return true;
  }
  return false;
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(x: number, y: number, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Strokes selected by a lasso: at least half of a stroke's points must lie inside the loop. */
export function strokesInPolygon(strokes: Stroke[], poly: Vec[]): Stroke[] {
  if (poly.length < 3) return [];
  return strokes.filter((s) => {
    let inside = 0;
    for (const p of s.points) if (pointInPolygon(p.x, p.y, poly)) inside++;
    return s.points.length > 0 && inside / s.points.length >= 0.5;
  });
}

export function translateStroke(s: Stroke, dx: number, dy: number): Stroke {
  return { ...s, points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
}
