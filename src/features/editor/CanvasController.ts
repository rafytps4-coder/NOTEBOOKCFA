import {
  History,
  StrokeStore,
  addItems,
  clampView,
  cloneStrokes,
  cropImage,
  drawPaper,
  drawStroke,
  drawStrokes,
  fitInside,
  fitView,
  hitHandle,
  liveOutline,
  minZ,
  moveItems,
  nextZ,
  objectBounds,
  objectsInPolygon,
  outlineToPath,
  paintPath,
  patchObjects,
  pointInPolygon,
  pointInRect,
  recognizeShape,
  removeItems,
  removeStrokes,
  resizeObject,
  rotateObject,
  screenToPage,
  strokeBounds,
  strokeHitsCircle,
  strokesInPolygon,
  topObjectAt,
  unionRects,
  visiblePageRect,
  zoomAt,
  type EditorTool,
  type HandleId,
  type PageObject,
  type Recognized,
  type Rect,
  type Stroke,
  type StrokeTool,
  type TextObject,
  type ToolOptions,
  type Vec,
  type View,
} from '@/engines/drawing';
import { newId } from '@/core/ids';
import type { ImageObject, PageTemplate } from '@/core/models';
import type { PageBackground } from '../pdf/pdfBackground';
import { subscribeImages } from './imageCache';
import { NavGesture } from './NavGesture';
import {
  HANDLE_HIT_PX,
  ROTATE_GAP_PX,
  drawHandles,
  drawObject,
  drawObjects,
  neededTextHeight,
} from './objectRender';
import {
  makeImage,
  makeShape,
  makeText,
  type ShapeOptions,
  type TextOptions,
} from './objectFactory';
import { PointBuffer } from './PointBuffer';

export type InputMode = 'pencilOnly' | 'pencilAndFinger';

export interface ToolState {
  tool: EditorTool;
  /** Options for the active ink tool (ignored for eraser/lasso/text/shape). */
  options: ToolOptions;
  inputMode: InputMode;
  text: TextOptions;
  shape: ShapeOptions;
  /** Hold still at the end of a pen/pencil stroke to turn it into a clean shape. */
  shapeSnap: boolean;
}

export interface UiPatch {
  canUndo?: boolean;
  canRedo?: boolean;
  hasSelection?: boolean;
  zoomPct?: number;
  /** The single selected object (when only one object is selected), for the options panel. */
  selectedObject?: PageObject | null;
}

export interface PerfStats {
  frameMs: number;
  pointsPerSec: number;
}

export interface PageLook {
  width: number;
  height: number;
  template: PageTemplate;
  background: string;
}

/** Navigation requested by touch/wheel in `fixed` mode, for the scrolling container to apply. */
export interface NavRequest {
  /** Desired page transform relative to now: scale factor and pan in screen px. */
  factor: number;
  dx: number;
  dy: number;
  /** Anchor in host-local px (for zoom). */
  cx: number;
  cy: number;
  reset?: boolean;
}

export interface PageInkContent {
  strokes: Stroke[];
  objects: PageObject[];
}

export interface EditTextRequest {
  obj: TextObject;
  isNew: boolean;
}

export interface ControllerOptions {
  host: HTMLElement;
  committed: HTMLCanvasElement;
  live: HTMLCanvasElement;
  page: PageLook;
  /** Fixed mode: the host is exactly the page at `scale`; scrolling/zoom belong to the container. */
  fixedScale?: number;
  onNavigate?: (n: NavRequest) => void;
  /** Called when the user starts working on this page (so undo/redo target it). */
  onActivate?: () => void;
  strokes: Stroke[];
  objects: PageObject[];
  getTool(): ToolState;
  onChanged(content: PageInkContent): void;
  onUi(patch: UiPatch): void;
  /** Ask the UI to show a text editor over the page, or hide it (null). */
  onEditText?: (req: EditTextRequest | null) => void;
  /** Switch tool (e.g. back to Select after creating an object). */
  onToolChange?: (tool: EditorTool) => void;
  /** Paints something other than plain paper behind the ink (e.g. a PDF page). */
  background?: PageBackground;
  /** Make an image asset available to this notebook before a pasted copy refers to it. */
  resolveAsset?: (assetId: string) => Promise<string>;
}

type Mode = 'idle' | 'draw' | 'erase' | 'lasso' | 'move' | 'nav' | 'xform' | 'shape';

/** In-memory clipboard shared across pages for the session. */
let clipboard: PageInkContent = { strokes: [], objects: [] };

const ERASER_PX = 10;
const MAX_DPR = 3;
const MAX_CANVAS_PIXELS = 14_000_000; // keep within iPad Safari canvas limits
const SELECT_COLOR = '#1a5fd0';
const SNAP_HOLD_MS = 550;
const MERGE_MS = 1000;

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
  private look: PageLook;
  private fixedScale: number | undefined;
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
  private selStrokes = new Set<string>();
  private selObjs = new Set<string>();
  private moveOrigin: Vec = { x: 0, y: 0 };
  private moveOffset: Vec = { x: 0, y: 0 };
  private nav = new NavGesture();
  private lastTap = { t: 0, x: 0, y: 0 };
  private tapStart = { t: 0, x: 0, y: 0, moved: false };

  // object gestures
  private xformStart: PageObject | null = null;
  private xformCur: PageObject | null = null;
  private xformHandle: HandleId | null = null;
  private shapeStart: Vec | null = null;
  private editing: EditTextRequest | null = null;
  private keepSelectionUntil = 0;
  private lastMove = 0;
  private snapped: Recognized | null = null;
  private mergeKey = '';
  private mergeTime = 0;
  private mergeBefore: PageObject[] = [];

  private raf = 0;
  private committedDirty = true;
  private liveDirty = true;
  private ro: ResizeObserver;
  private offImages: () => void;
  private offBackground: () => void;
  private disposed = false;

  // perf counters (cheap writes only)
  private frameMs = 0;
  private lastFrame = 0;
  private pointCount = 0;
  private pointWindowStart = performance.now();
  private pointsPerSec = 0;

  constructor(private o: ControllerOptions) {
    this.look = o.page;
    this.fixedScale = o.fixedScale;
    this.store = new StrokeStore(o.strokes, o.objects);
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
    this.offImages = subscribeImages(() => {
      this.committedDirty = true;
      this.schedule();
    });
    this.offBackground =
      o.background?.subscribe(() => {
        this.committedDirty = true;
        this.schedule();
      }) ?? (() => {});
    this.resize(true);
  }

  get strokes(): Stroke[] {
    return this.store.strokes;
  }

  get objects(): PageObject[] {
    return this.store.objects;
  }

  content(): PageInkContent {
    return { strokes: this.store.strokes, objects: this.store.objects };
  }

  get pageSize() {
    return { w: this.look.width, h: this.look.height };
  }

  perf(): PerfStats {
    return { frameMs: this.frameMs, pointsPerSec: this.pointsPerSec };
  }

  /** Current page→screen transform (host-local px), for positioning the text editor. */
  viewState(): View {
    return this.view;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.offImages();
    this.offBackground();
    const h = this.o.host;
    h.removeEventListener('pointerdown', this.onDown);
    h.removeEventListener('pointermove', this.onMove);
    h.removeEventListener('pointerup', this.onUp);
    h.removeEventListener('pointercancel', this.onCancel);
    h.removeEventListener('wheel', this.onWheel);
    h.removeEventListener('contextmenu', this.prevent);
  }

  // ---- public commands --------------------------------------------------

  /** Toolbar state. Fixed-mode pages omit zoom: the scrolling container owns it. */
  uiState(): UiPatch {
    return {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      hasSelection: this.hasSelection(),
      selectedObject: this.singleSelectedObject(),
      ...(this.fixedScale === undefined ? { zoomPct: Math.round(this.view.scale * 100) } : {}),
    };
  }

  undo() {
    this.history.undo();
  }
  redo() {
    this.history.redo();
  }

  setTool(): void {
    if (performance.now() < this.keepSelectionUntil) {
      this.keepSelectionUntil = 0; // we switched to Select ourselves after creating an object
      return;
    }
    // Switching tools drops any selection and unfinished gesture.
    this.cancelText();
    this.clearSelection();
    this.liveDirty = true;
    this.schedule();
  }

  resetView(): void {
    if (this.fixedScale !== undefined) {
      this.o.onNavigate?.({ factor: 1, dx: 0, dy: 0, cx: 0, cy: 0, reset: true });
      return;
    }
    this.setView(fitView(this.pageSize, this.vp));
  }

  /** Fixed mode: container changed the zoom. */
  setFixedScale(scale: number): void {
    this.fixedScale = scale;
    this.resize();
  }

  /** Template/background/size changed. Ink is untouched. */
  setLook(look: PageLook): void {
    this.look = look;
    this.resize();
  }

  zoomBy(factor: number): void {
    this.setView(zoomAt(this.view, this.vp.w / 2, this.vp.h / 2, this.view.scale * factor));
  }

  deleteSelection(): void {
    if (!this.hasSelection()) return;
    this.history.exec(removeItems([...this.selStrokes], [...this.selObjs], 'delete'));
    this.clearSelection();
  }

  copySelection(): void {
    clipboard = {
      strokes: this.store.strokes.filter((s) => this.selStrokes.has(s.id)),
      objects: this.store.objects.filter((o) => this.selObjs.has(o.id)),
    };
  }

  cutSelection(): void {
    this.copySelection();
    this.deleteSelection();
  }

  async paste(): Promise<void> {
    if (!clipboard.strokes.length && !clipboard.objects.length) return;
    const strokes = cloneStrokes(clipboard.strokes);
    let z = nextZ(this.store.objects);
    const objects: PageObject[] = [];
    for (const src of clipboard.objects) {
      let copy: PageObject = { ...src, id: newId(), cx: src.cx + 24, cy: src.cy + 24, z: z++ };
      if (copy.type === 'image' && this.o.resolveAsset) {
        copy = { ...copy, assetId: await this.o.resolveAsset(copy.assetId) };
      }
      objects.push(copy);
    }
    this.history.exec(addItems(strokes, objects, 'paste'));
    this.selStrokes = new Set(strokes.map((s) => s.id));
    this.selObjs = new Set(objects.map((o) => o.id));
    this.emitSelection();
    this.liveDirty = true;
    this.schedule();
  }

  /** Insert an image object at the centre of what is visible and select it. */
  insertImage(assetId: string, natW: number, natH: number): void {
    const centre =
      this.fixedScale === undefined
        ? screenToPage(this.view, this.vp.w / 2, this.vp.h / 2)
        : { x: this.look.width / 2, y: this.look.height / 2 };
    const maxW = this.look.width * 0.6;
    const maxH = this.look.height * 0.5;
    const size = fitInside(natW, natH, maxW, maxH);
    const obj = makeImage(assetId, centre.x, centre.y, size.w, size.h, this.store.objects);
    this.history.exec(addItems([], [obj], 'insert image'));
    this.selectOnly(obj.id);
    this.switchToSelect();
  }

  /** After creating an object: go to Select with that object still selected (handles visible). */
  private switchToSelect(): void {
    // The UI's tool-change effect calls setTool() a moment later; it must not drop this selection.
    // The window is short so it can't swallow a genuine tool change if the tool didn't change.
    this.keepSelectionUntil = performance.now() + 400;
    this.o.onToolChange?.('lasso');
  }

  /** What is selected, for features that turn a selection into something else (e.g. a flashcard). */
  selectionInfo(): { strokes: Stroke[]; objects: PageObject[]; bounds: Rect } | null {
    const bounds = this.selectionBounds();
    if (!bounds) return null;
    return {
      strokes: this.store.strokes.filter((x) => this.selStrokes.has(x.id)),
      objects: this.store.objects.filter((o) => this.selObjs.has(o.id)),
      bounds,
    };
  }

  singleSelectedObject(): PageObject | null {
    if (this.selStrokes.size || this.selObjs.size !== 1) return null;
    const id = [...this.selObjs][0];
    return this.store.objects.find((o) => o.id === id) ?? null;
  }

  /** Change properties of the selected object(s) (colour, size, text style…). Undo-friendly. */
  patchSelected(patch: Record<string, unknown>, mergeKey: string): void {
    const before = this.store.objects.filter((o) => this.selObjs.has(o.id));
    if (!before.length) return;
    const after = before.map((o) => {
      const next = { ...o, ...patch } as PageObject;
      if (next.type === 'text') next.h = Math.max(next.h, neededTextHeight(next));
      return next;
    });
    this.execMerged(before, after, mergeKey, 'format');
  }

  cropSelected(crop: ImageObject['crop']): void {
    const o = this.singleSelectedObject();
    if (!o || o.type !== 'image') return;
    this.execMerged([o], [cropImage(o, crop)], 'crop', 'crop');
  }

  bringToFront(): void {
    this.reorder((objs) => nextZ(objs));
  }

  sendToBack(): void {
    this.reorder((objs) => minZ(objs));
  }

  private reorder(zFor: (all: PageObject[]) => number): void {
    const before = this.store.objects.filter((o) => this.selObjs.has(o.id));
    if (!before.length) return;
    const base = zFor(this.store.objects);
    const step = base >= 0 ? 1 : -1;
    const after = before.map((o, i) => ({ ...o, z: base + i * step }));
    this.history.exec(patchObjects(before, after, 'reorder'));
  }

  /** Apply an object edit; repeated edits with the same key within a second form one undo step. */
  private execMerged(before: PageObject[], after: PageObject[], key: string, label: string): void {
    const now = performance.now();
    if (this.mergeKey === key && now - this.mergeTime < MERGE_MS && this.history.canUndo) {
      this.history.undo();
      this.history.exec(patchObjects(this.mergeBefore, after, label));
    } else {
      this.mergeBefore = before;
      this.history.exec(patchObjects(before, after, label));
    }
    this.mergeKey = key;
    this.mergeTime = now;
  }

  // ---- text editing --------------------------------------------------------

  private beginEditText(obj: TextObject, isNew: boolean): void {
    this.editing = { obj, isNew };
    this.committedDirty = true;
    this.o.onEditText?.(this.editing);
    this.schedule();
  }

  /** Finish editing with the final text. Empty boxes are discarded. */
  commitText(text: string): void {
    const e = this.editing;
    if (!e) return;
    this.editing = null;
    this.o.onEditText?.(null);
    const empty = text.trim() === '';
    if (e.isNew) {
      if (!empty) {
        const obj: TextObject = { ...e.obj, text };
        obj.h = Math.max(obj.h, neededTextHeight(obj));
        this.history.exec(addItems([], [obj], 'add text'));
        this.selectOnly(obj.id);
        this.switchToSelect();
      }
    } else if (empty) {
      this.history.exec(removeItems([], [e.obj.id], 'delete'));
      this.clearSelection();
    } else if (text !== e.obj.text) {
      const next: TextObject = { ...e.obj, text };
      next.h = Math.max(next.h, neededTextHeight(next));
      this.history.exec(patchObjects([e.obj], [next], 'edit text'));
    }
    this.committedDirty = this.liveDirty = true;
    this.schedule();
  }

  cancelText(): void {
    if (!this.editing) return;
    this.editing = null;
    this.o.onEditText?.(null);
    this.committedDirty = true;
    this.schedule();
  }

  // ---- layout & view ----------------------------------------------------

  private resize(first = false): void {
    const { clientWidth: w, clientHeight: h } = this.o.host;
    if (!w || !h) return;
    let dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    dpr = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)));
    this.dpr = Math.max(0.5, dpr);
    this.vp = { w, h };
    for (const c of [this.o.committed, this.o.live]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    this.rect = this.o.host.getBoundingClientRect();
    if (this.fixedScale !== undefined) this.view = { scale: this.fixedScale, tx: 0, ty: 0 };
    else if (first) this.view = fitView(this.pageSize, this.vp);
    else this.view = clampView(this.view, this.pageSize, this.vp);
    this.committedDirty = this.liveDirty = true;
    this.emitZoom();
    this.schedule();
  }

  private setView(v: View): void {
    if (this.fixedScale !== undefined) return; // container owns the view
    this.view = clampView(v, this.pageSize, this.vp);
    this.committedDirty = this.liveDirty = true;
    this.emitZoom();
    this.schedule();
  }

  private emitZoom() {
    this.o.onUi({ zoomPct: Math.round(this.view.scale * 100) });
  }

  private hasSelection() {
    return this.selStrokes.size > 0 || this.selObjs.size > 0;
  }

  private emitSelection() {
    this.o.onUi({ hasSelection: this.hasSelection(), selectedObject: this.singleSelectedObject() });
  }

  private afterHistory(): void {
    const strokeIds = new Set(this.store.strokes.map((s) => s.id));
    const objIds = new Set(this.store.objects.map((o) => o.id));
    for (const id of this.selStrokes) if (!strokeIds.has(id)) this.selStrokes.delete(id);
    for (const id of this.selObjs) if (!objIds.has(id)) this.selObjs.delete(id);
    this.emitSelection();
    this.o.onUi({ canUndo: this.history.canUndo, canRedo: this.history.canRedo });
    this.o.onChanged(this.content());
    this.committedDirty = this.liveDirty = true;
    this.schedule();
  }

  private clearSelection() {
    if (!this.hasSelection()) return;
    this.selStrokes = new Set();
    this.selObjs = new Set();
    this.emitSelection();
    this.liveDirty = true;
  }

  private selectOnly(objectId: string) {
    this.selStrokes = new Set();
    this.selObjs = new Set([objectId]);
    this.emitSelection();
    this.committedDirty = this.liveDirty = true;
    this.schedule();
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
    if (e.target instanceof HTMLTextAreaElement) return; // typing in the text editor overlay
    // Tapping the page while editing text ends the edit (preventDefault below would keep focus).
    if (this.editing) (document.activeElement as HTMLElement | null)?.blur();
    if (e.pointerType === 'pen') this.penSeen = true;
    // Palm rejection: while the pen (or mouse) is drawing, touches are ignored entirely.
    if (e.pointerType === 'touch' && this.drawPointer >= 0 && this.penSeen) return;
    e.preventDefault();
    this.rect = this.o.host.getBoundingClientRect();
    this.o.onActivate?.();
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

    const ts = this.o.getTool();
    const p = screenToPage(this.view, x, y);
    this.drawPointer = e.pointerId;
    this.strokeStart = e.timeStamp;
    this.lastMove = e.timeStamp;
    this.snapped = null;
    this.buf.clear();
    this.livePts.length = 0;
    this.processed = 0;
    this.hover = p;

    switch (ts.tool) {
      case 'eraser':
        this.mode = 'erase';
        this.pendingErase.clear();
        this.pushPoint(e, p.x, p.y);
        break;
      case 'lasso':
        this.startSelect(e, p);
        break;
      case 'text':
        this.startText(p);
        return;
      case 'shape':
        this.mode = 'shape';
        this.shapeStart = p;
        break;
      default:
        this.mode = 'draw';
        this.liveStyle = {
          tool: ts.tool as StrokeTool,
          color: ts.options.color,
          width: ts.options.width,
          opacity: ts.options.opacity,
          sim: e.pointerType !== 'pen',
        };
        this.o.live.style.mixBlendMode = ts.tool === 'highlighter' ? 'multiply' : 'normal';
        this.pushPoint(e, p.x, p.y);
    }
    this.liveDirty = true;
    this.schedule();
  };

  /** Select tool: handles → move selection → pick an object → otherwise lasso. */
  private startSelect(e: PointerEvent, p: Vec): void {
    const single = this.singleSelectedObject();
    if (single) {
      const px = 1 / this.view.scale;
      // Small objects: keep the middle of the body free of handle hit areas so it can be moved.
      const reach = Math.min(
        HANDLE_HIT_PX * px,
        Math.max(6 * px, Math.min(single.w, single.h) * 0.3),
      );
      const h = hitHandle(single, p.x, p.y, reach, ROTATE_GAP_PX * px, HANDLE_HIT_PX * px);
      if (h) {
        this.mode = 'xform';
        this.xformHandle = h;
        this.xformStart = single;
        this.xformCur = single;
        this.committedDirty = true;
        return;
      }
    }
    const hit = topObjectAt(this.store.objects, p.x, p.y, 4 / this.view.scale);
    if (hit) {
      // Double-tap on text edits it (also when it is already selected).
      const now = e.timeStamp;
      const t = this.lastTap;
      const again = now - t.t < 400 && Math.hypot(p.x - t.x, p.y - t.y) < 12;
      this.lastTap = { t: again ? 0 : now, x: p.x, y: p.y };
      if (hit.type === 'text' && again) {
        this.selectOnly(hit.id);
        this.drawPointer = -1;
        this.beginEditText(hit, false);
        return;
      }
    }
    const box = this.selectionBounds();
    if (box && pointInRect(p, box)) {
      this.beginMove(p);
      return;
    }
    if (hit) {
      this.selStrokes = new Set();
      this.selObjs = new Set([hit.id]);
      this.emitSelection();
      this.beginMove(p);
      return;
    }
    this.clearSelection();
    this.mode = 'lasso';
    this.pushPoint(e, p.x, p.y);
  }

  private beginMove(p: Vec): void {
    this.mode = 'move';
    this.moveOrigin = p;
    this.moveOffset = { x: 0, y: 0 };
    this.committedDirty = true; // redraw without the selected items
  }

  /** Text tool: tap an existing text box to edit it, otherwise start a new one. */
  private startText(p: Vec): void {
    this.drawPointer = -1; // one-shot: no drag follows
    const hit = topObjectAt(this.store.objects, p.x, p.y);
    if (hit && hit.type === 'text') {
      this.selectOnly(hit.id);
      this.beginEditText(hit, false);
    } else {
      this.beginEditText(makeText(p.x, p.y, this.o.getTool().text, this.store.objects), true);
    }
  }

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
      if (this.fixedScale !== undefined) {
        const d = this.nav.delta(e.pointerId, x, y);
        if (d) this.o.onNavigate?.(d);
      } else {
        const v = this.nav.move(e.pointerId, x, y, this.view);
        if (v) this.setView(v);
      }
      return;
    }
    if (e.pointerId !== this.drawPointer) return;
    const evs = e.getCoalescedEvents?.();
    const list = evs && evs.length ? evs : [e];
    this.lastMove = e.timeStamp;
    for (const ev of list) {
      const p = screenToPage(this.view, ev.clientX - this.rect.left, ev.clientY - this.rect.top);
      this.hover = p;
      if (this.mode === 'move') {
        this.moveOffset = { x: p.x - this.moveOrigin.x, y: p.y - this.moveOrigin.y };
      } else if (this.mode === 'xform' || this.mode === 'shape') {
        /* handled in the frame loop from `hover` */
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
    if (this.fixedScale !== undefined) {
      // Plain wheel scrolls the container natively; only pinch/ctrl-wheel zooms.
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.01);
      this.o.onNavigate?.({
        factor: f,
        dx: 0,
        dy: 0,
        cx: e.clientX - this.rect.left,
        cy: e.clientY - this.rect.top,
      });
      return;
    }
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
      if (this.snapped) {
        const s = this.snapped;
        const obj = makeShape(
          { x: s.box.x, y: s.box.y },
          { x: s.box.x + s.box.w, y: s.box.y + s.box.h },
          { kind: s.shape, stroke: this.liveStyle.color, width: this.liveStyle.width, fill: null },
          this.store.objects,
        );
        if (s.ends) obj.ends = s.ends;
        this.history.exec(addItems([], [obj], 'snap shape'));
      } else {
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
        this.history.exec(addItems([stroke], []));
      }
    } else if (mode === 'erase') {
      this.flushEraser();
      if (this.pendingErase.size) this.history.exec(removeStrokes([...this.pendingErase]));
      this.pendingErase.clear();
    } else if (mode === 'lasso') {
      const poly: Vec[] = [];
      for (let i = 0; i < this.buf.n; i++) poly.push({ x: this.buf.x(i), y: this.buf.y(i) });
      this.selStrokes = new Set(strokesInPolygon(this.store.strokes, poly).map((s) => s.id));
      this.selObjs = new Set(
        objectsInPolygon(this.store.objects, poly, pointInPolygon).map((o) => o.id),
      );
      this.emitSelection();
    } else if (mode === 'move') {
      const { x, y } = this.moveOffset;
      if (x !== 0 || y !== 0) {
        this.history.exec(moveItems([...this.selStrokes], [...this.selObjs], x, y));
      }
    } else if (mode === 'xform' && this.xformStart && this.xformCur) {
      this.finishXform();
    } else if (mode === 'shape' && this.shapeStart) {
      this.finishShape();
    }
    this.liveStyle = null;
    this.snapped = null;
    this.xformStart = this.xformCur = null;
    this.xformHandle = null;
    this.shapeStart = null;
    this.buf.clear();
    this.livePts.length = 0;
    this.hover = null;
    this.moveOffset = { x: 0, y: 0 };
    this.committedDirty = this.liveDirty = true;
    this.schedule();
  }

  private finishXform(): void {
    let next = this.xformCur!;
    if (next.type === 'text') next = { ...next, h: Math.max(next.h, neededTextHeight(next)) };
    if (JSON.stringify(next) !== JSON.stringify(this.xformStart)) {
      this.history.exec(
        patchObjects(
          [this.xformStart!],
          [next],
          this.xformHandle === 'rotate' ? 'rotate' : 'resize',
        ),
      );
    }
  }

  private finishShape(): void {
    const ts = this.o.getTool();
    const a = this.shapeStart!;
    const b = this.hover ?? a;
    const tiny = Math.hypot(b.x - a.x, b.y - a.y) * this.view.scale < 8;
    // A plain tap drops a default-sized shape (lines/arrows get a horizontal stroke).
    const flat = ts.shape.kind === 'line' || ts.shape.kind === 'arrow';
    const end = tiny ? { x: a.x + 120, y: a.y + (flat ? 0 : 90) } : b;
    const obj = makeShape(a, end, ts.shape, this.store.objects);
    this.history.exec(addItems([], [obj], 'add shape'));
    this.selectOnly(obj.id);
    this.switchToSelect();
  }

  private abortAction(): void {
    this.mode = 'idle';
    this.drawPointer = -1;
    this.liveStyle = null;
    this.snapped = null;
    this.xformStart = this.xformCur = null;
    this.xformHandle = null;
    this.shapeStart = null;
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
    if (this.mode === 'xform') this.updateXform();
    if (this.mode === 'draw') this.checkSnap(performance.now());
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

  private updateXform(): void {
    if (!this.xformStart || !this.hover || !this.xformHandle) return;
    const s = this.xformStart;
    const p = this.hover;
    if (this.xformHandle === 'rotate') this.xformCur = rotateObject(s, p.x, p.y, true);
    else {
      const keep = s.type === 'image';
      this.xformCur = resizeObject(s, this.xformHandle, p.x, p.y, keep);
    }
    this.liveDirty = true;
  }

  /** Hold still at the end of a pen/pencil stroke → preview a clean shape. */
  private checkSnap(now: number): void {
    if (this.snapped || !this.liveStyle || this.liveStyle.tool === 'highlighter') return;
    if (!this.o.getTool().shapeSnap || this.buf.n < 8) return;
    if (now - this.lastMove < SNAP_HOLD_MS) return; // event timestamps share performance.now()'s clock
    const pts = [];
    for (let i = 0; i < this.buf.n; i++) {
      pts.push({ x: this.buf.x(i), y: this.buf.y(i), pressure: 1, t: i });
    }
    this.snapped = recognizeShape(pts);
    if (this.snapped) this.liveDirty = true;
  }

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
    const { width: pw, height: ph } = this.look;
    if (this.fixedScale === undefined) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = 12 * this.dpr;
      ctx.shadowOffsetY = 2 * this.dpr;
      ctx.fillStyle = this.look.background;
      ctx.fillRect(0, 0, pw, ph);
      ctx.restore();
    }
    if (this.o.background) this.o.background.draw(ctx, pw, ph, this.view.scale * this.dpr);
    else drawPaper(ctx, pw, ph, this.look.template, this.look.background);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    const lifted = this.mode === 'move' || this.mode === 'xform';
    const hiddenObjs = new Set<string>(lifted ? this.selObjs : []);
    const editingId = this.editing && !this.editing.isNew ? this.editing.obj.id : null;
    // Objects sit under ink; the text box being edited is drawn by the editor overlay instead.
    const objs = editingId
      ? this.store.objects.filter((o) => o.id !== editingId)
      : this.store.objects;
    drawObjects(ctx, objs, hiddenObjs);
    const hidden = new Set(this.pendingErase);
    if (this.mode === 'move') for (const id of this.selStrokes) hidden.add(id);
    drawStrokes(ctx, this.store.strokes, visiblePageRect(this.view, this.vp), hidden);
    ctx.restore();
  }

  private selectionBounds(): Rect | null {
    const rects: Rect[] = [];
    for (const s of this.store.strokes) if (this.selStrokes.has(s.id)) rects.push(strokeBounds(s));
    for (const o of this.store.objects) if (this.selObjs.has(o.id)) rects.push(objectBounds(o));
    return unionRects(rects);
  }

  private renderLive(): void {
    const ctx = this.lctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this.applyView(ctx);
    const px = 1 / this.view.scale; // one screen pixel in page units

    if (this.mode === 'draw' && this.liveStyle) {
      if (this.snapped) {
        this.drawSnapPreview(ctx);
        return;
      }
      // Convert only the points added since the last frame.
      for (let i = this.livePts.length; i < this.buf.n; i++) {
        this.livePts.push([this.buf.x(i), this.buf.y(i), this.buf.pressure(i)]);
      }
      paintPath(ctx, outlineToPath(liveOutline(this.livePts, this.liveStyle)), this.liveStyle);
      return;
    }

    ctx.lineWidth = 1.5 * px;
    if (this.mode === 'shape' && this.shapeStart && this.hover) {
      drawObject(ctx, makeShape(this.shapeStart, this.hover, this.o.getTool().shape, []));
      return;
    }
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
    if (this.mode === 'xform' && this.xformCur) {
      drawObject(ctx, this.xformCur);
      drawHandles(ctx, this.xformCur, this.view.scale);
      return;
    }
    this.drawSelection(ctx, px);
  }

  private drawSnapPreview(ctx: CanvasRenderingContext2D) {
    const s = this.snapped!;
    const st = this.liveStyle!;
    const obj = makeShape(
      { x: s.box.x, y: s.box.y },
      { x: s.box.x + s.box.w, y: s.box.y + s.box.h },
      { kind: s.shape, stroke: st.color, width: st.width, fill: null },
      [],
    );
    if (s.ends) obj.ends = s.ends;
    drawObject(ctx, obj);
  }

  private drawSelection(ctx: CanvasRenderingContext2D, px: number) {
    const strokes = this.store.strokes.filter((s) => this.selStrokes.has(s.id));
    const objs = this.store.objects.filter((o) => this.selObjs.has(o.id));
    if (!strokes.length && !objs.length) return;
    const moving = this.mode === 'move';
    const dx = moving ? this.moveOffset.x : 0;
    const dy = moving ? this.moveOffset.y : 0;
    ctx.save();
    ctx.translate(dx, dy);
    if (moving) {
      for (const s of strokes) drawStroke(ctx, s);
      for (const o of [...objs].sort((a, b) => a.z - b.z)) drawObject(ctx, o);
    }
    const single = this.singleSelectedObject();
    if (single) {
      drawHandles(ctx, single, this.view.scale);
    } else {
      const b = this.selectionBounds();
      if (b) {
        ctx.lineWidth = 1.5 * px;
        ctx.strokeStyle = SELECT_COLOR;
        ctx.setLineDash([6 * px, 4 * px]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
    }
    ctx.restore();
  }
}
