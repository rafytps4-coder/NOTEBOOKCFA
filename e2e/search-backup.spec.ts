import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { makePdf } from '../src/test-utils/pdfFixtures';
import {
  createNotebook,
  drawLine,
  hostBox,
  inkPixels,
  storedObjects,
  storedStrokes,
  waitSaved,
} from './helpers';

async function addText(page: Page, text: string, x = 200, y = 250) {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(page.getByText('Tap the page to add a text box')).toBeVisible();
  const b = await hostBox(page);
  await page.mouse.click(b.x + x, b.y + y);
  await page.getByRole('textbox', { name: 'Text box' }).fill(text);
  await page.keyboard.press('Control+Enter');
  await expect
    .poll(async () => (await storedObjects(page)).some((o) => o.text === text))
    .toBe(true);
  await waitSaved(page);
}

async function search(page: Page, q: string) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Search' })
    .click();
  await page.getByRole('searchbox', { name: 'Search' }).fill(q);
}

async function goLibrary(page: Page) {
  await page.getByRole('link', { name: '← Library' }).click();
}

test('search finds typed text (case/accent-insensitive, prefix), highlights it and opens the page', async ({
  page,
}) => {
  await createNotebook(page, 'Physics notes');
  await addText(page, 'Quantum entanglement of photons');
  await page.getByRole('button', { name: '+ New page' }).click();
  await expect(page.getByText(/Page \d of 2/)).toBeVisible();
  // Put different text on page 2 (the new page is current)
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  const host = page.locator('.canvas-host').nth(1);
  await expect(host).toBeVisible();
  const box = (await host.boundingBox())!;
  await page.mouse.click(box.x + 200, box.y + 250);
  await page.getByRole('textbox', { name: 'Text box' }).fill('Café résumé Schrödinger');
  await page.keyboard.press('Control+Enter');
  await waitSaved(page);
  await goLibrary(page);

  await search(page, 'ENTANGL');
  const hit = page.getByRole('link', { name: /entanglement/ });
  await expect(hit).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('mark', { hasText: 'entanglement' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Physics notes' }).first()).toBeVisible();

  // accents folded both ways
  await page.getByRole('searchbox', { name: 'Search' }).fill('cafe resume schrodinger');
  const second = page.getByRole('link', { name: /Café résumé/ });
  await expect(second).toBeVisible();
  await second.click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible(); // opened at the right page
});

test('titles and folder names are searchable; trashed items are not', async ({ page }) => {
  await page.goto('/library');
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill('Thermodynamics');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: /^Thermodynamics/ }).click();
  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByLabel('Notebook name').fill('Entropy workbook');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.canvas-host').first()).toBeVisible();
  await goLibrary(page);

  await search(page, 'thermodyn');
  await expect(page.getByRole('link', { name: /Thermodynamics/ })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('searchbox', { name: 'Search' }).fill('entropy');
  await expect(page.getByRole('link', { name: /Entropy workbook/ })).toBeVisible();

  // Trash the notebook: it disappears from results
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Library' })
    .click();
  await page.getByRole('button', { name: /^Thermodynamics/ }).click();
  await page.getByRole('button', { name: 'More actions for Entropy workbook' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await search(page, 'entropy');
  await expect(page.getByText(/No results for/)).toBeVisible({ timeout: 10_000 });
});

test('PDF text is searchable; a result opens the right page; rebuild keeps working', async ({
  page,
}) => {
  const pdf = await makePdf({
    pages: 6,
    texts: ['alpha', 'beta', 'gamma zebrafish', 'delta', 'epsilon', 'zeta'],
  });
  await page.goto('/library');
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles({
    name: 'Biology.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdf),
  });
  await expect(page.locator('.canvas-host').first()).toBeVisible({ timeout: 20_000 });
  await goLibrary(page);

  await search(page, 'zebrafish');
  const hit = page.getByRole('link', { name: /zebrafish/ });
  await expect(hit).toBeVisible({ timeout: 20_000 }); // text is extracted in the background
  await expect(page.getByText('p. 3')).toBeVisible();
  await hit.click();
  await expect(page.getByText('Page 3 of 6')).toBeVisible();

  // Settings → Rebuild search index; results come back afterwards
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Rebuild search index' }).click();
  await expect(page.getByText('The search index was rebuilt.')).toBeVisible({ timeout: 30_000 });
  await search(page, 'zebrafish');
  await expect(page.getByRole('link', { name: /zebrafish/ })).toBeVisible({ timeout: 10_000 });
});

test('full export → wipe → import restores folders, notebooks, ink and text', async ({ page }) => {
  await page.addInitScript(
    () => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker,
  );
  await createNotebook(page, 'Backup me');
  await drawLine(page, 220, 250, 480, 250);
  await addText(page, 'Remember this text', 200, 400);
  await expect.poll(() => storedStrokes(page)).toBe(1);
  await goLibrary(page);

  await page.goto('/settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export everything' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Notebook-backup-\d{4}-\d{2}-\d{2}\.notebook$/);
  const backup = readFileSync((await download.path())!);
  await expect(page.getByText('Backup saved.')).toBeVisible();

  // Wipe the database completely and reload: the library is empty
  await page.evaluate(
    () =>
      new Promise<void>((res) => {
        const r = indexedDB.deleteDatabase('notebook');
        r.onsuccess = r.onerror = r.onblocked = () => res();
      }),
  );
  await page.goto('/library');
  await expect(page.getByText('Your library is empty')).toBeVisible();

  // Restore (merge into the empty library)
  await page.goto('/settings');
  await page.getByLabel('Choose a backup file to restore').setInputFiles({
    name: 'backup.notebook',
    mimeType: 'application/x-notebook',
    buffer: backup,
  });
  await expect(page.getByRole('dialog', { name: 'Restore from backup' })).toBeVisible();
  await expect(page.getByText('1 document(s)')).toBeVisible();
  await expect(page.getByText(/Includes: Backup me/)).toBeVisible();
  await page.getByRole('button', { name: 'Merge into my library' }).click();
  await expect(page.getByText(/Done: 1 notebook/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Close' }).click();

  await page.goto('/library');
  await page.getByRole('button', { name: /^Backup me/ }).click();
  await expect(page.locator('.canvas-host').first()).toBeVisible();
  await expect.poll(() => inkPixels(page, { x: 100, y: 120, w: 600, h: 400 })).toBeGreaterThan(50);
  expect((await storedObjects(page)).some((o) => o.text === 'Remember this text')).toBe(true);
  expect(await storedStrokes(page)).toBe(1);

  // Search works on restored data (typed text index is rebuilt after a restore)
  await goLibrary(page);
  await search(page, 'remember');
  await expect(page.getByRole('link', { name: /Remember this text/ })).toBeVisible({
    timeout: 15_000,
  });
});

test('replace restores a backup over newer changes (with the safety backup unticked)', async ({
  page,
}) => {
  await page.addInitScript(
    () => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker,
  );
  await createNotebook(page, 'Kept');
  await goLibrary(page);
  await page.goto('/settings');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export everything' }).click(),
  ]);
  const backup = readFileSync((await dl.path())!);

  await createNotebook(page, 'Added later');
  await goLibrary(page);
  await page.goto('/settings');
  await page
    .getByLabel('Choose a backup file to restore')
    .setInputFiles({ name: 'b.notebook', mimeType: 'application/x-notebook', buffer: backup });
  await page.getByLabel(/Replace: delete my current library/).check();
  await expect(
    page.getByText('Replace deletes everything currently in your library.'),
  ).toBeVisible();
  await page.getByLabel(/Save a backup of my current library first/).uncheck();
  await page.getByRole('button', { name: 'Replace my library' }).click();
  await expect(page.getByText(/Done: 1 notebook/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Close' }).click();
  await page.goto('/library');
  await expect(page.getByRole('button', { name: /^Kept/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Added later/ })).toHaveCount(0);
});

test('a corrupt or unrelated file is rejected and nothing changes', async ({ page }) => {
  await createNotebook(page, 'Safe notebook');
  await goLibrary(page);
  await page.goto('/settings');
  await page.getByLabel('Choose a backup file to restore').setInputFiles({
    name: 'broken.notebook',
    mimeType: 'application/x-notebook',
    buffer: Buffer.from(
      'PK\u0003\u0004 this is not really a zip archive, just text pretending to be one........',
    ),
  });
  await expect(page.getByRole('alert')).toContainText(/not a valid archive|damaged|too small/);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.goto('/library');
  await expect(page.getByRole('button', { name: /^Safe notebook/ })).toBeVisible();
});

test('backup reminder: off by default, shows when overdue, can be dismissed', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByText(/haven.t backed up/)).toHaveCount(0);
  await page.goto('/settings');
  await page.getByLabel('Remind me to back up').selectOption('7');
  await page.waitForTimeout(500);
  // Pretend the app was first used 30 days ago
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const o = indexedDB.open('notebook');
        o.onerror = () => rej(o.error);
        o.onsuccess = () => {
          const db = o.result;
          const tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({
            key: 'app.firstRunAt',
            value: Date.now() - 30 * 86400000,
          });
          tx.oncomplete = () => {
            db.close();
            res();
          };
        };
      }),
  );
  await page.goto('/library');
  await expect(page.getByText(/haven.t backed up/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByText(/haven.t backed up/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/haven.t backed up/)).toHaveCount(0); // stays quiet for a day
});

test('a notebook can be exported as a PDF from the library menu', async ({ page }) => {
  await page.addInitScript(
    () => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker,
  );
  await createNotebook(page, 'To PDF');
  await drawLine(page, 220, 250, 480, 250);
  await addText(page, 'Printed text', 200, 400);
  await page.getByRole('button', { name: '+ New page' }).click();
  await expect(page.getByText(/Page \d of 2/)).toBeVisible();
  await goLibrary(page);
  await page.getByRole('button', { name: 'More actions for To PDF' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export as PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('To PDF-annotated.pdf');
  const doc = await PDFDocument.load(readFileSync((await download.path())!));
  expect(doc.getPageCount()).toBe(2);
});
