import { zoomAt, type View } from '@/engines/drawing';

interface P {
  x: number;
  y: number;
}

/** Zoom by `factor` around (cx, cy), then pan by (dx, dy). All in host-local px. */
export interface NavDelta {
  factor: number;
  cx: number;
  cy: number;
  dx: number;
  dy: number;
}

/** One finger pans, two fingers pinch-zoom and pan. Pure math; no DOM. */
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

  /** Incremental change since the previous call, or null if this pointer isn't tracked. */
  delta(id: number, x: number, y: number): NavDelta | null {
    const prev = this.pts.get(id);
    if (!prev) return null;
    if (this.pts.size === 1) {
      this.pts.set(id, { x, y });
      return { factor: 1, cx: x, cy: y, dx: x - prev.x, dy: y - prev.y };
    }
    const before = [...this.pts.values()].map((p) => ({ ...p }));
    this.pts.set(id, { x, y });
    const after = [...this.pts.values()];
    const [a0, b0] = before as [P, P];
    const [a1, b1] = after as [P, P];
    const c0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const c1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
    const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
    return { factor: d0 > 0 ? d1 / d0 : 1, cx: c0.x, cy: c0.y, dx: c1.x - c0.x, dy: c1.y - c0.y };
  }

  /** Apply the change to a viewport view (single-page mode). */
  move(id: number, x: number, y: number, v: View): View | null {
    const d = this.delta(id, x, y);
    if (!d) return null;
    const z = zoomAt(v, d.cx, d.cy, v.scale * d.factor);
    return { ...z, tx: z.tx + d.dx, ty: z.ty + d.dy };
  }
}
