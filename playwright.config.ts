import { defineConfig, devices } from '@playwright/test';

// iPad-sized projects. WebKit is the real target (iPad Safari). The Chromium
// project exists so the same tests can run where WebKit is not installed.
const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // perf-sensitive tests: avoid CPU contention between workers
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'] } },
    {
      name: 'ipad-chromium',
      use: {
        ...devices['iPad Pro 11'],
        defaultBrowserType: 'chromium',
        browserName: 'chromium',
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
      },
    },
  ],
});
