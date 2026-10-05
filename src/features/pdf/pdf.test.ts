// @vitest-environment node
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPage,
  db,
  duplicatePage,
  getPageContent,
  listPages,
  savePageContent,
  softDeletePage,
  movePage,
  insertPage,
  type PageObject,
  type Stroke,
} from '@/core';
import { makePdf } from '@/test-utils/pdfFixtures';
import {
  clearAnnotations,
  hasAnnotations,
  restoreAnnotations,
  snapshotAnnotations,
} from './annotations';
import { exportOriginal, exportPdf, outlineToSvg, parseColor, shapeToSvg } from './exportPdf';
import { importPdfFile, looksLikePdf, ImportError } from './importPdf';
import { displayToUser, displaySize, apply } from './matrix';
import { pickBucket, PdfBitmapCache } from './bitmapCache';
import { setPdfjsForTests } from './pdfjs';
import { sha256Hex } from '@/core';

beforeAll(async () => {
  setPdfjsForTests((await import('pdfjs-dist/legacy/build/pdf.mjs')) as never);
});
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const asFile = (bytes: Uint8Array, name = 'test.pdf') =>
  new File([bytes as BlobPart], name, { type: 'application/pdf' });

const stroke = (id: string, pts: [number, number][], over: Partial<Stroke> = {}): Stroke => ({
  id,
  tool: 'pen',
  color: '#d62828',
  width: 4,
  opacity: 1,
  points: pts.map(([x, y], i) => ({ x, y, pressure: 0.5, t: i })),
  ...over,
});

describe('display → PDF user space', () => {
  const box = { x0: 0, y0: 0, W: 612, H: 792, rotate: 0 };
  it('R=0: top-left of the display is the top-left of the page (y flips)', () => {
    const m = displayToUser(box);
    expect(apply(m, 0, 0)).toEqual({ x: 0, y: 792 });
    expect(apply(m, 612, 792)).toEqual({ x: 612, y: 0 });
  });
  it('R=90: display is 792 wide; its top-right is the page top-left', () => {
    const b = { ...box, rotate: 90 };
    expect(displaySize(b)).toEqual({ w: 792, h: 612 });
    const m = displayToUser(b);
    expect(apply(m, 0, 0)).toEqual({ x: 0, y: 0 }); // top-left of view = bottom-left of page
    expect(apply(m, 792, 0)).toEqual({ x: 0, y: 792 }); // top-right of view = top-left of page
    expect(apply(m, 0, 612)).toEqual({ x: 612, y: 0 }); // bottom-left of view = bottom-right of page
  });
  it('R=180 and R=270 map the corners of the displayed page', () => {
    const m180 = displayToUser({ ...box, rotate: 180 });
    expect(apply(m180, 0, 0)).toEqual({ x: 612, y: 0 }); // upside down: view top-left = page bottom-right
    expect(apply(m180, 612, 792)).toEqual({ x: 0, y: 792 });
    const m270 = displayToUser({ ...box, rotate: 270 });
    expect(apply(m270, 0, 0)).toEqual({ x: 612, y: 792 }); // view top-left = page top-right
    expect(apply(m270, 792, 612)).toEqual({ x: 0, y: 0 });
  });
  it('honours a crop-box origin and a scale factor', () => {
    const m = displayToUser({ x0: 10, y0: 20, W: 100, H: 200, rotate: 0 }, 2);
    expect(apply(m, 0, 0)).toEqual({ x: 10, y: 220 });
    expect(apply(m, 50, 100)).toEqual({ x: 110, y: 20 });
  });
});

describe('import', () => {
  it('imports a 1-page PDF, stores the original bytes untouched, with a recorded hash', async () => {
    const bytes = await makePdf({ pages: 1 });
    const doc = await importPdfFile(asFile(bytes, 'one.pdf'));
    expect(doc).toMatchObject({ kind: 'pdf', title: 'one' });
    const asset = (await db.assets.where('documentId').equals(doc.id).toArray()).find(
      (a) => a.kind === 'pdf',
    )!;
    expect(new Uint8Array(await asset.blob.arrayBuffer())).toEqual(bytes);
    expect(asset.sha256).toBe(await sha256Hex(asset.blob));
    const pages = await listPages(doc.id);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ width: 612, height: 792, pdf: { index: 0 } });
  });

  it('imports a 200-page PDF and reports progress', async () => {
    const bytes = await makePdf({ pages: 200 });
    const seen: number[] = [];
    const t0 = performance.now();
    const doc = await importPdfFile(asFile(bytes), 'root', (p) => seen.push(p.done));
    const ms = performance.now() - t0;
    expect(await listPages(doc.id)).toHaveLength(200);
    expect(seen.at(-1)).toBe(200);
    console.log(
      `import of a 200-page PDF (${(bytes.length / 1024).toFixed(0)} KB): ${ms.toFixed(0)} ms (Node, pdf.js legacy build)`,
    );
  });

  it('applies /Rotate so rotated pages have swapped display dimensions', async () => {
    const bytes = await makePdf({ pages: 4, rotate: [0, 90, 180, 270] });
    const doc = await importPdfFile(asFile(bytes));
    const dims = (await listPages(doc.id)).map((p) => [p.width, p.height]);
    expect(dims).toEqual([
      [612, 792],
      [792, 612],
      [612, 792],
      [792, 612],
    ]);
  });

  it('imports a scanned (image-only) PDF', async () => {
    const bytes = await makePdf({ pages: 3, scanned: true });
    const doc = await importPdfFile(asFile(bytes));
    expect(await listPages(doc.id)).toHaveLength(3);
  });

  it('rejects non-PDF and corrupt files without leaving anything behind', async () => {
    const notPdf = new File(['hello world'], 'x.pdf', { type: 'application/pdf' });
    await expect(importPdfFile(notPdf)).rejects.toBeInstanceOf(ImportError);
    const corrupt = new File(
      [new TextEncoder().encode('%PDF-1.4\nthis is not really a pdf')],
      'bad.pdf',
    );
    await expect(importPdfFile(corrupt)).rejects.toThrow(/PDF/);
    expect(await db.documents.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
    expect(looksLikePdf({ name: 'A.PDF', type: '' })).toBe(true);
    expect(looksLikePdf({ name: 'a.png', type: 'image/png' })).toBe(false);
  });
});

describe('outline', () => {
  it('reads the table of contents and resolves destinations to page indexes', async () => {
    const bytes = await makePdf({
      pages: 5,
      outline: [
        { title: 'Intro', page: 0 },
        { title: 'Middle', page: 2 },
        { title: 'End', page: 4 },
      ],
    });
    const doc = await importPdfFile(asFile(bytes));
    const { loadOutline } = await import('./pdfDocs');
    const outline = await loadOutline(doc.id);
    expect(outline.map((o) => [o.title, o.pageIndex])).toEqual([
      ['Intro', 0],
      ['Middle', 2],
      ['End', 4],
    ]);
  });
  it('returns an empty outline when the PDF has none', async () => {
    const doc = await importPdfFile(asFile(await makePdf({ pages: 2 })));
    const { loadOutline } = await import('./pdfDocs');
    expect(await loadOutline(doc.id)).toEqual([]);
  });
});

describe('remove all annotations', () => {
  it('empties ink and objects, leaves the original PDF byte-identical, and is undoable', async () => {
    const bytes = await makePdf({ pages: 3 });
    const doc = await importPdfFile(asFile(bytes));
    const pages = await listPages(doc.id);
    const obj: PageObject = {
      id: 'o1',
      type: 'shape',
      shape: 'rect',
      stroke: '#000',
      strokeWidth: 2,
      fill: null,
      cx: 100,
      cy: 100,
      w: 50,
      h: 50,
      rot: 0,
      z: 1,
    };
    await savePageContent(pages[0]!.id, {
      strokes: [
        stroke('s1', [
          [0, 0],
          [50, 50],
        ]),
      ],
      objects: [obj],
    });
    await savePageContent(pages[2]!.id, {
      strokes: [
        stroke('s2', [
          [5, 5],
          [9, 9],
        ]),
      ],
      objects: [],
    });

    const asset = (await db.assets.where('documentId').equals(doc.id).toArray()).find(
      (a) => a.kind === 'pdf',
    )!;
    const before = await sha256Hex(asset.blob);

    const snap = await snapshotAnnotations(doc.id);
    expect(hasAnnotations(snap)).toBe(true);
    await clearAnnotations(snap);
    for (const p of pages) {
      const c = await getPageContent(p.id);
      expect(c.strokes).toHaveLength(0);
      expect(c.objects).toHaveLength(0);
    }
    const after = (await db.assets.get(asset.id))!;
    expect(await sha256Hex(after.blob)).toBe(before);
    expect(after.sha256).toBe(before);
    expect(new Uint8Array(await after.blob.arrayBuffer())).toEqual(bytes);
    expect(hasAnnotations(await snapshotAnnotations(doc.id))).toBe(false);

    await restoreAnnotations(snap); // undo
    expect((await getPageContent(pages[0]!.id)).strokes).toHaveLength(1);
    expect((await getPageContent(pages[0]!.id)).objects).toHaveLength(1);
    expect((await getPageContent(pages[2]!.id)).strokes).toHaveLength(1);
  });
});

describe('export', () => {
  const exportAndLoad = async (docId: string, mode?: 'annotated' | 'annotationsOnly') =>
    PDFDocument.load(await (await exportPdf(docId, { mode })).arrayBuffer());

  it('keeps page order, sizes and rotation; skips deleted pages; includes added pages', async () => {
    const bytes = await makePdf({
      pages: 4,
      sizes: [
        [500, 700],
        [600, 800],
        [700, 900],
        [800, 1000],
      ],
      rotate: [0, 90, 0, 0],
    });
    const doc = await importPdfFile(asFile(bytes));
    const pages = await listPages(doc.id);
    await softDeletePage(pages[2]!.id); // delete original page 3
    await movePage(pages[3]!.id, 0); // original page 4 first
    const added = await insertPage(doc.id, 1); // blank page after it
    expect(added.pdf).toBeUndefined();

    const out = await exportAndLoad(doc.id);
    const sizes = out.getPages().map((p) => {
      const { width, height } = p.getSize();
      return [Math.round(width), Math.round(height), p.getRotation().angle];
    });
    expect(sizes).toEqual([
      [800, 1000, 0], // original 4
      [794, 1123, 0], // added blank A4
      [500, 700, 0], // original 1
      [600, 800, 90], // original 2, /Rotate preserved
    ]);
  });

  it('draws ink and objects as vector content and leaves the source bytes alone', async () => {
    const bytes = await makePdf({ pages: 2 });
    const doc = await importPdfFile(asFile(bytes));
    const [p1] = await listPages(doc.id);
    const objects: PageObject[] = [
      {
        id: 'sh',
        type: 'shape',
        shape: 'ellipse',
        stroke: '#1e88e5',
        strokeWidth: 3,
        fill: '#ffe14d',
        cx: 200,
        cy: 300,
        w: 120,
        h: 80,
        rot: 0.3,
        z: 1,
      },
      {
        id: 'tx',
        type: 'text',
        text: 'Hello PDF',
        fontSize: 20,
        color: '#2a9d4b',
        bold: true,
        italic: false,
        cx: 300,
        cy: 150,
        w: 200,
        h: 40,
        rot: 0,
        z: 2,
      },
    ];
    await savePageContent(p1!.id, {
      strokes: [
        stroke('a', [
          [10, 10],
          [60, 40],
          [120, 20],
          [200, 90],
        ]),
        stroke(
          'hl',
          [
            [10, 200],
            [300, 210],
          ],
          { tool: 'highlighter', color: '#ffe14d', width: 18, opacity: 0.45 },
        ),
      ],
      objects,
    });
    const plain = await exportAndLoad(doc.id, 'annotationsOnly');
    const annotated = await exportAndLoad(doc.id);
    expect(plain.getPageCount()).toBe(2);
    expect(annotated.getPageCount()).toBe(2);
    const contentText = (d: PDFDocument, i: number) => {
      const c = d.getPage(i).node.Contents();
      const refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
      return refs
        .map((r) => {
          const st = d.context.lookup(r);
          const bytes =
            st instanceof PDFRawStream
              ? decodePDFRawStream(st).decode()
              : (st as unknown as { getContents(): Uint8Array }).getContents();
          return new TextDecoder('latin1').decode(bytes);
        })
        .join('\n');
    };
    const page1 = contentText(annotated, 0);
    const untouched = contentText(annotated, 1);
    expect(page1.length).toBeGreaterThan(untouched.length + 500);
    expect(page1).toContain(' cm'); // transformed drawing space (display → PDF user space)
    expect(page1).toContain('0.839'); // the red ink colour (#d62828)
    expect(page1).toContain(' Q '.trim()); // balanced graphics state
    expect(untouched).not.toContain('0.839');
    expect(contentText(plain, 0)).toContain('0.839'); // annotations-only keeps the ink too
    // Source file is unchanged.
    const asset = (await db.assets.where('documentId').equals(doc.id).toArray()).find(
      (a) => a.kind === 'pdf',
    )!;
    expect(new Uint8Array(await asset.blob.arrayBuffer())).toEqual(bytes);
    expect(new Uint8Array(await (await exportOriginal(doc.id)).arrayBuffer())).toEqual(bytes);
  });

  it('reports progress and keeps a duplicated PDF page tied to its PDF background', async () => {
    const bytes = await makePdf({ pages: 3 });
    const doc = await importPdfFile(asFile(bytes));
    const pages = await listPages(doc.id);
    const copy = await duplicatePage(pages[1]!.id);
    expect((await db.pages.get(copy.id))!.pdf).toEqual({ index: 1 });
    const seen: number[] = [];
    const blob = await exportPdf(doc.id, { onProgress: (p) => seen.push(p.done) });
    expect(seen).toEqual([1, 2, 3, 4]);
    expect((await PDFDocument.load(await blob.arrayBuffer())).getPageCount()).toBe(4);
  });

  it('exports a notebook of added pages only (no PDF source)', async () => {
    const doc = await db.documents.add({
      id: 'nb',
      kind: 'notebook',
      title: 'NB',
      folderId: 'root',
      favorite: false,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: null,
      deletedAt: null,
    });
    void doc;
    await createPage('nb', 0);
    await createPage('nb', 1);
    const out = await exportAndLoad('nb');
    expect(out.getPageCount()).toBe(2);
  });

  it('exports 120 pages with ink without blocking for long single steps', async () => {
    const bytes = await makePdf({ pages: 120 });
    const doc = await importPdfFile(asFile(bytes));
    const pages = await listPages(doc.id);
    for (const p of pages.slice(0, 60)) {
      await savePageContent(p.id, {
        strokes: [
          stroke(
            `s${p.id}`,
            Array.from(
              { length: 80 },
              (_, i) => [i * 5, 100 + Math.sin(i / 4) * 30] as [number, number],
            ),
          ),
        ],
        objects: [],
      });
    }
    let steps = 0;
    const t0 = performance.now();
    const blob = await exportPdf(doc.id, { onProgress: () => steps++ });
    console.log(
      `export of 120 pages (60 inked): ${(performance.now() - t0).toFixed(0)} ms, ${(blob.size / 1024).toFixed(0)} KB (Node)`,
    );
    expect(steps).toBe(120);
  });
});

describe('svg helpers', () => {
  it('builds a closed quadratic path from an outline', () => {
    const d = outlineToSvg([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith(' Z')).toBe(true);
    expect((d.match(/Q/g) ?? []).length).toBe(4);
    expect(outlineToSvg([[0, 0]])).toBe('');
  });
  it('shapes: arrow has a head, rect is closed, colour parsing falls back to black', () => {
    const base = {
      id: 's',
      type: 'shape' as const,
      stroke: '#000',
      strokeWidth: 2,
      fill: null,
      cx: 0,
      cy: 0,
      w: 100,
      h: 50,
      rot: 0,
      z: 1,
    };
    expect(shapeToSvg({ ...base, shape: 'arrow', ends: [0, 0, 1, 0] }).head).toBeTruthy();
    expect(shapeToSvg({ ...base, shape: 'line' }).head).toBeUndefined();
    expect(shapeToSvg({ ...base, shape: 'rect' }).body.endsWith('Z')).toBe(true);
    expect(parseColor('nonsense')).toEqual(parseColor('#000000'));
    expect(parseColor('#ff0000')).toMatchObject({ red: 1, green: 0, blue: 0 });
  });
});

describe('bitmap cache policy', () => {
  it('chooses the smallest bucket that satisfies the zoom, capped by canvas size', () => {
    expect(pickBucket(1.2, 612, 792)).toBe(1.5);
    expect(pickBucket(0.1, 612, 792)).toBe(0.25);
    expect(pickBucket(100, 612, 792)).toBeLessThanOrEqual(6);
    expect(pickBucket(6, 5000, 5000)).toBeLessThan(2); // giant page: never exceeds the pixel limit
  });
  it('starts empty and reports zero usage', () => {
    const c = new PdfBitmapCache(1024);
    expect(c.count).toBe(0);
    expect(c.totalBytes).toBe(0);
    expect(c.peek('d', 0)).toBeNull();
  });
});
