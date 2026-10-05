// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addImageAsset,
  cleanupOrphanAssets,
  createDocument,
  createPage,
  db,
  duplicateDocument,
  emptyTrash,
  ensureAssetInDocument,
  findOrphanAssets,
  getPageContent,
  listPages,
  permanentDeleteDocument,
  savePageContent,
  setPageThumbnail,
  softDeleteDocument,
  type ImageObject,
  type TextObject,
} from './index';

const imageObj = (assetId: string): ImageObject => ({
  id: `img-${assetId}`,
  type: 'image',
  assetId,
  cx: 100,
  cy: 100,
  w: 50,
  h: 50,
  rot: 0,
  z: 1,
  crop: { l: 0, t: 0, r: 0, b: 0 },
});
const textObj: TextObject = {
  id: 't1',
  type: 'text',
  text: 'Hello, searchable world',
  fontSize: 18,
  color: '#000',
  bold: false,
  italic: false,
  cx: 50,
  cy: 50,
  w: 120,
  h: 40,
  rot: 0,
  z: 2,
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('page objects persistence', () => {
  it('stores text and image objects with the page', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'D' });
    const p = await createPage(d.id, 0);
    const a = await addImageAsset(d.id, new Blob(['png-bytes']), 'pic.png');
    await savePageContent(p.id, { strokes: [], objects: [textObj, imageObj(a.id)] });
    const c = await getPageContent(p.id);
    expect(c.objects).toHaveLength(2);
    expect((c.objects[0] as TextObject).text).toBe('Hello, searchable world');
  });

  it('old rows without objects read as empty', async () => {
    await db.pageContent.put({ pageId: 'old', strokes: [] });
    expect((await getPageContent('old')).objects).toEqual([]);
  });
});

describe('orphan asset cleanup', () => {
  it('keeps referenced images, removes unreferenced ones only on cleanup', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'D' });
    const p = await createPage(d.id, 0);
    const used = await addImageAsset(d.id, new Blob(['used']), 'used.png');
    const unused = await addImageAsset(d.id, new Blob(['unused!']), 'unused.png');
    await savePageContent(p.id, { strokes: [], objects: [imageObj(used.id)] });
    // Not removed by editing: still present until cleanup is run explicitly.
    expect(await db.assets.get(unused.id)).toBeDefined();
    const found = await findOrphanAssets();
    expect(found.ids).toEqual([unused.id]);
    const report = await cleanupOrphanAssets();
    expect(report).toEqual({ count: 1, bytes: 7 });
    expect(await db.assets.get(unused.id)).toBeUndefined();
    expect(await db.assets.get(used.id)).toBeDefined();
  });

  it('never treats thumbnails as orphans', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'D' });
    const p = await createPage(d.id, 0);
    await setPageThumbnail(d.id, p.id, new Blob(['thumb']));
    expect((await findOrphanAssets()).ids).toEqual([]);
  });

  it('emptying the trash also cleans up orphans (and nothing before)', async () => {
    const keep = await createDocument({ kind: 'notebook', title: 'Keep' });
    const orphan = await addImageAsset(keep.id, new Blob(['x']), 'o.png');
    const gone = await createDocument({ kind: 'notebook', title: 'Gone' });
    await softDeleteDocument(gone.id);
    expect(await db.assets.get(orphan.id)).toBeDefined(); // trashing alone doesn't clean up
    await emptyTrash();
    expect(await db.assets.get(orphan.id)).toBeUndefined();
  });

  it('an image on a soft-deleted page still counts as referenced (undo needs it)', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'D' });
    const p = await createPage(d.id, 0);
    await createPage(d.id, 1);
    const a = await addImageAsset(d.id, new Blob(['img']), 'a.png');
    await savePageContent(p.id, { strokes: [], objects: [imageObj(a.id)] });
    await db.pages.update(p.id, { deletedAt: Date.now() });
    expect((await findOrphanAssets()).ids).toEqual([]);
  });
});

describe('images across documents', () => {
  it('duplicating a notebook gives the copy its own image assets and rewrites references', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'Orig' });
    const p = await createPage(d.id, 0);
    const a = await addImageAsset(d.id, new Blob(['pixels']), 'a.png');
    await savePageContent(p.id, { strokes: [], objects: [imageObj(a.id)] });
    const copy = await duplicateDocument(d.id);
    const copyPage = (await listPages(copy.id))[0]!;
    const obj = (await getPageContent(copyPage.id)).objects[0] as ImageObject;
    expect(obj.assetId).not.toBe(a.id);
    const copied = await db.assets.get(obj.assetId);
    expect(copied?.documentId).toBe(copy.id);
    // Deleting the original must not break the copy.
    await permanentDeleteDocument(d.id);
    expect(await db.assets.get(obj.assetId)).toBeDefined();
    expect(await (await db.assets.get(obj.assetId))!.blob.text()).toBe('pixels');
  });

  it('pasting into another notebook copies the asset into it', async () => {
    const a1 = await createDocument({ kind: 'notebook', title: 'A' });
    const a2 = await createDocument({ kind: 'notebook', title: 'B' });
    const asset = await addImageAsset(a1.id, new Blob(['i']), 'i.png');
    expect(await ensureAssetInDocument(asset.id, a1.id)).toBe(asset.id);
    const copyId = await ensureAssetInDocument(asset.id, a2.id);
    expect(copyId).not.toBe(asset.id);
    expect((await db.assets.get(copyId))!.documentId).toBe(a2.id);
  });
});
