import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** Minimal in-memory ProjectStorage covering the files used by publish. */
class FakeProjectStorage {
  // key = `${projectId}:${workspaceId ?? 'primary'}`
  readonly files = new Map<string, Array<{ path: string; content: string }>>();
  readonly writes: Array<{ workspaceId?: string; count: number }> = [];

  #key(projectId: string, workspaceId?: string) {
    return `${projectId}:${workspaceId ?? 'primary'}`;
  }

  seed(projectId: string, workspaceId: string | undefined, files: Array<{ path: string; content: string }>) {
    this.files.set(this.#key(projectId, workspaceId), files);
  }

  async listFiles(projectId: string, scope: { expectedOrganizationId: string; workspaceId?: string }) {
    return this.listFilesWithinPhysicalAccess(projectId, scope.workspaceId);
  }

  async listFilesWithinPhysicalAccess(projectId: string, workspaceId?: string) {
    return (this.files.get(this.#key(projectId, workspaceId)) ?? []).map((file) => ({ ...file, encoding: 'utf8' }));
  }

  async writeFiles(
    projectId: string,
    files: Array<{ path: string; content: string }>,
    scope: { expectedOrganizationId: string; workspaceId?: string },
  ) {
    this.files.set(this.#key(projectId, scope.workspaceId), files);
    this.writes.push({ workspaceId: scope.workspaceId, count: files.length });

    return files.map((file) => ({ ...file, encoding: 'utf8' }));
  }
}

async function setup() {
  const store = new TestApiStore();
  const storage = new FakeProjectStorage();
  const app = await buildApiApp({
    store,
    emailProvider: new QuietEmailProvider(),
    projectStorage: storage as unknown as ProjectStorage,
  });

  const user = await store.createUser({
    email: 'pw@example.com',
    name: 'PW',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'PW Org', slug: 'pw-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'pw-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'PW Project', slug: 'pw-project' });

  return { app, store, storage, token: 'pw-token', project };
}

describe('P2d production workspace checkout on publish', () => {
  it('creates a production workspace and seeds it with the published files', async () => {
    const { app, store, storage, token, project } = await setup();
    storage.seed(project.id, undefined, [
      { path: 'index.html', content: '<h1>hi</h1>' },
      { path: 'src/app.ts', content: 'export const x = 1;' },
    ]);
    const source = await store.createDeployment({
      projectId: project.id,
      expectedOrganizationId: project.organizationId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://preview.example/',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${source.id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);

    // a production workspace now exists
    const workspaces = await store.listWorkspaces(project.id);
    const prod = workspaces.find((w) => w.environment === 'production');
    expect(prod).toBeTruthy();
    expect(prod!.name).toBe('Production');
    expect(prod!.status).toBe('STOPPED');
    expect(await store.countActiveWorkspaces((await store.getProject(project.id))!.organizationId)).toBe(0);

    // the published files were copied into the prod checkout
    const write = storage.writes.find((w) => w.workspaceId === prod!.id);
    expect(write?.count).toBe(2);
    const prodFiles = await storage.listFiles(project.id, {
      expectedOrganizationId: project.organizationId,
      workspaceId: prod!.id,
    });
    expect(prodFiles.map((f) => f.path).sort()).toEqual(['index.html', 'src/app.ts']);
  });

  it('reuses the same production workspace on a second publish (no duplicate)', async () => {
    const { app, store, storage, token, project } = await setup();
    storage.seed(project.id, undefined, [{ path: 'a.txt', content: 'a' }]);
    const mkReady = () =>
      store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: project.organizationId,
        provider: 'static',
        environment: 'preview',
        status: 'READY',
        url: 'u',
      });

    await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${(await mkReady()).id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });
    await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${(await mkReady()).id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    const prodWorkspaces = (await store.listWorkspaces(project.id)).filter((w) => w.environment === 'production');
    expect(prodWorkspaces).toHaveLength(1);
  });
});
