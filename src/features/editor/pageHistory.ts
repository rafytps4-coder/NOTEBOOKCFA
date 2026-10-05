export interface PageOp {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/**
 * Undo/redo for page-structure changes (add, duplicate, delete, move, template/size, bookmark).
 * Deleted pages are only soft-deleted, so undo never loses ink. Ink edits have their own
 * per-page history inside each canvas controller.
 */
export class PageHistory {
  private undos: PageOp[] = [];
  private redos: PageOp[] = [];
  private listeners = new Set<() => void>();
  busy = false;

  get canUndo() {
    return this.undos.length > 0;
  }
  get canRedo() {
    return this.redos.length > 0;
  }
  get nextUndoLabel() {
    return this.undos[this.undos.length - 1]?.label;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Register an operation that has just been applied. */
  push(op: PageOp): void {
    this.undos.push(op);
    if (this.undos.length > 200) this.undos.shift();
    this.redos = [];
    this.emit();
  }

  async undo(): Promise<void> {
    const op = this.undos.pop();
    if (!op || this.busy) return;
    this.busy = true;
    try {
      await op.undo();
      this.redos.push(op);
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async redo(): Promise<void> {
    const op = this.redos.pop();
    if (!op || this.busy) return;
    this.busy = true;
    try {
      await op.redo();
      this.undos.push(op);
    } finally {
      this.busy = false;
      this.emit();
    }
  }
}
