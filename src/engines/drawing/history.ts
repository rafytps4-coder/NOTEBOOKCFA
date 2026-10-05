import { newId } from '@/core/ids';
import { translateStroke } from './geometry';
import type { Stroke } from './types';

/** Ordered strokes of one page. Strokes are immutable; commands swap whole objects. */
export class StrokeStore {
  strokes: Stroke[];
  constructor(strokes: Stroke[] = []) {
    this.strokes = strokes;
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
