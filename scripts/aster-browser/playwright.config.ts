import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'journey.pw.ts',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 900_000,
  expect: { timeout: 30_000 },
  outputDir: 'aster-browser-results',
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
