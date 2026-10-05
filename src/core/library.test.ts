// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ROOT_ID,
  createDocument,
  createFolder,
  db,
  duplicateDocument,
  duplicateFolder,
  emptyTrash,
  getFolderPath,
  listDocuments,
  listRecent,
  listSubfolders,
  listTrash,
  markOpened,
  moveDocument,
  moveFolder,
  permanentDeleteDocument,
  permanentDeleteFolder,
  renameDocument,
  restoreDocument,
  restoreFolder,
  setDocumentFavorite,
  softDeleteDocument,
  softDeleteFolder,
  getSetting,
  setSetting,
  type SortOptions,
} from './index';

const byName: SortOptions = { key: 'name', dir: 'asc' };

async function addPageAndAsset(documentId: string, tag: string) {
  await db.pages.add({
    id: `p-${tag}`,
    documentId,
    order: 0,
    width: 794,
    height: 1123,
    sizeName: 'A4',
    template: { kind: 'blank', spacing: 28, color: '#ccc' },
    background: '#fff',
    bookmarked: false,
    deletedAt: null,
    createdAt: 1,
    updatedAt: 1,
  });
  await db.pageContent.put({ pageId: `p-${tag}`, strokes: [] });
  await db.assets.add({
    id: `a-${tag}`,
    documentId,
    kind: 'image',
    mime: 'image/png',
    name: tag,
    size: 3,
    blob: new Blob(['abc']),
    createdAt: 1,
  });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('folders and documents', () => {
  it('creates nested folders and documents and lists by folder', async () => {
    const a = await createFolder('A');
    const b = await createFolder('B', a.id);
    await createDocument({ kind: 'notebook', title: 'Doc 1', folderId: b.id });
    expect((await listSubfolders(ROOT_ID, byName)).map((f) => f.name)).toEqual(['A']);
    expect((await listSubfolders(a.id, byName)).map((f) => f.name)).toEqual(['B']);
    expect((await listDocuments(b.id, byName)).map((d) => d.title)).toEqual(['Doc 1']);
    expect((await getFolderPath(b.id)).map((f) => f.name)).toEqual(['A', 'B']);
  });

  it('sorts by name (natural, case-insensitive), modified and created', async () => {
    await createDocument({ kind: 'notebook', title: 'note 10' });
    await createDocument({ kind: 'notebook', title: 'Note 2' });
    expect((await listDocuments(ROOT_ID, byName)).map((d) => d.title)).toEqual([
      'Note 2',
      'note 10',
    ]);
    expect(
      (await listDocuments(ROOT_ID, { key: 'name', dir: 'desc' })).map((d) => d.title),
    ).toEqual(['note 10', 'Note 2']);
    const first = (await listDocuments(ROOT_ID, byName))[0]!;
    await db.documents.update(first.id, { updatedAt: 9_999_999_999_999 });
    expect((await listDocuments(ROOT_ID, { key: 'modified', dir: 'desc' }))[0]!.id).toBe(first.id);
  });

  it('renames, favorites and moves; refuses invalid moves', async () => {
    const a = await createFolder('A');
    const b = await createFolder('B', a.id);
    const d = await createDocument({ kind: 'notebook', title: 'X' });
    await renameDocument(d.id, '  Y  ');
    await setDocumentFavorite(d.id, true);
    await moveDocument(d.id, b.id);
    const got = await db.documents.get(d.id);
    expect(got).toMatchObject({ title: 'Y', favorite: true, folderId: b.id });
    await expect(moveFolder(a.id, b.id)).rejects.toThrow();
    await expect(moveFolder(a.id, a.id)).rejects.toThrow();
    await expect(renameDocument(d.id, '   ')).rejects.toThrow();
    await moveFolder(b.id, ROOT_ID);
    expect((await getFolderPath(b.id)).map((f) => f.name)).toEqual(['B']);
  });

  it('duplicates a document with its pages and assets under new ids', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'Orig' });
    await addPageAndAsset(d.id, '1');
    const copy = await duplicateDocument(d.id);
    expect(copy.id).not.toBe(d.id);
    expect(copy.title).toBe('Orig copy');
    const pages = await db.pages.where('documentId').equals(copy.id).toArray();
    const assets = await db.assets.where('documentId').equals(copy.id).toArray();
    expect(pages).toHaveLength(1);
    expect(assets).toHaveLength(1);
    expect(pages[0]!.id).not.toBe('p-1');
    expect(await db.assets.where('documentId').equals(d.id).count()).toBe(1);
  });

  it('duplicates a folder subtree', async () => {
    const a = await createFolder('A');
    const b = await createFolder('B', a.id);
    await createDocument({ kind: 'notebook', title: 'In B', folderId: b.id });
    const copy = await duplicateFolder(a.id);
    const subs = await listSubfolders(copy.id, byName);
    expect(subs.map((f) => f.name)).toEqual(['B']);
    expect((await listDocuments(subs[0]!.id, byName)).map((d) => d.title)).toEqual(['In B']);
    expect(await db.folders.count()).toBe(4);
  });

  it('tracks recently opened documents', async () => {
    const a = await createDocument({ kind: 'notebook', title: 'A' });
    const b = await createDocument({ kind: 'pdf', title: 'B' });
    expect(await listRecent()).toEqual([]);
    await markOpened(a.id);
    await new Promise((r) => setTimeout(r, 3));
    await markOpened(b.id);
    expect((await listRecent()).map((d) => d.title)).toEqual(['B', 'A']);
  });
});

describe('trash', () => {
  it('soft-deletes and restores a document', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'D' });
    await softDeleteDocument(d.id);
    expect(await listDocuments(ROOT_ID, byName)).toHaveLength(0);
    expect((await listTrash()).documents.map((x) => x.id)).toEqual([d.id]);
    await restoreDocument(d.id);
    expect(await listDocuments(ROOT_ID, byName)).toHaveLength(1);
  });

  it('trashing a folder hides contents; trash shows only the top item; restore brings all back', async () => {
    const a = await createFolder('A');
    const b = await createFolder('B', a.id);
    const d = await createDocument({ kind: 'notebook', title: 'D', folderId: b.id });
    await softDeleteFolder(a.id);
    const trash = await listTrash();
    expect(trash.folders.map((f) => f.id)).toEqual([a.id]);
    expect(trash.documents).toHaveLength(0);
    await restoreFolder(a.id);
    expect((await listSubfolders(a.id, byName)).map((f) => f.id)).toEqual([b.id]);
    expect((await listDocuments(b.id, byName)).map((x) => x.id)).toEqual([d.id]);
  });

  it('keeps an earlier individually-deleted doc in trash when its folder is restored', async () => {
    const a = await createFolder('A');
    const d = await createDocument({ kind: 'notebook', title: 'D', folderId: a.id });
    await softDeleteDocument(d.id);
    await new Promise((r) => setTimeout(r, 3));
    await softDeleteFolder(a.id);
    await restoreFolder(a.id);
    expect((await listTrash()).documents.map((x) => x.id)).toEqual([d.id]);
    await restoreDocument(d.id);
    expect((await listDocuments(a.id, byName)).map((x) => x.id)).toEqual([d.id]);
  });

  it('restores to the top level when the original folder is gone', async () => {
    const a = await createFolder('A');
    const d = await createDocument({ kind: 'notebook', title: 'D', folderId: a.id });
    await softDeleteDocument(d.id);
    await softDeleteFolder(a.id);
    await restoreDocument(d.id);
    expect((await listDocuments(ROOT_ID, byName)).map((x) => x.id)).toEqual([d.id]);
  });

  it('permanent delete removes the document, its pages and assets and nothing else', async () => {
    const keep = await createDocument({ kind: 'notebook', title: 'Keep' });
    const gone = await createDocument({ kind: 'notebook', title: 'Gone' });
    const f = await createFolder('F');
    await addPageAndAsset(keep.id, 'keep');
    await addPageAndAsset(gone.id, 'gone');
    await permanentDeleteDocument(gone.id);
    expect(await db.documents.get(gone.id)).toBeUndefined();
    expect(await db.pages.get('p-gone')).toBeUndefined();
    expect(await db.assets.get('a-gone')).toBeUndefined();
    expect(await db.documents.get(keep.id)).toBeDefined();
    expect(await db.pages.get('p-keep')).toBeDefined();
    expect(await db.assets.get('a-keep')).toBeDefined();
    expect(await db.folders.get(f.id)).toBeDefined();
  });

  it('permanent folder delete removes the subtree only', async () => {
    const a = await createFolder('A');
    const b = await createFolder('B', a.id);
    const other = await createFolder('Other');
    const inB = await createDocument({ kind: 'notebook', title: 'inB', folderId: b.id });
    const outside = await createDocument({ kind: 'notebook', title: 'out', folderId: other.id });
    await addPageAndAsset(inB.id, 'inb');
    await addPageAndAsset(outside.id, 'out');
    await permanentDeleteFolder(a.id);
    expect(await db.folders.count()).toBe(1);
    expect(await db.documents.count()).toBe(1);
    expect(await db.pages.count()).toBe(1);
    expect(await db.assets.count()).toBe(1);
  });

  it('empty trash removes only trashed items', async () => {
    const live = await createDocument({ kind: 'notebook', title: 'live' });
    const dead = await createDocument({ kind: 'notebook', title: 'dead' });
    await softDeleteDocument(dead.id);
    await emptyTrash();
    expect(await db.documents.toArray()).toMatchObject([{ id: live.id }]);
  });
});

describe('scale', () => {
  it('creates 1,000 documents and lists/sorts them quickly', async () => {
    const folder = await createFolder('Big');
    const t = Date.now();
    await db.documents.bulkAdd(
      Array.from({ length: 1000 }, (_, i) => ({
        id: `doc-${i}`,
        kind: 'notebook' as const,
        title: `Notebook ${i}`,
        folderId: folder.id,
        favorite: false,
        createdAt: t + i,
        updatedAt: t + i,
        lastOpenedAt: null,
        deletedAt: null,
      })),
    );
    const start = performance.now();
    const list = await listDocuments(folder.id, byName);
    const ms = performance.now() - start;
    expect(list).toHaveLength(1000);
    expect(list[0]!.title).toBe('Notebook 0');
    expect(list[999]!.title).toBe('Notebook 999');
    console.log(`list+sort 1000 docs: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(500);
  });
});

describe('settings', () => {
  it('round-trips values with a fallback', async () => {
    expect(await getSetting('x', 5)).toBe(5);
    await setSetting('x', 7);
    expect(await getSetting('x', 5)).toBe(7);
  });
});
