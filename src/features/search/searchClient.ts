import { create } from 'zustand';
import { db } from '@/core';
import { SearchEngine } from './searchEngine';
import type { SearchHit } from './searchIndex';
import type { WorkerIn, WorkerOut } from './searchWorker';

interface SearchStatus {
  /** The index has been built at least once and no rebuild is running. */
  ready: boolean;
  /** Rebuild progress, while one is running. */
  progress: { done: number; total: number } | null;
  /** Bumped each time the index changes, so open result lists can refresh. */
  version: number;
}

export const useSearchStatus = create<SearchStatus>(() => ({
  ready: false,
  progress: null,
  version: 0,
}));

/**
 * Talks to the search worker (or, where Workers are unavailable, runs the same engine inline).
 * Also watches the database so the index follows edits without anyone having to ask.
 */
class SearchClient {
  private worker: Worker | null = null;
  private inline: SearchEngine | null = null;
  private seq = 0;
  private pending = new Map<number, (hits: SearchHit[]) => void>();
  private started = false;
  private dirtyDocs = new Set<string>();
  private dirtyFolders = new Set<string>();
  private dirtyFormulas = false;
  private timer: number | undefined;

  start(): void {
    if (this.started) return;
    this.started = true;
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('./searchWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerOut>) => this.onMessage(e.data);
      this.worker.onerror = (e) => console.error('Search worker error', e.message);
    } else {
      this.inline = new SearchEngine(db);
    }
    this.watchDatabase();
    this.rebuild();
  }

  private onMessage(m: WorkerOut) {
    if (m.t === 'progress')
      useSearchStatus.setState({ progress: { done: m.done, total: m.total } });
    else if (m.t === 'ready')
      useSearchStatus.setState((s) => ({ ready: true, progress: null, version: s.version + 1 }));
    else if (m.t === 'results') {
      this.pending.get(m.id)?.(m.hits);
      this.pending.delete(m.id);
    } else console.error('Search worker:', m.message);
  }

  private send(m: WorkerIn) {
    this.worker?.postMessage(m);
  }

  /** Throw the index away and rebuild it from the database (it is only a cache). */
  rebuild(): void {
    useSearchStatus.setState({ ready: false, progress: { done: 0, total: 1 } });
    if (this.inline) {
      void this.inline
        .rebuild((p) => useSearchStatus.setState({ progress: p }))
        .then(() =>
          useSearchStatus.setState((s) => ({
            ready: true,
            progress: null,
            version: s.version + 1,
          })),
        );
    } else this.send({ t: 'rebuild' });
  }

  search(q: string): Promise<SearchHit[]> {
    this.start();
    if (this.inline) return Promise.resolve(this.inline.search(q));
    return new Promise((resolve) => {
      const id = ++this.seq;
      this.pending.set(id, resolve);
      this.send({ t: 'search', id, q });
    });
  }

  private mark(doc?: string | null, folder?: string | null, formulas = false) {
    if (formulas) this.dirtyFormulas = true;
    if (doc) this.dirtyDocs.add(doc);
    if (folder) this.dirtyFolders.add(folder);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 300);
  }

  private flush() {
    const docs = [...this.dirtyDocs];
    const folders = [...this.dirtyFolders];
    this.dirtyDocs.clear();
    this.dirtyFolders.clear();
    const formulas = this.dirtyFormulas;
    this.dirtyFormulas = false;
    if (!docs.length && !folders.length && !formulas) return;
    if (this.inline) {
      void (async () => {
        if (formulas) await this.inline!.syncFormulas();
        for (const f of folders) await this.inline!.syncFolder(f);
        for (const d of docs) await this.inline!.syncDocument(d);
        useSearchStatus.setState((s) => ({ version: s.version + 1 }));
      })();
    } else this.send({ t: 'sync', docs, folders, formulas });
  }

  /**
   * Table hooks fire inside the write transaction, so they must never throw (that would abort the
   * user's save): they only record ids, defensively, and the sync happens shortly after.
   */
  private watchDatabase() {
    const safe =
      <A extends unknown[]>(fn: (...a: A) => void) =>
      (...a: A) => {
        try {
          fn(...a);
        } catch (e) {
          console.warn('Search hook failed', e);
        }
      };
    db.documents.hook(
      'creating',
      safe((_k: unknown, obj?: { id?: string }) => this.mark(obj?.id)),
    );
    db.documents.hook(
      'updating',
      safe((_m: unknown, key?: unknown) => this.mark(key ? String(key) : null)),
    );
    db.documents.hook(
      'deleting',
      safe((key?: unknown) => this.mark(key ? String(key) : null)),
    );
    db.folders.hook(
      'creating',
      safe((_k: unknown, obj?: { id?: string }) => this.mark(null, obj?.id)),
    );
    db.folders.hook(
      'updating',
      safe((_m: unknown, key?: unknown) => this.mark(null, key ? String(key) : null)),
    );
    db.folders.hook(
      'deleting',
      safe((key?: unknown) => this.mark(null, key ? String(key) : null)),
    );
    const byDoc = (obj?: { documentId?: string }) => this.mark(obj?.documentId);
    db.pages.hook(
      'creating',
      safe((_k: unknown, obj?: { documentId?: string }) => byDoc(obj)),
    );
    db.pages.hook(
      'updating',
      safe((_m: unknown, _k: unknown, obj?: { documentId?: string }) => byDoc(obj)),
    );
    db.pages.hook(
      'deleting',
      safe((_k: unknown, obj?: { documentId?: string }) => byDoc(obj)),
    );
    // Formulas and their notes: any change re-indexes the (small) formula set.
    for (const table of [db.formulas, db.formulaProgress]) {
      for (const ev of ['creating', 'updating', 'deleting'] as const) {
        (table.hook as (e: string, fn: () => void) => void)(
          ev,
          safe(() => this.mark(null, null, true)),
        );
      }
    }
    db.searchText.hook(
      'creating',
      safe((_k: unknown, obj?: { documentId?: string }) => byDoc(obj)),
    );
    db.searchText.hook(
      'updating',
      safe((_m: unknown, _k: unknown, obj?: { documentId?: string }) => byDoc(obj)),
    );
    db.searchText.hook(
      'deleting',
      safe((_k: unknown, obj?: { documentId?: string }) => byDoc(obj)),
    );
  }
}

export const searchClient = new SearchClient();
