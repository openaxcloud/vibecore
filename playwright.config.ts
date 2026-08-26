import { defineConfig, devices } from '@playwright/test';

const webServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER
  ? undefined
  : [
      {
        command: 'VITE_DEV_HOST=127.0.0.1 VITE_DEV_PORT=5173 VITE_STRICT_PORT=true pnpm run dev',
        url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
      {
        command: 'pnpm --filter @vibecore/admin dev',
        url: 'http://127.0.0.1:5174',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
    ];

export default defineConfig({
  testDir: './tests/e2e',

  /*
   * The TPL proof suite has an explicit destructive/live opt-in contract and a
   * dedicated playwright.tpl-proof.config.ts. Importing it through the default
   * config throws before grep/tag filtering, which would make every ordinary
   * E2E workflow (including the runtime gate) fail during discovery.
   */
  testIgnore: /tpl-proof-live\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,

  /*
   * Zero retries meant every flake was a red gate. Across seven consecutive CI
   * runs of identical code the failing set moved every time — a different
   * mobile profile, a different IDE theme test, once the gallery-remix spec —
   * with each offender passing in the other runs. Retries are the right tool
   * for that: Playwright still reports a retried test as "flaky" rather than
   * silently green, so the instability stays visible instead of blocking.
   * Locally we keep 0 so a flake surfaces immediately while you work on it.
   */
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1194, height: 834 },
        isMobile: false,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
