import type { ImageObject, TextObject } from '@/core';
import { drawObject } from '../editor/objectRender';
import type { Rasterizer } from './exportPdf';

const SCALE = 3; // oversample so rasterised text stays crisp in the PDF

function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  return new Promise((resolve) =>
    canvas.toBlob(
      async (b) => resolve(b ? new Uint8Array(await b.arrayBuffer()) : null),
      'image/png',
    ),
  );
}

/** Browser canvas fallbacks for text with non-Latin characters and for cropped / non-PNG/JPEG images. */
export const browserRasterizer: Rasterizer = {
  async text(o: TextObject) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(o.w * SCALE);
    c.height = Math.ceil(o.h * SCALE);
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.scale(SCALE, SCALE);
    drawObject(ctx, { ...o, cx: o.w / 2, cy: o.h / 2, rot: 0 });
    return toPng(c);
  },
  async image(o: ImageObject, blob: Blob) {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
      const { l, t, r, b } = o.crop;
      const sw = bmp.width * (1 - l - r);
      const sh = bmp.height * (1 - t - b);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sw));
      c.height = Math.max(1, Math.round(sh));
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bmp, bmp.width * l, bmp.height * t, sw, sh, 0, 0, c.width, c.height);
      return toPng(c);
    } finally {
      bmp.close();
    }
  },
};
