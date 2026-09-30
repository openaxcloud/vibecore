import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/**
 * BUG-QA0928-PROVISION-SANS-QUOTA — un démarrage À LA DEMANDE ne contournait pas
 * le quota `workspaces.active`.
 *
 * `POST /api/runtime/workspaces` et le redémarrage passent par `ensureQuota`.
 * Mais une lecture ou une écriture adressée à un espace ÉTEINT le démarrait par
 * `provisionWorkspaceOnDemand`, qui le passe en `STARTING` — donc compté actif —
 * sans rien vérifier. Un compte gratuit dont le créneau est tenu par le projet A
 * n'avait qu'à laisser l'onglet du projet B ouvert : la première lecture de B
 * lui donnait un second espace actif.
 *
 * Vraie API, vrai client HTTP vers un manager local qui COMPTE les démarrages
 * reçus et dit quels pods existent ; agent injoignable (port fermé).
 */

async function demarrerFauxRuntime(podsVivants: Set<string>) {
  const agent = createServer((_request, response) => response.writeHead(503).end('{}'));
  await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));

  const agentPort = (agent.address() as { port: number }).port;

  await new Promise<void>((resolve) => agent.close(() => resolve()));

  const demarragesRecus: string[] = [];
  const redemarragesRecus: string[] = [];

  const manager = createServer((request, response) => {
    const chemin = new URL(request.url ?? '/', 'http://manager.local').pathname;

    let corps = '';

    request.on('data', (morceau) => {
      corps += morceau.toString();
    });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');

      if (chemin === '/workspaces/start') {
        demarragesRecus.push(JSON.parse(corps || '{}').workspaceId);
        response.end(JSON.stringify({ status: 'RUNNING' }));

        return;
      }

      if (chemin.endsWith('/restart')) {
        // Refus déterministe (4xx) : c'est le cas où le créneau réservé doit être rendu.
        redemarragesRecus.push(chemin);
        response.writeHead(404).end(JSON.stringify({ error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' }));

        return;
      }

      if (chemin.endsWith('/agent-token')) {
        response.end(JSON.stringify({ token: 'jeton-test' }));

        return;
      }

      // Le manager dit, pod par pod, s'il existe : la réconciliation des créneaux fantômes s'en sert.
      const identifiant = /^\/workspaces\/([^/]+)$/.exec(chemin)?.[1];

      if (identifiant && podsVivants.has(identifiant)) {
        response.end(JSON.stringify({ id: identifiant, status: 'RUNNING' }));

        return;
      }

      response.writeHead(404).end(JSON.stringify({ error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' }));
    });
  });

  await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));

  const precedent = {
    manager: process.env.WORKSPACE_MANAGER_URL,
    agent: process.env.WORKSPACE_AGENT_URL_TEMPLATE,
    budget: process.env.WORKSPACE_COLD_START_BUDGET_MS,
  };

  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${(manager.address() as { port: number }).port}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${agentPort}`;

  // Le plancher du budget d'attente d'une écriture : sans lui, le cas « avant correctif » durerait 30 s.
  process.env.WORKSPACE_COLD_START_BUDGET_MS = '5000';

  const restaurer = (cle: string, valeur: string | undefined) => {
    if (valeur === undefined) {
      delete process.env[cle];
    } else {
      process.env[cle] = valeur;
    }
  };

  return {
    demarragesRecus,
    redemarragesRecus,
    async close() {
      restaurer('WORKSPACE_MANAGER_URL', precedent.manager);
      restaurer('WORKSPACE_AGENT_URL_TEMPLATE', precedent.agent);
      restaurer('WORKSPACE_COLD_START_BUDGET_MS', precedent.budget);
      await new Promise<void>((resolve) => (manager as Server).close(() => resolve()));
    },
  };
}

/**
 * Un compte gratuit (`workspaces.active` = 1), deux projets. Le projet A tient
 * le créneau avec un pod bien vivant ; l'espace du projet B est dans l'état voulu.
 */
async function preparer(etatDeA: 'RUNNING' | 'STOPPED', etatDeB: 'STOPPED' | 'RUNNING') {
  const store = new TestApiStore();
  const podsVivants = new Set<string>();
  const runtime = await demarrerFauxRuntime(podsVivants);
  const app = await buildApiApp({ store });

  const auth = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `quota-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Quota',
      organizationName: 'Quota Org',
    },
  });

  expect(auth.statusCode).toBe(201);

  const token = auth.json().token as string;
  const organizationId = auth.json().organization.id as string;

  const creerProjet = async (name: string) => {
    const reponse = await app.inject({
      method: 'POST',
      url: `/orgs/${organizationId}/projects`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name },
    });

    expect(reponse.statusCode).toBe(201);

    return reponse.json().project.id as string;
  };

  const creerEspace = async (projectId: string, status: 'RUNNING' | 'STOPPED') => {
    const espace = await store.createWorkspace({ projectId, name: `ws-${status}`, runtimeMode: 'remote-kubernetes' });
    await store.updateWorkspaceStatus({ workspaceId: espace.id, status });

    return espace.id;
  };

  const espaceA = await creerEspace(await creerProjet('Projet A'), etatDeA);
  const espaceB = await creerEspace(await creerProjet('Projet B'), etatDeB);

  if (etatDeA === 'RUNNING') {
    podsVivants.add(espaceA);
  }

  const lireB = () =>
    app.inject({
      method: 'GET',
      url: `/api/runtime/workspaces/${espaceB}/files/read?path=tree`,
      headers: { authorization: `Bearer ${token}` },
    });

  const ecrireB = () =>
    app.inject({
      method: 'PUT',
      url: `/api/runtime/workspaces/${espaceB}/files/write`,
      headers: { authorization: `Bearer ${token}` },
      payload: { path: 'src/App.tsx', content: 'export default () => null;\n' },
    });

  const redemarrerB = () =>
    app.inject({
      method: 'POST',
      url: `/api/runtime/workspaces/${espaceB}/restart`,
      headers: { authorization: `Bearer ${token}` },
    });

  const actifs = () => store.countActiveWorkspaces(organizationId);
  const statutDeB = async () => (await store.getWorkspace(espaceB))?.status;

  fermetures.push(
    () => runtime.close(),
    () => app.close(),
  );

  const auditsDeQuota = () => store.auditLogs.filter((entree) => entree.action === 'quota.exceeded').length;

  return { runtime, lireB, ecrireB, redemarrerB, actifs, statutDeB, espaceB, auditsDeQuota };
}

const laisserRespirer = () => new Promise((resolve) => setTimeout(resolve, 300));

let fermetures: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(fermetures.map((fermer) => fermer()));
  fermetures = [];
});

describe('un démarrage à la demande respecte le quota workspaces.active', () => {
  it('une LECTURE sur l’espace éteint du projet B ne donne pas un second espace actif', async () => {
    const { runtime, lireB, actifs, statutDeB } = await preparer('RUNNING', 'STOPPED');

    expect(await actifs()).toBe(1);

    await lireB();
    await laisserRespirer();

    expect(runtime.demarragesRecus, 'aucun démarrage ne part au-delà du quota').toEqual([]);
    expect(await statutDeB()).toBe('STOPPED');
    expect(await actifs()).toBe(1);
  });

  it('une ÉCRITURE sur l’espace éteint du projet B est refusée pour quota, sans démarrage', async () => {
    const { runtime, ecrireB, actifs, statutDeB } = await preparer('RUNNING', 'STOPPED');

    const reponse = await ecrireB();

    expect(reponse.statusCode, reponse.body).toBe(429);
    expect(runtime.demarragesRecus).toEqual([]);
    expect(await statutDeB()).toBe('STOPPED');
    expect(await actifs()).toBe(1);
  }, 20_000);

  it('une RAFALE de lectures refusées pour quota ne rejoue pas le contrôle à chaque lecture', async () => {
    const { runtime, lireB, auditsDeQuota } = await preparer('RUNNING', 'STOPPED');

    // Une ouverture d'IDE émet des dizaines de lectures (mesuré : pic à 47 en une seconde).
    for (let lecture = 0; lecture < 12; lecture += 1) {
      await lireB();
      await laisserRespirer();
    }

    expect(runtime.demarragesRecus).toEqual([]);

    /*
     * Un refus pour quota n'est pas une panne : la fenêtre de garde reste armée.
     * La réarmer comme après un échec réel referait le contrôle — et son audit —
     * à chaque lecture.
     */
    expect(auditsDeQuota()).toBe(1);
  }, 20_000);

  it('le REDÉMARRAGE explicite passe par la même règle : refusé pour quota, sans appel au manager', async () => {
    const { runtime, redemarrerB, actifs, statutDeB } = await preparer('RUNNING', 'STOPPED');

    const reponse = await redemarrerB();

    expect(reponse.statusCode, reponse.body).toBe(429);
    expect(runtime.redemarragesRecus).toEqual([]);
    expect(await statutDeB()).toBe('STOPPED');
    expect(await actifs()).toBe(1);
  });

  it('un redémarrage refusé pour de bon rend le créneau qu’il avait pris (FAILED, jamais STARTING figé)', async () => {
    const { runtime, redemarrerB, actifs, statutDeB } = await preparer('STOPPED', 'STOPPED');

    const reponse = await redemarrerB();

    expect(reponse.statusCode).toBeGreaterThanOrEqual(400);
    expect(runtime.redemarragesRecus.length).toBe(1);
    expect(await statutDeB()).toBe('FAILED');
    expect(await actifs()).toBe(0);
  });

  it('CONTRÔLE — créneau libre : la lecture démarre bien l’espace de B', async () => {
    const { runtime, lireB, espaceB } = await preparer('STOPPED', 'STOPPED');

    await lireB();
    await laisserRespirer();

    expect(runtime.demarragesRecus).toEqual([espaceB]);
  });

  it('un espace DÉJÀ compté actif (pod ramassé, ligne RUNNING) redémarre sans consommer de créneau', async () => {
    const { runtime, lireB, espaceB, actifs } = await preparer('STOPPED', 'RUNNING');

    expect(await actifs()).toBe(1);

    await lireB();
    await laisserRespirer();

    expect(runtime.demarragesRecus).toEqual([espaceB]);
    expect(await actifs()).toBe(1);
  });
});
