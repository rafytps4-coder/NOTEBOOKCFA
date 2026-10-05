import { expect, test } from '@playwright/test';

// Helpers is deliberately not listed until a Helper exists (no placeholder screens).
const SECTIONS = ['Library', 'Recent', 'Search', 'Settings'];

test('shell loads and all four sections are navigable', async ({ page }) => {
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

test('the unbuilt Helpers section is not shown', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Helpers' }),
  ).toHaveCount(0);
});
