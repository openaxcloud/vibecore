import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/**
 * Le statut rendu doit décrire le CLUSTER, pas une ligne qui a cessé d'y
 * correspondre.
 *
 * Mesuré en production le 2026-08-30 : 125 espaces de travail se déclaraient
 * `RUNNING` en base alors qu'UN SEUL pod tournait. L'IDE lisait ce statut,
 * affichait « en cours d'exécution », et chaque opération sur un fichier
 * répondait 425 — le produit mentait, puis donnait tort à son utilisateur.
 *
 * Ces cas ne lisent PAS la source : ils font tourner l'API contre un faux agent
 * dont on décide s'il répond à `/health`, et observent la réponse HTTP. Retirer
 * la réconciliation les fait tomber — vérifié.
 */

/** Faux agent + faux manager, avec un `/health` que le test pilote. */
async function startFakeRuntime(healthy: boolean) {
  const agent = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://agent.local').pathname;

    response.setHeader('content-type', 'application/json');

    if (path === '/health' && healthy) {
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(healthy ? 404 : 503).end(JSON.stringify({ error: 'unavailable' }));
  });

  await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));

  const manager = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://manager.local').pathname;

    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(path.endsWith('/agent-token') ? { token: 'probe-token' } : { status: 'RUNNING' }));
  });

  await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));

  const agentPort = (agent.address() as { port: number }).port;
  const managerPort = (manager.address() as { port: number }).port;

  const previous = {
    manager: process.env.WORKSPACE_MANAGER_URL,
    agent: process.env.WORKSPACE_AGENT_URL_TEMPLATE,
  };

  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${managerPort}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${agentPort}`;

  return {
    async close() {
      process.env.WORKSPACE_MANAGER_URL = previous.manager;
      process.env.WORKSPACE_AGENT_URL_TEMPLATE = previous.agent;
      await Promise.all(
        [agent, manager].map((server: Server) => new Promise<void>((resolve) => server.close(() => resolve()))),
      );
    },
  };
}

async function setUp(status: 'RUNNING' | 'PENDING' | 'STARTING' | 'STOPPED') {
  const store = new TestApiStore();
  const app = await buildApiApp({ store });

  const auth = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `status-truth-${status}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'password123',
      name: 'Status Truth',
      organizationName: 'Status Truth Org',
    },
  });

  expect(auth.statusCode).toBe(201);

  const token = auth.json().token as string;
  const organizationId = auth.json().organization.id as string;

  const project = await app.inject({
    method: 'POST',
    url: `/orgs/${organizationId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Status Truth Project' },
  });

  expect(project.statusCode).toBe(201);

  const workspace = await store.createWorkspace({
    projectId: project.json().project.id as string,
    name: 'status-truth',
    runtimeMode: 'remote-kubernetes',
  });

  await store.updateWorkspaceStatus({ workspaceId: workspace.id, status });

  const read = async () =>
    app.inject({
      method: 'GET',
      url: `/workspaces/${workspace.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

  return { app, store, workspaceId: workspace.id, read };
}

describe('le statut d’un espace de travail décrit le cluster, pas une ligne périmée', () => {
  it('rétrograde un RUNNING dont le pod ne répond plus', async () => {
    const runtime = await startFakeRuntime(false);
    const { app, read } = await setUp('RUNNING');

    const response = await read();

    expect(response.statusCode).toBe(200);
    expect(response.json().workspace.status).toBe('STOPPED');

    await app.close();
    await runtime.close();
  });

  it('persiste la correction, pour que la lecture suivante parte d’une base juste', async () => {
    const runtime = await startFakeRuntime(false);
    const { app, store, workspaceId, read } = await setUp('RUNNING');

    await read();

    expect((await store.getWorkspace(workspaceId))?.status).toBe('STOPPED');

    await app.close();
    await runtime.close();
  });

  it('laisse RUNNING quand le pod répond', async () => {
    const runtime = await startFakeRuntime(true);
    const { app, store, workspaceId, read } = await setUp('RUNNING');

    expect((await read()).json().workspace.status).toBe('RUNNING');
    expect((await store.getWorkspace(workspaceId))?.status).toBe('RUNNING');

    await app.close();
    await runtime.close();
  });

  for (const status of ['PENDING', 'STARTING'] as const) {
    it(`ne rétrograde jamais ${status}, dont l’injoignabilité est l’état normal`, async () => {
      const runtime = await startFakeRuntime(false);
      const { app, read } = await setUp(status);

      expect((await read()).json().workspace.status).toBe(status);

      await app.close();
      await runtime.close();
    });
  }

  it('ne touche pas un STOPPED, qui ne prétend rien', async () => {
    const runtime = await startFakeRuntime(false);
    const { app, read } = await setUp('STOPPED');

    expect((await read()).json().workspace.status).toBe('STOPPED');

    await app.close();
    await runtime.close();
  });
});
