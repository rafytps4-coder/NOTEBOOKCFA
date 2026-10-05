import { expect, test, type Page } from '@playwright/test';

const KIND = '(?:Folder|Notebook|PDF|Quick note)';
const item = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name}(?: ?, favorite)? ${KIND} ·`) });

async function newFolder(page: Page, name: string) {
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(item(page, name)).toBeVisible();
}

async function newNotebook(page: Page, name: string) {
  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByLabel('Notebook name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible(); // placeholder editor page
  await page.getByRole('link', { name: '← Library' }).click();
}

async function openMenu(page: Page, name: string) {
  await page.getByRole('button', { name: `More actions for ${name}` }).click();
}

test('library: nested folders, notebooks, rename/move/duplicate/favorite/trash/restore survive reload', async ({
  page,
}) => {
  await page.goto('/library');
  await expect(page.getByText('Your library is empty')).toBeVisible();

  await newNotebook(page, 'Algebra');
  await newFolder(page, 'School');

  // Move Algebra into School using the folder picker
  await openMenu(page, 'Algebra');
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page
    .getByRole('option', { name: /School/ })
    .getByRole('button')
    .click();
  await expect(item(page, 'Algebra')).toHaveCount(0);

  // Enter School, make a subfolder
  await item(page, 'School').click();
  await expect(page.getByRole('heading', { level: 1, name: 'School' })).toBeVisible();
  await newFolder(page, 'Math');

  // Rename, favorite, duplicate
  await openMenu(page, 'Algebra');
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Algebra I');
  await page.getByRole('button', { name: 'Rename' }).click();
  await openMenu(page, 'Algebra I');
  await page.getByRole('menuitem', { name: 'Favorite' }).click();
  await openMenu(page, 'Algebra I');
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(item(page, 'Algebra I copy')).toBeVisible();

  // Trash the copy and restore it
  await openMenu(page, 'Algebra I copy');
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await expect(item(page, 'Algebra I copy')).toHaveCount(0);
  await page.getByRole('link', { name: 'Trash' }).click();
  await expect(item(page, 'Algebra I copy')).toBeVisible();
  await openMenu(page, 'Algebra I copy');
  await page.getByRole('menuitem', { name: 'Restore' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();

  // Reload everything: still there
  await page.goto('/library');
  await item(page, 'School').click();
  await expect(item(page, 'Math')).toBeVisible();
  await expect(item(page, 'Algebra I')).toBeVisible();
  await expect(item(page, 'Algebra I copy')).toBeVisible();

  // Opened notebook shows in Recent
  await item(page, 'Algebra I').click();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Recent' })
    .click();
  await expect(item(page, 'Algebra I')).toBeVisible();
});

test('delete forever requires confirmation', async ({ page }) => {
  await page.goto('/library');
  await newNotebook(page, 'Temp');
  await openMenu(page, 'Temp');
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await page.getByRole('link', { name: 'Trash' }).click();
  await openMenu(page, 'Temp');
  await page.getByRole('menuitem', { name: 'Delete forever…' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(item(page, 'Temp')).toBeVisible();
  await openMenu(page, 'Temp');
  await page.getByRole('menuitem', { name: 'Delete forever…' }).click();
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
});
