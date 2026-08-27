/**
 * INVARIANT VERROUILLÉ : l'extinction est une barrière DURABLE, pas une pause.
 *
 * Le fail-open du garde proxy n'est acceptable QUE comme défense secondaire. Ce
 * fichier prouve que le garde ne rouvre jamais l'accès quand l'expiration est
 * connue, et qu'un état réellement indéterminé produit un 503 — jamais un 200
 * avec les octets d'un workload potentiellement expiré.
 *
 * Le scénario ciblé combine les trois pannes SIMULTANÉMENT :
 *   arrêt du workload en échec + manager indisponible + lecture du garde KO.
 */
import { describe, expect, it } from 'vitest';

import { buildPreviewProxyApp } from './app.js';

const PREVIEW_DOMAIN = 'preview.e-code.test';
const DEPLOY_ID = 'cmdurable0001';
const DEPLOY_HOST = `d-${DEPLOY_ID}.${PREVIEW_DOMAIN}`;
const APP_BODY = 'OCTETS-APPLICATIFS-DU-WORKLOAD';

/**
 * `apiState` est mutable pendant le test : c'est ainsi qu'on simule la panne de
 * la lecture utilisée par le garde APRÈS que l'expiration a été connue.
 */
function makeHarness(initial: { state?: string; down?: boolean } = {}) {
  const control = { state: initial.state ?? 'live', down: Boolean(initial.down) };
  const appHits: string[] = [];
  const apiHits: string[] = [];

  const fetchImpl = (async (input: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);

    if (url.includes('/serving-state')) {
      apiHits.push(url);

      if (control.down) {
        throw new Error('API injoignable (lecture du garde KO)');
      }

      return new Response(
        JSON.stringify({
          state: control.state,
          planEntitlements: { version: '2026-08-27.1', badgeRequired: false },
        }),
        {
        status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    appHits.push(url);

    return new Response(APP_BODY, { status: 200, headers: { 'content-type': 'text/plain' } });
  }) as unknown as typeof fetch;

  return { control, fetchImpl, appHits, apiHits };
}

const buildProxy = (fetchImpl: typeof fetch) =>
  buildPreviewProxyApp({
    previewDomain: PREVIEW_DOMAIN,
    apiBaseUrl: 'http://api.internal',
    serverDeployUpstreamTemplate: 'http://app-{deploymentId}.workspaces.svc.cluster.local',
    fetchImpl,
  });

const get = (proxy: any, url = '/') => proxy.inject({ method: 'GET', url, headers: { host: DEPLOY_HOST } });

describe('INV.4 — expiration CONNUE : aucune panne ne rouvre l accès', () => {
  it('SCÉNARIO CIBLÉ : expiration connue, puis lecture du garde KO -> 410, jamais 200', async () => {
    const { control, fetchImpl, appHits } = makeHarness({ state: 'expired' });
    const proxy = await buildProxy(fetchImpl);

    try {
      // 1. L'expiration devient CONNUE.
      const first = await get(proxy);
      expect(first.statusCode).toBe(410);

      // 2. La lecture utilisée par le garde tombe (dépendance indisponible).
      control.down = true;

      /*
       * 3. On martèle bien au-delà de toute fenêtre de cache « vivant ». Le
       *    verdict d'expiration est COLLANT : l'extinction est monotone, une
       *    publication éteinte ne redevient jamais vivante.
       */
      for (let i = 0; i < 25; i += 1) {
        const response = await get(proxy, `/chemin-${i}`);
        expect(response.statusCode, `requête ${i}`).toBe(410);
        expect(response.body).not.toContain(APP_BODY);
      }

      // Aucun octet applicatif, aucune requête vers l'amont.
      expect(appHits).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });

  it("le verdict d'expiration ne peut pas être contredit par l'API elle-même", async () => {
    const { control, fetchImpl, appHits } = makeHarness({ state: 'expired' });
    const proxy = await buildProxy(fetchImpl);

    try {
      expect((await get(proxy)).statusCode).toBe(410);

      /*
       * Même si l'autorité se mettait à répondre « live » — régression, bascule
       * sur une réplique en retard, réponse corrompue — l'extinction reste
       * acquise. La republication crée un NOUVEL id, jamais une résurrection.
       */
      control.state = 'live';

      for (let i = 0; i < 5; i += 1) {
        expect((await get(proxy)).statusCode).toBe(410);
      }

      expect(appHits).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });
});

describe('INV.5 — état INDÉTERMINÉ : 503, jamais 200', () => {
  it("état jamais établi + lecture KO -> 503 et zéro octet applicatif", async () => {
    const { fetchImpl, appHits } = makeHarness({ down: true });
    const proxy = await buildProxy(fetchImpl);

    try {
      const response = await get(proxy);

      // Ni 410 (on ne prétend pas qu'elle est éteinte), ni 200 (on ne sert pas
      // les octets d'un workload potentiellement expiré).
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'PUBLICATION_STATE_UNAVAILABLE', retryable: true });
      expect(response.headers['retry-after']).toBeDefined();
      expect(response.body).not.toContain(APP_BODY);
      expect(appHits).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });

  it('une réponse API non-OK est indéterminée, pas une autorisation', async () => {
    const appHits: string[] = [];
    const fetchImpl = (async (input: any) => {
      const url = typeof input === 'string' ? input : String(input?.url ?? input);

      if (url.includes('/serving-state')) {
        return new Response('erreur interne', { status: 500 });
      }

      appHits.push(url);

      return new Response(APP_BODY, { status: 200 });
    }) as unknown as typeof fetch;

    const proxy = await buildProxy(fetchImpl);

    try {
      expect((await get(proxy)).statusCode).toBe(503);
      expect(appHits).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });

  it("`not-found` est indéterminé : on ne sert pas une app qu'on ne sait pas identifier", async () => {
    const { fetchImpl, appHits } = makeHarness({ state: 'not-found' });
    const proxy = await buildProxy(fetchImpl);

    try {
      expect((await get(proxy)).statusCode).toBe(503);
      expect(appHits).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });

  it("une app VIVANTE confirmée survit à une panne BRÈVE de la lecture (fenêtre de fraîcheur)", async () => {
    /*
     * La contrepartie du 503 : on ne veut pas qu'un hoquet de l'API coupe toutes
     * les applications déployées. Un état « vivant » récemment confirmé reste
     * servi le temps de sa fenêtre de fraîcheur.
     */
    const { control, fetchImpl, appHits } = makeHarness({ state: 'live' });
    const proxy = await buildProxy(fetchImpl);

    try {
      expect((await get(proxy)).statusCode).toBe(200);

      control.down = true;

      const during = await get(proxy);
      expect(during.statusCode).toBe(200);
      expect(during.body).toContain(APP_BODY);
      expect(appHits.length).toBeGreaterThan(1);
    } finally {
      await proxy.close();
    }
  });
});
