import { addImageAsset } from '@/core';

/** Largest edge kept for stored images. Bigger photos are scaled down; the user's file is untouched. */
export const MAX_IMAGE_EDGE = 2560;

export interface ImportedImage {
  assetId: string;
  width: number;
  height: number;
}

/** Size after limiting the longest edge; never enlarges. */
export function limitedSize(w: number, h: number, max = MAX_IMAGE_EDGE): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Types we keep as-is when no resizing is needed (no re-encoding, so no quality loss). */
const KEEP_AS_IS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

/**
 * Decode, downscale if very large, store as an asset. Throws a readable Error on failure
 * (unsupported format, corrupt file, storage full).
 */
export async function importImageFile(file: File, documentId: string): Promise<ImportedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`“${file.name}” couldn’t be read as an image.`);
  }
  try {
    const { w, h } = limitedSize(bitmap.width, bitmap.height);
    let blob: Blob = file;
    if (w !== bitmap.width || h !== bitmap.height || !KEEP_AS_IS.has(file.type)) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Image scaling is not available in this browser.');
      ctx.drawImage(bitmap, 0, 0, w, h);
      const keepAlpha =
        file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';
      const out = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, keepAlpha ? 'image/png' : 'image/jpeg', 0.92),
      );
      if (!out) throw new Error(`“${file.name}” couldn’t be converted.`);
      blob = out;
    }
    try {
      const asset = await addImageAsset(documentId, blob, file.name);
      return { assetId: asset.id, width: w, height: h };
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'QuotaExceededError') {
        throw new Error(
          'Not enough storage space to add this image. Free some space or back up and clean up storage.',
          { cause: e },
        );
      }
      throw e;
    }
  } finally {
    bitmap.close();
  }
}
