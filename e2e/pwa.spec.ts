import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createNotebook, drawLine, storedStrokes, waitSaved } from './helpers';

test('installable: manifest, icons and iOS meta are present and valid', async ({ page }) => {
  await page.goto('/library');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifest = await (await page.request.get(href!)).json();
  expect(manifest).toMatchObject({
    name: 'Notebook',
    display: 'standalone',
    start_url: '/',
    scope: '/',
  });
  const sizes = manifest.icons.map(
    (i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? ':' + i.purpose : ''}`,
  );
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']));
  for (const icon of manifest.icons) {
    const r = await page.request.get(icon.src);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  expect(await page.locator('link[rel=apple-touch-icon]').getAttribute('href')).toBeTruthy();
  expect(
    await page.locator('meta[name=apple-mobile-web-app-capable]').getAttribute('content'),
  ).toBe('yes');
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain(
    'viewport-fit=cover',
  );
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
});

test('works offline after the first load: reload, create, draw, save', async ({
  page,
  context,
}) => {
  await page.goto('/library');
  // The service worker finishes precaching and tells the user it is ready for offline use.
  await expect(page.getByText('Notebook is ready to work offline.')).toBeVisible({
    timeout: 30_000,
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await createNotebook(page, 'Offline notebook');
  await drawLine(page, 220, 250, 480, 250);
  await expect.poll(() => storedStrokes(page)).toBe(1);
  await waitSaved(page);
  // Deep link reload while offline (SPA fallback from the cache)
  await page.reload();
  await expect(page.locator('.canvas-host').first()).toBeVisible();
  await context.setOffline(false);
});

test('the PDF engine and search worker also work offline', async ({ page, context }) => {
  await page.goto('/library');
  await expect(page.getByText('Notebook is ready to work offline.')).toBeVisible({
    timeout: 30_000,
  });
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Search' })
    .click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('anything');
  await expect(page.getByText(/No results for/)).toBeVisible({ timeout: 15_000 }); // the worker answered from cache
  await context.setOffline(false);
});

/** A tiny static server for `dist/` whose service worker script can be "released" in a new version. */
function startDistServer(): Promise<{
  url: string;
  origin: string;
  release: () => void;
  close: () => Promise<void>;
}> {
  const dist = path.join(process.cwd(), 'dist');
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
    '.json': 'application/json',
  };
  let version = 1;
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = path.join(dist, pathname);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory())
      file = path.join(dist, 'index.html');
    let body: Buffer = readFileSync(file);
    const headers: Record<string, string> = {
      'content-type': types[path.extname(file)] ?? 'application/octet-stream',
    };
    if (pathname === '/sw.js') {
      headers['cache-control'] = 'no-cache';
      body = Buffer.from(`${body.toString()}\n// release ${version}\n`);
    }
    res.writeHead(200, headers);
    res.end(body);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://localhost:${port}`,
        origin: `http://localhost:${port}`,
        release: () => void version++,
        close: () => new Promise<void>((r) => void server.close(() => r())),
      });
    }),
  );
}

test('update flow: a new version waits until the user chooses; never reloads by itself', async ({
  browser,
}) => {
  test.setTimeout(120_000); // precaching the whole app (maths fonts included) takes a while on slow machines
  const srv = await startDistServer();
  const ctx = await browser.newContext({
    viewport: { width: 834, height: 1194 },
    storageState: {
      cookies: [],
      origins: [
        { origin: srv.origin, localStorage: [{ name: 'notebook.firstRunDone', value: '1' }] },
      ],
    },
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${srv.url}/library`);
    await expect(page.getByText('Notebook is ready to work offline.')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));

    // Type something that is still waiting for its autosave when the user taps "Update now"
    await createNotebookAt(page);
    await drawLine(page, 220, 250, 480, 250);

    // A new version is released: the browser downloads it quietly and it waits
    srv.release();
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg!.update();
    });
    await expect(page.getByText('A new version of Notebook is ready.')).toBeVisible({
      timeout: 30_000,
    });
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(
      1,
    ); // no surprise reload

    // "Later" dismisses it without reloading
    await page.getByRole('button', { name: 'Later' }).click();
    await expect(page.getByText('A new version of Notebook is ready.')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(
      1,
    );

    // On the next visit the waiting version is offered again; "Update now" reloads into it
    await page.reload();
    await expect(page.getByText('A new version of Notebook is ready.')).toBeVisible({
      timeout: 30_000,
    });
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 2));
    await page.getByRole('button', { name: 'Update now' }).click();
    await expect
      .poll(
        () =>
          page
            .evaluate(() => (window as unknown as { __marker?: number }).__marker)
            .catch(() => 'navigating'), // the page is mid-reload
        { timeout: 30_000 },
      )
      .toBeUndefined(); // reloaded into the new version
    // …and the ink drawn before the update was saved first
    await expect(page.getByText('A new version of Notebook is ready.')).toHaveCount(0);
    await page.goto(`${srv.url}/library`);
    await page.getByRole('button', { name: /^Draw test/ }).click();
    await expect.poll(() => storedStrokes(page)).toBe(1);
  } finally {
    await ctx.close();
    await srv.close();
  }
});

async function createNotebookAt(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByLabel('Notebook name').fill('Draw test');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.canvas-host').first()).toBeVisible();
}
