import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildPreviewProxyApp } from './app';

/*
 * P0 — le cookie de tenant ne doit JAMAIS atteindre un workload utilisateur.
 *
 * L'amont d'un hôte `d-<id>.<previewDomain>` est du code DÉPLOYÉ PAR UN
 * UTILISATEUR, servi publiquement. Le cookie `vc_preview` est posé avec
 * `Domain=.e-code.ai` et vit 12 h : le navigateur l'envoie donc aussi à cet hôte.
 * La boucle d'en-têtes de ce chemin ne retirait ni `cookie` ni `authorization`
 * (celle du chemin statique `s-<id>`, elle, les retirait) — donc une application
 * publiée malveillante recevait le jeton tenant de son visiteur et pouvait le
 * rejouer pour lire les previews de la victime.
 *
 * Ce test ne relit pas la deny-list : il monte un VRAI serveur amont, fait passer
 * une requête par le proxy, et inspecte les en-têtes que l'amont a réellement
 * reçus. Rouge avant le correctif, vert après.
 */
describe('d-<id> — aucune fuite de credential vers le workload utilisateur', () => {
  const PREVIEW_DOMAIN = 'preview.e-code.ai';
  const DEPLOY_ID = 'dep123';

  /** En-têtes vus par l'amont, requête après requête. */
  const received: IncomingHttpHeaders[] = [];
  let upstream: Server;
  let upstreamPort = 0;

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      received.push(req.headers);
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('deployed app');
    });

    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    upstreamPort = (upstream.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  const build = () =>
    buildPreviewProxyApp({
      previewDomain: PREVIEW_DOMAIN,
      // Gabarit d'amont pointant sur le faux workload.
      serverDeployUpstreamTemplate: `http://127.0.0.1:${upstreamPort}`,
      // Pas d'API configurée => `resolveServingVerdict` renvoie 'live' (le garde
      // d'extinction est hors service sans API), donc la requête est bien
      // transmise à l'amont : c'est exactement ce qu'on veut observer ici.
      resolveAgent: async () => undefined,
    });

  const hit = async (headers: Record<string, string>) => {
    const app = await build();
    received.length = 0;

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: `d-${DEPLOY_ID}.${PREVIEW_DOMAIN}`, ...headers },
    });

    await app.close();

    return { response, upstreamHeaders: received[0] };
  };

  it('ne transmet PAS le cookie vc_preview a l amont', async () => {
    const { response, upstreamHeaders } = await hit({
      cookie: 'vc_preview=jeton-tenant-de-la-victime; theme=dark',
    });

    expect(response.statusCode).toBe(200);
    expect(upstreamHeaders).toBeDefined();
    expect(upstreamHeaders.cookie).toBeUndefined();
    // Et surtout : la valeur du jeton n'apparaît dans AUCUN en-tête reçu.
    expect(JSON.stringify(upstreamHeaders)).not.toContain('jeton-tenant-de-la-victime');
  });

  it('ne transmet PAS l en-tete Authorization a l amont', async () => {
    const { response, upstreamHeaders } = await hit({
      authorization: 'Bearer jeton-porteur-de-la-victime',
    });

    expect(response.statusCode).toBe(200);
    expect(upstreamHeaders.authorization).toBeUndefined();
    expect(JSON.stringify(upstreamHeaders)).not.toContain('jeton-porteur-de-la-victime');
  });

  it('ne transmet ni l un ni l autre quand les deux sont presents', async () => {
    const { upstreamHeaders } = await hit({
      cookie: 'vc_preview=secret-cookie',
      authorization: 'Bearer secret-bearer',
    });

    expect(upstreamHeaders.cookie).toBeUndefined();
    expect(upstreamHeaders.authorization).toBeUndefined();
    const seen = JSON.stringify(upstreamHeaders);
    expect(seen).not.toContain('secret-cookie');
    expect(seen).not.toContain('secret-bearer');
  });

  it('ne transmet pas non plus l en-tete interne de tenant', async () => {
    const { upstreamHeaders } = await hit({
      'x-vibecore-preview-tenant': 'jeton-interne',
    });

    expect(JSON.stringify(upstreamHeaders)).not.toContain('jeton-interne');
  });

  it('laisse passer les en-tetes applicatifs legitimes (le filtre n est pas un blocage global)', async () => {
    const { upstreamHeaders } = await hit({
      'accept-language': 'fr-FR',
      'user-agent': 'navigateur-de-test',
    });

    expect(upstreamHeaders['accept-language']).toBe('fr-FR');
    expect(upstreamHeaders['user-agent']).toBe('navigateur-de-test');
  });
});
