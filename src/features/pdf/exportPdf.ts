import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type Color,
} from 'pdf-lib';
import {
  getAssetBlob,
  getPageContent,
  getPdfAsset,
  listPages,
  type ImageObject,
  type Page,
  type PageObject,
  type ShapeObject,
  type Stroke,
  type TextObject,
} from '@/core';
import {
  LINE_HEIGHT,
  TEXT_PAD,
  strokeOutline,
  templateGeometry,
  wrapLines,
} from '@/engines/drawing';
import {
  FLIP_Y,
  displaySize,
  displayToUser,
  mul,
  rotateM,
  translate,
  type Matrix,
  type PageBox,
} from './matrix';

export type ExportMode = 'annotated' | 'annotationsOnly';

export interface ExportProgress {
  done: number;
  total: number;
}

export interface ExportOptions {
  mode?: ExportMode;
  onProgress?: (p: ExportProgress) => void;
  /** Rasterises things pdf-lib can't draw natively (non-Latin text, cropped/odd-format images). */
  rasterizer?: Rasterizer;
}

/** Browser-only helpers for content that can't be embedded as-is. Optional: tests omit it. */
export interface Rasterizer {
  text(o: TextObject): Promise<Uint8Array | null>;
  image(o: ImageObject, blob: Blob): Promise<Uint8Array | null>;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export function parseColor(hex: string): Color {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : String(+n.toFixed(3)));

/** Stroke outline polygon → SVG path with the same midpoint-quadratic smoothing the canvas uses. */
export function outlineToSvg(outline: number[][]): string {
  const n = outline.length;
  if (n < 2) return '';
  const mid = (a: number[], b: number[]) => [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2] as const;
  const m0 = mid(outline[n - 1]!, outline[0]!);
  let d = `M ${f(m0[0])} ${f(m0[1])}`;
  for (let i = 0; i < n; i++) {
    const p = outline[i]!;
    const m = mid(p, outline[(i + 1) % n]!);
    d += ` Q ${f(p[0]!)} ${f(p[1]!)} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d} Z`;
}

/** Local (centre-origin, y-down) SVG path for a shape object. */
export function shapeToSvg(o: ShapeObject): { body: string; head?: string } {
  const hw = o.w / 2;
  const hh = o.h / 2;
  switch (o.shape) {
    case 'rect':
      return {
        body: `M ${f(-hw)} ${f(-hh)} L ${f(hw)} ${f(-hh)} L ${f(hw)} ${f(hh)} L ${f(-hw)} ${f(hh)} Z`,
      };
    case 'triangle':
      return { body: `M 0 ${f(-hh)} L ${f(hw)} ${f(hh)} L ${f(-hw)} ${f(hh)} Z` };
    case 'ellipse': {
      const k = 0.5522847498;
      return {
        body:
          `M ${f(hw)} 0 C ${f(hw)} ${f(k * hh)} ${f(k * hw)} ${f(hh)} 0 ${f(hh)} ` +
          `C ${f(-k * hw)} ${f(hh)} ${f(-hw)} ${f(k * hh)} ${f(-hw)} 0 ` +
          `C ${f(-hw)} ${f(-k * hh)} ${f(-k * hw)} ${f(-hh)} 0 ${f(-hh)} ` +
          `C ${f(k * hw)} ${f(-hh)} ${f(hw)} ${f(-k * hh)} ${f(hw)} 0 Z`,
      };
    }
    default: {
      const [x1, y1, x2, y2] = o.ends ?? [0, 0, 1, 1];
      const ax = -hw + x1 * o.w;
      const ay = -hh + y1 * o.h;
      const bx = -hw + x2 * o.w;
      const by = -hh + y2 * o.h;
      const body = `M ${f(ax)} ${f(ay)} L ${f(bx)} ${f(by)}`;
      if (o.shape !== 'arrow') return { body };
      const ang = Math.atan2(by - ay, bx - ax);
      const head = Math.max(10, o.strokeWidth * 4);
      const p1 = [bx - head * Math.cos(ang - Math.PI / 7), by - head * Math.sin(ang - Math.PI / 7)];
      const p2 = [bx - head * Math.cos(ang + Math.PI / 7), by - head * Math.sin(ang + Math.PI / 7)];
      return {
        body,
        head: `M ${f(p1[0]!)} ${f(p1[1]!)} L ${f(bx)} ${f(by)} L ${f(p2[0]!)} ${f(p2[1]!)}`,
      };
    }
  }
}

interface Fonts {
  get(bold: boolean, italic: boolean): PDFFont;
}

async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  const cache = new Map<string, PDFFont>();
  const names = {
    '00': StandardFonts.Helvetica,
    '10': StandardFonts.HelveticaBold,
    '01': StandardFonts.HelveticaOblique,
    '11': StandardFonts.HelveticaBoldOblique,
  } as const;
  const all = await Promise.all(
    (Object.keys(names) as (keyof typeof names)[]).map(
      async (k) => [k, await doc.embedFont(names[k])] as const,
    ),
  );
  for (const [k, font] of all) cache.set(k, font);
  return { get: (b, i) => cache.get(`${b ? 1 : 0}${i ? 1 : 0}`)! };
}

/** Draw `fn` with `m` as the current transformation matrix. */
function withMatrix(page: PDFPage, m: Matrix, fn: () => void) {
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
  fn();
  page.pushOperators(popGraphicsState());
}

function drawStroke(page: PDFPage, s: Stroke, base: Matrix) {
  const d = outlineToSvg(strokeOutline(s, true));
  if (!d) return;
  const color = parseColor(s.color);
  const draw = (opacity: number, dx = 0) =>
    page.drawSvgPath(d, {
      x: dx,
      y: 0,
      scale: 1,
      color,
      opacity,
      blendMode: s.tool === 'highlighter' ? BlendMode.Multiply : BlendMode.Normal,
    });
  withMatrix(page, mul(base, FLIP_Y), () => {
    if (s.tool === 'pencil') {
      draw(s.opacity * 0.55);
      draw(s.opacity * 0.4, 0.35);
    } else draw(s.opacity);
  });
}

function drawShape(page: PDFPage, o: ShapeObject, base: Matrix) {
  const { body, head } = shapeToSvg(o);
  const m = mul(mul(mul(base, translate(o.cx, o.cy)), rotateM(o.rot)), FLIP_Y);
  const stroke = parseColor(o.stroke);
  const opts = {
    x: 0,
    y: 0,
    scale: 1,
    borderColor: stroke,
    borderWidth: o.strokeWidth,
    borderLineCap: LineCapStyle.Round,
  };
  withMatrix(page, m, () => {
    const filled = o.fill && o.shape !== 'line' && o.shape !== 'arrow';
    page.drawSvgPath(body, filled ? { ...opts, color: parseColor(o.fill!) } : opts);
    if (head) page.drawSvgPath(head, opts);
  });
}

async function drawText(
  doc: PDFDocument,
  page: PDFPage,
  o: TextObject,
  base: Matrix,
  fonts: Fonts,
  rasterizer: Rasterizer | undefined,
) {
  const font = fonts.get(o.bold, o.italic);
  const m = mul(mul(mul(base, translate(o.cx, o.cy)), rotateM(o.rot)), FLIP_Y);
  const lines = wrapLines(o.text, Math.max(10, o.w - TEXT_PAD * 2), (s) => {
    try {
      return font.widthOfTextAtSize(s, o.fontSize);
    } catch {
      return s.length * o.fontSize * 0.55; // unsupported glyph: rough width, handled below
    }
  });
  const encodable = lines.every((l) => {
    try {
      font.encodeText(l);
      return true;
    } catch {
      return false;
    }
  });
  if (!encodable && rasterizer) {
    const png = await rasterizer.text(o);
    if (png) {
      const img = await doc.embedPng(png);
      withMatrix(page, m, () =>
        page.drawImage(img, { x: -o.w / 2, y: -o.h / 2, width: o.w, height: o.h }),
      );
      return;
    }
  }
  const color = parseColor(o.color);
  const lh = o.fontSize * LINE_HEIGHT;
  withMatrix(page, m, () => {
    lines.forEach((raw, i) => {
      // Without a rasteriser, glyphs outside WinAnsi become '?' rather than failing the export.
      const text = [...raw]
        .map((ch) => {
          try {
            font.encodeText(ch);
            return ch;
          } catch {
            return '?';
          }
        })
        .join('');
      const baselineDown = -o.h / 2 + TEXT_PAD + i * lh + o.fontSize * 0.82;
      page.drawText(text, {
        x: -o.w / 2 + TEXT_PAD,
        y: -baselineDown,
        size: o.fontSize,
        font,
        color,
      });
    });
  });
}

async function drawImageObject(
  doc: PDFDocument,
  page: PDFPage,
  o: ImageObject,
  base: Matrix,
  rasterizer: Rasterizer | undefined,
) {
  const blob = await getAssetBlob(o.assetId);
  if (!blob) return;
  const m = mul(mul(mul(base, translate(o.cx, o.cy)), rotateM(o.rot)), FLIP_Y);
  const cropped = o.crop.l || o.crop.t || o.crop.r || o.crop.b;
  let embedded;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!cropped && blob.type === 'image/png') embedded = await doc.embedPng(bytes);
  else if (!cropped && blob.type === 'image/jpeg') embedded = await doc.embedJpg(bytes);
  else {
    const png = await rasterizer?.image(o, blob);
    if (!png) return; // can't draw it here (no browser canvas): skip rather than fail the export
    embedded = await doc.embedPng(png);
  }
  withMatrix(page, m, () =>
    page.drawImage(embedded, { x: -o.w / 2, y: -o.h / 2, width: o.w, height: o.h }),
  );
}

/** Background colour and template lines for pages that aren't PDF pages. */
function drawPaper(page: PDFPage, p: Page) {
  const { width: w, height: h } = p;
  if (p.background.toLowerCase() !== '#ffffff') {
    page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: parseColor(p.background) });
  }
  if (p.template.kind === 'blank') return;
  const g = templateGeometry(p.template, w, h);
  const color = parseColor(p.template.color);
  for (const l of g.hLines)
    page.drawLine({
      start: { x: l.x0, y: h - l.y },
      end: { x: l.x1, y: h - l.y },
      thickness: 0.75,
      color,
    });
  for (const l of g.vLines)
    page.drawLine({
      start: { x: l.x, y: h - l.y0 },
      end: { x: l.x, y: h - l.y1 },
      thickness: 0.75,
      color,
    });
  for (const d of g.dots)
    page.drawRectangle({ x: d.x - 1, y: h - d.y - 1, width: 2, height: 2, color });
}

function boxOf(page: PDFPage): PageBox {
  const c = page.getCropBox();
  return { x0: c.x, y0: c.y, W: c.width, H: c.height, rotate: page.getRotation().angle };
}

/**
 * Build a new PDF from a document: PDF pages are copied (vector content kept), added pages are
 * drawn from their template, and ink + objects are drawn as vectors on top. The original file is
 * only read. Runs in small async steps so the UI stays responsive.
 */
export async function exportPdf(documentId: string, opts: ExportOptions = {}): Promise<Blob> {
  const mode = opts.mode ?? 'annotated';
  const pages = await listPages(documentId);
  const asset = await getPdfAsset(documentId);
  const src =
    asset && mode === 'annotated' && pages.some((p) => p.pdf)
      ? await PDFDocument.load(await asset.blob.arrayBuffer())
      : null;
  const out = await PDFDocument.create();
  const fonts = await embedFonts(out);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    let page: PDFPage;
    let base: Matrix;
    if (p.pdf && src) {
      const [copied] = await out.copyPages(src, [p.pdf.index]);
      page = out.addPage(copied!);
      const box = boxOf(page);
      const k = displaySize(box).w / p.width || 1;
      base = displayToUser(box, k);
    } else {
      page = out.addPage([p.width, p.height]);
      if (mode === 'annotated' && !p.pdf) drawPaper(page, p);
      base = displayToUser({ x0: 0, y0: 0, W: p.width, H: p.height, rotate: 0 });
    }
    const content = await getPageContent(p.id);
    for (const o of [...content.objects].sort((a, b) => a.z - b.z))
      await drawObject(out, page, o, base, fonts, opts.rasterizer);
    for (const s of content.strokes) drawStroke(page, s, base);
    opts.onProgress?.({ done: i + 1, total: pages.length });
    await yieldToUi();
  }
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

async function drawObject(
  doc: PDFDocument,
  page: PDFPage,
  o: PageObject,
  base: Matrix,
  fonts: Fonts,
  rasterizer: Rasterizer | undefined,
) {
  if (o.type === 'shape') drawShape(page, o, base);
  else if (o.type === 'text') await drawText(doc, page, o, base, fonts, rasterizer);
  else await drawImageObject(doc, page, o, base, rasterizer);
}

/** The untouched original file. */
export async function exportOriginal(documentId: string): Promise<Blob> {
  const asset = await getPdfAsset(documentId);
  if (!asset) throw new Error('This document has no original PDF.');
  return asset.blob;
}
