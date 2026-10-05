// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  History,
  StrokeStore,
  addStrokes,
  clampScale,
  clampView,
  cloneStrokes,
  fitView,
  moveStrokes,
  pointInPolygon,
  removeStrokes,
  screenToPage,
  strokeBounds,
  strokeHitsCircle,
  strokeOutline,
  strokesInPolygon,
  translateStroke,
  zoomAt,
  MAX_SCALE,
  MIN_SCALE,
  type Stroke,
} from './index';

function line(id: string, x0: number, y0: number, x1: number, y1: number, n = 5): Stroke {
  return {
    id,
    tool: 'pen',
    color: '#000',
    width: 2,
    opacity: 1,
    points: Array.from({ length: n }, (_, i) => ({
      x: x0 + ((x1 - x0) * i) / (n - 1),
      y: y0 + ((y1 - y0) * i) / (n - 1),
      pressure: 0.5,
      t: i * 8,
    })),
  };
}

describe('geometry', () => {
  it('computes padded bounds', () => {
    const b = strokeBounds(line('a', 10, 20, 30, 40));
    expect(b.x).toBeLessThan(10);
    expect(b.x + b.w).toBeGreaterThan(30);
    expect(b.y + b.h).toBeGreaterThan(40);
  });

  it('hit-tests along the line, not just at points', () => {
    const s = line('a', 0, 0, 100, 0, 2); // only two points, 100px apart
    expect(strokeHitsCircle(s, 50, 3, 4)).toBe(true);
    expect(strokeHitsCircle(s, 50, 30, 4)).toBe(false);
    expect(strokeHitsCircle(s, 200, 0, 4)).toBe(false);
  });

  it('point in polygon + lasso selects strokes mostly inside', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon(50, 50, square)).toBe(true);
    expect(pointInPolygon(150, 50, square)).toBe(false);
    const inside = line('in', 10, 10, 90, 90);
    const outside = line('out', 200, 200, 300, 300);
    const straddle = line('half', 50, 50, 250, 50, 5); // 2 of 5 pts inside
    expect(strokesInPolygon([inside, outside, straddle], square).map((s) => s.id)).toEqual(['in']);
    expect(strokesInPolygon([inside], square.slice(0, 2))).toEqual([]);
  });

  it('translate returns a new stroke and leaves the original alone', () => {
    const s = line('a', 0, 0, 10, 10);
    const t = translateStroke(s, 5, 6);
    expect(t.points[0]).toMatchObject({ x: 5, y: 6 });
    expect(s.points[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('produces an outline polygon for a stroke', () => {
    const o = strokeOutline(line('a', 0, 0, 50, 20, 10));
    expect(o.length).toBeGreaterThan(4);
    expect(o.every((p) => Number.isFinite(p[0]!) && Number.isFinite(p[1]!))).toBe(true);
  });

  it('survives a JSON round trip (storage format)', () => {
    const s = line('a', 0, 0, 10, 10);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('history', () => {
  const setup = () => {
    const store = new StrokeStore();
    return { store, h: new History(store) };
  };

  it('undoes and redoes draw', () => {
    const { store, h } = setup();
    h.exec(addStrokes([line('a', 0, 0, 1, 1)]));
    h.exec(addStrokes([line('b', 0, 0, 1, 1)]));
    expect(store.strokes.map((s) => s.id)).toEqual(['a', 'b']);
    h.undo();
    expect(store.strokes.map((s) => s.id)).toEqual(['a']);
    h.redo();
    expect(store.strokes.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('erase undo restores strokes in their original z-order', () => {
    const { store, h } = setup();
    h.exec(addStrokes([line('a', 0, 0, 1, 1), line('b', 0, 0, 1, 1), line('c', 0, 0, 1, 1)]));
    h.exec(removeStrokes(['a', 'c']));
    expect(store.strokes.map((s) => s.id)).toEqual(['b']);
    h.undo();
    expect(store.strokes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    h.redo();
    expect(store.strokes.map((s) => s.id)).toEqual(['b']);
  });

  it('undoes and redoes move', () => {
    const { store, h } = setup();
    h.exec(addStrokes([line('a', 0, 0, 10, 0)]));
    h.exec(moveStrokes(['a'], 5, 7));
    expect(store.strokes[0]!.points[0]).toMatchObject({ x: 5, y: 7 });
    h.undo();
    expect(store.strokes[0]!.points[0]).toMatchObject({ x: 0, y: 0 });
    h.redo();
    expect(store.strokes[0]!.points[0]).toMatchObject({ x: 5, y: 7 });
  });

  it('delete selection is undoable, and a new action clears redo', () => {
    const { store, h } = setup();
    h.exec(addStrokes([line('a', 0, 0, 1, 1)]));
    h.exec(removeStrokes(['a'], 'delete'));
    h.undo();
    expect(store.strokes).toHaveLength(1);
    expect(h.canRedo).toBe(true);
    h.exec(addStrokes([line('z', 0, 0, 1, 1)]));
    expect(h.canRedo).toBe(false);
  });

  it('paste (clone) uses new ids and notifies subscribers', () => {
    const { h } = setup();
    let calls = 0;
    h.subscribe(() => calls++);
    const orig = [line('a', 0, 0, 1, 1)];
    const copy = cloneStrokes(orig);
    expect(copy[0]!.id).not.toBe('a');
    h.exec(addStrokes(copy));
    h.undo();
    expect(calls).toBe(2);
    expect(h.undo()).toBeUndefined();
  });
});

describe('view', () => {
  const vp = { w: 1000, h: 800 };
  const page = { w: 794, h: 1123 };

  it('zoomAt keeps the anchor point fixed', () => {
    const v = { scale: 1, tx: 20, ty: 30 };
    const before = screenToPage(v, 400, 300);
    const z = zoomAt(v, 400, 300, 2.5);
    const after = screenToPage(z, 400, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('limits zoom', () => {
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(0.001)).toBe(MIN_SCALE);
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 0, 0, 99).scale).toBe(MAX_SCALE);
  });

  it('keeps the page reachable and centres a small page', () => {
    const far = clampView({ scale: 2, tx: -99999, ty: 99999 }, page, vp);
    expect(far.tx).toBeGreaterThanOrEqual(vp.w - page.w * 2 - 80);
    expect(far.ty).toBeLessThanOrEqual(80);
    const small = clampView({ scale: 0.5, tx: 0, ty: 0 }, page, vp);
    expect(small.tx).toBeCloseTo((vp.w - page.w * 0.5) / 2);
  });

  it('fit shows the whole page', () => {
    const f = fitView(page, vp);
    expect(page.h * f.scale).toBeLessThanOrEqual(vp.h);
    expect(page.w * f.scale).toBeLessThanOrEqual(vp.w);
  });
});
