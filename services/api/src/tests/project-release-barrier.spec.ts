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

  it('atomically rejects forged and lost release fences before updating a deployment', async () => {
    const store = new TestApiStore();
    const owner = await store.createUser({ email: 'release-update-fence@example.test', passwordHash: 'test-hash' });
    const organization = await store.createOrganization({
      name: 'Release update fence',
      slug: 'release-update-fence',
      ownerUserId: owner.id,
    });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'Release update fence',
      slug: 'release-update-fence',
    });
    const manifest = await store.getLatestProjectManifest(project.id);
    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');
    const deployment = await store.createDeployment({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      provider: 'static',
      status: 'BUILDING',
      metadata: { fenceMarker: 'before' },
    });

    await expect(
      withProjectReleaseBarrier(
        store,
        {
          projectId: project.id,
          expectedOrganizationId: organization.id,
          expectedManifestDigest: manifest.digest,
          operationId: 'deployment-update-fence',
          heartbeatMs: 60_000,
          ttlSeconds: 60,
        },
        async (guard) => {
          await expect(
            store.updateDeployment(project.id, deployment.id, { metadata: { fenceMarker: 'exact' } }, guard.fence),
          ).resolves.toMatchObject({ metadata: { fenceMarker: 'exact' } });

          await expect(
            store.updateDeployment(
              project.id,
              deployment.id,
              { metadata: { fenceMarker: 'forged' } },
              { ...guard.fence, ownerToken: 'forged-owner' },
            ),
          ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST', statusCode: 409 });
          await expect(store.getDeployment(project.id, deployment.id)).resolves.toMatchObject({
            metadata: { fenceMarker: 'exact' },
          });

          const barrier = store.projectCheckpoints.get(guard.lease.checkpointId);
          if (!barrier) throw new Error('TEST_RELEASE_BARRIER_MISSING');
          barrier.barrierExpiresAt = new Date(Date.now() - 1_000).toISOString();

          await expect(
            store.updateDeployment(project.id, deployment.id, { metadata: { fenceMarker: 'lost' } }, guard.fence),
          ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST', statusCode: 409 });
        },
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST', statusCode: 409 });

    await expect(store.getDeployment(project.id, deployment.id)).resolves.toMatchObject({
      metadata: { fenceMarker: 'exact' },
    });
  });
});
