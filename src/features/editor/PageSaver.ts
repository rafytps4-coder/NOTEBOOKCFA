import { savePageStrokes, type Stroke } from '@/core';

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

/**
 * Debounced autosave. Never blocks drawing: writes are async and serialized.
 * Flushes on tab hide/pagehide so closing the app doesn't lose the last strokes.
 */
export class PageSaver {
  private timer: number | undefined;
  private dirty = false;
  private inflight: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private pageId: string,
    private getStrokes: () => Stroke[],
    private onState: (s: SaveState) => void,
    private onSaved: () => void,
    private delay = 700,
  ) {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onHide);
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') void this.flush();
  };
  private onHide = () => void this.flush();

  markDirty(): void {
    this.dirty = true;
    this.onState('unsaved');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), this.delay);
  }

  /** Write now if there is anything unsaved. Safe to call repeatedly. */
  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    if (this.inflight) {
      await this.inflight;
      if (!this.dirty) return;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.onState('saving');
    const strokes = this.getStrokes();
    this.inflight = savePageStrokes(this.pageId, strokes)
      .then(() => {
        if (this.disposed) return;
        this.onState(this.dirty ? 'unsaved' : 'saved');
        this.onSaved();
      })
      .catch((e) => {
        console.error('Autosave failed', e);
        this.dirty = true; // keep the data in memory and retry on the next change
        if (!this.disposed) this.onState('error');
      })
      .finally(() => {
        this.inflight = null;
      });
    await this.inflight;
  }

  async dispose(): Promise<void> {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onHide);
    await this.flush();
    this.disposed = true;
  }
}
