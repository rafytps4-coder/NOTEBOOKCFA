import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  createNotebook,
  drawLine,
  hostBox,
  inkPixels,
  pageToScreen,
  storedImageAssets,
  storedObjects,
  storedStrokes,
  waitSaved,
} from './helpers';

const RED = path.join(process.cwd(), 'e2e', 'red.png');
const AREA = { x: 150, y: 150, w: 500, h: 300 };

async function pickTool(page: import('@playwright/test').Page, name: string, hint: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByText(hint)).toBeVisible(); // options panel for the tool is shown
}

test('text box: create, type, persist, edit, undo', async ({ page }) => {
  await createNotebook(page, 'Text');
  await pickTool(page, 'Text', 'Tap the page to add a text box');
  const b = await hostBox(page);
  await page.mouse.click(b.x + 200, b.y + 250);
  const ta = page.getByRole('textbox', { name: 'Text box' });
  await expect(ta).toBeVisible();
  await ta.fill('Hello notebook');
  await page.keyboard.press('Control+Enter'); // commit
  await expect(ta).toHaveCount(0);

  await expect.poll(() => storedObjects(page)).toHaveLength(1);
  expect((await storedObjects(page))[0]).toMatchObject({ type: 'text', text: 'Hello notebook' });
  await expect.poll(() => inkPixels(page, AREA)).toBeGreaterThan(40); // rendered on the canvas

  // Edit it: the new box selected the Select tool; double-tap the text
  const o = (await storedObjects(page))[0]!;
  const pt = await pageToScreen(page, o.cx, o.cy);
  await page.mouse.dblclick(pt.x, pt.y);
  await expect(ta).toBeVisible();
  await ta.fill('Changed text');
  await page.keyboard.press('Control+Enter');
  await expect.poll(async () => (await storedObjects(page))[0]?.text).toBe('Changed text');

  // Undo twice: edit, then creation
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await storedObjects(page))[0]?.text).toBe('Hello notebook');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => storedObjects(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  await waitSaved(page);
  await page.reload();
  await expect.poll(() => inkPixels(page, AREA)).toBeGreaterThan(40);
  expect((await storedObjects(page))[0]).toMatchObject({ text: 'Changed text' });
});

test('an empty text box is discarded', async ({ page }) => {
  await createNotebook(page, 'Empty text');
  await pickTool(page, 'Text', 'Tap the page to add a text box');
  const b = await hostBox(page);
  await page.mouse.click(b.x + 200, b.y + 250);
  await expect(page.getByRole('textbox', { name: 'Text box' })).toBeVisible();
  await page.mouse.click(b.x + 600, b.y + 700); // tap elsewhere without typing
  await page.waitForTimeout(300);
  expect(await storedObjects(page)).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('shape: draw, auto-select, resize, rotate, move, delete, undo; survives reload', async ({
  page,
}) => {
  await createNotebook(page, 'Shapes');
  await pickTool(page, 'Shapes', 'Drag on the page to draw');
  await page.getByRole('button', { name: 'Rectangle' }).click();
  const b = await hostBox(page);
  await page.mouse.move(b.x + 200, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(b.x + 400, b.y + 300, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => storedObjects(page)).toHaveLength(1);
  const rect0 = (await storedObjects(page))[0]!;
  expect(rect0).toMatchObject({ type: 'shape', shape: 'rect' });
  expect(rect0.w).toBeGreaterThan(150);
  await expect.poll(() => inkPixels(page, AREA)).toBeGreaterThan(100);

  // Now in Select with the rectangle selected: resize via the SE handle
  await expect(page.getByText('Shape (rect)')).toBeVisible();
  const k = (await pageToScreen(page, 0, 0)).k;
  const se = await pageToScreen(page, rect0.cx + rect0.w / 2, rect0.cy + rect0.h / 2);
  await page.mouse.move(se.x, se.y);
  await page.mouse.down();
  await page.mouse.move(se.x + 100 * k, se.y + 60 * k, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await storedObjects(page))[0]!.w).toBeGreaterThan(rect0.w + 80);
  const rect1 = (await storedObjects(page))[0]!;

  // Rotate: drag the rotate handle (above the top edge) to the right of the centre
  const top = await pageToScreen(page, rect1.cx, rect1.cy - rect1.h / 2 - 28 / k);
  const c = await pageToScreen(page, rect1.cx, rect1.cy);
  await page.mouse.move(top.x, top.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 200, c.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await storedObjects(page))[0]!.rot)).toBeGreaterThan(0.5);

  // Move: drag from the centre
  const before = (await storedObjects(page))[0]!;
  const mid = await pageToScreen(page, before.cx, before.cy);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 50, mid.y + 50, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await storedObjects(page))[0]!.cx).toBeGreaterThan(before.cx + 20);

  // Recolour the outline (undoable), then delete and undo the delete
  await page.getByRole('button', { name: 'Outline colour #d62828' }).click();
  await expect.poll(async () => (await storedObjects(page))[0]!.stroke).toBe('#d62828');
  await page
    .getByRole('group', { name: 'Selection' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect.poll(() => storedObjects(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => storedObjects(page)).toHaveLength(1);

  await waitSaved(page);
  await page.reload();
  await expect.poll(() => storedObjects(page)).toHaveLength(1);
});

test('lasso selects ink and an object together and moves them as one', async ({ page }) => {
  await createNotebook(page, 'Mixed');
  await pickTool(page, 'Shapes', 'Drag on the page to draw');
  await page.getByRole('button', { name: 'Ellipse' }).click();
  let b = await hostBox(page);
  await page.mouse.move(b.x + 300, b.y + 300);
  await page.mouse.down();
  await page.mouse.move(b.x + 380, b.y + 360, { steps: 5 });
  await page.mouse.up();
  await pickTool(page, 'Pen', 'Snap to shapes');
  await drawLine(page, 250, 250, 450, 250);
  await expect.poll(() => storedStrokes(page)).toBe(1);

  await page.getByRole('button', { name: 'Lasso select' }).click();
  await expect(page.getByText('Tap an object, or draw a loop')).toBeVisible();
  b = await hostBox(page);
  await page.mouse.move(b.x + 200, b.y + 200);
  await page.mouse.down();
  for (const [x, y] of [
    [500, 200],
    [500, 420],
    [200, 420],
    [200, 205],
  ] as const) {
    await page.mouse.move(b.x + x, b.y + y, { steps: 4 });
  }
  await page.mouse.up();
  const before = (await storedObjects(page))[0]!;
  await page.mouse.move(b.x + 340, b.y + 330);
  await page.mouse.down();
  await page.mouse.move(b.x + 340, b.y + 430, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await storedObjects(page))[0]!.cy).toBeGreaterThan(before.cy + 40);
  await waitSaved(page);
  expect(await storedStrokes(page)).toBe(1);
});

test('image: insert, stored as asset, crop, delete; asset only removed by Clean up storage', async ({
  page,
}) => {
  await createNotebook(page, 'Images');
  const b = await hostBox(page);
  await page.mouse.click(b.x + 50, b.y + 50); // activate the page (pen tool: a dot)
  await page.locator('input[type=file]').setInputFiles(RED);
  await expect
    .poll(() => storedObjects(page).then((o) => o.filter((x) => x.type === 'image').length))
    .toBe(1);
  expect(await storedImageAssets(page)).toHaveLength(1);
  const area = { x: 310, y: 525, w: 170, h: 70 }; // 200x100 image centred on the page
  await expect
    .poll(() =>
      page.evaluate((r) => {
        const c = document.querySelectorAll<HTMLCanvasElement>('.canvas-host canvas')[0]!;
        const k = c.width / c.clientWidth;
        const d = c.getContext('2d')!.getImageData(r.x * k, r.y * k, r.w * k, r.h * k).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i]! > 180 && d[i + 1]! < 80 && d[i + 2]! < 80) n++;
        return n;
      }, area),
    )
    .toBeGreaterThan(1000);

  // Crop via the options panel
  await page.getByRole('button', { name: 'Crop…' }).click();
  const w0 = (await storedObjects(page)).find((o) => o.type === 'image')!.w;
  await page.getByLabel(/Trim left/).fill('50');
  await expect
    .poll(async () => (await storedObjects(page)).find((o) => o.type === 'image')!.w)
    .toBeLessThan(w0 * 0.6);

  // Delete the image object: its asset stays (undo may need it) …
  await page
    .getByRole('group', { name: 'Selection' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect
    .poll(async () => (await storedObjects(page)).filter((o) => o.type === 'image').length)
    .toBe(0);
  await waitSaved(page);
  expect(await storedImageAssets(page)).toHaveLength(1);

  // … until the user runs Clean up storage
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Clean up storage' }).click();
  await expect(page.getByText(/Removed 1 unused image/)).toBeVisible();
  expect(await storedImageAssets(page)).toHaveLength(0);
});

test('shape snapping (opt-in): holding still turns a rough line into a clean line object', async ({
  page,
}) => {
  await createNotebook(page, 'Snap');
  await page.getByLabel(/Snap to shapes/).check();
  const b = await hostBox(page);
  await page.mouse.move(b.x + 200, b.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++)
    await page.mouse.move(b.x + 200 + i * 12, b.y + 300 + (i % 2), { steps: 1 });
  await page.waitForTimeout(900); // hold still
  await page.mouse.up();
  await expect.poll(() => storedObjects(page)).toHaveLength(1);
  expect((await storedObjects(page))[0]).toMatchObject({ type: 'shape', shape: 'line' });
  expect(await storedStrokes(page)).toBe(0);
});

test('without the snap setting a held stroke stays freehand ink', async ({ page }) => {
  await createNotebook(page, 'NoSnap');
  const b = await hostBox(page);
  await page.mouse.move(b.x + 200, b.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++)
    await page.mouse.move(b.x + 200 + i * 12, b.y + 300 + (i % 2), { steps: 1 });
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect.poll(() => storedStrokes(page)).toBe(1);
  expect(await storedObjects(page)).toHaveLength(0);
});
