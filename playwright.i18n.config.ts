import { defineConfig, devices } from '@playwright/test';

import baseConfig from './playwright.config';

const configuredApiUrl = process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL;
const auditApiUrl = configuredApiUrl ?? 'http://127.0.0.1:3001';

const baseWebServers = Array.isArray(baseConfig.webServer)
  ? baseConfig.webServer
  : baseConfig.webServer
    ? [baseConfig.webServer]
    : [];
const auditWebServers = baseWebServers.map((server, index) =>
  index === 0
    ? {
        ...server,
        command: 'VITE_DEV_HOST=127.0.0.1 VITE_DEV_PORT=5173 VITE_STRICT_PORT=true pnpm run dev:web',
        env: {
          ...server.env,
          SAAS_API_URL: auditApiUrl,
          API_BASE_URL: auditApiUrl,
        },
      }
    : server,
);
const apiWebServer =
  process.env.PLAYWRIGHT_SKIP_WEB_SERVER || configuredApiUrl
    ? []
    : [
        {
          command: 'API_HOST=127.0.0.1 API_PORT=3001 pnpm --filter @vibecore/api exec tsx src/server.ts',
          url: 'http://127.0.0.1:3001/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ];

/*
 * Budgets d'attente. Les valeurs par défaut visent le dev server local. Contre
 * un environnement DISTANT (audit, staging) la première hydratation est bien
 * plus lente — mesuré sur l'env d'audit : le sélecteur de langue de la page
 * d'accueil apparaît à 6,1 s sur un contexte neuf et 15,2 s sur le suivant,
 * au-delà du budget local de 5 s. Sans ces variables l'audit échouait sur de
 * la LATENCE et non sur une chaîne non traduite, ce qui est exactement le
 * genre de faux négatif qui décrédibilise une preuve.
 */
const expectTimeout = Number(process.env.I18N_EXPECT_TIMEOUT_MS) || baseConfig.expect?.timeout || 5_000;
const testTimeout = Number(process.env.I18N_TEST_TIMEOUT_MS) || baseConfig.timeout || 30_000;

/**
 * Exhaustive EN/FR proof matrix. Kept separate from the everyday E2E config so
 * normal feature suites do not pay for four full responsive crawls.
 */
export default defineConfig({
  ...baseConfig,
  webServer: [...auditWebServers, ...apiWebServer],
  workers: 1,
  preserveOutput: 'always',
  timeout: testTimeout,
  expect: { ...baseConfig.expect, timeout: expectTimeout },
  projects: [
    {
      name: 'desktop-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'desktop-1024',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 900 },
      },
    },
    {
      name: 'tablet-768',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'mobile-390',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
