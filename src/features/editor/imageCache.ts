import { getAssetBlob } from '@/core';

type Source = ImageBitmap | HTMLImageElement;

/** Decoded images by asset id. Loading is async; listeners are told when something arrives. */
const cache = new Map<string, Source>();
const loading = new Set<string>();
const failed = new Set<string>();
const listeners = new Set<() => void>();

export function subscribeImages(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

async function decode(blob: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // The decoded <img> keeps its pixels after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Returns the decoded image if ready, otherwise starts loading it and returns null. */
export function getImage(assetId: string): Source | null {
  const hit = cache.get(assetId);
  if (hit) return hit;
  if (!loading.has(assetId) && !failed.has(assetId)) {
    loading.add(assetId);
    void getAssetBlob(assetId)
      .then(async (blob) => {
        if (!blob) throw new Error('missing asset');
        cache.set(assetId, await decode(blob));
      })
      .catch(() => failed.add(assetId))
      .finally(() => {
        loading.delete(assetId);
        listeners.forEach((l) => l());
      });
  }
  return null;
}

export function hasImageFailed(assetId: string): boolean {
  return failed.has(assetId);
}

/** Wait until every listed image is decoded (used for thumbnails). */
export async function preloadImages(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      if (cache.has(id) || failed.has(id)) return;
      const blob = await getAssetBlob(id);
      if (!blob) return void failed.add(id);
      try {
        cache.set(id, await decode(blob));
      } catch {
        failed.add(id);
      }
    }),
  );
}

export function clearImageCache(): void {
  for (const v of cache.values()) if ('close' in v) v.close();
  cache.clear();
  failed.clear();
}

export function imageSize(assetId: string): { w: number; h: number } | null {
  const s = cache.get(assetId);
  return s ? { w: s.width, h: s.height } : null;
}
