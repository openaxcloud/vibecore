/**
 * Extinction 30 j du chemin SERVER (réserve ciblée du rejeu expert).
 *
 * Le premier lot n'éteignait que `/static-deployments/*`. Le proxy transmet
 * `d-<id>.<domaine>` DIRECTEMENT au Service in-cluster sans consulter l'API :
 * une publication Starter expirée restait donc joignable indéfiniment.
 *
 * Ce fichier prouve les deux moitiés :
 *  - le TEST NÉGATIF reproduit la faille telle qu'elle existait (garde absent) ;
 *  - les TESTS POSITIFS montrent le 410, zéro octet applicatif, et surtout
 *    qu'AUCUNE requête n'atteint l'amont.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildPreviewProxyApp } from './app.js';

const PREVIEW_DOMAIN = 'preview.e-code.test';
const DEPLOY_ID = 'cmdeployexpired001';
const DEPLOY_HOST = `d-${DEPLOY_ID}.${PREVIEW_DOMAIN}`;

const APP_BODY = 'CONTENU APPLICATIF SERVEUR';

/**
 * Faux `fetch` qui distingue les deux amonts :
 *  - l'API (état de service) ;
 *  - le Service in-cluster du déploiement (l'app elle-même).
 *
 * `appHits` est la mesure décisive : elle dit si du trafic a atteint le workload.
 */
function makeFetch(options: { servingState?: string; apiFails?: boolean }) {
  const appHits: string[] = [];
  const apiHits: string[] = [];

  const impl = vi.fn(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);

    if (url.includes('/serving-state')) {
      apiHits.push(url);

      if (options.apiFails) {
        throw new Error('API injoignable');
      }

      return new Response(JSON.stringify({ state: options.servingState ?? 'live' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Tout le reste = l'amont applicatif (le workload déployé).
    appHits.push(url);

    return new Response(APP_BODY, { status: 200, headers: { 'content-type': 'text/plain' } });
  });

  return { impl: impl as unknown as typeof fetch, appHits, apiHits };
}

async function buildProxy(fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) {
  return buildPreviewProxyApp({
    previewDomain: PREVIEW_DOMAIN,
    apiBaseUrl: 'http://api.internal',
    serverDeployUpstreamTemplate: 'http://app-{deploymentId}.workspaces.svc.cluster.local',
    fetchImpl,
    ...extra,
  });
}

describe('TEST NÉGATIF — la faille telle qu elle existait', () => {
  it("SANS garde d'expiration, une publication SERVER expirée reste SERVIE", async () => {
    /*
     * Reproduction fidèle de l'état d'avant correctif : on neutralise la seule
     * source d'autorité du proxy (apiBaseUrl absent ⇒ aucune vérification
     * d'expiration possible), exactement comme lorsque le garde n'existait pas.
     * L'API dirait pourtant « expired ».
     */
    const { impl, appHits } = makeFetch({ servingState: 'expired' });
    const proxy = await buildProxy(impl, { apiBaseUrl: undefined });

    try {
      const response = await proxy.inject({
        method: 'GET',
        url: '/',
        headers: { host: DEPLOY_HOST },
      });

      // LA FAILLE : 200 et le contenu applicatif est servi malgré l'expiration.
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(APP_BODY);
      // …et le trafic a bien atteint le workload.
      expect(appHits.length).toBeGreaterThan(0);
    } finally {
      await proxy.close();
    }
  });
});

describe('TEST POSITIF — extinction réelle du chemin SERVER', () => {
  it('publication expirée -> 410, ZÉRO octet applicatif, ZÉRO requête vers l amont', async () => {
    const { impl, appHits, apiHits } = makeFetch({ servingState: 'expired' });
    const proxy = await buildProxy(impl);

    try {
      const response = await proxy.inject({
        method: 'GET',
        url: '/',
        headers: { host: DEPLOY_HOST },
      });

      expect(response.statusCode).toBe(410);
      expect(response.json()).toMatchObject({ code: 'PUBLISHED_DEPLOYMENT_EXPIRED' });

      // Zéro octet du contenu applicatif.
      expect(response.body).not.toContain(APP_BODY);

      /*
       * LA propriété qui distingue une extinction d'une façade : aucune requête
       * n'a atteint le workload. Le refus se produit AVANT tout forward.
       */
      expect(appHits).toHaveLength(0);
      expect(apiHits.length).toBeGreaterThan(0);
    } finally {
      await proxy.close();
    }
  });

  it('une publication VIVANTE est servie normalement (pas de faux positif)', async () => {
    const { impl, appHits } = makeFetch({ servingState: 'live' });
    const proxy = await buildProxy(impl);

    try {
      const response = await proxy.inject({ method: 'GET', url: '/', headers: { host: DEPLOY_HOST } });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(APP_BODY);
      expect(appHits.length).toBeGreaterThan(0);
    } finally {
      await proxy.close();
    }
  });

  it('le 410 couvre TOUS les chemins de l app, pas seulement la racine', async () => {
    const { impl, appHits } = makeFetch({ servingState: 'expired' });
    const proxy = await buildProxy(impl);

    try {
      for (const url of ['/', '/index.html', '/api/data', '/assets/app.js', '/deep/nested/route']) {
        const response = await proxy.inject({ method: 'GET', url, headers: { host: DEPLOY_HOST } });
        expect(response.statusCode, `chemin ${url}`).toBe(410);
      }

      expect(appHits).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });

  it("le 410 couvre aussi les méthodes d'écriture", async () => {
    const { impl, appHits } = makeFetch({ servingState: 'expired' });
    const proxy = await buildProxy(impl);

    try {
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'] as const) {
        const response = await proxy.inject({ method, url: '/api/write', headers: { host: DEPLOY_HOST } });
        expect(response.statusCode, method).toBe(410);
      }

      expect(appHits).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });

  it("l'état est mis en cache : l'API n'est pas interrogée à chaque requête", async () => {
    const { impl, apiHits } = makeFetch({ servingState: 'expired' });
    const proxy = await buildProxy(impl);

    try {
      for (let i = 0; i < 10; i += 1) {
        await proxy.inject({ method: 'GET', url: '/', headers: { host: DEPLOY_HOST } });
      }

      // Une seule interrogation dans la fenêtre de cache.
      expect(apiHits).toHaveLength(1);
    } finally {
      await proxy.close();
    }
  });

  it('API injoignable ET état jamais établi -> 503, JAMAIS 200', async () => {
    /*
     * Ce test asseyait auparavant un fail-open (200). Le rejeu expert l'a rejeté :
     * servir les octets d'un workload POTENTIELLEMENT expiré est précisément ce
     * qu'il faut interdire. État indéterminé ⇒ 503, et l'app n'est pas atteinte.
     *
     * La disponibilité n'est pas sacrifiée pour autant : un état « vivant »
     * récemment confirmé reste servi pendant sa fenêtre de fraîcheur (couvert par
     * server-deploy-expiry-durability.spec.ts).
     */
    const { impl, appHits } = makeFetch({ apiFails: true });
    const proxy = await buildProxy(impl);

    try {
      const response = await proxy.inject({ method: 'GET', url: '/', headers: { host: DEPLOY_HOST } });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'PUBLICATION_STATE_UNAVAILABLE' });
      expect(response.body).not.toContain(APP_BODY);
      expect(appHits).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });
});
