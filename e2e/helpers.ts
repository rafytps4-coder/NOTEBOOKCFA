import { expect, type Page } from '@playwright/test';

export async function createNotebook(page: Page, name = 'Draw test') {
  await page.goto('/library');
  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByLabel('Notebook name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.locator('.canvas-host')).toBeVisible();
}

export async function hostBox(page: Page) {
  const box = await page.locator('.canvas-host').boundingBox();
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
      const c = document.querySelectorAll<HTMLCanvasElement>('.canvas-host canvas')[0]!;
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
          const req = db.transaction('pages').objectStore('pages').getAll();
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
