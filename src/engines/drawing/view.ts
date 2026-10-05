import type { Rect, Vec } from './types';

/** Maps page space to screen (canvas CSS px): screen = page * scale + (tx, ty). */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 6;

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export const screenToPage = (v: View, x: number, y: number): Vec => ({
  x: (x - v.tx) / v.scale,
  y: (y - v.ty) / v.scale,
});

/** Zoom so the page point under (cx, cy) stays under the finger/cursor. */
export function zoomAt(v: View, cx: number, cy: number, newScale: number): View {
  const scale = clampScale(newScale);
  const px = (cx - v.tx) / v.scale;
  const py = (cy - v.ty) / v.scale;
  return { scale, tx: cx - px * scale, ty: cy - py * scale };
}

/** Keep part of the page visible: it can't be flung entirely off-screen. */
export function clampView(
  v: View,
  page: { w: number; h: number },
  vp: { w: number; h: number },
): View {
  const margin = 80;
  const pw = page.w * v.scale;
  const ph = page.h * v.scale;
  const clamp1 = (t: number, size: number, view: number) =>
    size + 2 * margin <= view
      ? (view - size) / 2 // page smaller than viewport: centre it
      : Math.min(margin, Math.max(view - size - margin, t));
  return { scale: v.scale, tx: clamp1(v.tx, pw, vp.w), ty: clamp1(v.ty, ph, vp.h) };
}

/** Scale and position that fit the whole page width in the viewport, with a little padding. */
export function fitView(page: { w: number; h: number }, vp: { w: number; h: number }): View {
  const pad = 16;
  const scale = clampScale(Math.min((vp.w - 2 * pad) / page.w, (vp.h - 2 * pad) / page.h));
  return clampView({ scale, tx: 0, ty: 0 }, page, vp);
}

export function visiblePageRect(v: View, vp: { w: number; h: number }): Rect {
  return { x: -v.tx / v.scale, y: -v.ty / v.scale, w: vp.w / v.scale, h: vp.h / v.scale };
}
