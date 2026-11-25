import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'readme.spec.ts',
  workers: 1,
  retries: 0,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
