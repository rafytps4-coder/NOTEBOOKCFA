import { expect, test, type Page } from '@playwright/test';
import { createNotebook, drawLine, hostBox, inkPixels, storedStrokes } from './helpers';

const VIEWPORTS = [
  { name: 'iPad 11" portrait', width: 834, height: 1194 },
  { name: 'iPad 11" landscape', width: 1194, height: 834 },
  { name: 'iPad 13" portrait', width: 1032, height: 1376 },
  { name: 'iPad 13" landscape', width: 1376, height: 1032 },
  { name: 'Split View 500', width: 500, height: 1000 },
  { name: 'Split View 375', width: 375, height: 800 },
  { name: 'Split View 320', width: 320, height: 700 },
];

async function noHorizontalOverflow(page: Page, where: string) {
  const o = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > 0 &&
          (r.right > window.innerWidth + 1 || r.left < -1) &&
          getComputedStyle(e).position !== 'fixed' &&
          !e.closest(
            '.pages-scroller, .page-list, .picker, .license-text, pre, .menu, .toast, .editor-top, .editor-toolbar',
          )
        );
      })
      .slice(0, 4)
      .map((e) => `${e.tagName.toLowerCase()}.${e.className}`),
  }));
  expect(
    o.doc,
    `${where}: page is wider than the viewport (${o.offenders.join(', ')})`,
  ).toBeLessThanOrEqual(o.win + 1);
  expect(o.offenders, `${where}: elements outside the viewport`).toEqual([]);
}

for (const vp of VIEWPORTS) {
  test(`layout holds at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/library');
    await noHorizontalOverflow(page, 'library (empty)');
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const l of ['Library', 'Recent', 'Search', 'Settings'])
      await expect(nav.getByRole('link', { name: l })).toBeVisible();

    await createNotebook(page, 'Responsive');
    await expect(page.locator('.canvas-host').first()).toBeVisible();
    await noHorizontalOverflow(page, 'editor');
    // Narrow screens keep the toolbar to one row that scrolls sideways. Every tool must still be
    // reachable: it scrolls into view and is actually visible (not clipped).
    for (const t of [
      'Pen',
      'Pencil',
      'Highlighter',
      'Eraser',
      'Lasso select',
      'Text',
      'Shapes',
      'Undo',
      'Redo',
    ]) {
      const btn = page.getByRole('button', { name: t, exact: true });
      await btn.scrollIntoViewIfNeeded();
      await expect(btn, `${t} is reachable`).toBeInViewport({ ratio: 0.9 });
    }
    await page.getByRole('button', { name: 'Pen', exact: true }).scrollIntoViewIfNeeded();
    // The canvas has real room and drawing works at this size
    const host = await hostBox(page);
    expect(host.height).toBeGreaterThan(Math.min(200, vp.height * 0.3));
    const a = {
      x: host.x + Math.min(40, host.width * 0.15),
      y: host.y + Math.min(120, host.height * 0.3),
    };
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + Math.min(120, host.width * 0.5), a.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => storedStrokes(page)).toBe(1);

    await page.getByRole('button', { name: 'Options', exact: true }).click();
    await noHorizontalOverflow(page, 'editor with options open');
    await page.getByRole('button', { name: 'Pages', exact: true }).click();
    await noHorizontalOverflow(page, 'editor with page list');
    await page.getByRole('button', { name: 'Page style' }).click();
    await noHorizontalOverflow(page, 'editor with page style');

    for (const path of ['/library', '/settings', '/search', '/recent']) {
      await page.goto(path);
      await expect(page.locator('main h1').first()).toBeVisible();
      await noHorizontalOverflow(page, path);
    }
    if (vp.width === 320 || vp.name === 'iPad 13" landscape') {
      await page.goto('/library');
      await page.screenshot({ path: `test-results/layout-${vp.width}x${vp.height}-library.png` });
    }
  });
}

test('rotating the iPad while drawing keeps the page and the ink', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await createNotebook(page, 'Rotate me');
  await drawLine(page, 220, 250, 480, 250);
  await expect.poll(() => storedStrokes(page)).toBe(1);
  await page.setViewportSize({ width: 1194, height: 834 }); // landscape
  await expect(page.locator('.canvas-host').first()).toBeVisible();
  await expect.poll(() => inkPixels(page, { x: 0, y: 0, w: 600, h: 400 })).toBeGreaterThan(30);
  await noHorizontalOverflow(page, 'landscape after rotating');
  await page.setViewportSize({ width: 834, height: 1194 }); // and back
  await expect.poll(() => inkPixels(page, { x: 0, y: 0, w: 600, h: 400 })).toBeGreaterThan(30);
  await drawLine(page, 220, 400, 480, 400);
  await expect.poll(() => storedStrokes(page)).toBe(2);
});
