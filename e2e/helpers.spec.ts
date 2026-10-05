import { expect, test } from '@playwright/test';
import { createNotebook, hostBox, waitSaved } from './helpers';

const DISCLAIMER =
  'Independent study tool. Not affiliated with or endorsed by CFA Institute. CFA® and Chartered Financial Analyst® are trademarks owned by CFA Institute.';

test('@helpers the Helpers screen lists the CFA shell; enable, onboard, see an honest dashboard, disable', async ({
  page,
}) => {
  await page.goto('/helpers');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Helpers' })).toBeVisible();
  const card = page.getByRole('listitem', { name: 'CFA Helper' });
  await expect(card).toContainText('What it stores');
  await expect(card.getByText('Off', { exact: true })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Open' })).toHaveCount(0);

  // while off, its screen is hidden
  await page.goto('/helpers/cfa');
  await expect(page.getByText('CFA Helper is turned off')).toBeVisible();

  await page.goto('/helpers');
  await page.getByRole('button', { name: 'Turn on CFA Helper' }).click();
  await expect(card.getByText('On', { exact: true })).toBeVisible();
  await card.getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to the CFA Helper' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText(DISCLAIMER);
  await page.getByRole('button', { name: 'Continue' }).click();

  // honest shell: disclaimer visible, everything unbuilt is labelled Planned, no invented numbers
  await expect(page.getByRole('heading', { level: 1, name: /CFA Helper/ })).toBeVisible();
  await expect(page.getByRole('note')).toContainText(DISCLAIMER);
  const planned = page.getByRole('list', { name: 'What is planned' });
  await expect(planned.getByText('Planned', { exact: true })).toHaveCount(4);
  await expect(page.getByText(/\d+\s*%/)).toHaveCount(0);

  // onboarding is remembered
  await page.goto('/helpers/cfa');
  await expect(page.getByRole('heading', { level: 1, name: /CFA Helper/ })).toBeVisible();

  await page.goto('/helpers');
  await page.getByRole('button', { name: 'Turn off CFA Helper' }).click();
  await expect(card.getByText('Off', { exact: true })).toBeVisible();
  await page.goto('/helpers/cfa');
  await expect(page.getByText('CFA Helper is turned off')).toBeVisible();
});

test('@helpers turning a Helper off keeps its data; only "Delete Helper data" removes it, after confirmation', async ({
  page,
}) => {
  await page.goto('/helpers');
  await page.getByRole('button', { name: 'Turn on CFA Helper' }).click();
  await page.goto('/study/formulas');
  await page.getByRole('button', { name: 'Install' }).click();
  await expect(page.getByRole('list', { name: 'Formulas' }).getByRole('listitem')).toHaveCount(8);
  await page.getByRole('link', { name: /Net present value/ }).click();
  await page.getByLabel('Your notes').fill('keep me');
  await page.waitForTimeout(900);

  await page.goto('/helpers');
  await page.getByRole('button', { name: 'Turn off CFA Helper' }).click();
  await page.goto('/study/formulas');
  await expect(page.getByRole('list', { name: 'Formulas' }).getByRole('listitem')).toHaveCount(8); // data kept
  await page.getByRole('button', { name: 'Packs' }).click();
  await expect(page.getByText('Starter formula bank')).toHaveCount(0); // its UI is hidden

  await page.goto('/helpers');
  await page.getByRole('button', { name: 'Delete Helper data…' }).click();
  const dlg = page.getByRole('dialog', { name: /Delete CFA Helper data/ });
  await expect(dlg).toContainText('Formulas installed from the CFA starter pack: 8');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await page.goto('/study/formulas');
  await expect(page.getByRole('list', { name: 'Formulas' }).getByRole('listitem')).toHaveCount(8); // cancelling deletes nothing

  await page.goto('/helpers');
  await page.getByRole('button', { name: 'Delete Helper data…' }).click();
  await page.getByRole('button', { name: 'Delete data' }).click();
  await expect(page.getByText('The data was deleted.')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.goto('/study/formulas');
  await expect(page.getByText('No formulas yet')).toBeVisible();
});

test('@helpers the notebook selection menu shows nothing when no Helper contributes actions', async ({
  page,
}) => {
  await createNotebook(page, 'Sel');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  const b = await hostBox(page);
  await page.mouse.click(b.x + 200, b.y + 250);
  await page.getByRole('textbox', { name: 'Text box' }).fill('x');
  await page.keyboard.press('Control+Enter');
  await waitSaved(page);
  await expect(page.getByRole('button', { name: /^Helpers/ })).toHaveCount(0); // none enabled

  await page.goto('/helpers');
  await page.getByRole('button', { name: 'Turn on CFA Helper' }).click();
  await page.goBack();
  await expect(page.getByRole('button', { name: /^Helpers/ })).toHaveCount(0); // enabled, but the shell offers no actions
});
