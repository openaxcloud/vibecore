import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/**
 * BUG-QA0930-DEPLOIEMENT-QUOTA-MASQUE — un client gratuit dont un autre projet
 * tient le créneau `workspaces.active` déploie : le build statique a besoin de
 * l'espace du projet, le démarrage est refusé pour quota (#628)… et le client lit
 * « Workspace is starting — please retry ». Il réessaie indéfiniment, sans jamais
 * apprendre que c'est la limite de son forfait.
 *
 * Trouvé le 2026-09-30 en balayant le premier déploiement : le `catch` de
 * `realBuildStaticInWorkspacePod` rend tout refus sous le seul message
 * DEPLOY_WORKSPACE_UNREACHABLE ; le vrai code (QUOTA_EXCEEDED) ne survit que dans
 * le journal du déploiement.
 *
 * Vraie API, vrai chemin de build (rien de remplacé), contre un manager HTTP
 * local qui dit quels pods existent ; agent injoignable.
 */

let fermetures: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(fermetures.map((fermer) => fermer()));
  fermetures = [];
});

async function preparer(creneauPris = true) {
  const podsVivants = new Set<string>();

  const agent = createServer((_requete, reponse) => reponse.writeHead(503).end('{}'));
  await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));

  const portAgent = (agent.address() as { port: number }).port;

  await new Promise<void>((resolve) => agent.close(() => resolve()));

  const manager = createServer((requete, reponse) => {
    const chemin = new URL(requete.url ?? '/', 'http://manager.local').pathname;
    const identifiant = /^\/workspaces\/([^/]+)$/.exec(chemin)?.[1];

    reponse.setHeader('content-type', 'application/json');

    if (identifiant && podsVivants.has(identifiant)) {
      reponse.end(JSON.stringify({ id: identifiant, status: 'RUNNING' }));

      return;
    }

    if (chemin.endsWith('/agent-token')) {
      reponse.end(JSON.stringify({ token: 'jeton-test' }));

      return;
    }

    reponse.writeHead(404).end(JSON.stringify({ code: 'WORKSPACE_NOT_FOUND' }));
  });

  await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));

  const stockage = await mkdtemp(join(tmpdir(), 'vc-deploy-quota-'));

  const precedent = {
    manager: process.env.WORKSPACE_MANAGER_URL,
    agent: process.env.WORKSPACE_AGENT_URL_TEMPLATE,
    secret: process.env.INTERNAL_API_SHARED_SECRET,
    stockage: process.env.STATIC_DEPLOY_STORAGE_DIR,
    budget: process.env.WORKSPACE_COLD_START_BUDGET_MS,
  };

  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${(manager.address() as { port: number }).port}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${portAgent}`;
  process.env.INTERNAL_API_SHARED_SECRET = 'secret-interne-test';
  process.env.STATIC_DEPLOY_STORAGE_DIR = stockage;
  process.env.WORKSPACE_COLD_START_BUDGET_MS = '5000';

  const store = new TestApiStore();
  const app = await buildApiApp({ store });

  fermetures.push(async () => {
    await app.close();
    await new Promise<void>((resolve) => (manager as Server).close(() => resolve()));
    await rm(stockage, { recursive: true, force: true }).catch(() => undefined);

    for (const [cle, valeur] of Object.entries({
      WORKSPACE_MANAGER_URL: precedent.manager,
      WORKSPACE_AGENT_URL_TEMPLATE: precedent.agent,
      INTERNAL_API_SHARED_SECRET: precedent.secret,
      STATIC_DEPLOY_STORAGE_DIR: precedent.stockage,
      WORKSPACE_COLD_START_BUDGET_MS: precedent.budget,
    })) {
      if (valeur === undefined) {
        delete process.env[cle];
      } else {
        process.env[cle] = valeur;
      }
    }
  });

  const inscription = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `deploy-quota-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Gratuit',
      organizationName: 'Gratuit Org',
    },
  });

  expect(inscription.statusCode).toBe(201);

  const { token, organization, user } = inscription.json() as {
    token: string;
    organization: { id: string };
    user: { id: string };
  };

  const creerProjet = async (name: string) => {
    const reponse = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/projects`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name },
    });

    expect(reponse.statusCode).toBe(201);

    return reponse.json().project.id as string;
  };

  // Le projet A tient le créneau gratuit : espace RUNNING, pod vivant côté manager.
  const projetA = await creerProjet('Projet A');
  const espaceA = await store.createWorkspace({ projectId: projetA, name: 'a', runtimeMode: 'remote-kubernetes' });

  if (creneauPris) {
    await store.updateWorkspaceStatus({ workspaceId: espaceA.id, status: 'RUNNING' });
    podsVivants.add(espaceA.id);
  } else {
    await store.updateWorkspaceStatus({ workspaceId: espaceA.id, status: 'STOPPED' });
  }

  const projetB = await creerProjet('Projet B');

  const deployerB = async () => {
    const enFile = await store.createDeployment({ projectId: projetB, provider: 'static', status: 'QUEUED' });

    const construit = await app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer secret-interne-test' },
      payload: {
        projectId: projetB,
        deploymentId: enFile.id,
        userId: user.id,
        buildInput: { provider: 'static', buildCommand: 'npm run build', outputDirectory: 'dist' },
      },
    });

    expect(construit.statusCode, construit.body).toBe(200);

    return construit.json().deployment as { status: string; logs?: Array<{ level: string; message: string }> };
  };

  return { deployerB };
}

describe('un déploiement refusé pour quota le DIT', () => {
  it('le client gratuit lit que sa limite est atteinte — pas « l’espace démarre, réessayez »', async () => {
    const { deployerB } = await preparer();

    const deploiement = await deployerB();

    expect(deploiement.status).toBe('FAILED');

    // Ce que la carte de publication affiche : la dernière ligne d'erreur du journal.
    const erreur =
      [...(deploiement.logs ?? [])].reverse().find((ligne) => /error/i.test(JSON.stringify(ligne)))?.message ?? '';

    /*
     * Mesuré AVANT correctif : « Workspace is starting — please retry. The build
     * runs in your project workspace, which could not be reached in time.
     * [WORKSPACE_UNREACHABLE] QUOTA_EXCEEDED — HTTP 429 — Quota exceeded for
     * workspaces.active ».
     */
    expect(erreur, 'le message dit la vraie cause').toMatch(/active workspace/i);
    expect(erreur, 'jamais « réessayez » : réessayer ne changera rien').not.toMatch(/please retry/i);
  }, 30_000);

  it('TÉMOIN — créneau libre mais espace qui ne répond pas à temps : « réessayez » reste le bon message', async () => {
    const { deployerB } = await preparer(false);

    const deploiement = await deployerB();
    const erreur =
      [...(deploiement.logs ?? [])].reverse().find((ligne) => /error/i.test(JSON.stringify(ligne)))?.message ?? '';

    expect(deploiement.status).toBe('FAILED');
    expect(erreur).toMatch(/please retry/i);
    expect(erreur).not.toMatch(/active workspace at a time/i);
  }, 30_000);
});
