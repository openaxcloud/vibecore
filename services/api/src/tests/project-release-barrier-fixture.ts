import { randomUUID } from 'node:crypto';
import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';
import type { ApiStore, ProjectReleaseFence } from '../store.js';

export async function acquireTestProjectReleaseFence(
  store: ApiStore,
  input: { projectId: string; organizationId: string; operationId?: string },
): Promise<{ digest: string; releaseFence: ProjectReleaseFence; release(): Promise<boolean> }> {
  let revision = await store.getLatestProjectManifest(input.projectId);

  if (!revision) {
    const manifest = createDefaultProjectManifest(input.projectId);
    revision = await store.createProjectManifestRevision({
      projectId: input.projectId,
      schemaVersion: manifest.schemaVersion,
      manifestVersion: manifest.manifestVersion,
      digest: projectManifestDigest(manifest),
      manifest,
    });
  }

  const ownerToken = `test-release-owner:${randomUUID()}`;
  const lease = await store.acquireProjectReleaseBarrier({
    projectId: input.projectId,
    expectedOrganizationId: input.organizationId,
    expectedManifestDigest: revision.digest,
    operationId: input.operationId ?? `test:${randomUUID()}`,
    ownerToken,
    ttlSeconds: 60,
  });

  if (!lease) throw new Error('TEST_PROJECT_RELEASE_BARRIER_NOT_ACQUIRED');

  return {
    digest: revision.digest,
    releaseFence: {
      checkpointId: lease.checkpointId,
      ownerToken: lease.ownerToken,
      fence: lease.fence,
      expectedOrganizationId: input.organizationId,
      expectedManifestDigest: revision.digest,
    },
    release: () =>
      store.releaseProjectReleaseBarrier({
        checkpointId: lease.checkpointId,
        projectId: input.projectId,
        ownerToken: lease.ownerToken,
        fence: lease.fence,
      }),
  };
}
