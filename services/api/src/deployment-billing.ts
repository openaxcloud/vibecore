/**
 * Pure decision helpers for deployment billing/quota accounting.
 *
 * These exist so the create/redeploy route handlers in app.ts can key their
 * `recordUsage('deployments.count')` call on the *persisted* deployment status
 * rather than a locally-computed one. A build that is canceled mid-flight has
 * its final `updateDeployment({status:'READY'})` blocked by the store's
 * monotonic guard (the row stays CANCELED), so the locally-computed status is
 * stale; billing must follow the row that actually landed in the database.
 */

export type PersistedDeploymentStatus = 'QUEUED' | 'BUILDING' | 'READY' | 'FAILED' | 'CANCELED' | (string & {});

/**
 * Whether a finished deploy/redeploy build should consume one unit of the
 * org's `deployments.count` quota.
 *
 * A deployment is only billed when it actually landed in a non-FAILED,
 * non-CANCELED terminal/in-progress state:
 *  - FAILED: repeated build failures must not exhaust a plan with zero
 *    successful deploys.
 *  - CANCELED: a build canceled mid-flight serves nothing, so it must not
 *    consume quota even though the handler locally computed 'READY'.
 *
 * Pass the status read back from `store.updateDeployment(...)` (which re-reads
 * the row after the monotonic-guard-protected write), NOT the local variable.
 */
export function shouldRecordDeploymentUsage(persistedStatus: PersistedDeploymentStatus): boolean {
  return persistedStatus !== 'FAILED' && persistedStatus !== 'CANCELED';
}
