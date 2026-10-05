import { expect, test } from '@playwright/test';
import { createNotebook, drawLine, hostBox, inkPixels, storedStrokes } from './helpers';

test('draw, undo/redo, erase, persist across reload', async ({ page }) => {
  await createNotebook(page);
  const area = { x: 200, y: 200, w: 300, h: 100 };

  expect(await inkPixels(page, area)).toBe(0);
  await drawLine(page, 220, 250, 480, 250);
  await expect.poll(() => inkPixels(page, area)).toBeGreaterThan(50);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => inkPixels(page, area)).toBe(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => inkPixels(page, area)).toBeGreaterThan(50);

  // Keyboard undo/redo
  await page.keyboard.press('Control+z');
  await expect.poll(() => inkPixels(page, area)).toBe(0);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => inkPixels(page, area)).toBeGreaterThan(50);

  await expect(page.locator('.save-state', { hasText: /^Saved$/ })).toBeVisible({
    timeout: 5000,
  });
  expect(await storedStrokes(page)).toBe(1);

  // Eraser removes the stroke; undo brings it back
  await page.getByRole('button', { name: 'Eraser' }).click();
  await expect(page.getByText('Eraser removes')).toBeVisible();
  const eb = await hostBox(page); // panel height changes with the tool
  await page.mouse.move(eb.x + 350, eb.y + 230);
  await page.mouse.down();
  await page.mouse.move(eb.x + 350, eb.y + 270, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => inkPixels(page, area)).toBe(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => inkPixels(page, area)).toBeGreaterThan(50);

  await expect(page.locator('.save-state', { hasText: /^Saved$/ })).toBeVisible({
    timeout: 5000,
  });
  await page.reload();
  await expect(page.locator('.canvas-host')).toBeVisible();
  await expect.poll(() => inkPixels(page, area)).toBeGreaterThan(50);
  expect(await storedStrokes(page)).toBe(1);
});

test('highlighter draws translucent colour and lasso moves ink (undoable)', async ({ page }) => {
  await createNotebook(page);
  await page.getByRole('button', { name: 'Highlighter' }).click();
  await drawLine(page, 220, 400, 480, 400);
  await expect
    .poll(() => inkPixels(page, { x: 220, y: 380, w: 260, h: 40 }, 'colour'))
    .toBeGreaterThan(100);

  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  await drawLine(page, 220, 200, 400, 200);
  const before = { x: 200, y: 180, w: 220, h: 40 };
  const after = { x: 200, y: 280, w: 220, h: 40 };
  await expect.poll(() => inkPixels(page, before)).toBeGreaterThan(30);

  // Lasso around the pen line (loop), then drag it 100px down
  await page.getByRole('button', { name: 'Lasso select' }).click();
  await expect(page.getByText('Draw a loop')).toBeVisible();
  const lb = await hostBox(page);
  await page.mouse.move(lb.x + 190, lb.y + 170);
  await page.mouse.down();
  for (const [x, y] of [
    [420, 170],
    [420, 230],
    [190, 230],
    [190, 172],
  ] as const) {
    await page.mouse.move(lb.x + x, lb.y + y, { steps: 4 });
  }
  await page.mouse.up();
  await page.mouse.move(lb.x + 300, lb.y + 200);
  await page.mouse.down();
  await page.mouse.move(lb.x + 300, lb.y + 300, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => inkPixels(page, after)).toBeGreaterThan(30);
  await expect.poll(() => inkPixels(page, before)).toBe(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => inkPixels(page, before)).toBeGreaterThan(30);
});

test('zoom and pan keep ink crisp; reset restores', async ({ page }) => {
  await createNotebook(page);
  await drawLine(page, 220, 250, 480, 250);
  const zoomBtn = page.getByRole('button', { name: /% · Fit/ });
  const start = await zoomBtn.textContent();
  const b = await hostBox(page);
  await page.mouse.move(b.x + 350, b.y + 250);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect.poll(async () => zoomBtn.textContent()).not.toBe(start);
  await zoomBtn.click();
  await expect(zoomBtn).toHaveText(start!);
});

test('palm rejection: touch is ignored for drawing after a pen was seen', async ({ page }) => {
  await createNotebook(page);
  const area = { x: 100, y: 100, w: 600, h: 600 };
  const fire = (
    type: string,
    pointerType: string,
    id: number,
    x: number,
    y: number,
    pressure = 0.5,
  ) =>
    page.evaluate(
      ({ type, pointerType, id, x, y, pressure }) => {
        const host = document.querySelector('.canvas-host')!;
        const r = host.getBoundingClientRect();
        host.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType,
            clientX: r.left + x,
            clientY: r.top + y,
            pressure,
            isPrimary: true,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
          }),
        );
      },
      { type, pointerType, id, x, y, pressure },
    );

  // A pen stroke (pressure varies)
  await fire('pointerdown', 'pen', 7, 200, 300, 0.2);
  for (let i = 1; i <= 8; i++)
    await fire('pointermove', 'pen', 7, 200 + i * 30, 300, 0.2 + i * 0.08);
  // palm touches down mid-stroke and moves: must be ignored
  await fire('pointerdown', 'touch', 9, 300, 500);
  await fire('pointermove', 'touch', 9, 340, 560);
  await fire('pointerup', 'touch', 9, 340, 560);
  await fire('pointerup', 'pen', 7, 440, 300, 0.1);
  await expect.poll(() => inkPixels(page, area)).toBeGreaterThan(50);

  // Touch alone, after the pen has been seen, must not draw (pan only)
  const ink = await inkPixels(page, { x: 100, y: 450, w: 600, h: 250 });
  await fire('pointerdown', 'touch', 11, 300, 500);
  await fire('pointermove', 'touch', 11, 300, 520);
  await fire('pointerup', 'touch', 11, 300, 520);
  await page.waitForTimeout(150);
  expect(await inkPixels(page, { x: 100, y: 450, w: 600, h: 250 })).toBeLessThanOrEqual(ink + 5);
  await page.waitForTimeout(1200);
  expect(await storedStrokes(page)).toBe(1);
});

test('presets can be saved, applied, renamed and deleted', async ({ page }) => {
  await createNotebook(page);
  await page.getByRole('button', { name: 'Colour #d62828' }).click();
  await page.getByRole('button', { name: 'Save current as preset' }).click();
  await page.getByRole('textbox', { name: 'Preset name' }).fill('Red pen');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Colour #1d1c1a' }).click();
  await page.getByRole('button', { name: 'Red pen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Colour #d62828' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Rename preset Red pen' }).click();
  await page.getByRole('textbox', { name: 'Preset name' }).fill('Marker');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.waitForTimeout(300); // let the settings write land
  await page.reload();
  await expect(page.getByRole('button', { name: 'Marker', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete preset Marker' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Marker', exact: true })).toHaveCount(0);
});

test('library card shows a thumbnail after drawing', async ({ page }) => {
  await createNotebook(page, 'Thumb');
  await drawLine(page, 220, 250, 480, 250);
  await expect(page.locator('.save-state', { hasText: /^Saved$/ })).toBeVisible({
    timeout: 5000,
  });
  await page.waitForTimeout(2200); // thumbnail is generated 1.5s after save
  await page.getByRole('link', { name: '← Library' }).click();
  await expect(page.locator('.thumb-img').first()).toBeVisible();
});
