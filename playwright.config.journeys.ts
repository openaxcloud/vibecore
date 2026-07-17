import { defineConfig, devices } from '@playwright/test';

/*
 * D5 dedicated E2E harness — authenticated journeys against a DEPLOYED
 * environment (staging or prod), driven by a dedicated test user.
 *
 * Why separate from playwright.config.ts: that config boots an ephemeral LOCAL
 * stack (no real workspaces / IDE / preview / publish). These journeys need the
 * real deployed infra, so there is NO webServer — the target comes from
 * E2E_BASE_URL. Evidence is captured for EVERY run (not just failures): video,
 * trace, screenshots + a per-test evidence-metadata.json (see support/fixtures).
 *
 * Run: E2E_BASE_URL=https://app.e-code.ai E2E_API_URL=https://api.e-code.ai \
 *      E2E_USER_EMAIL=… E2E_USER_PASSWORD=… \
 *      pnpm exec playwright test --config playwright.config.journeys.ts
 */
export default defineConfig({
  testDir: './tests/e2e-journeys',
  // Real workspaces cold-start + preview boot; give journeys room (prod latency +
  // remix clone + IDE load + bounded preview wait can legitimately take minutes).
  timeout: 480_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  // Deployed journeys cold-start real infra; a single retry in CI absorbs prod
  // latency flakes (splash hydration, slow first navigation) without masking real
  // breaks. Local runs use 0 to keep the feedback loop short.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-journeys' }]],
  outputDir: 'test-results-journeys',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://app.e-code.ai',
    // Full evidence on every run — this harness EXISTS to produce durable proofs.
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
