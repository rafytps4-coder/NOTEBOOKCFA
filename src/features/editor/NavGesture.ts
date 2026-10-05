import { zoomAt, type View } from '@/engines/drawing';

interface P {
  x: number;
  y: number;
}

/** One finger pans, two fingers pinch-zoom and pan. Pure view math; no DOM. */
export class NavGesture {
  private pts = new Map<number, P>();

  get active() {
    return this.pts.size > 0;
  }
  get count() {
    return this.pts.size;
  }
  has(id: number) {
    return this.pts.has(id);
  }

  start(id: number, x: number, y: number) {
    this.pts.set(id, { x, y });
  }

  end(id: number) {
    this.pts.delete(id);
  }

  clear() {
    this.pts.clear();
  }

  /** Returns the updated view, or null if this pointer isn't part of the gesture. */
  move(id: number, x: number, y: number, v: View): View | null {
    const prev = this.pts.get(id);
    if (!prev) return null;
    if (this.pts.size === 1) {
      this.pts.set(id, { x, y });
      return { ...v, tx: v.tx + (x - prev.x), ty: v.ty + (y - prev.y) };
    }
    const [a, b] = [...this.pts.entries()];
    const centre = (p: P, q: P) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
    const before = { a: a![1], b: b![1] };
    this.pts.set(id, { x, y });
    const [a2, b2] = [...this.pts.entries()];
    const c0 = centre(before.a, before.b);
    const c1 = centre(a2![1], b2![1]);
    const d0 = dist(before.a, before.b);
    const d1 = dist(a2![1], b2![1]);
    const zoomed = d0 > 0 ? zoomAt(v, c0.x, c0.y, v.scale * (d1 / d0)) : v;
    return { ...zoomed, tx: zoomed.tx + (c1.x - c0.x), ty: zoomed.ty + (c1.y - c0.y) };
  }
}
