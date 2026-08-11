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

/*
 * Ces deux refus (410 / 503) sont les SEULES pages que voit le visiteur d'une
 * publication éteinte : à ce stade il n'y a plus d'application pour parler à sa
 * place. Leur copie était écrite en dur en FRANÇAIS, donc servie en français à
 * un visiteur anglophone — et, comme elle contournait le catalogue, elle a
 * rouvert la dette que la garde i18n `scan-source.mjs` surveille.
 *
 * On verrouille ici les DEUX directions (fr et en) et la négociation par
 * en-tête, pas seulement « la chaîne n'est plus en dur » : c'est la différence
 * entre une garde verte et un comportement réellement localisé.
 */
describe('refus de publication — copie localisée (régression garde i18n)', () => {
  it('410 expiré : copie FR/EN négociée, statut et code inchangés', async () => {
    const french = await (async () => {
      const { impl } = makeFetch({ servingState: 'expired' });
      const proxy = await buildProxy(impl);

      try {
        return await proxy.inject({
          method: 'GET',
          url: '/',
          headers: { host: DEPLOY_HOST, 'accept-language': 'fr-FR' },
        });
      } finally {
        await proxy.close();
      }
    })();

    const english = await (async () => {
      const { impl } = makeFetch({ servingState: 'expired' });
      const proxy = await buildProxy(impl);

      try {
        return await proxy.inject({
          method: 'GET',
          url: '/',
          headers: { host: DEPLOY_HOST, 'accept-language': 'en-US' },
        });
      } finally {
        await proxy.close();
      }
    })();

    expect(french.statusCode).toBe(410);
    expect(english.statusCode).toBe(410);
    expect(french.headers['content-language']).toBe('fr');
    expect(english.headers['content-language']).toBe('en');
    expect(french.json().error).toBe(
      'Cette publication a expiré. Republiez le projet pour remettre l’adresse en ligne.',
    );
    expect(english.json().error).toBe(
      'This publication has expired. Publish the project again to bring its address back online.',
    );
    expect(french.json().code).toBe('PUBLISHED_DEPLOYMENT_EXPIRED');
    expect(english.json().code).toBe('PUBLISHED_DEPLOYMENT_EXPIRED');

    // Le refus reste non cachable : une réponse 410 mise en cache survivrait à une republication.
    expect(french.headers['cache-control']).toBe('no-store');
  });

  it('503 état indéterminé : copie FR/EN négociée, retry-after et retryable préservés', async () => {
    const french = await (async () => {
      const { impl } = makeFetch({ apiFails: true });
      const proxy = await buildProxy(impl);

      try {
        return await proxy.inject({
          method: 'GET',
          url: '/',
          headers: { host: DEPLOY_HOST, 'accept-language': 'fr-FR' },
        });
      } finally {
        await proxy.close();
      }
    })();

    const english = await (async () => {
      const { impl } = makeFetch({ apiFails: true });
      const proxy = await buildProxy(impl);

      try {
        return await proxy.inject({
          method: 'GET',
          url: '/',
          headers: { host: DEPLOY_HOST, 'accept-language': 'en-US' },
        });
      } finally {
        await proxy.close();
      }
    })();

    expect(french.statusCode).toBe(503);
    expect(english.statusCode).toBe(503);
    expect(french.json().error).toBe(
      'Impossible de vérifier l’état de cette publication. Réessayez dans un instant.',
    );
    expect(english.json().error).toBe(
      'This publication’s state could not be verified. Please try again in a moment.',
    );

    // Le contrat de reprise ne doit pas être perdu en passant par le catalogue.
    for (const response of [french, english]) {
      expect(response.json()).toMatchObject({ code: 'PUBLICATION_STATE_UNAVAILABLE', retryable: true });
      expect(response.headers['retry-after']).toBe('5');
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
});
