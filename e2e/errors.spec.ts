import { expect, test, type Page } from '@playwright/test';
import { createNotebook, drawLine, hostBox, storedStrokes, waitSaved } from './helpers';

async function pageIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const o = indexedDB.open('notebook');
        o.onerror = () => reject(o.error);
        o.onsuccess = () => {
          const db = o.result;
          const req = db.transaction('pages').objectStore('pages').getAllKeys();
          req.onsuccess = () => {
            db.close();
            resolve(req.result as string[]);
          };
        };
      }),
  );
}

async function overwriteContent(page: Page, pageId: string, value: unknown) {
  await page.evaluate(
    ([id, v]) =>
      new Promise<void>((resolve, reject) => {
        const o = indexedDB.open('notebook');
        o.onerror = () => reject(o.error);
        o.onsuccess = () => {
          const db = o.result;
          const tx = db.transaction('pageContent', 'readwrite');
          tx.objectStore('pageContent').put({ pageId: id, ...(v as object) });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
    [pageId, value] as const,
  );
}

test('storage full: a clear message, nothing is lost, saving recovers when space returns', async ({
  page,
}) => {
  await createNotebook(page, 'Full disk');
  // Make every write to page content fail like a full disk
  await page.evaluate(() => {
    const w = window as unknown as {
      __orig?: typeof IDBObjectStore.prototype.put;
      __full?: boolean;
    };
    w.__orig = IDBObjectStore.prototype.put;
    w.__full = true;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...a: Parameters<typeof IDBObjectStore.prototype.put>
    ) {
      if (w.__full && this.name === 'pageContent')
        throw new DOMException('Out of space', 'QuotaExceededError');
      return w.__orig!.apply(this, a);
    };
  });
  await drawLine(page, 220, 250, 480, 250);
  await expect(page.getByText(/out of storage space/)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.save-state')).toHaveText('Storage full: not saved');
  expect(await storedStrokes(page)).toBe(0);

  // Space comes back: the next change retries and everything (including the first stroke) is saved
  await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = false));
  await drawLine(page, 220, 300, 480, 300);
  await waitSaved(page);
  await expect(page.getByText(/out of storage space/)).toHaveCount(0);
  await expect.poll(() => storedStrokes(page)).toBe(2);
});

test('damaged page data: the page still opens, valid ink is kept, the user is told', async ({
  page,
}) => {
  await createNotebook(page, 'Damaged');
  await drawLine(page, 220, 250, 480, 250);
  await waitSaved(page);
  const [id] = await pageIds(page);
  const good = await page.evaluate(
    (pid) =>
      new Promise<unknown>((resolve) => {
        const o = indexedDB.open('notebook');
        o.onsuccess = () => {
          const req = o.result.transaction('pageContent').objectStore('pageContent').get(pid);
          req.onsuccess = () => {
            o.result.close();
            resolve(req.result);
          };
        };
      }),
    id!,
  );
  const strokes = (good as { strokes: unknown[] }).strokes;
  await overwriteContent(page, id!, {
    strokes: [...strokes, { id: 'broken', points: 'nope' }, null],
    objects: [],
  });
  await page.reload();
  await expect(page.locator('.canvas-host').first()).toBeVisible();
  await expect(page.getByText(/partly damaged: 2 items were skipped/)).toBeVisible();
  // The valid stroke survived; the raw damaged data is kept in a safety copy
  await expect.poll(() => storedStrokes(page)).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText(/partly damaged/)).toHaveCount(0);
  const b = await hostBox(page);
  void b;
});

test('completely damaged page data falls back to the last good copy', async ({ page }) => {
  await createNotebook(page, 'Last good');
  await drawLine(page, 220, 250, 480, 250);
  await waitSaved(page);
  await drawLine(page, 220, 320, 480, 320); // second save snapshots the first as the last good copy
  await expect.poll(() => storedStrokes(page)).toBe(2);
  await waitSaved(page);
  const [id] = await pageIds(page);
  await overwriteContent(page, id!, { strokes: 'garbage', objects: 7 });
  await page.reload();
  await expect(page.getByText(/last good copy was restored/)).toBeVisible();
  await expect.poll(() => storedStrokes(page)).toBeGreaterThanOrEqual(1);
});

test('blocked storage: a friendly explanation and a retry, not a blank page', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Storage isn’t available' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByText(/private or “lockdown” browsing/i)).toBeVisible();
});
