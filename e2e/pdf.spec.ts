import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { makePdf } from '../src/test-utils/pdfFixtures';
import { hostBox, openPages, pageToScreen, storedStrokes, waitSaved } from './helpers';

const pdfjsDir = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build');
const label = (page: Page) => page.getByText(/^Page \d+ of \d+$/);

async function importPdf(page: Page, bytes: Uint8Array, name = 'sample.pdf') {
  await page.addInitScript(() => {
    // Force the plain-download path (headless has no real save dialog).
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/library');
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator('.canvas-host').first()).toBeVisible({ timeout: 20_000 });
}

/** Count pixels on the first page canvas matching a predicate, and their centroid. */
async function canvasStats(page: Page, kind: 'yellow' | 'red' | 'grey') {
  return page.evaluate((kind) => {
    const c = document.querySelectorAll<HTMLCanvasElement>('.canvas-host canvas')[0];
    if (!c || !c.width) return { n: 0, cx: 0, cy: 0, k: 1 };
    const k = c.width / c.clientWidth;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b, a] = [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
      const hit =
        kind === 'yellow'
          ? r > 200 && g > 190 && b < 120
          : kind === 'red'
            ? r > 160 && g < 100 && b < 100
            : Math.abs(r - 120) < 12 && Math.abs(g - 120) < 12 && Math.abs(b - 120) < 12;
      if (a > 200 && hit) {
        n++;
        const p = i / 4;
        sx += p % c.width;
        sy += Math.floor(p / c.width);
      }
    }
    return { n, cx: n ? sx / n / k : 0, cy: n ? sy / n / k : 0, k };
  }, kind);
}

/** Render page `pageNo` of PDF bytes with pdf.js inside the browser; return red-pixel stats. */
async function renderExported(page: Page, bytes: Buffer, pageNo: number) {
  await page.route('**/__pdfjs/*', (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()!;
    void route.fulfill({
      body: readFileSync(path.join(pdfjsDir, file)),
      contentType: 'text/javascript',
    });
  });
  return page.evaluate(
    async ({ b64, pageNo }) => {
      // Served by the route above; resolved at runtime in the browser, so hide it from the type checker.
      const url = '/__pdfjs/pdf.min.mjs';
      const pdfjs = (await import(/* @vite-ignore */ url)) as typeof import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/__pdfjs/pdf.worker.min.mjs';
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data }).promise;
      const pg = await doc.getPage(pageNo);
      const vp = pg.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d')!;
      await pg.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let yellow = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, bl] = [d[i]!, d[i + 1]!, d[i + 2]!];
        if (r > 160 && g < 100 && bl < 100) {
          n++;
          sx += (i / 4) % canvas.width;
          sy += Math.floor(i / 4 / canvas.width);
        }
        if (r > 200 && g > 190 && bl < 120) yellow++;
      }
      return {
        w: canvas.width,
        h: canvas.height,
        n,
        cx: n ? sx / n : 0,
        cy: n ? sy / n : 0,
        yellow,
        pages: doc.numPages,
      };
    },
    { b64: bytes.toString('base64'), pageNo },
  );
}

async function drawRedLine(
  page: Page,
  pageWidth: number,
  from: [number, number],
  to: [number, number],
) {
  await page.getByRole('button', { name: 'Colour #d62828' }).click();
  const a = await pageToScreen(page, from[0], from[1], pageWidth);
  const b = await pageToScreen(page, to[0], to[1], pageWidth);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

const sha = (buf: Buffer | Uint8Array) => createHash('sha256').update(buf).digest('hex');

async function storedPdfHash(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('notebook');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('assets').objectStore('assets').getAll();
          req.onsuccess = async () => {
            db.close();
            const a = (req.result as { kind: string; blob: Blob }[]).find((x) => x.kind === 'pdf')!;
            const digest = await crypto.subtle.digest('SHA-256', await a.blob.arrayBuffer());
            resolve(
              [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join(''),
            );
          };
        };
      }),
  );
}

test('import, render, annotate, reload, export: annotations land where they were drawn; original untouched', async ({
  page,
}) => {
  const original = await makePdf({ pages: 3 });
  await importPdf(page, original, 'Lecture 1.pdf');
  await expect(label(page)).toHaveText('Page 1 of 3');
  // The PDF page is rendered behind the ink (yellow rectangle from the fixture)
  await expect.poll(async () => (await canvasStats(page, 'yellow')).n).toBeGreaterThan(500);

  await drawRedLine(page, 612, [100, 200], [300, 200]);
  await expect.poll(() => storedStrokes(page)).toBe(1);
  await waitSaved(page);
  const hashBefore = await storedPdfHash(page);
  expect(hashBefore).toBe(sha(original));

  // Reload: ink and background both come back
  await page.reload();
  await expect(page.locator('.canvas-host').first()).toBeVisible();
  await expect.poll(async () => (await canvasStats(page, 'red')).n).toBeGreaterThan(50);
  await expect.poll(async () => (await canvasStats(page, 'yellow')).n).toBeGreaterThan(500);

  // Export annotated PDF
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export annotated PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Lecture 1-annotated.pdf');
  const exported = readFileSync((await download.path())!);
  expect((await PDFDocument.load(exported)).getPageCount()).toBe(3);
  const r = await renderExported(page, exported, 1);
  expect(r.pages).toBe(3);
  expect(r.yellow).toBeGreaterThan(500); // original content preserved
  expect(r.n).toBeGreaterThan(100); // red ink present
  expect(Math.abs(r.cx - 200)).toBeLessThan(6); // centred where we drew it (page space x=200)
  expect(Math.abs(r.cy - 200)).toBeLessThan(6);

  // Export original: byte-identical
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export original PDF' }).click(),
  ]);
  expect(sha(readFileSync((await dl2.path())!))).toBe(sha(original));

  // Annotations only: has the ink but not the page content
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const [dl3] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export annotations only' }).click(),
  ]);
  const only = await renderExported(page, readFileSync((await dl3.path())!), 1);
  expect(only.n).toBeGreaterThan(100);
  expect(only.yellow).toBe(0);

  // Remove all annotations: ink gone, PDF blob unchanged; undo brings it back
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await page.getByRole('menuitem', { name: 'Remove all annotations…' }).click();
  await page.getByRole('button', { name: 'Remove annotations' }).click();
  await expect.poll(async () => (await canvasStats(page, 'red')).n).toBe(0);
  await expect.poll(() => storedStrokes(page)).toBe(0);
  expect(await storedPdfHash(page)).toBe(hashBefore);
  await openPages(page);
  await page.getByRole('button', { name: 'Undo page change' }).click();
  await expect.poll(() => storedStrokes(page)).toBe(1);
  await expect.poll(async () => (await canvasStats(page, 'red')).n).toBeGreaterThan(50);
  expect(await storedPdfHash(page)).toBe(hashBefore);
});

test('rotated pages: ink stays aligned after export (rotate 90 and 180)', async ({ page }) => {
  const original = await makePdf({ pages: 2, rotate: [90, 180] });
  await importPdf(page, original, 'rotated.pdf');
  await expect(label(page)).toHaveText('Page 1 of 2');
  // page 1 is /Rotate 90: displayed 792 wide x 612 tall
  await drawRedLine(page, 792, [150, 120], [350, 120]);
  await expect.poll(() => storedStrokes(page)).toBe(1);
  await waitSaved(page);
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export annotated PDF' }).click(),
  ]);
  const exported = readFileSync((await download.path())!);
  const doc = await PDFDocument.load(exported);
  expect(doc.getPage(0).getRotation().angle).toBe(90);
  const r = await renderExported(page, exported, 1);
  expect(r.w).toBe(792);
  expect(Math.abs(r.cx - 250)).toBeLessThan(6);
  expect(Math.abs(r.cy - 120)).toBeLessThan(6);
});

test('outline: shows the PDF table of contents and jumps; go-to-page works; scanned PDFs render', async ({
  page,
}) => {
  const original = await makePdf({
    pages: 6,
    outline: [
      { title: 'Chapter 1', page: 0 },
      { title: 'Chapter 2', page: 3 },
    ],
  });
  await importPdf(page, original, 'book.pdf');
  await openPages(page);
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await page.getByRole('button', { name: /Chapter 2/ }).click();
  await expect(label(page)).toHaveText('Page 4 of 6');
  await page.getByLabel('Go to page number').fill('2');
  await page.getByLabel('Go to page number').press('Enter');
  await expect(label(page)).toHaveText('Page 2 of 6');

  const scanned = await makePdf({ pages: 2, scanned: true });
  await importPdf(page, scanned, 'scan.pdf');
  await expect.poll(async () => (await canvasStats(page, 'grey')).n).toBeGreaterThan(5000);
});

test('adding a blank page to a PDF includes it in the export', async ({ page }) => {
  const original = await makePdf({ pages: 2 });
  await importPdf(page, original, 'add.pdf');
  await page.getByRole('button', { name: '+ New page' }).click();
  await expect(label(page)).toHaveText(/Page \d of 3/);
  await expect
    .poll(async () => page.evaluate(() => document.querySelectorAll('.canvas-host').length))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export annotated PDF' }).click(),
  ]);
  const doc = await PDFDocument.load(readFileSync((await download.path())!));
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(2).getSize()).toMatchObject({ width: 612, height: 792 }); // inherits the PDF page size
});

test('rejects a non-PDF file with a clear message', async ({ page }) => {
  await page.goto('/library');
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles({
    name: 'fake.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('hello, this is not a pdf'),
  });
  await expect(page.getByRole('alert')).toContainText(/doesn.t look like a PDF/);
  await expect(page.getByText('Your library is empty')).toBeVisible();
});

test('200-page PDF: opens quickly, renders lazily, memory stays bounded (numbers logged)', async ({
  page,
}) => {
  const original = await makePdf({ pages: 200 });
  const t0 = Date.now();
  await importPdf(page, original, 'big.pdf');
  await expect(label(page)).toHaveText('Page 1 of 200');
  const openMs = Date.now() - t0;
  await expect.poll(async () => (await canvasStats(page, 'yellow')).n).toBeGreaterThan(500);

  const stats = await page.evaluate(
    () =>
      new Promise<{ frames: number; avg: number; worst: number; canvases: number; heapMB: number }>(
        (resolve) => {
          const sc = document.querySelector('.pages-scroller') as HTMLElement;
          const deltas: number[] = [];
          let last = performance.now();
          let steps = 0;
          const tick = (now: number) => {
            deltas.push(now - last);
            last = now;
            sc.scrollTop += 120;
            if (++steps < 400) requestAnimationFrame(tick);
            else
              setTimeout(() => {
                const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } })
                  .memory;
                resolve({
                  frames: deltas.length,
                  avg: deltas.reduce((a, b) => a + b, 0) / deltas.length,
                  worst: Math.max(...deltas),
                  canvases: document.querySelectorAll('.canvas-host canvas').length,
                  heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1,
                });
              }, 800);
          };
          requestAnimationFrame(tick);
        },
      ),
  );
  console.log(`PDF200 import+open=${openMs}ms ${JSON.stringify(stats)}`);
  expect(stats.canvases).toBeLessThanOrEqual(10);
  void hostBox;
});
