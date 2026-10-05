import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { expect, test } from '@playwright/test';
import { makePdf } from '../src/test-utils/pdfFixtures';
import {
  hostBox,
  inkPixels,
  openPages,
  pageCount,
  storedImageAssets,
  storedObjects,
  storedStrokes,
  waitSaved,
} from './helpers';

/**
 * The Core MVP checklist, end to end, in one continuous session:
 * folder → notebook → many pages → draw → type text → insert image → import PDF → annotate →
 * export → search → reload (data intact) → dark mode → portrait/landscape.
 */
test('Core MVP checklist: the whole journey', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(
    () => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker,
  );
  const nav = page.getByRole('navigation', { name: 'Main' });
  // Privacy: nothing the app does may contact another origin.
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (
      !['localhost', '127.0.0.1'].includes(u.hostname) &&
      !['data:', 'blob:'].includes(u.protocol)
    )
      foreign.push(r.url());
  });

  // 1. folder → notebook
  await page.goto('/library');
  await expect(page.getByText('Your library is empty')).toBeVisible();
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill('Finance');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: /^Finance/ }).click();
  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByLabel('Notebook name').fill('Derivatives notes');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.canvas-host').first()).toBeVisible();

  // 2. many pages (the first plus 29 more)
  for (let i = 0; i < 29; i++) await page.getByRole('button', { name: '+ New page' }).click();
  await expect.poll(() => pageCount(page), { timeout: 30_000 }).toBe(30);
  await expect(page.getByText(/Page \d+ of 30/)).toBeVisible();
  await openPages(page);
  await page.getByRole('button', { name: 'Go to page 1', exact: true }).click();
  await expect(page.getByText('Page 1 of 30')).toBeVisible();

  // 3. draw with (simulated) pen pointer events: varying pressure
  const penStroke = (id: number) =>
    page.evaluate((id) => {
      const host = document.querySelector('.canvas-host')!;
      const r = host.getBoundingClientRect();
      const ev = (type: string, x: number, y: number, p: number) =>
        host.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: 'pen',
            clientX: r.left + x,
            clientY: r.top + y,
            pressure: p,
            isPrimary: true,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
          }),
        );
      ev('pointerdown', 150, 160, 0.2);
      for (let i = 1; i <= 20; i++)
        ev('pointermove', 150 + i * 14, 160 + Math.sin(i / 3) * 18, 0.2 + (i % 5) * 0.12);
      ev('pointerup', 430, 160, 0.1);
    }, id);
  // Live canvases are (re)mounted shortly after scrolling stops; wait for page 1's canvas to be the first.
  await expect.poll(async () => (await hostBox(page)).y).toBeLessThan(500);
  await page.waitForTimeout(500);
  await penStroke(5);
  await expect.poll(() => storedStrokes(page)).toBe(1);
  await expect.poll(() => inkPixels(page, { x: 100, y: 100, w: 500, h: 150 })).toBeGreaterThan(50);

  // 4. typed text
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  const b = await hostBox(page);
  await page.mouse.click(b.x + 150, b.y + 300);
  await page
    .getByRole('textbox', { name: 'Text box' })
    .fill('Delta hedging reduces directional risk');
  await page.keyboard.press('Control+Enter');
  await expect
    .poll(async () => (await storedObjects(page)).some((o) => o.type === 'text'))
    .toBe(true);

  // 5. insert an image
  await page
    .locator('input[type=file][accept="image/*"]')
    .setInputFiles(path.join(process.cwd(), 'e2e', 'red.png'));
  await expect
    .poll(async () => (await storedObjects(page)).some((o) => o.type === 'image'))
    .toBe(true);
  expect(await storedImageAssets(page)).toHaveLength(1);
  await waitSaved(page);

  // 6. import a PDF, annotate it
  await page.getByRole('link', { name: '← Library' }).click();
  await nav.getByRole('link', { name: 'Library' }).click();
  const pdf = await makePdf({
    pages: 4,
    texts: ['alpha', 'beta', 'options pricing theorem', 'delta'],
  });
  await page
    .locator('input[type=file][accept*="pdf"]')
    .setInputFiles({ name: 'Options.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await expect(page.getByText('Page 1 of 4')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Colour #d62828' }).click();
  const pb = await hostBox(page);
  await page.mouse.move(pb.x + 80, pb.y + 200);
  await page.mouse.down();
  await page.mouse.move(pb.x + 260, pb.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await storedStrokes(page)) >= 2).toBe(true); // + the notebook's stroke

  // 7. export the annotated PDF
  await waitSaved(page);
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export annotated PDF' }).click(),
  ]);
  const exported = await PDFDocument.load(readFileSync((await download.path())!));
  expect(exported.getPageCount()).toBe(4);

  // 8. search: typed text and PDF text
  await page.getByRole('link', { name: '← Library' }).click();
  await nav.getByRole('link', { name: 'Search' }).click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('hedging');
  await expect(page.getByRole('link', { name: /Delta hedging/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('searchbox', { name: 'Search' }).fill('theorem');
  await expect(page.getByRole('link', { name: /options pricing theorem/ })).toBeVisible({
    timeout: 20_000,
  });

  // 9. reload: everything is still there
  await page.reload();
  await page.goto('/library');
  await expect(page.getByRole('button', { name: /^Finance/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Options/ })).toBeVisible();
  await page.getByRole('button', { name: /^Finance/ }).click();
  await page.getByRole('button', { name: /^Derivatives notes/ }).click();
  await expect(page.getByText(/Page \d+ of 30/)).toBeVisible();
  await expect.poll(() => storedStrokes(page)).toBeGreaterThanOrEqual(2);
  const objs = await storedObjects(page);
  expect(
    objs.some((o) => o.type === 'text' && o.text === 'Delta hedging reduces directional risk'),
  ).toBe(true);
  expect(objs.some((o) => o.type === 'image')).toBe(true);

  // 10. dark mode
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const lum =
    bg
      .match(/\d+/g)!
      .slice(0, 3)
      .map(Number)
      .reduce((a, c) => a + c, 0) / 3;
  expect(lum).toBeLessThan(60);
  await page.goto('/library');
  await page.getByRole('button', { name: /^Finance/ }).click();
  await page.getByRole('button', { name: /^Derivatives notes/ }).click();
  await expect(page.locator('.canvas-host').first()).toBeVisible();
  // the paper stays white so ink reads as ink
  await expect.poll(() => inkPixels(page, { x: 100, y: 100, w: 500, h: 150 })).toBeGreaterThan(50);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'System', exact: true }).click();

  // 11. portrait ↔ landscape
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/library');
  await page.getByRole('button', { name: /^Finance/ }).click();
  await page.getByRole('button', { name: /^Derivatives notes/ }).click();
  await expect(page.locator('.canvas-host').first()).toBeVisible();
  const before = await storedStrokes(page);
  const lb = await hostBox(page);
  await page.mouse.move(lb.x + 120, lb.y + 220);
  await page.mouse.down();
  await page.mouse.move(lb.x + 300, lb.y + 220, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => storedStrokes(page)).toBe(before + 1);
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('.canvas-host').first()).toBeVisible();
  await waitSaved(page);
  expect(foreign, 'requests to other origins').toEqual([]);
});
