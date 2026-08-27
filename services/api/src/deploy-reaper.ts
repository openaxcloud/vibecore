import { appPublicEnglish } from './app-public-copy.js';
import type { ApiStore } from './store.js';

/*
 * Stale-build reaper (#26). A durable deploy job can be orphaned if the worker or
 * the api pod that was driving it dies mid-build: the deployment row is then left
 * in QUEUED or BUILDING forever with no process advancing it. The reaper is a
 * periodic safety net (a worker cron job, like workspace-gc / database-maintenance):
 * any deployment still non-terminal whose `updatedAt` has gone stale past the
 * build timeout is failed with a clear, retryable message so the UI never hangs.
 *
 * `updatedAt` is the right freshness signal: a healthy build flushes incremental
 * logs/phase to the row roughly once a second, so its `updatedAt` stays fresh;
 * an interrupted build stops updating and goes stale.
 */

export const DEFAULT_DEPLOY_BUILD_TIMEOUT_MS = 10 * 60 * 1000;

export function resolveDeployBuildTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.DEPLOY_BUILD_TIMEOUT_MS);

  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DEPLOY_BUILD_TIMEOUT_MS;
}

export interface ReapStaleDeploymentsResult {
  scanned: number;
  failed: number;
  deploymentIds: string[];
}

/**
 * Fail every deployment stuck in QUEUED/BUILDING past the build timeout. The
 * status write goes through updateDeployment, whose monotonic guard leaves an
 * already-terminal row untouched — so a build that reached READY/FAILED between
 * the scan and the write is never clobbered (we only count rows that actually
 * flipped to FAILED). Each row is isolated: one write failure never aborts the
 * sweep.
 */
export async function reapStaleDeployments(
  store: ApiStore,
  options: { timeoutMs?: number; now?: Date } = {},
): Promise<ReapStaleDeploymentsResult> {
  const timeoutMs = options.timeoutMs ?? resolveDeployBuildTimeoutMs();
  const now = options.now ?? new Date();
  const cutoffIso = new Date(now.getTime() - timeoutMs).toISOString();

  const stale = await store.listStaleDeployments(cutoffIso).catch(() => []);
  const deploymentIds: string[] = [];

  for (const deployment of stale) {
    /*
     * Reserved VM builds are durable sagas with a billing hold, external fence,
     * and PVC cleanup contract. A generic FAILED status write would strand all
     * three, so their dedicated recovery/cancellation loops own terminalization.
     */
    if (
      deployment.runtimeKind === 'reserved-vm' ||
      Boolean((deployment.metadata as Record<string, unknown> | undefined)?.reservedVmCreate)
    ) {
      continue;
    }

    try {
      const updated = await store.updateDeployment(deployment.projectId, deployment.id, {
        status: 'FAILED',
        finishedAt: now.toISOString(),
        logs: [
          ...deployment.logs,
          {
            timestamp: now.toISOString(),
            level: 'error' as const,
            message: appPublicEnglish('DEPLOYMENT_BUILD_TIMEOUT'),
          },
        ],
      });

      if (updated.status === 'FAILED') {
        deploymentIds.push(deployment.id);
      }
    } catch {
      // Isolate: one row's write failure must not abort the sweep.
    }
  }

  return { scanned: stale.length, failed: deploymentIds.length, deploymentIds };
}
