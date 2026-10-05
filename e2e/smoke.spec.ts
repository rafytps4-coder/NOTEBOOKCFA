import { expect, test } from '@playwright/test';

const SECTIONS = ['Library', 'Recent', 'Study', 'Search', 'Settings'];

test('shell loads and all sections are navigable', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of SECTIONS) {
    await nav.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }
});

test('manual dark mode override applies', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
