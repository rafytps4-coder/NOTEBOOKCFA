import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** The starter pack is offered by the CFA Helper, so turn it on first. */
async function enableCfaHelper(page: Page) {
  await page.goto('/helpers');
  await page.getByRole('button', { name: 'Turn on CFA Helper' }).click();
  await expect(page.getByText('On', { exact: true })).toBeVisible();
}

test('@helpers install the starter pack, browse, make a flashcard, study it and watch mastery follow the rules', async ({
  page,
}) => {
  await enableCfaHelper(page);
  await page.goto('/study/formulas');
  await expect(page.getByText('No formulas yet')).toBeVisible();
  await page.getByRole('button', { name: 'Install' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Installed “Starter formula bank/ }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'Formulas' }).getByRole('listitem')).toHaveCount(8);

  // search and filter
  await page.getByLabel('Search formulas').fill('sharpe');
  await expect(page.getByRole('list', { name: 'Formulas' }).getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('Search formulas').fill('');
  await page.getByLabel('Category').selectOption('Options');
  await expect(page.getByRole('list', { name: 'Formulas' }).getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('Category').selectOption('');

  // detail: rendered maths, accessible plain text, variables, example
  await page.getByRole('link', { name: /Future value/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: /Future value/ })).toBeVisible();
  await expect(page.locator('.math .katex')).toBeVisible();
  await expect(page.getByRole('img', { name: 'FV = PV * (1 + r)^N' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Periodic interest rate');
  await expect(page.getByText('Worked example')).toBeVisible();
  await expect(page.getByText('Not studied yet')).toBeVisible();

  // flashcard linked to the formula
  await page.getByRole('button', { name: 'Create flashcard' }).click();
  const dlg = page.getByRole('dialog', { name: 'Create flashcard' });
  await dlg.getByLabel('New set name').fill('Formula cards');
  await dlg.getByRole('button', { name: 'Create card' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/Linked: 1 flashcard/)).toBeVisible();

  // study it: Hard, Hard, Good = three correct answers in one session
  await page.goto('/study');
  await page.getByRole('link', { name: /Formula cards/ }).click();
  await page.getByRole('link', { name: /Study now/ }).click();
  const show = page.getByRole('button', { name: /Show answer/ });
  for (const key of ['2', '2', '3']) {
    await show.click();
    await page.getByRole('button', { name: new RegExp(`\\(${key}\\)`) }).click();
  }
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();

  await page.goto('/study/formulas');
  const row = page.getByRole('listitem').filter({ hasText: 'Future value' });
  await expect(row.getByText('Reviewing')).toBeVisible(); // 3 answers, 100% → Reviewing
  await page.getByRole('link', { name: /Future value/ }).click();
  await expect(page.getByText(/3 answers so far, accuracy 100%/)).toBeVisible();

  // a wrong answer shows up in "recommended for review" with a plain reason
  await page.getByRole('button', { name: 'Create practice question' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/study/questions');
  await page.getByRole('link', { name: /Start quiz/ }).click();
  await page.getByLabel('Your answer').fill('wrong');
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText('Not quite.')).toBeVisible();
  await page.goto('/study/formulas');
  await expect(page.getByRole('region', { name: 'Recommended for review' })).toContainText(
    'Your last answer was wrong',
  );
});

test('@helpers notes persist, formulas are found by search, bad packs are refused without changes', async ({
  page,
}) => {
  await enableCfaHelper(page);
  await page.goto('/study/formulas');
  await page.getByRole('button', { name: 'Install' }).click();
  await expect(page.getByRole('list', { name: 'Formulas' }).getByRole('listitem')).toHaveCount(8);

  await page.getByRole('link', { name: /Net present value/ }).click();
  await page.getByLabel('Your notes').fill('discount rate zebra');
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.getByLabel('Your notes')).toHaveValue('discount rate zebra');

  await page.goto('/search');
  await page.getByRole('searchbox', { name: 'Search' }).fill('zebra');
  await expect(page.getByRole('list', { name: 'Formulas' })).toContainText('Net present value');
  await page.getByRole('searchbox', { name: 'Search' }).fill('parity');
  await page
    .getByRole('link', { name: /Put-call parity/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 2, name: /Put-call parity/ })).toBeVisible();

  // bad packs
  await page.goto('/study/formulas');
  await page.getByRole('button', { name: 'Packs' }).click();
  const input = page.getByLabel('Choose a formula pack file');
  await input.setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"kind":"formulas","schemaVersion":"1.0.0"}'),
  });
  await expect(page.getByRole('alert')).toContainText('was not installed');
  await input.setInputFiles({
    name: 'new.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"kind":"formulas","schemaVersion":"9.0.0"}'),
  });
  await expect(page.getByRole('alert')).toContainText('newer than this app');
  await input.setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('nope'),
  });
  await expect(page.getByRole('alert')).toContainText('not valid JSON');
  await expect(page.getByRole('list', { name: 'Formulas' }).getByRole('listitem')).toHaveCount(8);
});

test('write your own formula', async ({ page }) => {
  await page.goto('/study/formulas');
  await page.getByRole('button', { name: 'New formula' }).click();
  const d = page.getByRole('dialog', { name: 'New formula' });
  await d.getByLabel('Name', { exact: true }).fill('Area of a circle');
  await d.getByLabel('Category').fill('Geometry');
  await d.getByLabel('Equation (LaTeX)').fill('A = \\pi r^{2}');
  await d.getByLabel(/Equation in plain text/).fill('A = pi * r^2');
  await d.getByLabel('Variable 1 symbol').fill('r');
  await d.getByLabel('Variable 1 name').fill('radius');
  await d.getByLabel('What it’s for').fill('Size of a circle');
  await d.getByLabel('When to use it').fill('You know the radius');
  await d.getByRole('button', { name: 'Save' }).click();
  await page.getByLabel('Search formulas').fill('circle');
  await expect(page.getByRole('list', { name: 'Formulas' })).toContainText('yours');
});

test('a pack file installs without any Helper (core works on its own)', async ({ page }) => {
  await page.goto('/study/formulas');
  await expect(page.getByText('No formulas yet')).toBeVisible();
  await page
    .getByLabel('Choose a formula pack file')
    .setInputFiles(
      path.join(process.cwd(), 'content-packs', 'cfa-l1-2027', 'formulas.starter.json'),
    );
  await expect(page.getByRole('list', { name: 'Formulas' }).getByRole('listitem')).toHaveCount(8);
});
