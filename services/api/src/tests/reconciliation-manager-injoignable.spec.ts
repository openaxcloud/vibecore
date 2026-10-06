import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * BUG-QA0928-RECONCILIATION-MANAGER-INJOIGNABLE.
 *
 * `reconcileOrphanedActiveWorkspaces` libère le créneau d'un workspace que le
 * manager dit disparu. Il s'appuyait sur `isRuntimeWorkspaceGone`, qui compte
 * aussi le manager INJOIGNABLE comme « disparu » — exactement ce que son propre
 * commentaire interdit (« A TRANSIENT manager fault must NOT flip a live
 * workspace to STOPPED »). Mesuré en local le 2026-09-28 : RUNNING → STOPPED sur
 * la seule ligne vivante, et le démarrage d'un second projet passait le quota.
 *
 * C'est aussi ce qui masquait le `429` de quota qu'il fallait pour reproduire
 * BUG-QA0928-RUNTIME-ID-PROJET hors production.
 */

const managers: Server[] = [];
const precedent = process.env.WORKSPACE_MANAGER_URL;

afterEach(async () => {
  await Promise.all(managers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));

  if (precedent === undefined) {
    delete process.env.WORKSPACE_MANAGER_URL;
  } else {
    process.env.WORKSPACE_MANAGER_URL = precedent;
  }
});

async function managerQuiRepond404(): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  });
  managers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const adresse = server.address();

  if (!adresse || typeof adresse === 'string') {
    throw new Error('manager de test sans port');
  }

  return `http://127.0.0.1:${adresse.port}`;
}

async function monter(managerUrl: string) {
  process.env.WORKSPACE_MANAGER_URL = managerUrl;

  const store = new TestApiStore();
  const app = await buildApiApp({ store, allowedOrigins: ['http://localhost:5173'] });

  const inscription = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'qa-reconciliation@example.test', password: 'password123', name: 'QA', organizationName: 'QA' },
  });
  expect(inscription.statusCode).toBe(201);

  const { token, organization } = inscription.json() as { token: string; organization: { id: string } };
  const auth = { authorization: `Bearer ${token}` };

  const creer = async (name: string) => {
    const reponse = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/projects`,
      headers: auth,
      payload: { name, framework: 'react' },
    });
    expect(reponse.statusCode).toBeLessThan(300);

    const corps = reponse.json() as { id?: string; project?: { id: string } };

    return corps.project?.id ?? corps.id!;
  };

  const projet1 = await creer('Projet 1');
  const projet2 = await creer('Projet 2');

  // Le créneau gratuit (`workspaces.active` = 1) est tenu par un workspace VIVANT du projet 1.
  const vivant = await store.createWorkspace({ projectId: projet1, name: 'vivant', runtimeMode: 'remote-kubernetes' });
  await store.updateWorkspaceStatus({ workspaceId: vivant.id, status: 'RUNNING' });

  const demarrerProjet2 = () =>
    app.inject({
      method: 'POST',
      url: '/api/runtime/workspaces',
      headers: auth,
      payload: { metadata: { projectId: projet2 } },
    });

  return { app, store, vivant, demarrerProjet2 };
}

describe('réconciliation du quota quand le manager est injoignable', () => {
  it('garde le créneau du workspace vivant et répond 429 (quota), sans le marquer STOPPED', async () => {
    // Port fermé (rien n'y écoute) : ECONNREFUSED → WORKSPACE_MANAGER_UNAVAILABLE.
    const { app, store, vivant, demarrerProjet2 } = await monter('http://127.0.0.1:59997');

    const reponse = await demarrerProjet2();

    expect((await store.getWorkspace(vivant.id))?.status).toBe('RUNNING');
    expect(reponse.statusCode).toBe(429);

    await app.close();
  });

  it('libère toujours le créneau quand le manager DIT que le workspace n’existe plus (404)', async () => {
    const { app, store, vivant, demarrerProjet2 } = await monter(await managerQuiRepond404());

    const reponse = await demarrerProjet2();

    expect((await store.getWorkspace(vivant.id))?.status).toBe('STOPPED');
    expect(reponse.statusCode).not.toBe(429);

    await app.close();
  });
});
