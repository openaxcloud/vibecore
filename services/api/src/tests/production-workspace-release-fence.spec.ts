import { describe, expect, it } from 'vitest';

import { withProjectReleaseBarrier } from '../project-release-barrier.js';
import { TestApiStore } from './test-api-store.js';

describe('production workspace release fence', () => {
  it('creates one canonical checkout and rejects missing, forged, and expired authority', async () => {
    const store = new TestApiStore();
    const owner = await store.createUser({
      email: 'production-workspace-fence@example.test',
      passwordHash: 'test-hash',
    });
    const organization = await store.createOrganization({
      name: 'Production workspace fence',
      slug: 'production-workspace-fence',
      ownerUserId: owner.id,
    });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'Production workspace fence',
      slug: 'production-workspace-fence',
    });
    await store.createWorkspace({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      name: 'Development',
      runtimeMode: 'docker',
      environment: 'development',
    });
    const manifest = await store.getLatestProjectManifest(project.id);
    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');

    await expect(
      store.createWorkspace({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        name: 'Unsafe production',
        runtimeMode: 'docker',
        environment: 'production',
      }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_WORKSPACE_RELEASE_FENCE_REQUIRED', statusCode: 409 });

    await expect(
      withProjectReleaseBarrier(
        store,
        {
          projectId: project.id,
          expectedOrganizationId: organization.id,
          expectedManifestDigest: manifest.digest,
          operationId: 'production-workspace-create',
          heartbeatMs: 60_000,
          ttlSeconds: 60,
        },
        async (guard) => {
          const input = {
            projectId: project.id,
            expectedOrganizationId: organization.id,
            releaseFence: guard.fence,
            name: 'Production',
            runtimeMode: 'docker',
            initialStatus: 'STOPPED' as const,
          };
          const [first, replay] = await Promise.all([
            store.ensureProductionWorkspace(input),
            store.ensureProductionWorkspace(input),
          ]);
          expect(replay.id).toBe(first.id);
          expect((await store.listWorkspaces(project.id)).filter((row) => row.environment === 'production')).toEqual([
            first,
          ]);

          await expect(
            store.ensureProductionWorkspace({
              ...input,
              releaseFence: { ...guard.fence, ownerToken: 'forged-publish-owner' },
            }),
          ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST', statusCode: 409 });

          const barrier = store.projectCheckpoints.get(guard.lease.checkpointId);
          if (!barrier) throw new Error('TEST_RELEASE_BARRIER_MISSING');
          barrier.barrierExpiresAt = new Date(Date.now() - 1_000).toISOString();

          return store.ensureProductionWorkspace(input);
        },
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST', statusCode: 409 });

    expect((await store.listWorkspaces(project.id)).filter((row) => row.environment === 'production')).toHaveLength(1);
  });
});
