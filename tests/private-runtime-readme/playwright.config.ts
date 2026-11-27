import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'readme.playwright.ts',
  workers: 1,
  retries: 0,

  // Keep the Linux recipe's native user agent. A Windows UA defaults a one-line Monaco model to CRLF.
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: devices['Desktop Chrome'].viewport } }],
});
