import { requireApiBaseUrl } from './api-base-url.js';

/*
 * Deploy build + stale-build reaper triggers (#26).
 *
 * These are thin worker → api hops, mirroring the other internal triggers in
 * index.ts (database.maintenance, metering.*, inactivity.gc). The api owns the
 * actual build drive — the workspace-pod build, the QUEUED → BUILDING → READY/FAILED
 * transitions and the incremental log flush — behind two internal endpoints. The
 * worker's job is only to CONSUME the durable BullMQ job and call them, which is
 * exactly what makes a deploy durable: the build now runs off the original request
 * handler, so an api-pod restart no longer orphans it (BullMQ retries the job),
 * and the reaper fails anything that ever stalls so a deployment never hangs.
 *
 *  - triggerDeployBuild → POST /internal/deployments/build (drives one deployment)
 *  - triggerDeployReap  → POST /internal/deployments/reap  (fails stale builds)
 */

function apiBaseUrl(): string {
  /*
   * Délègue au résolveur partagé (`api-base-url.ts`). Cette fonction avait sa
   * PROPRE chaîne à quatre variables pendant que `index.ts` n'en essayait que
   * deux — c'est cette divergence qui laissait les jobs de métrage et de
   * maintenance échouer en production. Une seule source de vérité désormais.
   */
  return requireApiBaseUrl('deploy jobs');
}

function internalSecret(): string | undefined {
  return (process.env.INTERNAL_API_SHARED_SECRET ?? process.env.WORKSPACE_MANAGER_SHARED_SECRET)?.trim();
}

/*
 * A workspace-pod build can legitimately run up to the maximum build timeout
 * (~30 min) before the api returns, so the internal call must allow ample
 * headroom over that — otherwise a long-but-valid build would be aborted here
 * and the job retried needlessly. A genuinely hung api still eventually frees the
 * BullMQ job (and the reaper fails the row regardless).
 */
const DEPLOY_BUILD_CALL_TIMEOUT_MS = 40 * 60 * 1000;

export async function triggerDeployBuild(jobData: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const secret = internalSecret();

  const response = await fetch(`${apiBaseUrl()}/internal/deployments/build`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(jobData ?? {}),
    signal: AbortSignal.timeout(DEPLOY_BUILD_CALL_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Drain the failed-call body so the connection is released instead of leaking.
    await response.body?.cancel().catch(() => {});
    throw new Error(`deploy.build upstream failed: ${response.status}`);
  }

  const result = await response.json().catch(() => ({}));

  return result as Record<string, unknown>;
}

export async function triggerDeployReap(jobData: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const secret = internalSecret();

  const response = await fetch(`${apiBaseUrl()}/internal/deployments/reap`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(jobData ?? {}),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`deploy.reap upstream failed: ${response.status}`);
  }

  const result = await response.json().catch(() => ({}));

  return result as Record<string, unknown>;
}
