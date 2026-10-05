import { db } from './db';
import { newId, now } from './ids';
import type { Asset, ImageObject } from './models';

export async function addImageAsset(documentId: string, blob: Blob, name: string): Promise<Asset> {
  const asset: Asset = {
    id: newId(),
    documentId,
    kind: 'image',
    mime: blob.type || 'application/octet-stream',
    name,
    size: blob.size,
    blob,
    createdAt: now(),
  };
  await db.assets.add(asset);
  return asset;
}

export async function getAssetBlob(assetId: string): Promise<Blob | undefined> {
  return (await db.assets.get(assetId))?.blob;
}

/**
 * Pasting an image into another notebook: that notebook needs its own copy, otherwise deleting
 * the source notebook would delete the asset out from under it.
 */
export async function ensureAssetInDocument(assetId: string, documentId: string): Promise<string> {
  const a = await db.assets.get(assetId);
  if (!a || a.documentId === documentId) return assetId;
  const copy = { ...a, id: newId(), documentId, createdAt: now() };
  await db.assets.add(copy);
  return copy.id;
}

/** Ids of every image asset referenced by any page (including soft-deleted pages). */
async function referencedAssetIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  await db.pageContent.each((c) => {
    for (const o of c.objects ?? []) if (o.type === 'image') ids.add((o as ImageObject).assetId);
  });
  return ids;
}

export interface OrphanReport {
  count: number;
  bytes: number;
}

/** Image assets no page refers to. Thumbnails and PDFs are never orphans. */
export async function findOrphanAssets(): Promise<{ ids: string[]; report: OrphanReport }> {
  const used = await referencedAssetIds();
  const ids: string[] = [];
  let bytes = 0;
  await db.assets
    .where('documentId')
    .notEqual('')
    .each((a) => {
      if (a.kind === 'image' && !used.has(a.id)) {
        ids.push(a.id);
        bytes += a.size;
      }
    });
  return { ids, report: { count: ids.length, bytes } };
}

/**
 * Remove unreferenced images. Only called when the user empties the trash or runs
 * "Clean up storage": never on edit, because undo may still need an image.
 */
export async function cleanupOrphanAssets(): Promise<OrphanReport> {
  const { ids, report } = await findOrphanAssets();
  if (ids.length) await db.assets.bulkDelete(ids);
  return report;
}
