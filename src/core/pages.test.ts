// @vitest-environment node
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  db,
  duplicateDocument,
  duplicatePage,
  getPageContent,
  insertPage,
  listPages,
  movePage,
  permanentDeleteDocument,
  purgeDeletedPages,
  restorePage,
  savePageStrokes,
  softDeletePage,
  updatePage,
  createPage,
  type Stroke,
} from './index';
import { NotebookDB } from './db';

const stroke = (id: string): Stroke => ({
  id,
  tool: 'pen',
  color: '#000',
  width: 2,
  opacity: 1,
  points: [{ x: 1, y: 2, pressure: 0.5, t: 0 }],
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function doc(n: number) {
  const d = await createDocument({ kind: 'notebook', title: 'D' });
  for (let i = 0; i < n; i++) await createPage(d.id, i);
  return d;
}
const ids = async (docId: string) => (await listPages(docId)).map((p) => p.id);

describe('page operations', () => {
  it('inserts before/after keeping order contiguous', async () => {
    const d = await doc(3);
    const [a, b, c] = await ids(d.id);
    const x = await insertPage(d.id, 1);
    expect(await ids(d.id)).toEqual([a, x.id, b, c]);
    const y = await insertPage(d.id, 0);
    expect(await ids(d.id)).toEqual([y.id, a, x.id, b, c]);
    expect((await listPages(d.id)).map((p) => p.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('duplicates with ink and never shares or loses the original ink', async () => {
    const d = await doc(2);
    const [a] = await ids(d.id);
    await savePageStrokes(a!, [stroke('s1')]);
    const copy = await duplicatePage(a!);
    expect((await ids(d.id))[1]).toBe(copy.id);
    expect((await getPageContent(copy.id)).strokes).toHaveLength(1);
    expect((await getPageContent(a!)).strokes).toHaveLength(1);
  });

  it('soft-delete hides, restore brings back at the same index with ink', async () => {
    const d = await doc(4);
    const all = await ids(d.id);
    await savePageStrokes(all[1]!, [stroke('keep')]);
    await softDeletePage(all[1]!);
    expect(await ids(d.id)).toEqual([all[0], all[2], all[3]]);
    await restorePage(all[1]!, 1);
    expect(await ids(d.id)).toEqual(all);
    expect((await getPageContent(all[1]!)).strokes[0]!.id).toBe('keep');
  });

  it('purge removes only soft-deleted pages and their ink', async () => {
    const d = await doc(3);
    const all = await ids(d.id);
    await savePageStrokes(all[0]!, [stroke('s')]);
    await softDeletePage(all[1]!);
    expect(await purgeDeletedPages(d.id)).toBe(1);
    expect(await db.pages.get(all[1]!)).toBeUndefined();
    expect(await db.pageContent.get(all[1]!)).toBeUndefined();
    expect((await getPageContent(all[0]!)).strokes).toHaveLength(1);
  });

  it('moves pages without touching their ink', async () => {
    const d = await doc(4);
    const all = await ids(d.id);
    await savePageStrokes(all[0]!, [stroke('s0')]);
    await movePage(all[0]!, 2);
    expect(await ids(d.id)).toEqual([all[1], all[2], all[0], all[3]]);
    expect((await getPageContent(all[0]!)).strokes[0]!.id).toBe('s0');
    await movePage(all[0]!, 0);
    expect(await ids(d.id)).toEqual(all);
  });

  it('changing template/bookmark leaves ink untouched', async () => {
    const d = await doc(1);
    const [a] = await ids(d.id);
    await savePageStrokes(a!, [stroke('s')]);
    await updatePage(a!, {
      template: { kind: 'grid', spacing: 20, color: '#000' },
      bookmarked: true,
    });
    const p = (await listPages(d.id))[0]!;
    expect(p.template.kind).toBe('grid');
    expect(p.bookmarked).toBe(true);
    expect((await getPageContent(a!)).strokes).toHaveLength(1);
  });

  it('duplicating a document copies page ink; deleting it removes ink only for that doc', async () => {
    const d = await doc(2);
    const [a] = await ids(d.id);
    await savePageStrokes(a!, [stroke('s')]);
    const copy = await duplicateDocument(d.id);
    const copyPages = await listPages(copy.id);
    expect(copyPages).toHaveLength(2);
    expect((await getPageContent(copyPages[0]!.id)).strokes).toHaveLength(1);
    await permanentDeleteDocument(copy.id);
    expect(await db.pageContent.count()).toBe(2);
    expect((await getPageContent(a!)).strokes).toHaveLength(1);
  });
});

describe('schema v2 migration', () => {
  it('moves strokes out of page rows without losing any', async () => {
    const name = `migrate-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      folders: 'id, parentId, favorite, createdAt, updatedAt',
      documents: 'id, folderId, kind, favorite, createdAt, updatedAt, lastOpenedAt',
      pages: 'id, documentId, [documentId+order]',
      assets: 'id, documentId',
      settings: 'key',
    });
    await v1.table('pages').put({
      id: 'p1',
      documentId: 'd1',
      order: 0,
      width: 794,
      height: 1123,
      strokes: [stroke('old')],
      createdAt: 1,
      updatedAt: 1,
    });
    v1.close();
    const v2 = new NotebookDB(name);
    const page = await v2.pages.get('p1');
    expect(page).toMatchObject({ template: { kind: 'blank' }, bookmarked: false, deletedAt: null });
    expect('strokes' in (page as object)).toBe(false);
    expect((await v2.pageContent.get('p1'))!.strokes[0]!.id).toBe('old');
    v2.close();
  });
});

describe('scale', () => {
  it('500-page document: list, insert-at-front and move stay fast', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'Big' });
    const t = Date.now();
    await db.pages.bulkAdd(
      Array.from({ length: 500 }, (_, i) => ({
        id: `p${i}`,
        documentId: d.id,
        order: i,
        width: 794,
        height: 1123,
        sizeName: 'A4' as const,
        template: { kind: 'blank' as const, spacing: 28, color: '#ccc' },
        background: '#fff',
        bookmarked: false,
        deletedAt: null,
        createdAt: t,
        updatedAt: t,
      })),
    );
    const time = async (fn: () => Promise<unknown>) => {
      const s = performance.now();
      await fn();
      return performance.now() - s;
    };
    const list = await time(() => listPages(d.id));
    const insert = await time(() => insertPage(d.id, 0));
    const move = await time(() => movePage('p499', 0));
    console.log(
      `500 pages: list ${list.toFixed(1)} ms, insert-at-front ${insert.toFixed(0)} ms, move last->first ${move.toFixed(0)} ms`,
    );
    expect((await listPages(d.id)).map((p) => p.order)).toEqual(
      Array.from({ length: 501 }, (_, i) => i),
    );
    expect(list).toBeLessThan(500);
  });
});
