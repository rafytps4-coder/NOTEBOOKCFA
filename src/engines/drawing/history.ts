import { newId } from '@/core/ids';
import { translateStroke } from './geometry';
import { moveObject } from './objects';
import type { PageObject } from '@/core/models';
import type { Stroke } from './types';

/** Ink and objects of one page. Both are immutable values; commands swap whole items. */
export class StrokeStore {
  strokes: Stroke[];
  objects: PageObject[];
  constructor(strokes: Stroke[] = [], objects: PageObject[] = []) {
    this.strokes = strokes;
    this.objects = objects;
  }
}

export interface Command {
  label: string;
  apply(store: StrokeStore): void;
  revert(store: StrokeStore): void;
}

export const addStrokes = (added: Stroke[]): Command => ({
  label: 'draw',
  apply: (s) => {
    s.strokes = [...s.strokes, ...added];
  },
  revert: (s) => {
    const ids = new Set(added.map((a) => a.id));
    s.strokes = s.strokes.filter((x) => !ids.has(x.id));
  },
});

/** Removes strokes by id; remembers where they were so undo restores z-order. */
export const removeStrokes = (ids: string[], label = 'erase'): Command => {
  let removed: { stroke: Stroke; index: number }[] = [];
  return {
    label,
    apply: (s) => {
      const set = new Set(ids);
      removed = [];
      s.strokes.forEach((stroke, index) => set.has(stroke.id) && removed.push({ stroke, index }));
      s.strokes = s.strokes.filter((x) => !set.has(x.id));
    },
    revert: (s) => {
      const next = [...s.strokes];
      for (const r of removed) next.splice(Math.min(r.index, next.length), 0, r.stroke);
      s.strokes = next;
    },
  };
};

export const moveStrokes = (ids: string[], dx: number, dy: number): Command => {
  const shift = (s: StrokeStore, ddx: number, ddy: number) => {
    const set = new Set(ids);
    s.strokes = s.strokes.map((x) => (set.has(x.id) ? translateStroke(x, ddx, ddy) : x));
  };
  return {
    label: 'move',
    apply: (s) => shift(s, dx, dy),
    revert: (s) => shift(s, -dx, -dy),
  };
};

/** Copies with fresh ids, offset a little so they don't hide the originals. */
/** Add strokes and/or objects in one undo step (paste, shape snap). */
export const addItems = (strokes: Stroke[], objects: PageObject[], label = 'add'): Command => ({
  label,
  apply: (s) => {
    s.strokes = [...s.strokes, ...strokes];
    s.objects = [...s.objects, ...objects];
  },
  revert: (s) => {
    const sid = new Set(strokes.map((x) => x.id));
    const oid = new Set(objects.map((x) => x.id));
    s.strokes = s.strokes.filter((x) => !sid.has(x.id));
    s.objects = s.objects.filter((x) => !oid.has(x.id));
  },
});

/** Delete strokes and/or objects in one undo step, restoring order on undo. */
export const removeItems = (
  strokeIds: string[],
  objectIds: string[],
  label = 'delete',
): Command => {
  let rs: { item: Stroke; index: number }[] = [];
  let ro: { item: PageObject; index: number }[] = [];
  return {
    label,
    apply: (s) => {
      const si = new Set(strokeIds);
      const oi = new Set(objectIds);
      rs = [];
      ro = [];
      s.strokes.forEach((item, index) => si.has(item.id) && rs.push({ item, index }));
      s.objects.forEach((item, index) => oi.has(item.id) && ro.push({ item, index }));
      s.strokes = s.strokes.filter((x) => !si.has(x.id));
      s.objects = s.objects.filter((x) => !oi.has(x.id));
    },
    revert: (s) => {
      const a = [...s.strokes];
      for (const r of rs) a.splice(Math.min(r.index, a.length), 0, r.item);
      const b = [...s.objects];
      for (const r of ro) b.splice(Math.min(r.index, b.length), 0, r.item);
      s.strokes = a;
      s.objects = b;
    },
  };
};

/** Move strokes and objects together. */
export const moveItems = (
  strokeIds: string[],
  objectIds: string[],
  dx: number,
  dy: number,
): Command => {
  const shift = (s: StrokeStore, ddx: number, ddy: number) => {
    const si = new Set(strokeIds);
    const oi = new Set(objectIds);
    s.strokes = s.strokes.map((x) => (si.has(x.id) ? translateStroke(x, ddx, ddy) : x));
    s.objects = s.objects.map((x) => (oi.has(x.id) ? moveObject(x, ddx, ddy) : x));
  };
  return { label: 'move', apply: (s) => shift(s, dx, dy), revert: (s) => shift(s, -dx, -dy) };
};

/** Replace objects by id with new versions (resize, rotate, format, crop, z-order, edit text). */
export const patchObjects = (
  before: PageObject[],
  after: PageObject[],
  label = 'edit',
): Command => {
  const swap = (s: StrokeStore, to: PageObject[]) => {
    const m = new Map(to.map((o) => [o.id, o]));
    s.objects = s.objects.map((o) => m.get(o.id) ?? o);
  };
  return { label, apply: (s) => swap(s, after), revert: (s) => swap(s, before) };
};

export function cloneStrokes(strokes: Stroke[], offset = 24): Stroke[] {
  return strokes.map((s) => ({ ...translateStroke(s, offset, offset), id: newId() }));
}

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<() => void>();

  constructor(
    private store: StrokeStore,
    private limit = 500,
  ) {}

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  exec(cmd: Command): void {
    cmd.apply(this.store);
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
  }

  undo(): Command | undefined {
    const cmd = this.undoStack.pop();
    if (!cmd) return undefined;
    cmd.revert(this.store);
    this.redoStack.push(cmd);
    this.emit();
    return cmd;
  }

  redo(): Command | undefined {
    const cmd = this.redoStack.pop();
    if (!cmd) return undefined;
    cmd.apply(this.store);
    this.undoStack.push(cmd);
    this.emit();
    return cmd;
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}
