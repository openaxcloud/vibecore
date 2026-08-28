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

/**
 * Exhaustive EN/FR proof matrix. Kept separate from the everyday E2E config so
 * normal feature suites do not pay for four full responsive crawls.
 */
export default defineConfig({
  ...baseConfig,
  webServer: [...auditWebServers, ...apiWebServer],
  workers: 1,
  preserveOutput: 'always',
  /*
   * Zéro reprise, contrairement au reste de la suite E2E (playwright.config.ts
   * met `retries: 2` en CI). Deux raisons, toutes deux mesurées sur le shard
   * `mobile-390` du run 33101508960 :
   *
   *   1. Budget. Le describe de l'audit est configuré à 30 min par test. Avec
   *      deux reprises, un test qui dépasse son budget une fois consomme
   *      30 x 3 = 90 min — exactement le `timeout-minutes` du job, donc un
   *      timeout garanti. Le log de l'API archivé par ce run le montre
   *      directement : le débit de requêtes change de régime à +30 min puis à
   *      +60 min (~280, puis ~1000, puis ~1450 requêtes par tranche de 5 min,
   *      les caches se réchauffant à chaque reprise). Trois segments de
   *      30 minutes, et aucune accalmie : rien ne se bloque, la reprise
   *      consomme simplement tout le budget du job.
   *   2. Justesse de la preuve. `preserveOutput: 'always'` conserve la sortie
   *      de CHAQUE tentative. Les captures et JSON d'une reprise s'ajoutent
   *      donc à ceux de la tentative initiale, et l'étape « Verify complete
   *      proof set » compare un total à une égalité stricte (282 / 564 / 2).
   *      Une reprise fait mécaniquement échouer cette vérification, même
   *      quand l'audit finit par passer.
   *
   * Une reprise n'a par ailleurs pas de sens ici : ce n'est pas un test de
   * fonctionnalité sujet au flake, c'est une collecte de preuve déterministe.
   * Si elle échoue, on veut la preuve de l'échec, pas un deuxième essai.
   */
  retries: 0,
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
