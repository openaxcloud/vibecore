import { defineConfig, devices } from '@playwright/test';

/**
 * RPL-IDE-001.4 → .8 live-proof config.
 *
 * Point it at whichever environment carries the build under test:
 *
 *   PLAYWRIGHT_BASE_URL=https://app.<lb-ip>.sslip.io \
 *   SAAS_API_URL=https://api.<lb-ip>.sslip.io \
 *   npx playwright test -c playwright.rpl-ide-panels.config.ts
 *
 * `ignoreHTTPSErrors` is on because the audit environment's preview hosts sit
 * behind a self-signed ClusterIssuer (docs/audit/TEST_ENV_RUNBOOK.md §2).
 * Four widths × light/dark, themes handled inside the spec.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /rpl-ide-panels-proof\.spec\.ts/,
  timeout: 900_000,
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
