import { deflateSync } from 'node:zlib';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';

interface FixtureOptions {
  pages: number;
  /** Portrait Letter by default. */
  size?: [number, number];
  /** Per-page /Rotate values (cycled). */
  rotate?: number[];
  /** Image-only pages, like a scan. */
  scanned?: boolean;
  /** Different page sizes (cycled) to detect ordering mistakes. */
  sizes?: [number, number][];
  /** Extra text drawn on each page (cycled), so tests can search for it. */
  texts?: string[];
  /** Table of contents entries (0-based target page). */
  outline?: { title: string; page: number }[];
}

export async function makePdf(o: FixtureOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const img = o.scanned ? await doc.embedPng(grayPng(32, 32, 120)) : null;
  for (let i = 0; i < o.pages; i++) {
    const [w, h] = o.sizes ? o.sizes[i % o.sizes.length]! : (o.size ?? [612, 792]);
    const page = doc.addPage([w, h]);
    if (img) page.drawImage(img, { x: 0, y: 0, width: w, height: h });
    else {
      page.drawText(`Page ${i + 1}`, { x: 50, y: h - 80, size: 24, font, color: rgb(0, 0, 0) });
      if (o.texts)
        page.drawText(o.texts[i % o.texts.length]!, {
          x: 50,
          y: h - 120,
          size: 14,
          font,
          color: rgb(0, 0, 0),
        });
      page.drawRectangle({ x: 50, y: 50, width: 100, height: 60, color: rgb(0.9, 0.9, 0.2) });
    }
    if (o.rotate) page.setRotation(degrees(o.rotate[i % o.rotate.length]!));
  }
  if (o.outline?.length) addOutline(doc, o.outline);
  return doc.save();
}

/** pdf-lib has no outline API, so build the /Outlines tree by hand. */
function addOutline(doc: PDFDocument, items: { title: string; page: number }[]) {
  const ctx = doc.context;
  const rootRef = ctx.nextRef();
  const refs = items.map(() => ctx.nextRef());
  items.forEach((it, i) => {
    const dict = ctx.obj({
      Title: PDFString.of(it.title),
      Parent: rootRef,
      Dest: PDFArray.withContext(ctx),
    }) as PDFDict;
    const dest = dict.get(PDFName.of('Dest')) as PDFArray;
    dest.push(doc.getPage(it.page).ref);
    dest.push(PDFName.of('Fit'));
    if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]!);
    if (i < items.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]!);
    ctx.assign(refs[i]!, dict);
  });
  const root = ctx.obj({
    Type: 'Outlines',
    First: refs[0]!,
    Last: refs[refs.length - 1]!,
    Count: PDFNumber.of(items.length),
  });
  ctx.assign(rootRef, root);
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
}

const CRC = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Solid grey RGB PNG, built by hand so fixtures need no image libraries. */
export function grayPng(w: number, h: number, value: number): Uint8Array {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, value)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
