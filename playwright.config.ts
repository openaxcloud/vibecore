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

    /*
     * WebKit, profil iPhone — le moteur d'Avi.
     *
     * Nos trois autres projets tournent tous sur Chromium, et l'écart avec
     * Safari iOS est SILENCIEUX : mesuré le 2026-09-01, Chromium focalise un
     * conteneur non interactif au toucher, Safari iOS ne le fait pas. Une barre
     * d'actions révélée par `:focus-within` était donc morte sur l'iPhone
     * pendant qu'un test Chromium la voyait s'ouvrir — un vert sur une surface
     * qui n'a pas le problème.
     *
     * La portée est VOLONTAIREMENT ÉTROITE : seulement les specs dont le sujet
     * EST une interaction tactile. Faire tourner toute la suite sur un second
     * moteur doublerait le temps de CI pour un gain nul sur les specs qui ne
     * touchent à rien.
     */
    {
      name: 'webkit-iphone',
      use: { ...devices['iPhone 15 Pro'] },
      testMatch: [
        /agent-message-density\.spec\.ts/,
        /agent-scroll-pill\.spec\.ts/,
        /agent-composer-panel-viewport\.spec\.ts/,
        /ide-touch-targets\.spec\.ts/,
      ],
    },
  ],
});
