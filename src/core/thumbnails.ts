import { db } from './db';
import { now } from './ids';
import { pageThumbId } from './pages';

/**
 * Thumbnails live in `assets` (kind 'thumbnail') so listing never loads image data.
 * Two flavours: one per document (library card, name 'thumbnail') and one per page
 * (sidebar / lazy pages, id `pagethumb:<pageId>`, name 'page-thumbnail').
 */
export async function getThumbnail(documentId: string): Promise<Blob | undefined> {
  const rows = await db.assets.where('documentId').equals(documentId).toArray();
  return rows.find((a) => a.kind === 'thumbnail' && a.name === 'thumbnail')?.blob;
}

export async function setThumbnail(documentId: string, blob: Blob): Promise<void> {
  await db.transaction('rw', db.assets, async () => {
    const rows = await db.assets.where('documentId').equals(documentId).toArray();
    const existing = rows.find((a) => a.kind === 'thumbnail' && a.name === 'thumbnail');
    await db.assets.put({
      id: existing?.id ?? crypto.randomUUID(),
      documentId,
      kind: 'thumbnail',
      mime: blob.type || 'image/png',
      name: 'thumbnail',
      size: blob.size,
      blob,
      createdAt: now(),
    });
  });
}

export async function getPageThumbnail(pageId: string): Promise<Blob | undefined> {
  return (await db.assets.get(pageThumbId(pageId)))?.blob;
}

export async function setPageThumbnail(
  documentId: string,
  pageId: string,
  blob: Blob,
): Promise<void> {
  await db.assets.put({
    id: pageThumbId(pageId),
    documentId,
    kind: 'thumbnail',
    mime: blob.type || 'image/png',
    name: 'page-thumbnail',
    size: blob.size,
    blob,
    createdAt: now(),
  });
}
