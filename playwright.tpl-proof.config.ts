import { defineConfig, devices } from '@playwright/test';
import { loadTplProofConfig } from './app/lib/qa/tpl-proof-contract.js';

/* Evaluated before test discovery: an unguarded command cannot even list tests. */
const proof = loadTplProofConfig();

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /tpl-proof-live\.spec\.ts/,
  timeout: 30 * 60_000,
  expect: { timeout: proof.runtimeTimeoutMs },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  outputDir: `${proof.outputDir}/playwright`,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: proof.appBaseUrl,
    ignoreHTTPSErrors: false,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
    navigationTimeout: proof.runtimeTimeoutMs,
  },
  projects: [{ name: `tpl-proof-${proof.target}-chromium`, use: { ...devices['Desktop Chrome'] } }],
});
