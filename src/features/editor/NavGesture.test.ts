// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NavGesture } from './NavGesture';

describe('NavGesture (touch pan / pinch maths)', () => {
  it('one finger pans by the finger movement', () => {
    const g = new NavGesture();
    g.start(1, 100, 100);
    expect(g.delta(1, 130, 90)).toEqual({ factor: 1, cx: 130, cy: 90, dx: 30, dy: -10 });
    expect(g.delta(1, 130, 90)).toMatchObject({ dx: 0, dy: 0 });
  });

  it('two fingers: zoom factor follows the distance, pan follows the centre', () => {
    const g = new NavGesture();
    g.start(1, 100, 100);
    g.start(2, 200, 100); // 100 px apart, centre (150, 100)
    const d = g.delta(2, 300, 100)!; // 200 px apart, centre (200, 100)
    expect(d.factor).toBeCloseTo(2);
    expect(d.cx).toBe(150);
    expect(d.cy).toBe(100);
    expect(d.dx).toBeCloseTo(50);
    expect(d.dy).toBeCloseTo(0);
  });

  it('ignores pointers it does not track and forgets ended ones', () => {
    const g = new NavGesture();
    expect(g.delta(9, 1, 1)).toBeNull();
    g.start(1, 0, 0);
    expect(g.active).toBe(true);
    g.end(1);
    expect(g.active).toBe(false);
    expect(g.has(1)).toBe(false);
  });

  it('applies to a viewport view keeping the pinch centre fixed', () => {
    const g = new NavGesture();
    g.start(1, 100, 100);
    g.start(2, 200, 100);
    const v = g.move(2, 300, 100, { scale: 1, tx: 0, ty: 0 })!;
    expect(v.scale).toBeCloseTo(2);
    // The page point that was under the old centre (150,100) is now under the new centre (200,100).
    expect((200 - v.tx) / v.scale).toBeCloseTo(150);
  });
});
