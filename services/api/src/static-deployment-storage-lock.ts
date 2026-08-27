import { createHash } from 'node:crypto';

import { appPublicEnglish } from './app-public-copy.js';
import { withProjectLock } from './project-storage.js';

const SAFE_DEPLOYMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * Serialize every mutation of one static deployment directory across API
 * replicas. The underlying link(2) lock is the same NFS-safe primitive used by
 * LocalProjectStorage, but it has its own namespace so project and deployment
 * mutations cannot collide accidentally.
 */
export function withStaticDeploymentStorageLock<T>(deploymentId: string, mutate: () => Promise<T>): Promise<T> {
  if (!SAFE_DEPLOYMENT_ID.test(deploymentId)) {
    throw Object.assign(new Error(appPublicEnglish('STATIC_DEPLOYMENT_ID_INVALID')), {
      code: 'INVALID_STATIC_DEPLOYMENT_ID',
      statusCode: 400,
    });
  }

  const lockId = `static-${createHash('sha256').update(deploymentId).digest('hex')}`;

  return withProjectLock(lockId, mutate);
}

/**
 * Acquire several static-deployment locks in one deterministic order. A
 * rollback reads one immutable source while replacing a different target, so
 * both paths must remain stable against account-purge erasure for the whole
 * copy. Sorting also prevents two inverse rollback requests from deadlocking.
 */
export function withStaticDeploymentStorageLocks<T>(
  deploymentIds: readonly string[],
  mutate: () => Promise<T>,
): Promise<T> {
  const ids = [...new Set(deploymentIds)].sort();

  const acquire = (index: number): Promise<T> => {
    const deploymentId = ids[index];
    return deploymentId ? withStaticDeploymentStorageLock(deploymentId, () => acquire(index + 1)) : mutate();
  };

  return acquire(0);
}
