import { describe, expect, it, vi } from 'vitest';
import { withProjectReleaseBarrier } from '../project-release-barrier.js';
import { TestApiStore } from './test-api-store.js';

describe('project release barrier heartbeat', () => {
  it('makes heartbeat loss sticky and deletes the exact ephemeral barrier', async () => {
    const store = new TestApiStore();
    const owner = await store.createUser({ email: 'release-heartbeat@example.test', passwordHash: 'test-hash' });
    const organization = await store.createOrganization({
      name: 'Release heartbeat',
      slug: 'release-heartbeat',
      ownerUserId: owner.id,
    });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'Release heartbeat',
      slug: 'release-heartbeat',
    });
    const manifest = await store.getLatestProjectManifest(project.id);

    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');

    vi.spyOn(store, 'renewProjectCheckpointBarrier').mockResolvedValue(undefined);

    await expect(
      withProjectReleaseBarrier(
        store,
        {
          projectId: project.id,
          expectedOrganizationId: organization.id,
          expectedManifestDigest: manifest.digest,
          operationId: 'heartbeat-loss',
          heartbeatMs: 5,
          ttlSeconds: 10,
        },
        async (guard) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          await guard.assert();
        },
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });

    expect(store.renewProjectCheckpointBarrier).toHaveBeenCalled();
    expect([...store.projectCheckpoints.values()].filter((row) => row.state === 'RELEASE_BARRIER')).toEqual([]);
  });
});
