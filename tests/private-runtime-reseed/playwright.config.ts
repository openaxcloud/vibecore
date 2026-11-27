import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'reseed.playwright.ts',
  webServer: {
    command: 'pnpm run start:node',
    cwd: process.cwd(),
    env: { HOST: '127.0.0.1', PORT: '5173', NODE_ENV: 'production' },
    url: 'http://127.0.0.1:5173',
    timeout: 180_000,
    reuseExistingServer: false,
  },
  workers: 1,
  retries: 0,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
