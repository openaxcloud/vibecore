import { describe, expect, it } from 'vitest';
import { buildPreviewProxyApp } from './app.js';

/*
 * LE PROXY D'APERCU NE DOIT PAS MOURIR D'UNE REPONSE MAL FORMEE.
 *
 * Production, 2026-09-08 : les deux pods `preview-proxy` portaient SEPT
 * redemarrages. Le journal du conteneur mort :
 *
 *   GET /@vite/client -> "Route ... not found" -> 404 "stream closed prematurely"
 *   FastifyError: Attempted to send payload of invalid type 'object'
 *     code FST_ERR_REP_INVALID_PAYLOAD_TYPE  -> exit 1
 *
 * Il n'y avait ni `setErrorHandler` ni `setNotFoundHandler` dans ce service.
 * Un seul espace de travail au serveur de dev instable faisait donc tomber
 * l'apercu de TOUS les utilisateurs : le pod redemarrait, nginx n'avait plus
 * d'amont sain, et l'URL publique rendait 503.
 */

const agent = { baseUrl: 'http://workspace-agent.test', token: 'agent-token' };
const construire = () => buildPreviewProxyApp({ fetchImpl: fetch, resolveAgent: async () => agent });

describe('le proxy survit aux reponses mal formees', () => {
  it("une route absente rend un 404 TEXTUEL, jamais un objet", async () => {
    const app = await construire();
    const r = await app.inject({ method: 'GET', url: '/chemin-qui-nexiste-pas' });

    expect(r.statusCode).toBe(404);
    expect(r.headers['content-type']).toContain('text/plain');
    expect(r.body).toBe('Not Found');
  });

  it("une route absente sur un chemin d'asset Vite ne leve pas — c'est le cas de production", async () => {
    const app = await construire();
    const r = await app.inject({ method: 'GET', url: '/@vite/client' });

    expect(r.statusCode).toBe(404);
    expect(r.headers['content-type']).toContain('text/plain');
  });

  it("une erreur levee APRES un content-type d'amont non-JSON est capturee, pas fatale", async () => {
    const app = await construire();

    /*
     * Reproduction fidele du crash : le content-type vient de l'amont
     * (`text/javascript` pour `/@vite/client`), PUIS quelque chose leve. Sans
     * gestionnaire, Fastify tentait d'envoyer son objet d'erreur par-dessus ce
     * content-type et levait FST_ERR_REP_INVALID_PAYLOAD_TYPE.
     */
    app.get('/piege', async (_request, reply) => {
      reply.header('content-type', 'text/javascript');
      throw new Error('stream closed prematurely');
    });

    const r = await app.inject({ method: 'GET', url: '/piege' });

    expect(r.statusCode).toBe(502);
    expect(r.headers['content-type']).toContain('text/plain');
    expect(typeof r.body).toBe('string');
    expect(r.body).toBe('Preview temporarily unavailable');
  });

  it('une erreur portant un statut HTTP conserve ce statut', async () => {
    const app = await construire();
    app.get('/refuse', async () => {
      const e = new Error('nope') as Error & { statusCode?: number };
      e.statusCode = 403;
      throw e;
    });

    const r = await app.inject({ method: 'GET', url: '/refuse' });
    expect(r.statusCode).toBe(403);
  });

  it('TEMOIN — /health repond toujours normalement en JSON', async () => {
    // Sans ce temoin, des gardes qui casseraient TOUTES les reponses passeraient
    // les tests ci-dessus. Il ancre le fait que le service fonctionne encore.
    const app = await construire();
    const r = await app.inject({ method: 'GET', url: '/health' });

    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('application/json');
    expect(JSON.parse(r.body)).toMatchObject({ status: 'ok', service: 'preview-proxy' });
  });
});
