import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/**
 * UNE LECTURE SUR UN ESPACE ÉTEINT DOIT DEMANDER SON DÉMARRAGE.
 *
 * Le défaut (BUG-RUNTIME-425-001) : seule l'ÉCRITURE provisionnait. Une lecture
 * constatait l'agent injoignable, rendait `425`, et personne ne démarrait rien —
 * donc la lecture suivante rendait `425` à son tour, indéfiniment. Mesuré le
 * 2026-09-05 sur le banc d'audit : 23 lectures, 24 réponses `425`, ZÉRO appel de
 * démarrage en six heures.
 *
 * Ces cas ne lisent pas la source. Ils font tourner la vraie API contre un faux
 * manager qui COMPTE les `/workspaces/start` reçus, et un agent qui refuse la
 * connexion. Chaque condition est cassée séparément — un seul test qui les
 * couvrirait toutes passerait au vert en n'en tenant qu'une.
 */

async function demarrerFauxRuntime(panne: 'connexion-refusee' | 'nom-introuvable' = 'connexion-refusee') {
  /* Agent injoignable : le port est fermé, donc la connexion est refusée. */
  const agent = createServer((_request, response) => response.writeHead(503).end('{}'));
  await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));
  const agentPort = (agent.address() as { port: number }).port;
  await new Promise<void>((resolve) => agent.close(() => resolve()));

  const demarragesRecus: string[] = [];
  let manageurEnPanne = false;

  const manager = createServer((request, response) => {
    const chemin = new URL(request.url ?? '/', 'http://manager.local').pathname;

    response.setHeader('content-type', 'application/json');

    if (chemin === '/workspaces/start') {
      demarragesRecus.push(chemin);

      if (manageurEnPanne) {
        response.writeHead(500).end(JSON.stringify({ error: 'manager indisponible' }));
        return;
      }

      response.end(JSON.stringify({ status: 'RUNNING' }));

      return;
    }

    response.end(JSON.stringify(chemin.endsWith('/agent-token') ? { token: 'jeton-test' } : { status: 'STOPPED' }));
  });

  await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));

  const precedent = {
    manager: process.env.WORKSPACE_MANAGER_URL,
    agent: process.env.WORKSPACE_AGENT_URL_TEMPLATE,
  };

  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${(manager.address() as { port: number }).port}`;
  /*
   * DEUX PANNES DISTINCTES, deux branches distinctes du code :
   *  - port fermé  -> ECONNREFUSED -> branche « agent injoignable » (502) ;
   *  - `.invalid`  -> ENOTFOUND    -> branche `isWorkspaceDnsNotResolvedYet` (425).
   * Le TLD `.invalid` est réservé par la RFC 2606 : il ne résout jamais, sur
   * aucun réseau. Sans ce second cas, la branche DNS n'était couverte par aucun
   * test — vérifié : la neutraliser laissait les quatre premiers cas au vert.
   */
  process.env.WORKSPACE_AGENT_URL_TEMPLATE =
    panne === 'nom-introuvable' ? 'http://workspace-ws-inexistant.invalid' : `http://127.0.0.1:${agentPort}`;

  return {
    demarragesRecus,
    tomberEnPanne() {
      manageurEnPanne = true;
    },
    async close() {
      process.env.WORKSPACE_MANAGER_URL = precedent.manager;
      process.env.WORKSPACE_AGENT_URL_TEMPLATE = precedent.agent;
      await new Promise<void>((resolve) => (manager as Server).close(() => resolve()));
    },
  };
}

async function preparer() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store });

  const auth = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `lecture-425-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Lecture 425',
      organizationName: 'Lecture 425 Org',
    },
  });

  expect(auth.statusCode).toBe(201);

  const token = auth.json().token as string;
  const organizationId = auth.json().organization.id as string;

  const project = await app.inject({
    method: 'POST',
    url: `/orgs/${organizationId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Lecture 425 Project' },
  });

  expect(project.statusCode).toBe(201);

  const workspace = await store.createWorkspace({
    projectId: project.json().project.id as string,
    name: 'lecture-425',
    runtimeMode: 'remote-kubernetes',
  });

  await store.updateWorkspaceStatus({ workspaceId: workspace.id, status: 'STOPPED' });

  const lireArbre = async () =>
    app.inject({
      method: 'GET',
      url: `/api/runtime/workspaces/${workspace.id}/files/read?path=tree`,
      headers: { authorization: `Bearer ${token}` },
    });

  return { app, lireArbre };
}

/** Laisse partir le déclenchement en arrière-plan avant d'observer le manager. */
const laisserRespirer = () => new Promise((resolve) => setTimeout(resolve, 250));

let fermetures: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(fermetures.map((f) => f()));
  fermetures = [];
});

describe('une lecture sur un espace de travail éteint demande son démarrage', () => {
  it('CONDITION 0 — la lecture déclenche un démarrage au lieu de ne rien faire', async () => {
    const runtime = await demarrerFauxRuntime();
    const { app, lireArbre } = await preparer();
    fermetures.push(() => runtime.close(), () => app.close());

    const reponse = await lireArbre();
    await laisserRespirer();

    /* La lecture n'attend pas : elle rend l'état transitoire tout de suite. */
    expect([425, 502]).toContain(reponse.statusCode);

    /* Mais un démarrage est parti — c'est tout le correctif. */
    expect(runtime.demarragesRecus.length).toBeGreaterThan(0);
  });

  it('CONDITION 1 — une rafale de lectures ne déclenche pas une rafale de démarrages', async () => {
    const runtime = await demarrerFauxRuntime();
    const { app, lireArbre } = await preparer();
    fermetures.push(() => runtime.close(), () => app.close());

    await Promise.all(Array.from({ length: 12 }, () => lireArbre()));
    await laisserRespirer();

    /*
     * Douze lectures simultanées, comme à l'ouverture d'un IDE (mesuré : 95
     * requêtes par ouverture, pic à 47 en une seconde). Sans mise en commun,
     * on observerait douze démarrages.
     */
    expect(runtime.demarragesRecus.length).toBe(1);
  });

  it('CONDITION 2 — un démarrage qui échoue est journalisé, jamais avalé', async () => {
    const runtime = await demarrerFauxRuntime();
    runtime.tomberEnPanne();

    const { app, lireArbre } = await preparer();
    fermetures.push(() => runtime.close(), () => app.close());

    const erreurs: unknown[] = [];
    app.log.error = ((...arguments_: unknown[]) => {
      erreurs.push(arguments_[0]);
    }) as typeof app.log.error;

    await lireArbre();
    await laisserRespirer();

    /*
     * Le manager a bien été sollicité et a répondu 500. L'échec doit laisser une
     * trace : c'est BUG-RUNTIME-SILENCE-002 — un `catch` vide remplacerait un
     * blocage silencieux par un autre.
     */
    expect(runtime.demarragesRecus.length).toBeGreaterThan(0);

    const journalisees = JSON.stringify(erreurs);
    expect(journalisees).toContain('workspace.read_triggered_start_failed');
  });

  it('CONDITION 2 bis — après un échec, une nouvelle lecture peut redéclencher', async () => {
    const runtime = await demarrerFauxRuntime();
    runtime.tomberEnPanne();

    const { app, lireArbre } = await preparer();
    fermetures.push(() => runtime.close(), () => app.close());

    app.log.error = (() => undefined) as typeof app.log.error;

    await lireArbre();
    await laisserRespirer();
    const apresLePremier = runtime.demarragesRecus.length;

    await lireArbre();
    await laisserRespirer();

    /*
     * La fenêtre de garde ne doit jamais protéger un ÉCHEC : sinon un manager
     * momentanément indisponible gèlerait l'espace de travail pour toute la durée
     * de la fenêtre, sans que rien ne réessaie.
     */
    expect(runtime.demarragesRecus.length).toBeGreaterThan(apresLePremier);
  });

  it('CONDITION 0 bis — le déclenchement vaut aussi quand le nom DNS ne résout pas encore', async () => {
    const runtime = await demarrerFauxRuntime('nom-introuvable');
    const { app, lireArbre } = await preparer();
    fermetures.push(() => runtime.close(), () => app.close());

    const reponse = await lireArbre();
    await laisserRespirer();

    /*
     * Le pod et son Service naissent ensemble, mais kube-dns propage avec un
     * délai : pendant cette fenêtre, l'API voit ENOTFOUND et répond `425`. C'est
     * la branche que l'ouverture d'IDE rencontre le plus souvent en production —
     * mesuré le 2026-09-05 sur la prod : 3 réponses `425` en 6 h, toutes portant
     * `getaddrinfo ENOTFOUND workspace-ws-…`, groupées sur UNE seconde.
     */
    expect([425, 502]).toContain(reponse.statusCode);
    expect(runtime.demarragesRecus.length).toBeGreaterThan(0);
  });
});
