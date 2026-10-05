import type { ShapeKind } from '@/core/models';
import type { Rect, StrokePoint } from './types';

export interface Recognized {
  shape: ShapeKind;
  box: Rect;
  /** line only: true if it runs bottom-left to top-right, etc. (start/end corners of the box) */
  ends?: [number, number, number, number];
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(p: StrokePoint[]) {
  let n = 0;
  for (let i = 1; i < p.length; i++) n += dist(p[i - 1]!, p[i]!);
  return n;
}

function distToLine(p: StrokePoint, a: StrokePoint, b: StrokePoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Douglas–Peucker simplification. */
function simplify(pts: StrokePoint[], eps: number): StrokePoint[] {
  if (pts.length < 3) return pts;
  let idx = 0;
  let max = 0;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToLine(pts[i]!, a, b);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [a, b];
  const left = simplify(pts.slice(0, idx + 1), eps);
  const right = simplify(pts.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

function bbox(pts: StrokePoint[]): Rect {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Conservative recogniser for "hold still to snap" strokes. Returns null unless the stroke is
 * clearly a straight line, an (almost) closed rectangle / triangle, or a closed round loop.
 */
export function recognizeShape(pts: StrokePoint[]): Recognized | null {
  if (pts.length < 8) return null;
  const len = pathLength(pts);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const chord = dist(first, last);
  if (len < 40) return null;

  // Straight line: every point within 4% of the length from the chord.
  const maxDev = Math.max(...pts.map((p) => distToLine(p, first, last)));
  if (chord / len > 0.9 && maxDev < Math.max(4, len * 0.04)) {
    const box = bbox([first, last]);
    const ex = last.x >= first.x ? 1 : 0;
    const ey = last.y >= first.y ? 1 : 0;
    return { shape: 'line', box, ends: [1 - ex, 1 - ey, ex, ey] };
  }

  // Closed loop?
  const box = bbox(pts);
  const diag = Math.hypot(box.w, box.h);
  if (chord > diag * 0.25 || box.w < 20 || box.h < 20) return null;

  // Split the loop at the point farthest from the start so Douglas–Peucker has a real chord.
  let far = 0;
  for (let i = 1; i < pts.length; i++) if (dist(pts[i]!, first) > dist(pts[far]!, first)) far = i;
  const eps = diag * 0.08;
  const a = simplify(pts.slice(0, far + 1), eps);
  const b = simplify([...pts.slice(far), first], eps);
  const poly = [...a.slice(0, -1), ...b.slice(0, -1)];
  const corners = poly.length;
  if (corners === 4) return { shape: 'rect', box };
  if (corners === 3) return { shape: 'triangle', box };

  // Round: points sit near an ellipse inscribed in the box.
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const errs = pts.map((p) => {
    const r = Math.hypot((p.x - cx) / (box.w / 2), (p.y - cy) / (box.h / 2));
    return Math.abs(r - 1);
  });
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  if (mean < 0.12 && corners > 5) return { shape: 'ellipse', box };
  return null;
}
