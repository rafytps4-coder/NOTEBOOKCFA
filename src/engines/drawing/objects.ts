import type { ImageObject, PageObject, ShapeObject, TextObject } from '@/core/models';
import type { Rect, Vec } from './types';

export type { ImageObject, PageObject, ShapeObject, TextObject };

export const MIN_OBJECT_SIZE = 12;

export function rotatePoint(p: Vec, c: Vec, a: number): Vec {
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Page point -> the object's own unrotated frame, origin at its centre. */
export function toLocal(o: PageObject, x: number, y: number): Vec {
  const p = rotatePoint({ x, y }, { x: o.cx, y: o.cy }, -o.rot);
  return { x: p.x - o.cx, y: p.y - o.cy };
}

export function objectCorners(o: PageObject): Vec[] {
  const c = { x: o.cx, y: o.cy };
  const hw = o.w / 2;
  const hh = o.h / 2;
  return [
    { x: c.x - hw, y: c.y - hh },
    { x: c.x + hw, y: c.y - hh },
    { x: c.x + hw, y: c.y + hh },
    { x: c.x - hw, y: c.y + hh },
  ].map((p) => rotatePoint(p, c, o.rot));
}

export function objectBounds(o: PageObject): Rect {
  const cs = objectCorners(o);
  const xs = cs.map((p) => p.x);
  const ys = cs.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function hitObject(o: PageObject, x: number, y: number, slop = 0): boolean {
  const l = toLocal(o, x, y);
  return Math.abs(l.x) <= o.w / 2 + slop && Math.abs(l.y) <= o.h / 2 + slop;
}

/** Topmost object (highest z, then latest) under a point. */
export function topObjectAt(
  objects: PageObject[],
  x: number,
  y: number,
  slop = 0,
): PageObject | null {
  let best: PageObject | null = null;
  for (const o of objects) if (hitObject(o, x, y, slop) && (!best || o.z >= best.z)) best = o;
  return best;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export const HANDLE_IDS: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'];

const HANDLE_DIR: Record<Exclude<HandleId, 'rotate'>, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

/** Handle positions in page space. `rotateGap` is the distance above the top edge, in page units. */
export function handlePositions(o: PageObject, rotateGap: number): Record<HandleId, Vec> {
  const c = { x: o.cx, y: o.cy };
  const at = (lx: number, ly: number) => rotatePoint({ x: c.x + lx, y: c.y + ly }, c, o.rot);
  const out = {} as Record<HandleId, Vec>;
  for (const id of Object.keys(HANDLE_DIR) as Exclude<HandleId, 'rotate'>[]) {
    const [dx, dy] = HANDLE_DIR[id];
    out[id] = at((dx * o.w) / 2, (dy * o.h) / 2);
  }
  out.rotate = at(0, -o.h / 2 - rotateGap);
  return out;
}

export function hitHandle(
  o: PageObject,
  x: number,
  y: number,
  radius: number,
  rotateGap: number,
  rotateRadius = radius,
): HandleId | null {
  const pos = handlePositions(o, rotateGap);
  // Rotation handle first (it sits outside the box, so it can keep a larger hit area).
  if (Math.hypot(pos.rotate.x - x, pos.rotate.y - y) <= rotateRadius) return 'rotate';
  for (const id of HANDLE_IDS.filter((h) => h !== 'rotate')) {
    if (Math.hypot(pos[id].x - x, pos[id].y - y) <= radius) return id;
  }
  return null;
}

/**
 * Resize by dragging `handle` to page point (x, y). The opposite edge/corner stays fixed, even
 * when the object is rotated. Corner handles keep the aspect ratio when `keepAspect` is set.
 */
export function resizeObject<T extends PageObject>(
  o: T,
  handle: Exclude<HandleId, 'rotate'>,
  x: number,
  y: number,
  keepAspect: boolean,
): T {
  const [dx, dy] = HANDLE_DIR[handle];
  const p = toLocal(o, x, y); // pointer in the object's frame
  // Fixed anchor (opposite side) in local frame; for edge handles the other axis is unchanged.
  const anchorX = dx === 0 ? -o.w / 2 : (-dx * o.w) / 2;
  const anchorY = dy === 0 ? -o.h / 2 : (-dy * o.h) / 2;
  let left = dx === 0 ? -o.w / 2 : Math.min(anchorX, p.x);
  let right = dx === 0 ? o.w / 2 : Math.max(anchorX, p.x);
  let top = dy === 0 ? -o.h / 2 : Math.min(anchorY, p.y);
  let bottom = dy === 0 ? o.h / 2 : Math.max(anchorY, p.y);
  if (dx !== 0 && dy !== 0 && keepAspect) {
    const ratio = o.w / o.h;
    const w = Math.max(MIN_OBJECT_SIZE, right - left);
    const h = Math.max(MIN_OBJECT_SIZE, bottom - top);
    const scale = Math.max(w / o.w, h / o.h);
    const nw = o.w * scale;
    const nh = nw / ratio;
    if (dx > 0) right = left + nw;
    else left = right - nw;
    if (dy > 0) bottom = top + nh;
    else top = bottom - nh;
  }
  if (right - left < MIN_OBJECT_SIZE) {
    if (dx > 0) right = left + MIN_OBJECT_SIZE;
    else left = right - MIN_OBJECT_SIZE;
  }
  if (bottom - top < MIN_OBJECT_SIZE) {
    if (dy > 0) bottom = top + MIN_OBJECT_SIZE;
    else top = bottom - MIN_OBJECT_SIZE;
  }
  const w = right - left;
  const h = bottom - top;
  // New centre in local frame, rotated back into page space.
  const centre = rotatePoint(
    { x: o.cx + (left + right) / 2, y: o.cy + (top + bottom) / 2 },
    { x: o.cx, y: o.cy },
    o.rot,
  );
  return { ...o, w, h, cx: centre.x, cy: centre.y };
}

/** Rotate so the rotate handle points at (x, y). Snaps to 15° steps when `snap` is set. */
export function rotateObject<T extends PageObject>(o: T, x: number, y: number, snap = true): T {
  let rot = Math.atan2(y - o.cy, x - o.cx) + Math.PI / 2;
  if (snap) {
    const step = Math.PI / 12;
    const nearest = Math.round(rot / step) * step;
    if (Math.abs(rot - nearest) < 0.06) rot = nearest;
  }
  return { ...o, rot };
}

export function moveObject<T extends PageObject>(o: T, dx: number, dy: number): T {
  return { ...o, cx: o.cx + dx, cy: o.cy + dy };
}

/** Objects whose centre lies inside the lasso polygon. */
export function objectsInPolygon(
  objects: PageObject[],
  poly: Vec[],
  inside: (x: number, y: number, poly: Vec[]) => boolean,
): PageObject[] {
  if (poly.length < 3) return [];
  return objects.filter((o) => inside(o.cx, o.cy, poly));
}

export function nextZ(objects: PageObject[]): number {
  return objects.reduce((m, o) => Math.max(m, o.z), 0) + 1;
}

export function minZ(objects: PageObject[]): number {
  return objects.reduce((m, o) => Math.min(m, o.z), 0) - 1;
}

/** Apply a crop (fractions trimmed per side) while keeping the visible scale constant. */
export function cropImage(o: ImageObject, crop: ImageObject['crop']): ImageObject {
  const oldW = 1 - o.crop.l - o.crop.r;
  const oldH = 1 - o.crop.t - o.crop.b;
  const newW = 1 - crop.l - crop.r;
  const newH = 1 - crop.t - crop.b;
  if (newW <= 0.05 || newH <= 0.05) return o;
  const sx = o.w / oldW; // page px per source-width
  const sy = o.h / oldH;
  const left = -o.w / 2 + sx * (crop.l - o.crop.l);
  const right = o.w / 2 - sx * (crop.r - o.crop.r);
  const top = -o.h / 2 + sy * (crop.t - o.crop.t);
  const bottom = o.h / 2 - sy * (crop.b - o.crop.b);
  const centre = rotatePoint(
    { x: o.cx + (left + right) / 2, y: o.cy + (top + bottom) / 2 },
    { x: o.cx, y: o.cy },
    o.rot,
  );
  return { ...o, crop, w: sx * newW, h: sy * newH, cx: centre.x, cy: centre.y };
}

/** Largest size that fits `maxW x maxH` keeping aspect ratio. */
export function fitInside(w: number, h: number, maxW: number, maxH: number) {
  const s = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(MIN_OBJECT_SIZE, w * s), h: Math.max(MIN_OBJECT_SIZE, h * s) };
}
