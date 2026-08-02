import { defineConfig, devices } from '@playwright/test';

/**
 * RPL-IDE-001.1/.2/.3 live-proof config. Runs against PROD by default
 * (PLAYWRIGHT_BASE_URL=https://app.e-code.ai, SAAS_API_URL=https://api.e-code.ai).
 * Four widths × the interaction/responsive matrix; themes handled inside the spec.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /rpl-ide-live-proof\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.e-code.ai',
    ignoreHTTPSErrors: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    navigationTimeout: 60_000,
  },
  projects: [
    { name: 'w1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'w1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'w768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'w390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
});
