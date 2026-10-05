import MiniSearch from 'minisearch';

export type HitKind = 'folder' | 'document' | 'page';

export interface IndexItem {
  id: string;
  kind: HitKind;
  documentId: string | null;
  folderId: string | null;
  pageId: string | null;
  /** 1-based position of the page in its document (page items only). */
  pageNumber: number | null;
  title: string;
  text: string;
  /** Soft-deleted items stay indexed but are hidden from results. */
  deleted: boolean;
}

export interface Segment {
  text: string;
  hit: boolean;
}

export interface SearchHit {
  id: string;
  kind: HitKind;
  documentId: string | null;
  folderId: string | null;
  pageId: string | null;
  pageNumber: number | null;
  title: string;
  snippet: Segment[] | null;
  score: number;
}

/** Accent-, case- and width-insensitive form of a single term. */
export function foldTerm(term: string): string {
  return term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Fold a whole text, remembering which original index each folded character came from. */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = foldTerm(ch);
    for (let k = 0; k < f.length; k++) map.push(i);
    folded += f;
    i += ch.length;
  }
  return { folded, map };
}

const WORD = /[\p{L}\p{N}]/u;

/**
 * A short excerpt around the first match, with every matched word marked. `terms` are the folded
 * index terms that matched. Returns null when none of them can be located (e.g. a title-only hit).
 */
export function makeSnippet(text: string, terms: string[], radius = 48): Segment[] | null {
  if (!text || terms.length === 0) return null;
  const { folded, map } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at < 0) break;
      const before = at > 0 ? folded[at - 1]! : ' ';
      if (!WORD.test(before)) {
        let end = at + term.length;
        while (end < folded.length && WORD.test(folded[end]!)) end++; // whole word (prefix matches)
        ranges.push([map[at]!, (map[end - 1] ?? text.length - 1) + 1]);
        from = end;
      } else from = at + 1;
    }
  }
  if (!ranges.length) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  const first = ranges[0]!;
  let start = Math.max(0, first[0] - radius);
  let end = Math.min(text.length, first[1] + radius);
  while (start > 0 && WORD.test(text[start - 1]!) && start < first[0]) start++; // don't cut a word in half
  while (end < text.length && WORD.test(text[end]!) && end > first[1]) end--;
  const segs: Segment[] = [];
  let pos = start;
  for (const [a, b] of ranges) {
    if (b <= start || a >= end) continue;
    const s = Math.max(a, pos);
    if (s > pos) segs.push({ text: text.slice(pos, s), hit: false });
    const e = Math.min(b, end);
    if (e > s) segs.push({ text: text.slice(s, e), hit: true });
    pos = Math.max(pos, e);
  }
  if (pos < end) segs.push({ text: text.slice(pos, end), hit: false });
  if (start > 0) segs.unshift({ text: '…', hit: false });
  if (end < text.length) segs.push({ text: '…', hit: false });
  // Collapse newlines so a snippet is one line.
  return segs.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ') }));
}

/** Full-text index over folders, documents and page text. A derived cache: rebuildable from the DB. */
export class SearchIndex {
  private mini = this.create();
  private byDocument = new Map<string, Set<string>>();
  private byId = new Map<string, IndexItem>();

  private create() {
    return new MiniSearch<IndexItem>({
      fields: ['title', 'text'],
      storeFields: [
        'kind',
        'documentId',
        'folderId',
        'pageId',
        'pageNumber',
        'title',
        'text',
        'deleted',
      ],
      processTerm: (t) => foldTerm(t) || null,
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: { title: 3 },
        processTerm: (t) => foldTerm(t) || null,
      },
    });
  }

  get size() {
    return this.mini.documentCount;
  }

  clear() {
    this.mini = this.create();
    this.byDocument.clear();
    this.byId.clear();
  }

  upsert(item: IndexItem) {
    if (this.mini.has(item.id)) this.mini.replace(item);
    else this.mini.add(item);
    this.byId.set(item.id, item);
    if (item.documentId) {
      let s = this.byDocument.get(item.documentId);
      if (!s) this.byDocument.set(item.documentId, (s = new Set()));
      s.add(item.id);
    }
  }

  remove(id: string) {
    if (!this.mini.has(id)) return;
    this.mini.discard(id);
    const it = this.byId.get(id);
    if (it?.documentId) this.byDocument.get(it.documentId)?.delete(id);
    this.byId.delete(id);
  }

  /** Remove every item that belongs to a document (its page text and the document itself). */
  removeDocument(documentId: string) {
    for (const id of [...(this.byDocument.get(documentId) ?? [])]) this.remove(id);
    this.byDocument.delete(documentId);
  }

  search(query: string, limit = 60): SearchHit[] {
    const q = query.trim();
    if (!q) return [];
    const run = (combineWith: 'AND' | 'OR') =>
      this.mini.search(q, { combineWith, filter: (r) => !r.deleted });
    let results = run('AND');
    if (results.length === 0 && q.split(/\s+/).length > 1) results = run('OR');
    return results.slice(0, limit).map((r) => {
      const it = r as unknown as IndexItem & { terms: string[]; score: number };
      return {
        id: it.id,
        kind: it.kind,
        documentId: it.documentId,
        folderId: it.folderId,
        pageId: it.pageId,
        pageNumber: it.pageNumber,
        title: it.title,
        snippet: it.kind === 'page' ? makeSnippet(it.text, r.terms) : null,
        score: r.score,
      };
    });
  }
}
