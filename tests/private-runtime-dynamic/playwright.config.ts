import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: '*.playwright.ts',
  workers: 1,
  retries: 0,
  use: { browserName: 'chromium', viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', trace: 'off' },
});
