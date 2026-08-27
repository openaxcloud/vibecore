import { createHash } from 'node:crypto';

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
    throw Object.assign(new Error('INVALID_STATIC_DEPLOYMENT_ID'), {
      code: 'INVALID_STATIC_DEPLOYMENT_ID',
      statusCode: 400,
    });
  }

  const lockId = `static-${createHash('sha256').update(deploymentId).digest('hex')}`;
  return withProjectLock(lockId, mutate);
}
