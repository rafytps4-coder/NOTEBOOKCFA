import { getStroke } from 'perfect-freehand';
import { strokeBounds } from './geometry';
import type { Stroke } from './types';

type Outline = number[][];

export type StrokeStyle = Pick<Stroke, 'tool' | 'color' | 'width' | 'opacity' | 'sim'>;

/** perfect-freehand options per tool. */
function optionsFor(s: StrokeStyle, last: boolean) {
  const common = { last, simulatePressure: s.sim ?? false };
  switch (s.tool) {
    case 'highlighter':
      return {
        ...common,
        size: s.width,
        thinning: 0,
        smoothing: 0.6,
        streamline: 0.6,
        start: { cap: false },
        end: { cap: false },
      };
    case 'pencil':
      return { ...common, size: s.width, thinning: 0.6, smoothing: 0.4, streamline: 0.35 };
    default:
      return { ...common, size: s.width, thinning: 0.5, smoothing: 0.5, streamline: 0.5 };
  }
}

export function strokeOutline(s: Stroke, last = true): Outline {
  const pts = s.points.map((p) => [p.x, p.y, p.pressure]);
  return getStroke(pts, optionsFor(s, last));
}

/** Outline for a stroke still being drawn; `pts` is [x, y, pressure][] built incrementally. */
export function liveOutline(pts: number[][], style: StrokeStyle): Outline {
  return getStroke(pts, optionsFor(style, false));
}

/** Outline polygon → smooth Path2D (quadratic curves through midpoints). */
export function outlineToPath(outline: Outline): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (n < 2) return path;
  const mid = (a: number[], b: number[]) => [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2] as const;
  const m0 = mid(outline[n - 1]!, outline[0]!);
  path.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = outline[i]!;
    const m = mid(p, outline[(i + 1) % n]!);
    path.quadraticCurveTo(p[0]!, p[1]!, m[0], m[1]);
  }
  path.closePath();
  return path;
}

/** Path cache keyed by stroke identity (strokes are immutable, so this never goes stale). */
const pathCache = new WeakMap<Stroke, Path2D>();

export function strokePath(s: Stroke): Path2D {
  let p = pathCache.get(s);
  if (!p) {
    p = outlineToPath(strokeOutline(s, true));
    pathCache.set(s, p);
  }
  return p;
}

/** Fill an outline path with the tool's look. The caller sets the page→screen transform first. */
export function paintPath(ctx: CanvasRenderingContext2D, path: Path2D, s: StrokeStyle): void {
  ctx.save();
  ctx.fillStyle = s.color;
  if (s.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = s.opacity;
    ctx.fill(path);
  } else if (s.tool === 'pencil') {
    // Grainy pencil: two slightly offset translucent passes give a soft, uneven edge.
    ctx.globalAlpha = s.opacity * 0.55;
    ctx.fill(path);
    ctx.translate(0.35, -0.3);
    ctx.globalAlpha = s.opacity * 0.4;
    ctx.fill(path);
  } else {
    ctx.globalAlpha = s.opacity;
    ctx.fill(path);
  }
  ctx.restore();
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  if (s.points.length === 0) return;
  paintPath(ctx, strokePath(s), s);
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  visible: { x: number; y: number; w: number; h: number },
  skip?: Set<string>,
): void {
  for (const s of strokes) {
    if (skip?.has(s.id)) continue;
    const b = strokeBounds(s);
    if (b.x > visible.x + visible.w || b.x + b.w < visible.x) continue;
    if (b.y > visible.y + visible.h || b.y + b.h < visible.y) continue;
    drawStroke(ctx, s);
  }
}
