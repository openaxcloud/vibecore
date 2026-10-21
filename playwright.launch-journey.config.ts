import { defineConfig } from '@playwright/test';

/*
 * Local production build + real API must already be running. One Chromium engine,
 * three viewport profiles; this configuration does not establish Safari coverage.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['signup-confirmation-feedback.spec.ts', 'dashboard-publication-readiness.spec.ts'],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results/launch-journey',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium' },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 1194, height: 834 }, hasTouch: true } },
    { name: 'mobile', use: { viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true } },
  ],
});
