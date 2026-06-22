/**
 * Pure view helpers for the project deployments panel.
 *
 * Kept in a sibling module (not the route) so the polling / timeout logic is
 * unit-testable without rendering the React tree or stubbing react-router.
 */

/**
 * How long the deploy/redeploy POST is allowed to run before the client aborts.
 *
 * The static provider builds SYNCHRONOUSLY inside the POST and the backend caps
 * that build at 600s, so the client must wait slightly longer (610s) than the
 * backend cap. Anything shorter (e.g. the 30s apiRequest default) aborts mid
 * `npm install` and reports a false failure for a deploy that actually succeeds.
 */
export const DEPLOY_REQUEST_TIMEOUT_MS = 610_000;

/** Poll cadence while a deployment is still building. */
export const DEPLOY_POLL_INTERVAL_MS = 4000;

/**
 * Statuses that are still in flight — the backend GET loader reconciles these to
 * a terminal state, but only if the client keeps polling. Compared
 * case-insensitively because providers/hooks have historically persisted mixed
 * casing.
 */
const ACTIVE_DEPLOY_STATUSES = new Set(['queued', 'building', 'pending', 'in_progress', 'deploying']);

/** True when a single status is non-terminal and warrants continued polling. */
export function isActiveDeploymentStatus(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }

  return ACTIVE_DEPLOY_STATUSES.has(status.trim().toLowerCase());
}

/**
 * True when ANY deployment row is still building, i.e. the panel should keep
 * revalidating the loader. Returns false once every row is terminal
 * (READY/FAILED/CANCELED) so the interval can be torn down.
 */
export function shouldPollDeployments(deployments: ReadonlyArray<{ status: string }> | null | undefined): boolean {
  if (!deployments || deployments.length === 0) {
    return false;
  }

  return deployments.some((deployment) => isActiveDeploymentStatus(deployment.status));
}
