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
function makeFetch(options: {
  servingState?: string;
  apiFails?: boolean;
  badgeRequired?: boolean;
  omitEntitlementsPin?: boolean;
  appContentType?: string;
  omitAppContentType?: boolean;
  appStatus?: number;
}) {
  const appHits: string[] = [];
  const apiHits: string[] = [];

  const impl = vi.fn(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);

    if (url.includes('/serving-state')) {
      apiHits.push(url);

      if (options.apiFails) {
        throw new Error('API injoignable');
      }

      return new Response(
        JSON.stringify({
          state: options.servingState ?? 'live',
          ...(options.omitEntitlementsPin
            ? {}
            : {
                planEntitlements: {
                  version: '2026-08-27.1',
                  badgeRequired: options.badgeRequired ?? false,
                },
              }),
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    // Tout le reste = l'amont applicatif (le workload déployé).
    appHits.push(url);

    return new Response(APP_BODY, {
      status: options.appStatus ?? 200,
      headers: options.omitAppContentType ? undefined : { 'content-type': options.appContentType ?? 'text/plain' },
    });
  });

  return { impl: impl as unknown as typeof fetch, appHits, apiHits };
}

async function buildProxy(fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) {
  return buildPreviewProxyApp({
    previewDomain: PREVIEW_DOMAIN,
    apiBaseUrl: 'http://api.internal',
    proxySharedSecret: 'published-frame-test-secret',
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

  it('compose le badge Starter hors du DOM applicatif, localisé et responsive', async () => {
    const { impl, appHits } = makeFetch({
      servingState: 'live',
      badgeRequired: true,
      appContentType: 'text/html; charset=utf-8',
    });
    const proxy = await buildProxy(impl);

    try {
      const response = await proxy.inject({
        method: 'GET',
        url: '/',
        headers: { host: DEPLOY_HOST, 'accept-language': 'fr-FR', 'sec-fetch-dest': 'document' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(APP_BODY);
      expect(response.body).toContain('data-vibecore-published-badge');
      expect(response.body).toContain('Créé avec E-Code');
      expect(response.body).toContain('@media(max-width:480px)');
      expect(response.body).toContain('min-height:44px');
      expect(response.body).toContain('rel="noopener noreferrer"');
      expect(response.body).toContain('<iframe');
      expect(response.body).toContain('sandbox="allow-downloads');
      expect(response.body).toContain('vc-loading');
      expect(response.body).toContain('Chargement de l’application publiée');
      expect(appHits).toHaveLength(0);

      const rawSource = /<iframe[^>]+src="([^"]+)"/.exec(response.body)?.[1]?.replaceAll('&amp;', '&');
      expect(rawSource).toBeTruthy();
      const rawUrl = new URL(rawSource!);
      expect(rawUrl.hostname).toBe(`rd-${DEPLOY_ID}.${PREVIEW_DOMAIN}`);

      const raw = await proxy.inject({
        method: 'GET',
        url: `${rawUrl.pathname}${rawUrl.search}`,
        headers: { host: rawUrl.host, 'sec-fetch-dest': 'iframe' },
      });
      expect(raw.statusCode).toBe(200);
      expect(raw.body).toBe(APP_BODY);
      expect(appHits).toHaveLength(1);

      // Even with a valid signed frame URL, a copied direct navigation never
      // becomes a badge-free public origin.
      const bypass = await proxy.inject({
        method: 'GET',
        url: `${rawUrl.pathname}${rawUrl.search}`,
        headers: { host: rawUrl.host, 'sec-fetch-dest': 'document' },
      });
      expect(bypass.statusCode).toBe(404);
    } finally {
      await proxy.close();
    }
  });

  it.each([
    ['XHTML', 'application/xhtml+xml', 200, false],
    ['SVG', 'image/svg+xml', 200, false],
    ['HTML latin-1', 'text/html; charset=iso-8859-1', 200, false],
    ['MIME absent', undefined, 200, true],
    ['404', 'text/html; charset=utf-8', 404, false],
    ['500', 'text/html; charset=utf-8', 500, false],
  ])('sert le shell avant workload pour une navigation Starter %s', async (_label, contentType, status, omitMime) => {
    const { impl, appHits } = makeFetch({
      servingState: 'live',
      badgeRequired: true,
      appContentType: contentType,
      appStatus: status,
      omitAppContentType: omitMime,
    });
    const proxy = await buildProxy(impl);
    try {
      const shell = await proxy.inject({
        method: 'GET',
        url: '/anything',
        headers: { host: DEPLOY_HOST, 'sec-fetch-dest': 'document' },
      });
      expect(shell.statusCode).toBe(200);
      expect(shell.body).toContain('data-vibecore-published-badge');
      expect(appHits).toHaveLength(0);

      const source = /<iframe[^>]+src="([^"]+)"/.exec(shell.body)?.[1]?.replaceAll('&amp;', '&');
      const rawUrl = new URL(source!);
      const raw = await proxy.inject({
        method: 'GET',
        url: `${rawUrl.pathname}${rawUrl.search}`,
        headers: { host: rawUrl.host, 'sec-fetch-dest': 'iframe' },
      });
      expect(raw.statusCode).toBe(status);
      expect(raw.body).toBe(APP_BODY);
      expect(appHits).toHaveLength(1);
    } finally {
      await proxy.close();
    }
  });

  it.each([
    ['HEAD document', 'HEAD', 'document'],
    ['script asset', 'GET', 'script'],
  ])('ne remplace pas %s par le shell badge', async (_label, method, destination) => {
    const { impl, appHits } = makeFetch({ servingState: 'live', badgeRequired: true, appContentType: 'text/html' });
    const proxy = await buildProxy(impl);
    try {
      const response = await proxy.inject({
        method,
        url: '/asset.js',
        headers: { host: DEPLOY_HOST, 'sec-fetch-dest': destination, accept: 'text/html' },
      });
      expect(response.body).not.toContain('data-vibecore-published-badge');
      expect(appHits).toHaveLength(1);
    } finally {
      await proxy.close();
    }
  });

  it('ne retire le badge que lorsque le pin exact le permet', async () => {
    const { impl } = makeFetch({
      servingState: 'live',
      badgeRequired: false,
      appContentType: 'text/html; charset=utf-8',
    });
    const proxy = await buildProxy(impl);

    try {
      const response = await proxy.inject({ method: 'GET', url: '/', headers: { host: DEPLOY_HOST } });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('data-vibecore-published-badge');
    } finally {
      await proxy.close();
    }
  });

  it('refuse le workload si le control-plane ne fournit pas le pin exact', async () => {
    const { impl, appHits } = makeFetch({ servingState: 'live', omitEntitlementsPin: true });
    const proxy = await buildProxy(impl);

    try {
      const response = await proxy.inject({ method: 'GET', url: '/', headers: { host: DEPLOY_HOST } });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'PUBLICATION_STATE_UNAVAILABLE' });
      expect(appHits).toHaveLength(0);
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
