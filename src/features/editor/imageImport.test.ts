// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_EDGE, limitedSize } from './imageImport';

describe('limitedSize', () => {
  it('leaves small images alone', () => {
    expect(limitedSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
  it('scales the longest edge down to the limit, keeping aspect ratio', () => {
    const s = limitedSize(5120, 2560);
    expect(s.w).toBe(MAX_IMAGE_EDGE);
    expect(s.h).toBe(1280);
    const t = limitedSize(3000, 6000);
    expect(t.h).toBe(MAX_IMAGE_EDGE);
    expect(t.w).toBe(1280);
  });
  it('never returns zero', () => {
    expect(limitedSize(1, 100000).w).toBeGreaterThanOrEqual(1);
  });
});
