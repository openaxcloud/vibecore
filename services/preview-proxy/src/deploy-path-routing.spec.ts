import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildPreviewProxyApp, deployPathSubPath } from './app';

/*
 * Routage par CHEMIN des publications — `/d/<id>` et `/s/<id>`.
 *
 * POURQUOI il existe : le screenshotter ne peut pas fabriquer un `Host` (Chromium
 * interdit d'y toucher et le recalcule depuis l'URL). Le routage par chemin avait
 * été ajouté pour les previews de workspace seulement, alors que l'API planifie
 * AUSSI les vignettes des publications `d-<id>` / `s-<id>` : ces captures partaient
 * donc avec un Host que le proxy ne route pas.
 *
 * POURQUOI il est fermé aux appelants externes : sans garde, `https://<proxy>/d/a`
 * et `/d/b` mettraient deux publications distinctes sur UNE MÊME origine, ce qui
 * détruirait l'isolation d'origine (cookies, localStorage, same-origin scripting)
 * que les hôtes `d-`/`s-` existent précisément pour donner.
 */
describe('routage par chemin des publications', () => {
  const SECRET = 'secret-proxy-de-test-ne-pas-livrer';
  const DEPLOY_ID = 'clx9k2m4p';

  /** Chemins vus par l'amont, dans l'ordre. */
  const seen: string[] = [];
  let upstream: Server;
  let upstreamPort = 0;

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      seen.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('app publiee');
    });

    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    upstreamPort = (upstream.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  const build = (withSecret = true) =>
    buildPreviewProxyApp({
      previewDomain: 'preview.e-code.ai',
      serverDeployUpstreamTemplate: `http://127.0.0.1:${upstreamPort}`,
      ...(withSecret ? { proxySharedSecret: SECRET } : {}),
      // Sans API configurée, `resolveServingVerdict` renvoie 'live' : la requête
      // atteint donc bien l'amont, ce qu'on veut observer.
      resolveAgent: async () => undefined,
    });

  const hit = async (url: string, headers: Record<string, string> = {}, withSecret = true) => {
    const app = await build(withSecret);
    seen.length = 0;

    const response = await app.inject({ method: 'GET', url, headers });

    await app.close();

    return response;
  };

  it('sert la publication quand l appelant presente le secret interne', async () => {
    const response = await hit(`/d/${DEPLOY_ID}/assets/app.js?v=3`, {
      'x-vibecore-preview-internal': SECRET,
    });

    expect(response.statusCode).toBe(200);
    // L'amont doit recevoir le chemin de l'APP, pas le prefixe de routage.
    expect(seen).toEqual(['/assets/app.js?v=3']);
  });

  it('demande la racine de l app pour /d/<id> nu', async () => {
    const response = await hit(`/d/${DEPLOY_ID}`, { 'x-vibecore-preview-internal': SECRET });

    expect(response.statusCode).toBe(200);
    expect(seen).toEqual(['/']);
  });

  it('REFUSE sans en-tete interne — et l amont ne voit rien', async () => {
    const response = await hit(`/d/${DEPLOY_ID}/`);

    expect(response.statusCode).toBe(403);
    expect(seen).toEqual([]);
  });

  it('REFUSE avec un mauvais secret', async () => {
    const response = await hit(`/d/${DEPLOY_ID}/`, { 'x-vibecore-preview-internal': 'pas-le-bon' });

    expect(response.statusCode).toBe(403);
    expect(seen).toEqual([]);
  });

  it('la route n existe pas quand aucun secret n est configure (fail-closed)', async () => {
    const response = await hit(`/d/${DEPLOY_ID}/`, { 'x-vibecore-preview-internal': SECRET }, false);

    expect(response.statusCode).toBe(404);
    expect(seen).toEqual([]);
  });

  it('le secret ne fuit pas vers l app publiee', async () => {
    const headers: Record<string, string>[] = [];
    const spy = createServer((req, res) => {
      headers.push(req.headers as Record<string, string>);
      res.writeHead(200).end('ok');
    });

    await new Promise<void>((resolve) => spy.listen(0, '127.0.0.1', resolve));
    const port = (spy.address() as AddressInfo).port;

    const app = await buildPreviewProxyApp({
      previewDomain: 'preview.e-code.ai',
      serverDeployUpstreamTemplate: `http://127.0.0.1:${port}`,
      proxySharedSecret: SECRET,
      resolveAgent: async () => undefined,
    });

    await app.inject({
      method: 'GET',
      url: `/d/${DEPLOY_ID}/`,
      headers: { 'x-vibecore-preview-internal': SECRET },
    });

    await app.close();
    await new Promise<void>((resolve) => spy.close(() => resolve()));

    expect(JSON.stringify(headers[0])).not.toContain(SECRET);
  });
});

/*
 * Le découpage du préfixe est de l'arithmétique de chaînes : c'est exactement là
 * que se logent les erreurs off-by-one, et un mauvais découpage demande à l'amont
 * une URL qu'il ne connaît pas (404 silencieux sur la vignette).
 */
describe('deployPathSubPath', () => {
  it('retire le prefixe et garde le reste', () => {
    expect(deployPathSubPath({ url: '/d/abc123/assets/x.js' }, 'd')).toBe('/assets/x.js');
    expect(deployPathSubPath({ url: '/s/abc123/index.html' }, 's')).toBe('/index.html');
  });

  it('rend la racine pour un prefixe nu, avec ou sans query', () => {
    expect(deployPathSubPath({ url: '/d/abc123' }, 'd')).toBe('/');
    expect(deployPathSubPath({ url: '/d/abc123?a=1' }, 'd')).toBe('/?a=1');
    expect(deployPathSubPath({ url: '/d/abc123/' }, 'd')).toBe('/');
  });

  it('ne touche pas une URL qui ne porte pas le prefixe attendu', () => {
    expect(deployPathSubPath({ url: '/autre/chose' }, 'd')).toBe('/autre/chose');
    // Un chemin `/s/...` n'est pas amputé par le découpage `d`.
    expect(deployPathSubPath({ url: '/s/abc123/x' }, 'd')).toBe('/s/abc123/x');
  });

  it('laisse intact un chemin de l app qui ressemble au prefixe', () => {
    // `/d/<id>/d/<id>/x` : seul le PREMIER segment est un prefixe de routage.
    expect(deployPathSubPath({ url: '/d/abc123/d/abc123/x' }, 'd')).toBe('/d/abc123/x');
  });
});
