// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  History,
  StrokeStore,
  addItems,
  cropImage,
  handlePositions,
  hitHandle,
  hitObject,
  moveItems,
  nextZ,
  objectBounds,
  patchObjects,
  pointInPolygon,
  recognizeShape,
  removeItems,
  resizeObject,
  rotateObject,
  topObjectAt,
  wrapLines,
  type ImageObject,
  type PageObject,
  type ShapeObject,
  type Stroke,
  type StrokePoint,
} from './index';

const rect = (over: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'r',
  type: 'shape',
  shape: 'rect',
  cx: 100,
  cy: 100,
  w: 80,
  h: 40,
  rot: 0,
  z: 1,
  stroke: '#000',
  strokeWidth: 2,
  fill: null,
  ...over,
});
const img = (over: Partial<ImageObject> = {}): ImageObject => ({
  id: 'i',
  type: 'image',
  assetId: 'a',
  cx: 200,
  cy: 200,
  w: 100,
  h: 50,
  rot: 0,
  z: 1,
  crop: { l: 0, t: 0, r: 0, b: 0 },
  ...over,
});

describe('object geometry', () => {
  it('bounds and hit-testing respect rotation', () => {
    const o = rect({ rot: Math.PI / 2 }); // 80x40 rotated 90° => 40 wide, 80 tall on the page
    const b = objectBounds(o);
    expect(b.w).toBeCloseTo(40);
    expect(b.h).toBeCloseTo(80);
    expect(hitObject(o, 100, 100 + 35)).toBe(true); // inside along the rotated long axis
    expect(hitObject(o, 100 + 35, 100)).toBe(false);
  });

  it('picks the topmost object', () => {
    const low = rect({ id: 'low', z: 1 });
    const high = rect({ id: 'high', z: 5 });
    expect(topObjectAt([low, high], 100, 100)!.id).toBe('high');
    expect(topObjectAt([low, high], 500, 500)).toBeNull();
    expect(nextZ([low, high])).toBe(6);
  });

  it('resizing a handle keeps the opposite corner fixed', () => {
    const o = rect({ cx: 100, cy: 100, w: 80, h: 40 }); // spans 60..140 x 80..120
    const r = resizeObject(o, 'se', 180, 160, false);
    expect(r.cx - r.w / 2).toBeCloseTo(60);
    expect(r.cy - r.h / 2).toBeCloseTo(80);
    expect(r.w).toBeCloseTo(120);
    expect(r.h).toBeCloseTo(80);
  });

  it('resizing a rotated object keeps the opposite corner fixed in page space', () => {
    const o = rect({ rot: Math.PI / 6 });
    const hp = handlePositions(o, 20);
    const fixedBefore = handlePositions(o, 20).nw;
    const r = resizeObject(o, 'se', hp.se.x + 30, hp.se.y + 30, false);
    const fixedAfter = handlePositions(r, 20).nw;
    expect(fixedAfter.x).toBeCloseTo(fixedBefore.x, 5);
    expect(fixedAfter.y).toBeCloseTo(fixedBefore.y, 5);
    expect(r.w).toBeGreaterThan(o.w);
  });

  it('corner resize keeps aspect ratio when asked; never below the minimum', () => {
    const o = img();
    const r = resizeObject(o, 'se', 400, 260, true);
    expect(r.w / r.h).toBeCloseTo(2);
    const tiny = resizeObject(o, 'se', 0, 0, false);
    expect(tiny.w).toBeGreaterThanOrEqual(12);
    expect(tiny.h).toBeGreaterThanOrEqual(12);
  });

  it('edge handles only change one dimension', () => {
    const o = rect();
    const r = resizeObject(o, 'e', 200, 999, false);
    expect(r.h).toBe(o.h);
    expect(r.w).toBeGreaterThan(o.w);
  });

  it('rotation handle points at the pointer and snaps near 15°', () => {
    const o = rect();
    const r = rotateObject(o, o.cx + 100, o.cy, true); // pointer to the right => rotated 90°
    expect(r.rot).toBeCloseTo(Math.PI / 2);
    expect(
      hitHandle(o, handlePositions(o, 20).rotate.x, handlePositions(o, 20).rotate.y, 10, 20),
    ).toBe('rotate');
    expect(hitHandle(o, 0, 0, 10, 20)).toBeNull();
  });

  it('cropping keeps the visible scale and shifts the centre', () => {
    const o = img();
    const c = cropImage(o, { l: 0.5, t: 0, r: 0, b: 0 });
    expect(c.w).toBeCloseTo(50);
    expect(c.h).toBeCloseTo(50);
    expect(c.cx - c.w / 2).toBeCloseTo(o.cx - o.w / 2 + 50); // right edge stays put
    expect(cropImage(o, { l: 0.6, t: 0, r: 0.6, b: 0 })).toBe(o); // refuses to crop everything
    const back = cropImage(c, { l: 0, t: 0, r: 0, b: 0 });
    expect(back.w).toBeCloseTo(100);
    expect(back.cx).toBeCloseTo(o.cx);
  });
});

describe('object commands', () => {
  const stroke = (id: string): Stroke => ({
    id,
    tool: 'pen',
    color: '#000',
    width: 2,
    opacity: 1,
    points: [{ x: 0, y: 0, pressure: 0.5, t: 0 }],
  });

  it('add / patch / move / remove are all undoable and redoable', () => {
    const store = new StrokeStore();
    const h = new History(store);
    const o = rect();
    h.exec(addItems([stroke('s')], [o]));
    expect(store.objects).toHaveLength(1);
    h.exec(patchObjects([o], [{ ...o, w: 200 }], 'resize'));
    expect((store.objects[0] as ShapeObject).w).toBe(200);
    h.exec(moveItems(['s'], ['r'], 10, 5));
    expect(store.objects[0]!.cx).toBe(110);
    expect(store.strokes[0]!.points[0]).toMatchObject({ x: 10, y: 5 });
    h.exec(removeItems(['s'], ['r']));
    expect(store.objects).toHaveLength(0);
    h.undo();
    expect(store.objects).toHaveLength(1);
    expect(store.strokes).toHaveLength(1);
    h.undo(); // move
    expect(store.objects[0]!.cx).toBe(100);
    h.undo(); // patch
    expect((store.objects[0] as ShapeObject).w).toBe(80);
    h.undo(); // add
    expect(store.objects).toHaveLength(0);
    h.redo();
    h.redo();
    expect((store.objects[0] as ShapeObject).w).toBe(200);
  });

  it('delete restores objects at their original z-order index', () => {
    const store = new StrokeStore([], [rect({ id: 'a' }), rect({ id: 'b' }), rect({ id: 'c' })]);
    const h = new History(store);
    h.exec(removeItems([], ['a', 'c']));
    h.undo();
    expect(store.objects.map((o: PageObject) => o.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('text layout', () => {
  const measure = (s: string) => s.length * 10; // monospace: 10px per char
  it('wraps on words and keeps explicit newlines', () => {
    expect(wrapLines('hello world foo', 100, measure)).toEqual(['hello', 'world foo']);
    expect(wrapLines('a\n\nb', 100, measure)).toEqual(['a', '', 'b']);
  });
  it('breaks over-long words by character', () => {
    const lines = wrapLines('abcdefghij', 40, measure);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join('')).toBe('abcdefghij');
    expect(lines.every((l) => measure(l) <= 40)).toBe(true);
  });
});

describe('shape recognition', () => {
  const P = (pts: [number, number][]): StrokePoint[] =>
    pts.map(([x, y], i) => ({ x, y, pressure: 0.5, t: i }));
  const along = (a: [number, number], b: [number, number], n: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => [
      a[0] + ((b[0] - a[0]) * i) / n,
      a[1] + ((b[1] - a[1]) * i) / n,
    ]);

  it('recognises a wobbly straight line', () => {
    const pts = along([0, 0], [200, 10], 30).map(
      ([x, y], i) => [x, y + (i % 2)] as [number, number],
    );
    expect(recognizeShape(P(pts))!.shape).toBe('line');
  });
  it('recognises a rectangle', () => {
    const pts = [
      ...along([0, 0], [100, 0], 10),
      ...along([100, 0], [100, 60], 8),
      ...along([100, 60], [0, 60], 10),
      ...along([0, 60], [2, 3], 8),
    ];
    expect(recognizeShape(P(pts))!.shape).toBe('rect');
  });
  it('recognises a triangle', () => {
    const pts = [
      ...along([50, 0], [100, 80], 12),
      ...along([100, 80], [0, 80], 12),
      ...along([0, 80], [48, 3], 12),
    ];
    expect(recognizeShape(P(pts))!.shape).toBe('triangle');
  });
  it('recognises a circle', () => {
    const pts = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return [100 + 50 * Math.cos(a), 100 + 50 * Math.sin(a)] as [number, number];
    });
    expect(recognizeShape(P(pts))!.shape).toBe('ellipse');
  });
  it('leaves handwriting alone', () => {
    const squiggle = Array.from(
      { length: 40 },
      (_, i) => [i * 5, Math.sin(i * 0.9) * 30] as [number, number],
    );
    expect(recognizeShape(P(squiggle))).toBeNull();
    expect(
      recognizeShape(
        P([
          [0, 0],
          [1, 1],
        ]),
      ),
    ).toBeNull();
  });
  it('point-in-polygon helper is reusable for object lasso', () => {
    expect(
      pointInPolygon(5, 5, [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]),
    ).toBe(true);
  });
});
