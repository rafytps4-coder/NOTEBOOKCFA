import {
  History,
  StrokeStore,
  addStrokes,
  clampView,
  cloneStrokes,
  drawStrokes,
  drawStroke,
  fitView,
  liveOutline,
  moveStrokes,
  outlineToPath,
  paintPath,
  pointInRect,
  removeStrokes,
  screenToPage,
  strokeBounds,
  strokeHitsCircle,
  strokesInPolygon,
  unionRects,
  visiblePageRect,
  zoomAt,
  type EditorTool,
  type Rect,
  type Stroke,
  type StrokeTool,
  type ToolOptions,
  type Vec,
  type View,
} from '@/engines/drawing';
import { newId } from '@/core/ids';
import { NavGesture } from './NavGesture';
import { PointBuffer } from './PointBuffer';

export type InputMode = 'pencilOnly' | 'pencilAndFinger';

export interface ToolState {
  tool: EditorTool;
  /** Options for the active ink tool (ignored for eraser/lasso). */
  options: ToolOptions;
  inputMode: InputMode;
}

export interface UiPatch {
  canUndo?: boolean;
  canRedo?: boolean;
  hasSelection?: boolean;
  zoomPct?: number;
}

export interface PerfStats {
  frameMs: number;
  pointsPerSec: number;
}

export interface ControllerOptions {
  host: HTMLElement;
  committed: HTMLCanvasElement;
  live: HTMLCanvasElement;
  page: { width: number; height: number };
  strokes: Stroke[];
  getTool(): ToolState;
  onStrokesChanged(strokes: Stroke[]): void;
  onUi(patch: UiPatch): void;
}

type Mode = 'idle' | 'draw' | 'erase' | 'lasso' | 'move' | 'nav';

/** In-memory clipboard shared across pages for the session. */
let clipboard: Stroke[] = [];

const ERASER_PX = 10;
const MAX_DPR = 3;
const SELECT_COLOR = '#1a5fd0';

/**
 * Owns the two canvases (committed + live), the view transform, pointer handling and the
 * undo history for one page. The pointer handlers only write numbers into a typed buffer
 * and schedule a frame; all drawing and hit-testing happens in requestAnimationFrame.
 */
export class CanvasController {
  private store: StrokeStore;
  readonly history: History;
  private view: View = { scale: 1, tx: 0, ty: 0 };
  private vp = { w: 1, h: 1 };
  private dpr = 1;
  private cctx: CanvasRenderingContext2D;
  private lctx: CanvasRenderingContext2D;
  private rect: DOMRect;

  private mode: Mode = 'idle';
  private drawPointer = -1;
  private penSeen = false;
  private buf = new PointBuffer();
  private livePts: number[][] = []; // converted incrementally, in the frame loop
  private liveStyle: Omit<Stroke, 'id' | 'points'> | null = null;
  private strokeStart = 0;
  private processed = 0; // buffer index handled so far (eraser)
  private hover: Vec | null = null;
  private pendingErase = new Set<string>();
  private selected = new Set<string>();
  private moveOrigin: Vec = { x: 0, y: 0 };
  private moveOffset: Vec = { x: 0, y: 0 };
  private nav = new NavGesture();
  private lastTap = { t: 0, x: 0, y: 0 };
  private tapStart = { t: 0, x: 0, y: 0, moved: false };

  private raf = 0;
  private committedDirty = true;
  private liveDirty = true;
  private ro: ResizeObserver;
  private disposed = false;

  // perf counters (cheap writes only)
  private frameMs = 0;
  private lastFrame = 0;
  private pointCount = 0;
  private pointWindowStart = performance.now();
  private pointsPerSec = 0;

  constructor(private o: ControllerOptions) {
    this.store = new StrokeStore(o.strokes);
    this.history = new History(this.store);
    this.history.subscribe(() => this.afterHistory());
    const c = o.committed.getContext('2d');
    const l = o.live.getContext('2d');
    if (!c || !l) throw new Error('Canvas 2D is not available');
    this.cctx = c;
    this.lctx = l;
    this.rect = o.host.getBoundingClientRect();

    const h = o.host;
    h.addEventListener('pointerdown', this.onDown);
    h.addEventListener('pointermove', this.onMove);
    h.addEventListener('pointerup', this.onUp);
    h.addEventListener('pointercancel', this.onCancel);
    h.addEventListener('wheel', this.onWheel, { passive: false });
    h.addEventListener('contextmenu', this.prevent);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(h);
    this.resize(true);
  }

  get strokes(): Stroke[] {
    return this.store.strokes;
  }

  get pageSize() {
    return { w: this.o.page.width, h: this.o.page.height };
  }

  perf(): PerfStats {
    return { frameMs: this.frameMs, pointsPerSec: this.pointsPerSec };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const h = this.o.host;
    h.removeEventListener('pointerdown', this.onDown);
    h.removeEventListener('pointermove', this.onMove);
    h.removeEventListener('pointerup', this.onUp);
    h.removeEventListener('pointercancel', this.onCancel);
    h.removeEventListener('wheel', this.onWheel);
    h.removeEventListener('contextmenu', this.prevent);
  }

  // ---- public commands --------------------------------------------------

  undo() {
    this.history.undo();
  }
  redo() {
    this.history.redo();
  }

  setTool(): void {
    // Switching tools drops any selection and unfinished gesture.
    this.clearSelection();
    this.liveDirty = true;
    this.schedule();
  }

  resetView(): void {
    this.setView(fitView(this.pageSize, this.vp));
  }

  zoomBy(factor: number): void {
    this.setView(zoomAt(this.view, this.vp.w / 2, this.vp.h / 2, this.view.scale * factor));
  }

  deleteSelection(): void {
    if (!this.selected.size) return;
    this.history.exec(removeStrokes([...this.selected], 'delete'));
    this.clearSelection();
  }

  copySelection(): void {
    clipboard = this.store.strokes.filter((s) => this.selected.has(s.id));
  }

  cutSelection(): void {
    this.copySelection();
    this.deleteSelection();
  }

  paste(): void {
    if (!clipboard.length) return;
    const copies = cloneStrokes(clipboard);
    this.history.exec(addStrokes(copies));
    this.selected = new Set(copies.map((c) => c.id));
    this.emitSelection();
    this.liveDirty = true;
    this.schedule();
  }

  // ---- layout & view ----------------------------------------------------

  private resize(first = false): void {
    const { clientWidth: w, clientHeight: h } = this.o.host;
    if (!w || !h) return;
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.vp = { w, h };
    for (const c of [this.o.committed, this.o.live]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    this.rect = this.o.host.getBoundingClientRect();
    if (first) this.view = fitView(this.pageSize, this.vp);
    else this.view = clampView(this.view, this.pageSize, this.vp);
    this.committedDirty = this.liveDirty = true;
    this.emitZoom();
    this.schedule();
  }

  private setView(v: View): void {
    this.view = clampView(v, this.pageSize, this.vp);
    this.committedDirty = this.liveDirty = true;
    this.emitZoom();
    this.schedule();
  }

  private emitZoom() {
    this.o.onUi({ zoomPct: Math.round(this.view.scale * 100) });
  }

  private emitSelection() {
    this.o.onUi({ hasSelection: this.selected.size > 0 });
  }

  private afterHistory(): void {
    const alive = new Set(this.store.strokes.map((s) => s.id));
    for (const id of this.selected) if (!alive.has(id)) this.selected.delete(id);
    this.emitSelection();
    this.o.onUi({ canUndo: this.history.canUndo, canRedo: this.history.canRedo });
    this.o.onStrokesChanged(this.store.strokes);
    this.committedDirty = this.liveDirty = true;
    this.schedule();
  }

  private clearSelection() {
    if (!this.selected.size) return;
    this.selected = new Set();
    this.emitSelection();
    this.liveDirty = true;
  }

  // ---- pointer path (no allocation beyond the event objects) -------------

  private prevent = (e: Event) => e.preventDefault();

  private touchDraws(): boolean {
    return this.o.getTool().inputMode === 'pencilAndFinger' && !this.penSeen;
  }

  private canDraw(e: PointerEvent): boolean {
    if (e.pointerType === 'pen') return true;
    if (e.pointerType === 'mouse') return e.button === 0;
    return this.touchDraws();
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'pen') this.penSeen = true;
    // Palm rejection: while the pen (or mouse) is drawing, touches are ignored entirely.
    if (e.pointerType === 'touch' && this.drawPointer >= 0 && this.penSeen) return;
    e.preventDefault();
    this.rect = this.o.host.getBoundingClientRect();
    try {
      this.o.host.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer: drawing still works without capture */
    }
    const x = e.clientX - this.rect.left;
    const y = e.clientY - this.rect.top;

    if (e.pointerType === 'touch' && (!this.canDraw(e) || this.mode !== 'idle')) {
      // Second finger while a finger stroke is in progress: abandon the stroke and navigate.
      if (this.mode !== 'idle' && this.mode !== 'nav') {
        // Hand the finger that was drawing over to the pinch gesture, then drop its stroke.
        if (this.hover) {
          const { scale, tx, ty } = this.view;
          this.nav.start(this.drawPointer, this.hover.x * scale + tx, this.hover.y * scale + ty);
        }
        this.abortAction();
      }
      this.mode = 'nav';
      this.nav.start(e.pointerId, x, y);
      if (this.nav.count === 1) this.tapStart = { t: e.timeStamp, x, y, moved: false };
      else this.tapStart.moved = true;
      return;
    }
    if (!this.canDraw(e) || this.mode !== 'idle') return;

    this.drawPointer = e.pointerId;
    const { tool, options } = this.o.getTool();
    const p = screenToPage(this.view, x, y);
    this.strokeStart = e.timeStamp;
    this.buf.clear();
    this.livePts.length = 0;
    this.processed = 0;
    this.hover = p;

    if (tool === 'eraser') {
      this.mode = 'erase';
      this.pendingErase.clear();
      this.pushPoint(e, p.x, p.y);
    } else if (tool === 'lasso') {
      const box = this.selectionBounds();
      if (box && pointInRect(p, box)) {
        this.mode = 'move';
        this.moveOrigin = p;
        this.moveOffset = { x: 0, y: 0 };
        this.committedDirty = true; // redraw without the selected strokes
      } else {
        this.clearSelection();
        this.mode = 'lasso';
        this.pushPoint(e, p.x, p.y);
      }
    } else {
      this.mode = 'draw';
      this.liveStyle = {
        tool: tool as StrokeTool,
        color: options.color,
        width: options.width,
        opacity: options.opacity,
        sim: e.pointerType !== 'pen',
      };
      this.o.live.style.mixBlendMode = tool === 'highlighter' ? 'multiply' : 'normal';
      this.pushPoint(e, p.x, p.y);
    }
    this.liveDirty = true;
    this.schedule();
  };

  private pushPoint(e: PointerEvent, px: number, py: number): void {
    const pressure = e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 0.5;
    this.buf.push(px, py, pressure, e.timeStamp - this.strokeStart);
    this.pointCount++;
  }

  private onMove = (e: PointerEvent): void => {
    if (this.mode === 'nav' && this.nav.has(e.pointerId)) {
      const x = e.clientX - this.rect.left;
      const y = e.clientY - this.rect.top;
      const t = this.tapStart;
      if (Math.hypot(x - t.x, y - t.y) > 10) t.moved = true;
      const v = this.nav.move(e.pointerId, x, y, this.view);
      if (v) this.setView(v);
      return;
    }
    if (e.pointerId !== this.drawPointer) return;
    const evs = e.getCoalescedEvents?.();
    const list = evs && evs.length ? evs : [e];
    for (const ev of list) {
      const p = screenToPage(this.view, ev.clientX - this.rect.left, ev.clientY - this.rect.top);
      this.hover = p;
      if (this.mode === 'move') {
        this.moveOffset = { x: p.x - this.moveOrigin.x, y: p.y - this.moveOrigin.y };
      } else {
        this.pushPoint(ev, p.x, p.y);
      }
    }
    this.liveDirty = true;
    this.schedule();
  };

  private onUp = (e: PointerEvent): void => {
    if (this.mode === 'nav' && this.nav.has(e.pointerId)) {
      this.finishNavPointer(e);
      return;
    }
    if (e.pointerId !== this.drawPointer) return;
    this.commitAction();
  };

  private onCancel = (e: PointerEvent): void => {
    if (this.nav.has(e.pointerId)) {
      this.nav.end(e.pointerId);
      if (!this.nav.active) this.mode = 'idle';
      return;
    }
    if (e.pointerId === this.drawPointer) this.abortAction();
  };

  private finishNavPointer(e: PointerEvent): void {
    const wasSingle = this.nav.count === 1;
    this.nav.end(e.pointerId);
    if (this.nav.active) return;
    this.mode = 'idle';
    const t = this.tapStart;
    // Double-tap with a single finger resets the zoom.
    if (wasSingle && !t.moved && e.timeStamp - t.t < 300) {
      const prev = this.lastTap;
      if (e.timeStamp - prev.t < 350 && Math.hypot(t.x - prev.x, t.y - prev.y) < 30) {
        this.resetView();
        this.lastTap = { t: 0, x: 0, y: 0 };
      } else {
        this.lastTap = { t: e.timeStamp, x: t.x, y: t.y };
      }
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const x = e.clientX - this.rect.left;
    const y = e.clientY - this.rect.top;
    if (e.ctrlKey || e.metaKey) {
      this.setView(zoomAt(this.view, x, y, this.view.scale * Math.exp(-e.deltaY * 0.01)));
    } else {
      this.setView({ ...this.view, tx: this.view.tx - e.deltaX, ty: this.view.ty - e.deltaY });
    }
  };

  // ---- commit / abort ----------------------------------------------------

  private commitAction(): void {
    const mode = this.mode;
    this.mode = 'idle';
    this.drawPointer = -1;
    if (mode === 'draw' && this.liveStyle) {
      const points = [];
      for (let i = 0; i < this.buf.n; i++) {
        points.push({
          x: this.buf.x(i),
          y: this.buf.y(i),
          pressure: this.buf.pressure(i),
          t: this.buf.t(i),
        });
      }
      const stroke: Stroke = { id: newId(), ...this.liveStyle, points };
      this.history.exec(addStrokes([stroke]));
    } else if (mode === 'erase') {
      this.flushEraser();
      if (this.pendingErase.size) this.history.exec(removeStrokes([...this.pendingErase]));
      this.pendingErase.clear();
    } else if (mode === 'lasso') {
      const poly: Vec[] = [];
      for (let i = 0; i < this.buf.n; i++) poly.push({ x: this.buf.x(i), y: this.buf.y(i) });
      this.selected = new Set(strokesInPolygon(this.store.strokes, poly).map((s) => s.id));
      this.emitSelection();
    } else if (mode === 'move') {
      const { x, y } = this.moveOffset;
      if (x !== 0 || y !== 0) this.history.exec(moveStrokes([...this.selected], x, y));
    }
    this.liveStyle = null;
    this.buf.clear();
    this.livePts.length = 0;
    this.hover = null;
    this.moveOffset = { x: 0, y: 0 };
    this.committedDirty = this.liveDirty = true;
    this.schedule();
  }

  private abortAction(): void {
    this.mode = 'idle';
    this.drawPointer = -1;
    this.liveStyle = null;
    this.buf.clear();
    this.livePts.length = 0;
    this.pendingErase.clear();
    this.hover = null;
    this.moveOffset = { x: 0, y: 0 };
    this.committedDirty = this.liveDirty = true;
    this.schedule();
  }

  // ---- frame loop ---------------------------------------------------------

  private schedule(): void {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    if (this.lastFrame) this.frameMs = this.frameMs * 0.9 + (now - this.lastFrame) * 0.1;
    this.lastFrame = now;
    if (now - this.pointWindowStart >= 1000) {
      this.pointsPerSec = Math.round((this.pointCount * 1000) / (now - this.pointWindowStart));
      this.pointCount = 0;
      this.pointWindowStart = now;
    }

    if (this.mode === 'erase') this.flushEraser();
    if (this.committedDirty) {
      this.renderCommitted();
      this.committedDirty = false;
    }
    if (this.liveDirty) {
      this.renderLive();
      this.liveDirty = false;
    }
    if (this.mode !== 'idle' && this.mode !== 'nav') this.schedule();
  };

  /** Hit-test new eraser points; strokes touched are hidden until the gesture is committed. */
  private flushEraser(): void {
    const r = ERASER_PX / this.view.scale;
    let changed = false;
    for (; this.processed < this.buf.n; this.processed++) {
      const x = this.buf.x(this.processed);
      const y = this.buf.y(this.processed);
      for (const s of this.store.strokes) {
        if (this.pendingErase.has(s.id)) continue;
        if (strokeHitsCircle(s, x, y, r)) {
          this.pendingErase.add(s.id);
          changed = true;
        }
      }
    }
    if (changed) this.committedDirty = true;
  }

  private applyView(ctx: CanvasRenderingContext2D): void {
    const { scale, tx, ty } = this.view;
    const d = this.dpr;
    ctx.setTransform(d * scale, 0, 0, d * scale, d * tx, d * ty);
  }

  private renderCommitted(): void {
    const ctx = this.cctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this.applyView(ctx);
    const { width: pw, height: ph } = this.o.page;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 12 * this.dpr;
    ctx.shadowOffsetY = 2 * this.dpr;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pw, ph);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    const hidden = new Set(this.pendingErase);
    if (this.mode === 'move') for (const id of this.selected) hidden.add(id);
    drawStrokes(ctx, this.store.strokes, visiblePageRect(this.view, this.vp), hidden);
    ctx.restore();
  }

  private selectionBounds(): Rect | null {
    if (!this.selected.size) return null;
    return unionRects(this.store.strokes.filter((s) => this.selected.has(s.id)).map(strokeBounds));
  }

  private renderLive(): void {
    const ctx = this.lctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this.applyView(ctx);
    const px = 1 / this.view.scale; // one screen pixel in page units

    if (this.mode === 'draw' && this.liveStyle) {
      // Convert only the points added since the last frame.
      for (let i = this.livePts.length; i < this.buf.n; i++) {
        this.livePts.push([this.buf.x(i), this.buf.y(i), this.buf.pressure(i)]);
      }
      paintPath(ctx, outlineToPath(liveOutline(this.livePts, this.liveStyle)), this.liveStyle);
      return;
    }

    ctx.lineWidth = 1.5 * px;
    if (this.mode === 'erase' && this.hover) {
      ctx.strokeStyle = '#666';
      ctx.beginPath();
      ctx.arc(this.hover.x, this.hover.y, ERASER_PX * px, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (this.mode === 'lasso' && this.buf.n > 1) {
      ctx.strokeStyle = SELECT_COLOR;
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.beginPath();
      ctx.moveTo(this.buf.x(0), this.buf.y(0));
      for (let i = 1; i < this.buf.n; i++) ctx.lineTo(this.buf.x(i), this.buf.y(i));
      ctx.stroke();
      return;
    }
    const selected = this.store.strokes.filter((s) => this.selected.has(s.id));
    if (selected.length) {
      const dx = this.mode === 'move' ? this.moveOffset.x : 0;
      const dy = this.mode === 'move' ? this.moveOffset.y : 0;
      ctx.save();
      ctx.translate(dx, dy);
      if (this.mode === 'move') for (const s of selected) drawStroke(ctx, s);
      const b = unionRects(selected.map(strokeBounds));
      if (b) {
        ctx.strokeStyle = SELECT_COLOR;
        ctx.setLineDash([6 * px, 4 * px]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      ctx.restore();
    }
  }
}
