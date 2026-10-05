import { expect, test } from '@playwright/test';
import {
  createNotebook,
  drawLine,
  inkPixels,
  openPages,
  pageCount,
  seedNotebook,
  storedStrokes,
} from './helpers';

const label = (page: import('@playwright/test').Page) => page.getByText(/^Page \d+ of \d+$/);

test('add, duplicate, move, delete+undo, bookmark, template change; all survive reload', async ({
  page,
}) => {
  await createNotebook(page, 'Pages');
  await expect(label(page)).toHaveText('Page 1 of 1');

  // Ink on page 1
  await drawLine(page, 220, 250, 480, 250);
  await expect.poll(() => inkPixels(page, { x: 200, y: 200, w: 300, h: 100 })).toBeGreaterThan(50);

  // Add pages
  await page.getByRole('button', { name: '+ New page' }).click();
  await expect(label(page)).toHaveText(/Page \d of 2/);
  await page.getByRole('button', { name: '+ New page' }).click();
  await expect(label(page)).toHaveText(/Page \d of 3/);
  expect(await pageCount(page)).toBe(3);

  await openPages(page);
  // Sidebar: duplicate page 1 (has ink) -> 4 pages, copy is page 2
  await page.getByRole('button', { name: 'Page 1 actions' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate page' }).click();
  await expect(label(page)).toHaveText(/Page \d of 4/);
  await expect.poll(() => storedStrokes(page)).toBe(2); // original + copy

  // Move page 2 to position 4 via the dialog
  await page.getByRole('button', { name: 'Page 2 actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to position…' }).click();
  await page.getByRole('textbox', { name: /New position/ }).fill('4');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect
    .poll(async () => page.getByRole('button', { name: /^Go to page 4/ }).count())
    .toBe(1);

  // Delete page 3 (confirmation), then undo it
  await page.getByRole('button', { name: 'Page 3 actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete page…' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await pageCount(page)).toBe(4);
  await page.getByRole('button', { name: 'Page 3 actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete page…' }).click();
  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect.poll(() => pageCount(page)).toBe(3);
  await page.getByRole('button', { name: 'Undo page change' }).click();
  await expect.poll(() => pageCount(page)).toBe(4);

  // Bookmark page 1 and filter
  await page.getByRole('button', { name: 'Page 1 actions' }).click();
  await page.getByRole('menuitem', { name: 'Bookmark', exact: true }).click();
  await page.getByRole('button', { name: '★ Bookmarks' }).click();
  await expect(page.getByRole('button', { name: /^Go to page \d/ })).toHaveCount(1);
  await page.getByRole('button', { name: '★ Bookmarks' }).click();

  // Template change on page 1: ink untouched
  await page.getByRole('button', { name: /^Go to page 1/ }).click();
  await expect(label(page)).toHaveText(/Page 1 of 4/);
  await page.getByRole('button', { name: 'Page style' }).click();
  await page.getByLabel('Template').selectOption('grid');
  await page.getByRole('button', { name: 'Done' }).click();
  // (zoom changed when the sidebar opened, so look at a generous area)
  await expect.poll(() => inkPixels(page, { x: 100, y: 120, w: 600, h: 200 })).toBeGreaterThan(50);

  await expect(page.locator('.save-state', { hasText: /^Saved$/ })).toBeVisible({ timeout: 5000 });
  await page.reload();
  await expect(label(page)).toHaveText(/Page \d of 4/);
  await expect.poll(() => storedStrokes(page)).toBe(2);
  await openPages(page);
  await expect(page.getByRole('button', { name: /^Go to page 1, bookmarked/ })).toBeVisible();
});

test('single-page mode with keyboard navigation and page-count guard', async ({ page }) => {
  await createNotebook(page, 'Single');
  await page.getByRole('button', { name: 'Single page' }).click();
  await openPages(page);
  await page.keyboard.press('Control+Enter'); // new page after current
  await expect(label(page)).toHaveText('Page 2 of 2');
  await page.keyboard.press('PageUp');
  await expect(label(page)).toHaveText('Page 1 of 2');
  await page.keyboard.press('PageDown');
  await expect(label(page)).toHaveText('Page 2 of 2');
  await page.getByRole('button', { name: 'Page 2 actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete page…' }).click();
  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect.poll(() => pageCount(page)).toBe(1);
  await page.getByRole('button', { name: 'Page 1 actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete page…' }).click();
  await expect(page.getByText('A notebook always keeps at least one page')).toBeVisible();
});

test('120-page notebook: lazy canvases and ink on a far page persists', async ({ page }) => {
  const id = await seedNotebook(page, 120, 'Big');
  await page.goto(`/doc/${id}`);
  await expect(label(page)).toHaveText(/Page 1 of 120/);
  const canvases = await page.locator('.canvas-host canvas').count();
  expect(canvases).toBeLessThanOrEqual(10); // only pages near the viewport are live

  // jump to page 100 through the sidebar-less navigation: scroll the scroller
  await page.evaluate(() => {
    const sc = document.querySelector('.pages-scroller')!;
    sc.scrollTop = 99 * (1123 * 1.01 + 16);
  });
  await expect.poll(async () => label(page).textContent()).toMatch(/Page (99|100|101) of 120/);
  const sc = (await page.locator('.pages-scroller').boundingBox())!;
  await expect
    .poll(() =>
      page.evaluate(
        ([x, y]) => document.elementFromPoint(x!, y!)?.closest('.canvas-host') !== null,
        [sc.x + sc.width / 2, sc.y + sc.height / 2],
      ),
    )
    .toBe(true); // the page under the pen has become live
  const cx = sc.x + sc.width / 2;
  const cy = sc.y + sc.height / 2;
  await page.mouse.move(cx - 100, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.save-state', { hasText: /^Saved$/ })).toBeVisible({ timeout: 5000 });
  await expect.poll(() => storedStrokes(page)).toBe(1);
  expect(await page.locator('.canvas-host canvas').count()).toBeLessThanOrEqual(10);
});

test('500-page notebook stays responsive (numbers are logged)', async ({ page }) => {
  const id = await seedNotebook(page, 500, 'Huge');
  const t0 = Date.now();
  await page.goto(`/doc/${id}`);
  await openPages(page);
  await expect(label(page)).toHaveText(/Page 1 of 500/);
  await expect(page.locator('.page-item').first()).toBeVisible();
  const openMs = Date.now() - t0;

  const stats = await page.evaluate(
    () =>
      new Promise<{
        frames: number;
        worst: number;
        avg: number;
        canvases: number;
        items: number;
        longTasks: number;
      }>((resolve) => {
        const sc = document.querySelector('.pages-scroller') as HTMLElement;
        let longTasks = 0;
        new PerformanceObserver((l) => (longTasks += l.getEntries().length)).observe({
          entryTypes: ['longtask'],
        });
        const deltas: number[] = [];
        let last = performance.now();
        let steps = 0;
        const tick = (now: number) => {
          deltas.push(now - last);
          last = now;
          sc.scrollTop += 700; // fast scroll through ~600 px per frame
          if (++steps < 300) requestAnimationFrame(tick);
          else
            resolve({
              frames: deltas.length,
              worst: Math.max(...deltas),
              avg: deltas.reduce((a, b) => a + b, 0) / deltas.length,
              canvases: document.querySelectorAll('.canvas-host canvas').length,
              items: document.querySelectorAll('.page-item').length,
              longTasks,
            });
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(`PERF500 open=${openMs}ms ${JSON.stringify(stats)}`);
  expect(stats.canvases).toBeLessThanOrEqual(10);
  expect(stats.items).toBe(500);
  expect(stats.avg).toBeLessThan(50);
});

test('default template and size from Settings apply to a new notebook; later pages inherit', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByLabel('Template').selectOption('ruled');
  await page.locator('label', { hasText: /^Size/ }).locator('select').selectOption('Letter');
  await page.getByLabel('Orientation').selectOption('landscape');
  await page.waitForTimeout(700); // let the settings writes land
  await createNotebook(page, 'Defaults');
  await page.getByRole('button', { name: 'Page style' }).click();
  await expect(page.getByLabel('Template')).toHaveValue('ruled');
  await expect(page.locator('.style-panel').getByLabel('Size')).toHaveValue('Letter');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: '+ New page' }).click();
  await expect(label(page)).toHaveText(/Page \d of 2/);
  await page.getByRole('button', { name: 'Page style' }).click();
  await expect(page.getByLabel('Template')).toHaveValue('ruled');
});
