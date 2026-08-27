import { randomUUID } from 'node:crypto';
import type { ApiStore, ProjectReleaseBarrierLease, ProjectReleaseFence } from './store.js';

const DEFAULT_RELEASE_BARRIER_TTL_SECONDS = 60;
const DEFAULT_RELEASE_BARRIER_HEARTBEAT_MS = 15_000;

export interface ProjectReleaseGuard {
  readonly lease: ProjectReleaseBarrierLease;
  readonly fence: ProjectReleaseFence;

  /** Revalidate the DB-clock lease, Project organization, and manifest digest. */
  assert(): Promise<void>;
}

/**
 * Run bounded external release work behind a durable, renewable project fence.
 *
 * The store acquires topology -> checkpoint -> Project only for short database
 * transactions. External build/migration/promotion calls run without an open DB
 * transaction; a heartbeat extends the PostgreSQL-clock lease and a crashed
 * process thaws automatically at expiry. Callers must invoke `guard.assert()` at
 * every effect boundary and pass `guard.fence` into the atomic READY commit.
 */
export async function withProjectReleaseBarrier<T>(
  store: ApiStore,
  input: {
    projectId: string;
    expectedOrganizationId: string;
    expectedManifestDigest: string;
    operationId: string;
    ttlSeconds?: number;
    heartbeatMs?: number;
  },
  effect: (guard: ProjectReleaseGuard) => Promise<T>,
): Promise<T> {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_RELEASE_BARRIER_TTL_SECONDS;
  const heartbeatMs = input.heartbeatMs ?? DEFAULT_RELEASE_BARRIER_HEARTBEAT_MS;
  const ownerToken = randomUUID();
  const lease = await store.acquireProjectReleaseBarrier({
    projectId: input.projectId,
    expectedOrganizationId: input.expectedOrganizationId,
    expectedManifestDigest: input.expectedManifestDigest,
    operationId: input.operationId,
    ownerToken,
    ttlSeconds,
  });

  if (!lease) {
    throw Object.assign(new Error('A project checkpoint or release is already active.'), {
      code: 'CHECKPOINT_BARRIER_ACTIVE',
      statusCode: 423,
    });
  }

  let lost: unknown;
  let renewing = false;
  const fence: ProjectReleaseFence = {
    checkpointId: lease.checkpointId,
    ownerToken: lease.ownerToken,
    fence: lease.fence,
    expectedOrganizationId: input.expectedOrganizationId,
    expectedManifestDigest: input.expectedManifestDigest,
  };
  const assert = async () => {
    if (lost) throw lost;

    try {
      await store.assertProjectReleaseBarrier({
        checkpointId: lease.checkpointId,
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        expectedManifestDigest: input.expectedManifestDigest,
        ownerToken: lease.ownerToken,
        fence: lease.fence,
      });
    } catch (error) {
      lost = error;
      throw error;
    }
  };

  const heartbeat = setInterval(() => {
    if (renewing || lost) return;
    renewing = true;
    void store
      .renewProjectCheckpointBarrier({
        checkpointId: lease.checkpointId,
        ownerToken: lease.ownerToken,
        fence: lease.fence,
        ttlSeconds,
      })
      .then((expiresAt) => {
        if (!expiresAt) {
          lost = Object.assign(new Error('Project release barrier was lost.'), {
            code: 'PROJECT_RELEASE_BARRIER_LOST',
            statusCode: 409,
          });
        }
      })
      .catch((error: unknown) => {
        lost = error;
      })
      .finally(() => {
        renewing = false;
      });
  }, heartbeatMs);
  heartbeat.unref?.();

  try {
    await assert();
    const result = await effect({ lease, fence, assert });
    await assert();
    return result;
  } finally {
    clearInterval(heartbeat);
    await store
      .releaseProjectReleaseBarrier({
        checkpointId: lease.checkpointId,
        projectId: input.projectId,
        ownerToken: lease.ownerToken,
        fence: lease.fence,
      })
      .catch(() => false);
  }
}
