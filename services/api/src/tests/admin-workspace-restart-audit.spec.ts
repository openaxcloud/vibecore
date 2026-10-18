import { createServer } from 'node:http';
import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- NodeNext service tests use the production API module.
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }

  vi.unstubAllEnvs();
});

describe('administrator restart audit reports the persisted workspace status', () => {
  for (const scenario of [
    { v2: false, responseStatus: 'STARTING', observedStatus: 'STARTING' },
    { v2: true, responseStatus: 'STARTING', observedStatus: 'STARTING' },
    { v2: true, responseStatus: 'RUNNING', observedStatus: 'FAILED' },
  ] as const) {
    it(`V2=${scenario.v2}, response=${scenario.responseStatus}, observed=${scenario.observedStatus}`, async () => {
      const store = new TestApiStore();

      const admin = await store.createUser({
        email: 'restart-admin@local.test',
        name: 'Admin',
        passwordHash: hashPassword('password123'),
        platformAdmin: true,
      });
      await store.updateUser({ userId: admin.id, mfaEnabled: true });
      await store.createSession({
        userId: admin.id,
        token: 'local-admin-restart',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const org = await store.createOrganization({ name: 'Audit', slug: 'audit', ownerUserId: admin.id });
      const project = await store.createProject({ organizationId: org.id, name: 'Audit', slug: 'audit' });

      const workspace = await store.createWorkspace({
        projectId: project.id,
        name: 'Audit',
        runtimeMode: 'remote-kubernetes',
      });

      const admission = { generation: 'local-generation', state: 'PROVISIONING', reservedAt: new Date().toISOString() };

      let restarted = false;

      // Isolated HTTP contract fixture: no Kubernetes resource or real agent is started.
      const manager = createServer((request, response) => {
        request.resume();
        response.setHeader('content-type', 'application/json');

        if (request.url?.endsWith('/restart')) {
          restarted = true;
          response.end(JSON.stringify({ status: scenario.responseStatus }));
        } else if (request.url?.endsWith('/admissions')) {
          response.end(JSON.stringify({ workspaces: [] }));
        } else if (request.url === '/v2/workspaces/reserve' || request.url === `/v2/workspaces/${workspace.id}`) {
          response.end(
            JSON.stringify({
              id: workspace.id,
              orgId: org.id,
              projectId: project.id,
              status: restarted ? scenario.observedStatus : 'STARTING',
              admission,
            }),
          );
        } else {
          response.statusCode = 404;
          response.end('{}');
        }
      });
      await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));
      cleanups.push(() => new Promise<void>((resolve) => manager.close(() => resolve())));
      vi.stubEnv('WORKSPACE_MANAGER_URL', `http://127.0.0.1:${(manager.address() as { port: number }).port}`);
      vi.stubEnv('WORKSPACE_ADMISSION_V2_ENABLED', String(scenario.v2));
      vi.stubEnv('WORKSPACE_ADMISSION_V2_QUOTA_ENABLED', String(scenario.v2));

      const app = await buildApiApp({ store });
      cleanups.push(() => app.close());

      const headers = { authorization: 'Bearer local-admin-restart' };

      const reauth = await app.inject({
        method: 'POST',
        url: '/auth/reauth',
        headers,
        payload: { password: 'password123' },
      });
      expect(reauth.statusCode).toBe(200);

      const result = await app.inject({ method: 'POST', url: `/admin/workspaces/${workspace.id}/restart`, headers });
      expect(result.statusCode, result.body).toBe(200);
      expect(restarted).toBe(true);
      expect(result.json().workspace.status).toBe(scenario.observedStatus);
      expect((await store.getWorkspace(workspace.id))?.status).toBe(scenario.observedStatus);

      const audit = (await store.listAdminAuditLogs()).find((event) => event.action === 'admin.workspace.restart');
      expect(audit?.metadata).toMatchObject({ workspaceId: workspace.id, status: scenario.observedStatus });
    });
  }
});
