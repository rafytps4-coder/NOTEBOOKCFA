import { expect, test, type Page } from '@playwright/test';
import { createNotebook, hostBox, waitSaved } from './helpers';

async function newSet(page: Page, name: string) {
  await page.goto('/study');
  await page.getByRole('button', { name: 'New set' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
}

test('create a set, add cards, study with the keyboard, see real stats', async ({ page }) => {
  await newSet(page, 'Capitals');
  await expect(page.getByText('Statistics appear after your first review')).toBeVisible();

  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByLabel('Front', { exact: true }).fill('France');
  await page.getByLabel('Back', { exact: true }).fill('Paris');
  await page.getByRole('button', { name: /Save & add another/ }).click();
  await page.getByLabel('Front', { exact: true }).fill('Italy');
  await page.getByLabel('Back', { exact: true }).fill('Rome');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Cards' }).getByRole('listitem')).toHaveCount(2);

  await page.getByRole('link', { name: /Study now \(0 due, 2 new\)/ }).click();
  await expect(page.getByText('2 left')).toBeVisible();
  const show = page.getByRole('button', { name: /Show answer/ });
  await page.keyboard.press('Space');
  await expect(page.getByRole('group', { name: 'How well did you remember?' })).toBeVisible();
  await page.keyboard.press('3'); // Good
  await expect(page.getByText('1 left')).toBeVisible();
  await expect(show).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('1'); // Again: this card returns in the same session
  await expect(page.getByText('1 left')).toBeVisible();
  await expect(show).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.getByRole('link', { name: /Back to Capitals/ }).click();

  await expect(page.getByRole('link', { name: /Study now \(0 due, 0 new\)/ })).toBeVisible();
  const stats = page.getByRole('list', { name: 'Cards' });
  await expect(stats.getByText('new')).toHaveCount(0);
  await expect(
    page.getByLabel('Set statistics').getByText('3', { exact: true }).first(),
  ).toBeVisible(); // 3 reviews
  await page.goto('/study');
  await expect(page.getByRole('link', { name: /Capitals/ })).toContainText('0 due');
});

test('quiz a question, log the mistake, see weak areas and review it', async ({ page }) => {
  await page.goto('/study/questions');
  await page.getByRole('button', { name: 'New question' }).click();
  await page.getByLabel('Question', { exact: true }).fill('What is 2 + 2?');
  await page.getByLabel('Choice 1', { exact: true }).fill('3');
  await page.getByLabel('Choice 2', { exact: true }).fill('4');
  await page.getByLabel('Choice 2 is correct').check();
  await page.getByLabel('Tags (comma separated)').fill('arithmetic');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Questions' })).toContainText('What is 2 + 2?');

  await page.getByRole('link', { name: /Start quiz/ }).click();
  await page.getByLabel('3', { exact: true }).check();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText('Not quite.')).toBeVisible();
  await page.getByRole('button', { name: 'Log this mistake' }).click();
  await page.getByLabel('Why did it go wrong?').selectOption('calculation');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();

  await page.goto('/study/mistakes');
  await expect(page.getByRole('list', { name: 'Weak areas by tag' })).toContainText('arithmetic');
  await expect(page.getByRole('list', { name: 'Mistakes' })).toContainText('Calculation error');
  await page.getByRole('link', { name: /Review mistakes \(1\)/ }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByText('Correct answer: 4')).toBeVisible();
  await page.getByRole('button', { name: /Mark reviewed/ }).click();
  await expect(page.getByRole('heading', { name: 'All reviewed' })).toBeVisible();
});

test('create a flashcard from a notebook selection (text + snapshot) and jump back', async ({
  page,
}) => {
  await createNotebook(page, 'Bio notes');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  const b = await hostBox(page);
  await page.mouse.click(b.x + 200, b.y + 250);
  await page.getByRole('textbox', { name: 'Text box' }).fill('Mitochondria');
  await page.keyboard.press('Control+Enter');
  await waitSaved(page);

  await page.getByRole('button', { name: 'Flashcard' }).click();
  const dlg = page.getByRole('dialog', { name: 'Create flashcard' });
  await expect(dlg.getByRole('img', { name: 'Selected part of the page' })).toBeVisible();
  await expect(dlg.getByLabel('Front text')).toHaveValue('Mitochondria');
  await dlg.getByLabel('New set name').fill('Biology');
  await dlg.getByLabel('Back text').fill('Powerhouse of the cell');
  await dlg.getByRole('button', { name: 'Create card' }).click();
  await expect(page.getByRole('dialog', { name: 'Flashcard created' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.goto('/study');
  await page.getByRole('link', { name: /Biology/ }).click();
  const row = page.getByRole('list', { name: 'Cards' }).getByRole('listitem');
  await expect(row).toContainText('Mitochondria');
  await row.getByRole('link', { name: /Open the notebook page/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bio notes' })).toBeVisible();
});
