import { expect, type Page } from '@playwright/test';

export async function createNotebook(page: Page, name = 'Draw test') {
  await page.goto('/library');
  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByLabel('Notebook name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.locator('.canvas-host').first()).toBeVisible();
}

export async function openPages(page: Page) {
  const btn = page.getByRole('button', { name: 'Pages', exact: true });
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
}

export async function hostBox(page: Page) {
  const box = await page.locator('.canvas-host').first().boundingBox();
  if (!box) throw new Error('no canvas host');
  return box;
}

/** Count dark (ink-like) pixels on the committed layer inside a screen rect (CSS px, host-relative). */
export async function inkPixels(
  page: Page,
  r: { x: number; y: number; w: number; h: number },
  test: 'dark' | 'colour' = 'dark',
) {
  return page.evaluate(
    ({ r, test }) => {
      const c = document.querySelectorAll<HTMLCanvasElement>('.canvas-host canvas')[0];
      if (!c || !c.clientWidth) return 0;
      const k = c.width / c.clientWidth;
      const d = c.getContext('2d')!.getImageData(r.x * k, r.y * k, r.w * k, r.h * k).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [R, G, B, A] = [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
        if (A < 200) continue;
        if (test === 'dark' ? R < 110 && G < 110 && B < 110 : R > 235 && G > 200 && B < 215) n++;
      }
      return n;
    },
    { r, test },
  );
}

/** Read persisted strokes straight from IndexedDB. */
export async function storedStrokes(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('notebook');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('pageContent').objectStore('pageContent').getAll();
          req.onsuccess = () => {
            db.close();
            resolve(
              (req.result as { strokes: unknown[] }[]).reduce((n, p) => n + p.strokes.length, 0),
            );
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

export async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  const b = await hostBox(page);
  await page.mouse.move(b.x + x0, b.y + y0);
  await page.mouse.down();
  await page.mouse.move(b.x + (x0 + x1) / 2, b.y + (y0 + y1) / 2, { steps: 6 });
  await page.mouse.move(b.x + x1, b.y + y1, { steps: 6 });
  await page.mouse.up();
}

/** Insert a notebook with `n` empty pages straight into IndexedDB (schema v2). Returns the doc id. */
export async function seedNotebook(page: Page, n: number, title = 'Seeded') {
  await page.goto('/library'); // makes the app create the database
  await page.waitForSelector('h1');
  return page.evaluate(
    ({ n, title }) =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('notebook');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['documents', 'pages', 'pageContent'], 'readwrite');
          const docId = crypto.randomUUID();
          const t = Date.now();
          tx.objectStore('documents').add({
            id: docId,
            kind: 'notebook',
            title,
            folderId: 'root',
            favorite: false,
            createdAt: t,
            updatedAt: t,
            lastOpenedAt: null,
            deletedAt: null,
          });
          for (let i = 0; i < n; i++) {
            const id = crypto.randomUUID();
            tx.objectStore('pages').add({
              id,
              documentId: docId,
              order: i,
              width: 794,
              height: 1123,
              sizeName: 'A4',
              template: { kind: i % 3 === 0 ? 'ruled' : 'blank', spacing: 28, color: '#c5cfdc' },
              background: '#ffffff',
              bookmarked: false,
              deletedAt: null,
              createdAt: t,
              updatedAt: t,
            });
            tx.objectStore('pageContent').add({ pageId: id, strokes: [] });
          }
          tx.oncomplete = () => {
            db.close();
            resolve(docId);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { n, title },
  );
}

export async function pageCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('notebook');
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('pages').objectStore('pages').getAll();
          req.onsuccess = () => {
            db.close();
            resolve(
              (req.result as { deletedAt: number | null }[]).filter((p) => p.deletedAt === null)
                .length,
            );
          };
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
}

type StoredObject = Record<string, unknown> & {
  id: string;
  type: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
};

async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('notebook');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction(name).objectStore(name).getAll();
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
          req.onerror = () => reject(req.error);
        };
      }) as Promise<never>,
    store,
  ) as Promise<T[]>;
}

export async function storedObjects(page: Page): Promise<StoredObject[]> {
  const rows = await readStore<{ objects?: StoredObject[] }>(page, 'pageContent');
  return rows.flatMap((r) => r.objects ?? []);
}

export async function storedImageAssets(page: Page) {
  const rows = await readStore<{ id: string; kind: string; size: number }>(page, 'assets');
  return rows.filter((a) => a.kind === 'image');
}

/** Page-space point → screen coordinates of the first page (`pageWidth` defaults to A4: 794 px). */
export async function pageToScreen(page: Page, x: number, y: number, pageWidth = 794) {
  const box = await hostBox(page);
  const k = box.width / pageWidth;
  return { x: box.x + x * k, y: box.y + y * k, k };
}

export async function waitSaved(page: Page) {
  await expect(page.locator('.save-state', { hasText: /^Saved$/ })).toBeVisible({ timeout: 6000 });
}
