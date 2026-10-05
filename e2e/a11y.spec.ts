import { expect, test, type Page } from '@playwright/test';
import { makePdf } from '../src/test-utils/pdfFixtures';
import { createNotebook, openPages } from './helpers';

/** A small, dependency-free accessibility audit of what is currently on screen. */
async function audit(page: Page, where: string) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true') return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    };
    const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const name = (el: Element): string => {
      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) {
        return labelledby
          .split(/\s+/)
          .map((id) => textOf(document.getElementById(id) ?? el))
          .join(' ')
          .trim();
      }
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim();
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        const labels = [...(el.labels ?? [])]
          .map((l) => textOf(l))
          .join(' ')
          .trim();
        if (labels) return labels;
        if (el instanceof HTMLInputElement && el.placeholder && el.type === 'search')
          return el.placeholder;
      }
      const t = textOf(el);
      if (t) return t;
      return (el.getAttribute('title') ?? '').trim();
    };
    const label = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').split(' ')[0]}`;
    document
      .querySelectorAll(
        'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=menuitem], [role=option], [role=checkbox]',
      )
      .forEach((el) => {
        if (!visible(el) && !(el instanceof HTMLInputElement && el.type === 'file')) return;
        if (el instanceof HTMLInputElement && el.type === 'file') {
          if (!name(el)) out.push(`file input without a name: ${label(el)}`);
          return;
        }
        if (!name(el)) out.push(`no accessible name: ${label(el)}`);
        if (el.getAttribute('tabindex') === '-1' && el.tagName !== 'MAIN')
          out.push(`not keyboard reachable (tabindex=-1): ${label(el)}`);
      });
    document.querySelectorAll('img').forEach((img) => {
      if (!img.hasAttribute('alt')) out.push('img without alt');
    });
    document.querySelectorAll('dialog[open]').forEach((d) => {
      if (!d.getAttribute('aria-labelledby')) out.push('dialog without a label');
    });
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) out.push(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);
    if (!document.documentElement.lang) out.push('html has no lang');
    if (!document.querySelector('main')) out.push('no <main> landmark');
    if (!document.querySelector('nav[aria-label]') && !document.querySelector('.shell-editor'))
      out.push('no labelled <nav>');
    const h1s = [...document.querySelectorAll('h1')].filter(visible);
    if (h1s.length !== 1) out.push(`expected one visible h1, found ${h1s.length}`);
    document.querySelectorAll('[role=img]').forEach((el) => {
      if (!el.getAttribute('aria-label')) out.push('role=img without a description');
    });
    return out;
  });
  expect(problems, `accessibility problems on ${where}`).toEqual([]);
}

test('every screen: controls are named, landmarks present, no duplicate ids', async ({ page }) => {
  await createNotebook(page, 'Audit notebook');
  await audit(page, 'editor');
  await openPages(page);
  await audit(page, 'editor with page list');
  await page.getByRole('button', { name: 'Page style' }).click();
  await audit(page, 'editor with page style');
  await page.getByRole('button', { name: 'Page style' }).click();
  for (const tool of ['Text', 'Shapes', 'Eraser', 'Lasso select', 'Highlighter']) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    await audit(page, `editor with ${tool} tool`);
  }
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await audit(page, 'editor export menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await audit(page, 'shortcuts sheet');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('link', { name: '← Library' }).click();
  await audit(page, 'library');
  await page.getByRole('button', { name: 'More actions for Audit notebook' }).click();
  await audit(page, 'item menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New folder' }).click();
  await audit(page, 'name dialog');
  await page.keyboard.press('Escape');
  for (const link of ['Favorites', 'Trash']) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await audit(page, `library ${link}`);
  }
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Recent' })
    .click();
  await audit(page, 'recent');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Search' })
    .click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('audit');
  await expect(page.getByRole('link', { name: /Audit notebook/ })).toBeVisible({ timeout: 10_000 });
  await audit(page, 'search results');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await audit(page, 'settings');
});

test('PDF editor and restore dialog are accessible too', async ({ page }) => {
  await page.goto('/library');
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles({
    name: 'a11y.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await makePdf({ pages: 2, outline: [{ title: 'One', page: 0 }] })),
  });
  await expect(page.locator('.canvas-host').first()).toBeVisible({ timeout: 20_000 });
  await openPages(page);
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await audit(page, 'pdf editor with outline');
  await page.getByRole('link', { name: '← Library' }).click();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByLabel('Choose a backup file to restore').setInputFiles({
    name: 'x.notebook',
    mimeType: 'application/x-notebook',
    buffer: Buffer.from('not a backup'),
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await audit(page, 'restore dialog');
});

test('keyboard: visible focus rings, skip link, shortcuts sheet, dialogs close with Escape', async ({
  page,
}) => {
  await page.goto('/library');
  const focusRing = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        ok: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2,
      };
    });
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  // First Tab lands on the skip link, which jumps past the navigation.
  await page.keyboard.press('Tab');
  expect(await focusRing()).toMatchObject({ tag: 'A', ok: true });
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const ring = await focusRing();
    expect(ring, `focus ring on tab stop ${i + 1}`).not.toBeNull();
    expect(ring!.ok, `visible focus ring on ${ring!.tag} (tab stop ${i + 1})`).toBe(true);
  }
  // "?" opens the shortcuts sheet from anywhere; Escape closes it
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await expect(page.getByText('Next page')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Keyboard-only: create a folder
  await page.getByRole('button', { name: 'New folder' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('From keyboard');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^From keyboard Folder/ })).toBeVisible();
});

test('reduced motion is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/library');
  await expect(page.getByRole('button', { name: 'New notebook' })).toBeVisible();
  const durations = await page.evaluate(() => {
    const el = document.querySelector('.btn')!;
    const cs = getComputedStyle(el);
    return [cs.transitionDuration, cs.animationDuration];
  });
  expect(durations.every((d) => d.split(',').every((x) => parseFloat(x) <= 0.001))).toBe(true);
});

test('text size setting scales the interface', async ({ page }) => {
  await page.goto('/settings');
  const size = () =>
    page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const btn = () =>
    page.getByRole('link', { name: 'Library' }).evaluate((e) => e.getBoundingClientRect().height);
  const base = await size();
  const baseH = await btn();
  await page.getByRole('button', { name: 'Extra large' }).click();
  expect(await size()).toBeCloseTo(base * 1.3, 0);
  expect(await btn()).toBeGreaterThan(baseH * 1.2); // controls grow with the text
  await page.reload();
  expect(await size()).toBeCloseTo(base * 1.3, 0); // remembered
  await page.getByRole('button', { name: 'Default' }).click();
});

test('first-run guide: short, skippable, shown once, can be reopened', async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 834, height: 1194 },
  });
  const page = await ctx.newPage();
  await page.goto('/library');
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByRole('heading', { name: 'Welcome to Notebook' })).toBeVisible();
  await expect(dlg.getByText('Step 1 of 4')).toBeVisible();
  await dlg.getByRole('button', { name: 'Next' }).click();
  await expect(dlg.getByRole('heading', { name: 'Write with Apple Pencil' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Back' }).click();
  await dlg.getByRole('button', { name: 'Next' }).click();
  await dlg.getByRole('button', { name: 'Next' }).click();
  await dlg.getByRole('button', { name: 'Next' }).click();
  await expect(dlg.getByRole('heading', { name: 'Keep a backup' })).toBeVisible();
  await expect(dlg.getByText(/pay|subscribe|account required/i)).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0); // not shown again

  // skippable at any point
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p2 = await fresh.newPage();
  await p2.goto('/library');
  await p2.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await expect(p2.getByRole('dialog')).toHaveCount(0);

  // reopen from Settings → About
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Show the intro again' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to Notebook' })).toBeVisible();
  await ctx.close();
  await fresh.close();
});

test('About: version, privacy statement, disclaimer and licences', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText(/version 0\.1\.0/)).toBeVisible();
  await expect(page.getByText(/Nothing leaves your device/)).toBeVisible();
  await expect(
    page.getByText(
      'Independent study tool. Not affiliated with or endorsed by CFA Institute. CFA® and Chartered Financial Analyst® are trademarks owned by CFA Institute.',
    ),
  ).toBeVisible();
  await page.getByText(/Open-source licences/).click();
  await page.getByRole('button', { name: /^react 19/ }).click();
  await expect(page.locator('.license-text')).toContainText('Permission is hereby granted');
  await expect(page.getByRole('heading', { name: 'Install on your home screen' })).toBeVisible();
  await expect(page.getByText(/Add to Home Screen/)).toBeVisible();
});
