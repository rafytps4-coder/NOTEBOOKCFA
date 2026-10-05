// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addImageAsset,
  createDocument,
  createFolder,
  createPage,
  db,
  getPageContent,
  listPages,
  permanentDeleteDocument,
  savePageContent,
  setPageThumbnail,
  setSetting,
  setThumbnail,
  sha256Hex,
  softDeleteDocument,
  type ImageObject,
  type Stroke,
  type TextObject,
} from '@/core';
import {
  ArchiveError,
  exportDocument,
  exportLibrary,
  importArchive,
  inspectArchive,
} from './archive';
import { ZipWriter } from './zip';

const stroke = (id: string): Stroke => ({
  id,
  tool: 'pen',
  color: '#000',
  width: 3,
  opacity: 1,
  points: [
    { x: 1, y: 2, pressure: 0.5, t: 0 },
    { x: 5, y: 6, pressure: 0.6, t: 9 },
  ],
});
const textObj: TextObject = {
  id: 't',
  type: 'text',
  text: 'Hello, ünïcode ✓',
  fontSize: 20,
  color: '#111',
  bold: true,
  italic: false,
  cx: 10,
  cy: 10,
  w: 100,
  h: 30,
  rot: 0,
  z: 1,
};

async function seed() {
  const school = await createFolder('School');
  const math = await createFolder('Math', school.id);
  const nb = await createDocument({ kind: 'notebook', title: 'Algebra', folderId: math.id });
  const p1 = await createPage(nb.id, 0);
  const p2 = await createPage(nb.id, 1);
  const img = await addImageAsset(
    nb.id,
    new Blob([Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 4, 5])], { type: 'image/png' }),
    'pic.png',
  );
  const imageObj: ImageObject = {
    id: 'i',
    type: 'image',
    assetId: img.id,
    cx: 50,
    cy: 50,
    w: 40,
    h: 40,
    rot: 0,
    z: 2,
    crop: { l: 0, t: 0, r: 0, b: 0 },
  };
  await savePageContent(p1.id, { strokes: [stroke('s1')], objects: [textObj, imageObj] });
  await savePageContent(p2.id, { strokes: [stroke('s2')], objects: [] });
  await setThumbnail(nb.id, new Blob(['thumb-doc'], { type: 'image/png' }));
  await setPageThumbnail(nb.id, p1.id, new Blob(['thumb-page'], { type: 'image/png' }));
  const trashed = await createDocument({ kind: 'quickNote', title: 'Old note' });
  await softDeleteDocument(trashed.id);
  await setSetting('library.view', 'list');
  return { school, math, nb, p1, p2, img };
}

/** Everything that backups must reproduce, with blobs reduced to their hashes. */
async function snapshot() {
  const assets = await Promise.all(
    (await db.assets.toArray())
      .filter((a) => a.name !== 'page-thumbnail')
      .map(async ({ blob, ...a }) => ({
        ...a,
        hash: await sha256Hex(blob),
        bytes: blob.size,
        type: blob.type,
      })),
  );
  const sort = <T extends { id?: string; pageId?: string; key?: string }>(r: T[]) =>
    [...r].sort((a, b) =>
      String(a.id ?? a.pageId ?? a.key).localeCompare(String(b.id ?? b.pageId ?? b.key)),
    );
  return {
    folders: sort(await db.folders.toArray()),
    documents: sort(await db.documents.toArray()),
    pages: sort((await db.pages.toArray()).filter((p) => p.deletedAt === null)),
    pageContent: sort(await db.pageContent.toArray()),
    settings: sort(await db.settings.toArray()),
    assets: sort(assets),
  };
}

const wipe = () => Promise.all(db.tables.map((t) => t.clear()));
beforeEach(wipe);

describe('export → wipe → import', () => {
  it('restores everything exactly, assets byte-for-byte', async () => {
    await seed();
    const before = await snapshot();
    const blob = (await exportLibrary())!;
    expect(blob.size).toBeGreaterThan(100);
    await wipe();
    expect(await db.documents.count()).toBe(0);
    const result = await importArchive(blob, 'replace');
    expect(result).toMatchObject({ folders: 2, documents: 2, pages: 2, remapped: 0 });
    expect(await snapshot()).toEqual(before);
    // spot checks beyond the snapshot
    const asset = (await db.assets.toArray()).find((a) => a.kind === 'image')!;
    expect(new Uint8Array(await asset.blob.arrayBuffer())).toEqual(
      Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 4, 5]),
    );
    expect(asset.blob.type).toBe('image/png');
  });

  it('inspect shows what a backup contains without changing anything', async () => {
    await seed();
    const blob = (await exportLibrary())!;
    const before = await snapshot();
    const info = await inspectArchive(blob);
    expect(info).toMatchObject({ scope: 'library', dbVersion: 5 });
    expect(info.counts).toMatchObject({ folders: 2, documents: 2, pages: 2 });
    expect(info.titles).toContain('Algebra');
    expect(await snapshot()).toEqual(before);
  });

  it('replace discards what was there before', async () => {
    await seed();
    const blob = (await exportLibrary())!;
    await createDocument({ kind: 'notebook', title: 'Added after the backup' });
    await importArchive(blob, 'replace');
    expect((await db.documents.toArray()).map((d) => d.title).sort()).toEqual([
      'Algebra',
      'Old note',
    ]);
  });

  it('streams to a sink without holding the archive in memory', async () => {
    await seed();
    const parts: BlobPart[] = [];
    const result = await exportLibrary({ sink: (p) => void parts.push(p as BlobPart) });
    expect(result).toBeNull();
    const blob = new Blob(parts);
    await wipe();
    await importArchive(blob, 'replace');
    expect(await db.documents.count()).toBe(2);
  });
});

describe('merge', () => {
  it('adds a second copy with new ids and keeps every reference consistent', async () => {
    const s = await seed();
    const blob = (await exportLibrary())!;
    const result = await importArchive(blob, 'merge'); // same ids already exist
    expect(result.remapped).toBeGreaterThan(5);
    expect(await db.documents.count()).toBe(4);
    expect(await db.folders.count()).toBe(4);
    const copies = (await db.documents.toArray()).filter((d) => d.title === 'Algebra');
    expect(copies).toHaveLength(2);
    const copy = copies.find((d) => d.id !== s.nb.id)!;
    const copyFolder = (await db.folders.get(copy.folderId))!;
    expect(copyFolder.name).toBe('Math');
    expect(copyFolder.id).not.toBe(s.math.id);
    expect((await db.folders.get(copyFolder.parentId))!.name).toBe('School');
    // The copy's image object points at the copy's own asset
    const cpage = (await listPages(copy.id))[0]!;
    const obj = (await getPageContent(cpage.id)).objects.find(
      (o) => o.type === 'image',
    ) as ImageObject;
    expect(obj.assetId).not.toBe(s.img.id);
    const asset = (await db.assets.get(obj.assetId))!;
    expect(asset.documentId).toBe(copy.id);
    // Deleting the original must not break the copy
    await permanentDeleteDocument(s.nb.id);
    expect(await db.assets.get(obj.assetId)).toBeDefined();
    expect((await getPageContent(cpage.id)).strokes).toHaveLength(1);
  });

  it('into an empty library nothing needs a new id', async () => {
    await seed();
    const blob = (await exportLibrary())!;
    await wipe();
    expect((await importArchive(blob, 'merge')).remapped).toBe(0);
  });

  it('keeps existing settings and fills in missing ones', async () => {
    await seed();
    const blob = (await exportLibrary())!;
    await setSetting('library.view', 'grid');
    await db.settings.delete('somethingElse');
    await importArchive(blob, 'merge');
    expect((await db.settings.get('library.view'))!.value).toBe('grid'); // not overwritten
  });
});

describe('single notebook files', () => {
  it('exports one notebook (its pages, ink and images) and imports it as a new notebook', async () => {
    const s = await seed();
    const blob = (await exportDocument(s.nb.id))!;
    const info = await inspectArchive(blob);
    expect(info).toMatchObject({ scope: 'document' });
    expect(info.counts).toMatchObject({ documents: 1, pages: 2, folders: 0 });
    await wipe();
    const r = await importArchive(blob, 'merge');
    expect(r).toMatchObject({ documents: 1, pages: 2 });
    const doc = (await db.documents.toArray())[0]!;
    expect(doc).toMatchObject({ title: 'Algebra', folderId: 'root', deletedAt: null });
    expect((await getPageContent((await listPages(doc.id))[0]!.id)).objects).toHaveLength(2);
  });
  it('cannot be used to replace the whole library', async () => {
    const s = await seed();
    const blob = (await exportDocument(s.nb.id))!;
    await expect(importArchive(blob, 'replace')).rejects.toThrow(/only be added/);
    expect(await db.documents.count()).toBe(2);
  });
});

describe('bad archives fail safely (nothing is changed)', () => {
  it('flipped byte in a file', async () => {
    await seed();
    const before = await snapshot();
    const blob = (await exportLibrary())!;
    const buf = new Uint8Array(await blob.arrayBuffer());
    const at = buf.findIndex((_, i) => buf[i] === 137 && buf[i + 1] === 80 && buf[i + 2] === 78); // our fake PNG bytes
    buf[at + 6] = buf[at + 6]! ^ 0xff;
    await expect(importArchive(new Blob([buf]), 'replace')).rejects.toThrow(/damaged/);
    expect(await snapshot()).toEqual(before);
  });

  it('truncated file and random data', async () => {
    await seed();
    const before = await snapshot();
    const blob = (await exportLibrary())!;
    await expect(importArchive(blob.slice(0, blob.size - 40), 'replace')).rejects.toBeInstanceOf(
      ArchiveError,
    );
    await expect(
      importArchive(
        new Blob(['not a backup at all, just some text bytes ...............']),
        'replace',
      ),
    ).rejects.toBeInstanceOf(ArchiveError);
    expect(await snapshot()).toEqual(before);
  });

  const handmade = async (manifest: unknown, files: Record<string, unknown> = {}) => {
    const z = new ZipWriter();
    for (const [n, v] of Object.entries(files)) await z.addText(n, JSON.stringify(v));
    await z.addText('manifest.json', JSON.stringify(manifest));
    return z.toBlob();
  };
  const goodManifest = (over: Record<string, unknown> = {}) => ({
    format: 'notebook-archive',
    version: 1,
    scope: 'library',
    createdAt: 1,
    dbVersion: 5,
    tables: {},
    summary: { folders: 0, documents: 0, pages: 0, assets: 0, bytes: 0 },
    ...over,
  });

  it('newer archive or data format is refused with a clear message', async () => {
    await seed();
    const before = await snapshot();
    await expect(
      importArchive(await handmade(goodManifest({ version: 99 })), 'replace'),
    ).rejects.toThrow(/newer version/);
    await expect(
      importArchive(await handmade(goodManifest({ dbVersion: 99 })), 'replace'),
    ).rejects.toThrow(/newer data format/);
    await expect(
      importArchive(await handmade(goodManifest({ format: 'something-else' })), 'replace'),
    ).rejects.toThrow(/not a valid/);
    await expect(importArchive(await handmade({ nope: true }), 'replace')).rejects.toThrow(
      /malformed/,
    );
    await expect(
      importArchive(
        await handmade(goodManifest({ tables: { secrets: { files: [], count: 0 } } })),
        'replace',
      ),
    ).rejects.toThrow(/can’t restore/);
    expect(await snapshot()).toEqual(before);
  });

  it('rows that fail validation stop the import before anything is written', async () => {
    await seed();
    const before = await snapshot();
    const blob = await handmade(
      goodManifest({ tables: { folders: { files: ['data/folders.json'], count: 1 } } }),
      { 'data/folders.json': [{ id: 5, name: 'bad' }] },
    );
    await expect(importArchive(blob, 'replace')).rejects.toThrow(/folders row 1/);
    expect(await snapshot()).toEqual(before);
  });

  it('a file listed in the backup but missing is an error', async () => {
    await seed();
    const before = await snapshot();
    const blob = await handmade(
      goodManifest({ tables: { assets: { files: ['data/assets.json'], count: 1 } } }),
      { 'data/assets.json': [{ id: 'a1', documentId: 'd', kind: 'image', file: 'blobs/a1' }] },
    );
    await expect(importArchive(blob, 'replace')).rejects.toThrow(/missing/);
    expect(await snapshot()).toEqual(before);
  });
});

describe('older data formats', () => {
  it('a v1 backup (ink stored inside page rows) is migrated on import', async () => {
    const z = new ZipWriter();
    await z.addText(
      'data/documents.json',
      JSON.stringify([
        {
          id: 'd1',
          kind: 'notebook',
          title: 'Old',
          folderId: 'root',
          favorite: false,
          createdAt: 1,
          updatedAt: 1,
          lastOpenedAt: null,
          deletedAt: null,
        },
      ]),
    );
    await z.addText(
      'data/pages.json',
      JSON.stringify([
        {
          id: 'p1',
          documentId: 'd1',
          order: 0,
          width: 794,
          height: 1123,
          strokes: [stroke('old')],
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );
    await z.addText(
      'manifest.json',
      JSON.stringify({
        format: 'notebook-archive',
        version: 1,
        scope: 'library',
        createdAt: 1,
        dbVersion: 1,
        tables: {
          documents: { files: ['data/documents.json'], count: 1 },
          pages: { files: ['data/pages.json'], count: 1 },
        },
        summary: { folders: 0, documents: 1, pages: 1, assets: 0, bytes: 0 },
      }),
    );
    await importArchive(z.toBlob(), 'replace');
    const page = (await db.pages.get('p1'))!;
    expect(page).toMatchObject({ template: { kind: 'blank' }, bookmarked: false, deletedAt: null });
    expect('strokes' in page).toBe(false);
    expect((await getPageContent('p1')).strokes[0]!.id).toBe('old');
  });
});
