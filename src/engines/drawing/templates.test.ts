// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pageDimensions, templateGeometry, orientationOf } from './index';

const tpl = (kind: 'blank' | 'ruled' | 'grid' | 'dotted' | 'cornell', spacing = 28) => ({
  kind,
  spacing,
  color: '#ccc',
});

describe('templates', () => {
  it('blank has nothing', () => {
    const g = templateGeometry(tpl('blank'), 800, 1000);
    expect(g.hLines.length + g.vLines.length + g.dots.length).toBe(0);
  });
  it('ruled lines follow the spacing', () => {
    const g = templateGeometry(tpl('ruled', 30), 800, 1000);
    expect(g.hLines.length).toBeGreaterThan(10);
    expect(g.hLines[1]!.y - g.hLines[0]!.y).toBe(30);
    expect(g.vLines).toHaveLength(0);
  });
  it('adjusting spacing changes line count', () => {
    const a = templateGeometry(tpl('grid', 20), 800, 1000);
    const b = templateGeometry(tpl('grid', 40), 800, 1000);
    expect(a.hLines.length).toBeGreaterThan(b.hLines.length);
    expect(a.vLines.length).toBeGreaterThan(b.vLines.length);
  });
  it('dotted has dots and cornell has a cue column + summary line', () => {
    expect(templateGeometry(tpl('dotted'), 800, 1000).dots.length).toBeGreaterThan(100);
    const c = templateGeometry(tpl('cornell'), 800, 1000);
    expect(c.vLines).toHaveLength(1);
    expect(c.hLines.some((l) => l.x0 === 0)).toBe(true);
  });
});

describe('page sizes', () => {
  it('handles orientation and custom sizes', () => {
    expect(pageDimensions('A4', 'portrait')).toEqual({ width: 794, height: 1123 });
    expect(pageDimensions('A4', 'landscape')).toEqual({ width: 1123, height: 794 });
    expect(pageDimensions('Letter', 'portrait')).toEqual({ width: 816, height: 1056 });
    const c = pageDimensions('custom', 'portrait', { width: 100000, height: 10 });
    expect(c.width).toBeLessThanOrEqual(4000);
    expect(c.height).toBeLessThanOrEqual(4000);
    expect(orientationOf({ width: 1123, height: 794 })).toBe('landscape');
  });
});
