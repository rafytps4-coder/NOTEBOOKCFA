import { db } from './db';
import { newId, now } from './ids';

/** Thumbnails live in `assets` (kind 'thumbnail') so listing documents never loads image data. */
export async function getThumbnail(documentId: string): Promise<Blob | undefined> {
  const rows = await db.assets.where('documentId').equals(documentId).toArray();
  return rows.find((a) => a.kind === 'thumbnail')?.blob;
}

export async function setThumbnail(documentId: string, blob: Blob): Promise<void> {
  await db.transaction('rw', db.assets, async () => {
    const rows = await db.assets.where('documentId').equals(documentId).toArray();
    const existing = rows.find((a) => a.kind === 'thumbnail');
    await db.assets.put({
      id: existing?.id ?? newId(),
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
