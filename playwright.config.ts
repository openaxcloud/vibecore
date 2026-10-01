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
   * UNE SUITE QUI EXPIRE NE REND AUCUN VERDICT — et un run `cancelled` ne
   * prouve rien, ni dans un sens ni dans l'autre.
   *
   * Mesuré le 2026-09-30 sur le contrôle requis de #597 : tentative 1 lancée à
   * 03:42, `cancelled` à 05:13 — quatre-vingt-onze minutes, zéro ligne de
   * verdict, aucun rapport. Le coureur GitHub a tué le processus au plafond du
   * job (`timeout-minutes: 75` dans `.github/workflows/e2e.yml`), et Playwright,
   * qui n'avait AUCUNE borne globale, n'a rien eu le temps d'écrire.
   *
   * La borne ci-dessous est volontairement SOUS le plafond du job : c'est
   * Playwright qui doit s'arrêter le premier, parce que lui sait rendre un
   * rapport en s'arrêtant. Tué par le coureur, il ne laisse rien — et une suite
   * qui ne rend rien ne protège plus rien, elle fait seulement patienter.
   */
  /*
   * 75 ET NON 60 — mesuré, pas choisi.
   *
   * Le 2026-10-01, l'étape de suite de la tranche 1 a duré 3601 s : exactement
   * cette borne, à la seconde près. Elle n'a donc pas fini, elle a été COUPÉE,
   * et la porte a vu des tests « did not run ». Cause : les specs E2E sont
   * passés de 48 à 55 fichiers dans la nuit, et la tranche 1 en portait déjà 44
   * sur 48 (Playwright découpe par fichier, pas par durée — voir
   * docs/bugs/DETTE-CI-TRANCHES-DESEQUILIBREES-001.md).
   *
   * Le vrai remède est le découpage en quatre tranches ; celui-ci est le filet
   * qui empêche la suite d'être coupée en attendant, et il reste utile après :
   * une borne qui tranche AVANT que la suite ait fini ne protège rien, elle
   * transforme une suite lente en suite muette.
   *
   * Le plafond du job suit (110 min dans e2e.yml) : cette borne doit rester
   * SOUS lui, parce que Playwright sait rendre un rapport en s'arrêtant alors
   * qu'un job tué par le coureur ne laisse rien.
   */
  globalTimeout: 75 * 60_000,

  /*
   * Au-delà de vingt échecs, la suite ne mesure plus un défaut mais un
   * environnement cassé. On s'arrête et on rend le rapport tant qu'il reste du
   * temps pour l'écrire.
   */
  maxFailures: process.env.CI ? 20 : 0,

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

        // Un rognage par conteneur de défilement : mesuré identique sur les deux moteurs, épinglé sur les deux.
        /bandeau-toast-visible\.spec\.ts/,

        // BUG-QA0928-MODALE-SANS-FOCUS : mesuré sur WebKit (focus resté dans la page), épinglé sur ce moteur aussi.
        /modale-accueil-prend-le-focus\.spec\.ts/,

        /*
         * PAS `idee-entre-domaines.spec.ts`, et ce n'est pas un oubli. Mesuré le
         * 2026-09-30 : le WebKit de Playwright ne garde AUCUN cookie `Secure` reçu
         * en http — ni sur 127.0.0.1, ni sur localhost, ni sur *.localhost ;
         * Chromium les garde. La CI sert le build de production en http, avec des
         * cookies `Secure` : sous WebKit, l'inscription ne connecte jamais le
         * visiteur. Le test y échouait 5/5 et faisait expirer ce canari. Ce
         * parcours se prouve sur WebKit en production (https) :
         * `docs/bugs/qa-2026-09-28/verif-live-idee-deux-domaines.mjs`.
         */

        // Le titre de l'accueil prend six lignes en français sur WebKit, trois sur Chromium : c'est ici que le champ sortait de l'écran.
        /accueil-champ-au-premier-ecran\.spec\.ts/,
      ],
    },
  ],
});
