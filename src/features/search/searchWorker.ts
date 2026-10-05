/// <reference lib="webworker" />
import { db } from '@/core/db';
import { SearchEngine } from './searchEngine';
import type { SearchHit } from './searchIndex';

export type WorkerIn =
  | { t: 'rebuild' }
  | { t: 'sync'; docs: string[]; folders: string[]; formulas?: boolean }
  | { t: 'search'; id: number; q: string };

export type WorkerOut =
  | { t: 'progress'; done: number; total: number }
  | { t: 'ready' }
  | { t: 'results'; id: number; hits: SearchHit[] }
  | { t: 'error'; message: string };

/** Hosts the search index off the main thread. All it does is read IndexedDB and answer queries. */
const engine = new SearchEngine(db);
const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

// Serialise work so a sync never runs in the middle of a rebuild.
let chain: Promise<unknown> = Promise.resolve();

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.t === 'search') {
    post({ t: 'results', id: m.id, hits: engine.search(m.q) });
    return;
  }
  chain = chain
    .then(async () => {
      if (m.t === 'rebuild') {
        await engine.rebuild((p) => post({ t: 'progress', ...p }));
        post({ t: 'ready' });
      } else {
        if (m.formulas) await engine.syncFormulas();
        for (const f of m.folders) await engine.syncFolder(f);
        for (const d of m.docs) await engine.syncDocument(d);
        post({ t: 'ready' });
      }
    })
    .catch((err) => post({ t: 'error', message: String(err) }));
};
