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
 * Build the `?workspace=…` suffix to carry the active workspace across a
 * deploy/redeploy/cancel/rollback redirect.
 *
 * Every action redirects back to the deployments panel, but only the default
 * deploy handler used to preserve the workspace — redeploy/cancel/rollback
 * dropped it, so the next NEW deploy from the wizard submitted an empty
 * `workspaceId` and the backend scoped the build to the project root. Prefer the
 * hidden-input value (`bodyWorkspaceId`), then fall back to the current URL's
 * `?workspace=` query, mirroring how the deploy POST resolves the workspace.
 * Returns '' (no suffix) when neither is present so legacy non-workspace
 * projects redirect to the bare path.
 */
export function deploymentsRedirectQuery(requestUrl: string, bodyWorkspaceId: string | null | undefined): string {
  let queryWorkspaceId: string | null = null;

  try {
    queryWorkspaceId = new URL(requestUrl).searchParams.get('workspace');
  } catch {
    queryWorkspaceId = null;
  }

  const workspaceId = (bodyWorkspaceId || queryWorkspaceId || '').trim();

  return workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : '';
}

/**
 * Human-readable build duration ("42s", "3m 12s", "1h 4m") from the row's
 * `startedAt`/`finishedAt` timestamps. Returns null when either bound is
 * missing (still building, or a legacy row predating the timestamps) or the
 * pair is malformed/negative, so the timeline simply omits the duration
 * instead of fabricating one.
 */
export function formatDeploymentDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
): string | null {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }

  const totalSeconds = Math.round(ms / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

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
