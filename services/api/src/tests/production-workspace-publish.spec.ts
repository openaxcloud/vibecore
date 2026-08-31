import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { LocalProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class ExpiringProductionWorkspaceStore extends TestApiStore {
  override async ensureProductionWorkspace(input: Parameters<TestApiStore['ensureProductionWorkspace']>[0]) {
    const workspace = await super.ensureProductionWorkspace(input);
    const barrier = this.projectCheckpoints.get(input.releaseFence.checkpointId);
    if (!barrier) throw new Error('TEST_RELEASE_BARRIER_MISSING');
    barrier.barrierExpiresAt = new Date(Date.now() - 1_000).toISOString();
    return workspace;
  }
}

describe('production workspace publish synchronization', () => {
  let storageRoot: string;
  let originalStorageRoot: string | undefined;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'vibecore-production-workspace-'));
    originalStorageRoot = process.env.PROJECT_STORAGE_DIR;
    process.env.PROJECT_STORAGE_DIR = storageRoot;
  });

  afterEach(async () => {
    if (originalStorageRoot === undefined) delete process.env.PROJECT_STORAGE_DIR;
    else process.env.PROJECT_STORAGE_DIR = originalStorageRoot;
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('keeps the committed publish but rejects every stale checkout write after fence expiry', async () => {
    const store = new ExpiringProductionWorkspaceStore();
    const storage = new LocalProjectStorage(
      (scope, effect) => store.withProjectPhysicalMutation(scope, effect),
      (scope, effect) => store.withProjectPhysicalMutation(scope, effect),
      (scope, effect) => store.withProjectPhysicalAccess(scope, effect),
    );
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const user = await store.createUser({
      email: 'production-workspace-publish@example.test',
      passwordHash: hashPassword('password123'),
    });
    const organization = await store.createOrganization({
      name: 'Production workspace publish',
      slug: 'production-workspace-publish',
      ownerUserId: user.id,
    });
    await store.createSession({ userId: user.id, token: 'publish-token', expiresAt: new Date(Date.now() + 3_600_000) });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'Production workspace publish',
      slug: 'production-workspace-publish',
    });
    const manifest = await store.getLatestProjectManifest(project.id);
    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');
    const development = await store.createWorkspace({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      name: 'Development',
      runtimeMode: 'docker',
      environment: 'development',
    });
    await storage.writeFiles(project.id, [{ path: 'src/version.txt', content: 'stale-publisher-a' }], {
      expectedOrganizationId: organization.id,
      workspaceId: development.id,
    });
    const source = await store.createDeployment({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      workspaceId: development.id,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://preview.production-workspace.example',
      metadata: { projectManifestDigest: manifest.digest },
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/deployments/${source.id}/publish`,
        headers: { authorization: 'Bearer publish-token' },
      });
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({ deployment: { environment: 'production', status: 'READY' } });

      const production = (await store.listWorkspaces(project.id)).filter(
        (workspace) => workspace.environment === 'production',
      );
      expect(production).toHaveLength(1);
      await expect(
        storage.listFiles(project.id, {
          expectedOrganizationId: organization.id,
          workspaceId: production[0]!.id,
        }),
      ).resolves.toEqual([]);
      expect((await store.listDeployments(project.id)).filter((row) => row.environment === 'production')).toHaveLength(
        1,
      );
    } finally {
      await app.close();
    }
  });
});
