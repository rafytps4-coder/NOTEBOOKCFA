// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  createFolder,
  createPage,
  db,
  permanentDeleteDocument,
  renameDocument,
  restoreDocument,
  savePageContent,
  setPdfText,
  softDeleteDocument,
  softDeleteFolder,
  moveDocument,
  type TextObject,
} from '@/core';
import { SearchEngine } from './searchEngine';
import { SearchIndex, foldTerm, makeSnippet, type IndexItem } from './searchIndex';

const text = (id: string, t: string, cy = 100): TextObject => ({
  id,
  type: 'text',
  text: t,
  fontSize: 20,
  color: '#000',
  bold: false,
  italic: false,
  cx: 100,
  cy,
  w: 200,
  h: 40,
  rot: 0,
  z: 1,
});

const item = (id: string, over: Partial<IndexItem> = {}): IndexItem => ({
  id,
  kind: 'page',
  documentId: 'd',
  folderId: null,
  pageId: id,
  pageNumber: 1,
  title: 'Doc',
  text: '',
  deleted: false,
  ...over,
});

describe('index matching', () => {
  it('is case- and accent-insensitive', () => {
    const idx = new SearchIndex();
    idx.upsert(item('a', { text: 'Café Résumé naïve' }));
    expect(idx.search('CAFE').map((h) => h.id)).toEqual(['a']);
    expect(idx.search('resume').map((h) => h.id)).toEqual(['a']);
    expect(idx.search('café').map((h) => h.id)).toEqual(['a']);
    expect(idx.search('naive')).toHaveLength(1);
    expect(foldTerm('Éclair')).toBe('eclair');
  });

  it('matches prefixes and small typos', () => {
    const idx = new SearchIndex();
    idx.upsert(item('a', { text: 'Quantum entanglement experiments' }));
    expect(idx.search('entangl')).toHaveLength(1); // prefix
    expect(idx.search('quantm')).toHaveLength(1); // one letter missing (fuzzy)
    expect(idx.search('zebra')).toHaveLength(0);
    expect(idx.search('   ')).toEqual([]);
  });

  it('multi-word queries prefer all words, but fall back to any', () => {
    const idx = new SearchIndex();
    idx.upsert(item('both', { text: 'alpha beta' }));
    idx.upsert(item('one', { text: 'alpha gamma' }));
    expect(idx.search('alpha beta').map((h) => h.id)).toEqual(['both']);
    expect(
      idx
        .search('alpha zzzz')
        .map((h) => h.id)
        .sort(),
    ).toEqual(['both', 'one']);
  });

  it('upsert replaces, remove deletes, soft-deleted items are hidden', () => {
    const idx = new SearchIndex();
    idx.upsert(item('a', { text: 'first version' }));
    idx.upsert(item('a', { text: 'second version' }));
    expect(idx.search('first')).toHaveLength(0);
    expect(idx.search('second')).toHaveLength(1);
    idx.upsert(item('a', { text: 'second version', deleted: true }));
    expect(idx.search('second')).toHaveLength(0);
    idx.upsert(item('a', { text: 'second version', deleted: false }));
    idx.remove('a');
    expect(idx.search('second')).toHaveLength(0);
    expect(idx.size).toBe(0);
  });

  it('removeDocument drops all of that document’s items only', () => {
    const idx = new SearchIndex();
    idx.upsert(item('p1', { documentId: 'd1', text: 'shared word' }));
    idx.upsert(item('p2', { documentId: 'd1', text: 'shared word' }));
    idx.upsert(item('p3', { documentId: 'd2', text: 'shared word' }));
    idx.removeDocument('d1');
    expect(idx.search('shared').map((h) => h.id)).toEqual(['p3']);
  });
});

describe('snippets', () => {
  it('shows context around the match and marks matched words', () => {
    const t =
      'The quick brown fox jumps over the lazy dog and keeps running through the forest until night';
    const segs = makeSnippet(t, ['lazy'], 20)!;
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['lazy']);
    const joined = segs.map((s) => s.text).join('');
    expect(joined).toContain('over the lazy dog');
    expect(joined.startsWith('…')).toBe(true);
    expect(joined.endsWith('…')).toBe(true);
  });
  it('matches through accents and marks the original characters', () => {
    const segs = makeSnippet('Un café très fort', ['cafe'])!;
    expect(segs.find((s) => s.hit)!.text).toBe('café');
  });
  it('marks the whole word for prefix matches and every occurrence', () => {
    const segs = makeSnippet('entangled states and entanglement', ['entangled', 'entanglement'])!;
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['entangled', 'entanglement']);
  });
  it('returns null when nothing can be located', () => {
    expect(makeSnippet('hello world', ['zzz'])).toBeNull();
    expect(makeSnippet('', ['a'])).toBeNull();
  });
});

describe('engine over IndexedDB', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('indexes titles, folder names, typed text and PDF text; results carry the right page', async () => {
    const folder = await createFolder('Astrophysics');
    const nb = await createDocument({
      kind: 'notebook',
      title: 'Lecture notes',
      folderId: folder.id,
    });
    const p1 = await createPage(nb.id, 0);
    const p2 = await createPage(nb.id, 1);
    await savePageContent(p2.id, {
      strokes: [],
      objects: [text('t', 'Schwarzschild radius of a black hole')],
    });
    const pdf = await createDocument({ kind: 'pdf', title: 'Textbook' });
    const pp = await createPage(pdf.id, 0);
    await setPdfText(pp.id, pdf.id, 'Chapter one introduces the cosmic microwave background.');

    const e = new SearchEngine(db);
    const progress: number[] = [];
    await e.rebuild((p) => progress.push(p.done));
    expect(progress.at(-1)).toBe(2);

    const byFolder = e.search('astrophys');
    expect(byFolder[0]).toMatchObject({ kind: 'folder', folderId: folder.id });
    expect(e.search('lecture')[0]).toMatchObject({ kind: 'document', documentId: nb.id });

    const typed = e.search('schwarzschild');
    expect(typed[0]).toMatchObject({
      kind: 'page',
      documentId: nb.id,
      pageId: p2.id,
      pageNumber: 2,
    });
    expect(typed[0]!.snippet!.some((s) => s.hit)).toBe(true);
    const fromPdf = e.search('microwave');
    expect(fromPdf[0]).toMatchObject({
      kind: 'page',
      documentId: pdf.id,
      pageId: pp.id,
      pageNumber: 1,
    });
    expect(p1.id).not.toBe(p2.id);
  });

  it('stays in step incrementally: edits, renames, trash/restore, delete, folder trash', async () => {
    const folder = await createFolder('Physics');
    const d = await createDocument({ kind: 'notebook', title: 'Mechanics', folderId: folder.id });
    const p = await createPage(d.id, 0);
    const e = new SearchEngine(db);
    await e.rebuild();
    expect(e.search('momentum')).toHaveLength(0);

    await savePageContent(p.id, { strokes: [], objects: [text('t', 'Conservation of momentum')] });
    await e.syncDocument(d.id);
    expect(e.search('momentum')).toHaveLength(1);

    await savePageContent(p.id, { strokes: [], objects: [text('t', 'Conservation of energy')] });
    await e.syncDocument(d.id);
    expect(e.search('momentum')).toHaveLength(0);
    expect(e.search('energy')).toHaveLength(1);

    await renameDocument(d.id, 'Dynamics');
    await e.syncDocument(d.id);
    expect(e.search('mechanics')).toHaveLength(0);
    expect(e.search('dynamics').length).toBeGreaterThan(0);

    await softDeleteDocument(d.id);
    await e.syncDocument(d.id);
    expect(e.search('energy')).toHaveLength(0);
    await restoreDocument(d.id);
    await e.syncDocument(d.id);
    expect(e.search('energy')).toHaveLength(1);

    await softDeleteFolder(folder.id);
    await e.syncFolder(folder.id);
    expect(e.search('energy')).toHaveLength(0); // inside a trashed folder
    expect(e.search('physics')).toHaveLength(0);
    await moveDocument(d.id, 'root').catch(() => undefined);

    await permanentDeleteDocument(d.id);
    await e.syncDocument(d.id);
    expect(e.search('dynamics')).toHaveLength(0);
    expect(await db.searchText.where('documentId').equals(d.id).count()).toBe(0);
  });

  it('is rebuildable from source data: wiping the index and rebuilding gives the same results', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'Chemistry' });
    const p = await createPage(d.id, 0);
    await savePageContent(p.id, {
      strokes: [],
      objects: [text('a', 'Avogadro constant'), text('b', 'mole', 300)],
    });
    const e = new SearchEngine(db);
    await e.rebuild();
    const before = e.search('avogadro').map((h) => [h.kind, h.pageId]);
    e.index.clear();
    expect(e.search('avogadro')).toHaveLength(0);
    await e.rebuild();
    expect(e.search('avogadro').map((h) => [h.kind, h.pageId])).toEqual(before);
  });

  it('typed text rows are rebuildable from page content alone', async () => {
    const { rebuildTypedText } = await import('@/core');
    const d = await createDocument({ kind: 'notebook', title: 'X' });
    const p = await createPage(d.id, 0);
    await savePageContent(p.id, { strokes: [], objects: [text('a', 'findable phrase')] });
    await db.searchText.clear();
    await rebuildTypedText();
    expect((await db.searchText.toArray()).map((r) => r.text)).toEqual(['findable phrase']);
  });

  it('searches 2,000 pages quickly', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'Big' });
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      key: `typed:p${i}`,
      documentId: d.id,
      pageId: `p${i}`,
      source: 'typed' as const,
      text: `page ${i} discusses topic${i % 50} with some filler words about nothing in particular`,
    }));
    await db.pages.bulkAdd(
      rows.map((r, i) => ({
        id: r.pageId,
        documentId: d.id,
        order: i,
        width: 794,
        height: 1123,
        sizeName: 'A4' as const,
        template: { kind: 'blank' as const, spacing: 28, color: '#ccc' },
        background: '#fff',
        bookmarked: false,
        deletedAt: null,
        createdAt: 1,
        updatedAt: 1,
      })),
    );
    await db.searchText.bulkAdd(rows);
    const e = new SearchEngine(db);
    const t0 = performance.now();
    await e.rebuild();
    const build = performance.now() - t0;
    const t1 = performance.now();
    const hits = e.search('topic7');
    const query = performance.now() - t1;
    console.log(
      `2000-page index build ${build.toFixed(0)} ms, query ${query.toFixed(1)} ms, ${hits.length} hits`,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(query).toBeLessThan(200);
  });
});
