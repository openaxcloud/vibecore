/**
 * Runtime metering for server deployments (autoscale billing).
 *
 * Bills ACTIVE machine time — replicas > 0 — at the deployment's machine size
 * using the Replit formula (18 u/CPU-s + 2 u/GiB-s) from the active rate card.
 * Runs on the deploy.reap cadence (every 5 min via the platform CronJob): each
 * advances a per-deployment watermark (`metadata.serverDeploy.runtimeMeteredAt`)
 * and bills the elapsed window when the app was observed running. A sleeping
 * app (scaled to 0) advances the watermark WITHOUT billing — idle time is free,
 * that is the whole point of scale-to-zero.
 *
 * Distinct from meterDeploymentOnce (the one-shot base-fee marker keyed on
 * lastMeteredAt): this is the recurring usage stream. Never bills 0 for a
 * non-empty active window (machineComputeUnits floors at 1 unit).
 */
import { machineComputeUnits, machineSizeFromCard, type RateCard } from '@vibecore/billing';

import { meterDeployment } from './metering-service.js';
import type { ApiStore, DeploymentRecord } from './store.js';

export interface ServerDeployLiveStatus {
  exists: boolean;
  replicas: number;
  readyReplicas: number;

  /** Cumulative proxied-request counter (manager annotation), when known. */
  requestCount?: number;
}

/**
 * Cap a single billed window. The sweep runs every 5 minutes; if sweeps were
 * down for hours we cannot know retroactively when the app was actually up,
 * so bill at most this much per observation rather than inventing history.
 */
const MAX_WINDOW_SECONDS = 30 * 60;

/** Ignore sub-Nyquist windows (double ticks, clock skew). */
const MIN_WINDOW_SECONDS = 30;

function runtimeWatermarkIso(deployment: DeploymentRecord): string {
  const serverMeta = (deployment.metadata as Record<string, unknown> | undefined)?.serverDeploy as
    | { runtimeMeteredAt?: unknown }
    | undefined;

  if (typeof serverMeta?.runtimeMeteredAt === 'string' && !Number.isNaN(Date.parse(serverMeta.runtimeMeteredAt))) {
    return serverMeta.runtimeMeteredAt;
  }

  /*
   * First sweep for this row: start the clock when the deploy finished (went
   * READY), falling back to creation. Never bill pre-READY build time here.
   */
  return deployment.finishedAt ?? deployment.createdAt;
}

async function stampWatermark(store: ApiStore, deployment: DeploymentRecord, nowIso: string, meteredRequests?: number) {
  const metadata = (deployment.metadata as Record<string, unknown> | undefined) ?? {};
  const serverMeta = (metadata.serverDeploy as Record<string, unknown> | undefined) ?? {};

  await store.updateDeployment(deployment.projectId, deployment.id, {
    metadata: {
      ...metadata,
      serverDeploy: {
        ...serverMeta,
        runtimeMeteredAt: nowIso,
        ...(meteredRequests !== undefined ? { meteredRequests } : {}),
      },
    },
  });
}

/** Already-billed request watermark (cumulative counter position). */
function meteredRequestsWatermark(deployment: DeploymentRecord): number {
  const serverMeta = (deployment.metadata as Record<string, unknown> | undefined)?.serverDeploy as
    | { meteredRequests?: unknown }
    | undefined;

  const value = Number(serverMeta?.meteredRequests);

  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export interface RuntimeMeteringResult {
  scanned: number;
  billed: number;
  slept: number;
  computeUnits: number;
  requests: number;
}

export async function meterServerDeploymentRuntime(
  store: ApiStore,
  input: {
    card: RateCard;
    getLiveStatus: (deploymentId: string) => Promise<ServerDeployLiveStatus | undefined>;
    nowMs: number;
    shadow: boolean;
  },
): Promise<RuntimeMeteringResult> {
  const rows = await store.listActiveServerDeployments();
  const result: RuntimeMeteringResult = { scanned: rows.length, billed: 0, slept: 0, computeUnits: 0, requests: 0 };

  for (const row of rows) {
    try {
      await store.withSerializedMutation(`deploy-runtime-meter:${row.id}`, async () => {
        const fresh = (await store.getDeployment(row.projectId, row.id)) ?? row;

        if (fresh.status !== 'READY') {
          return;
        }

        // Reserved VM is settled by its durable calendar-month LedgerReservations.
        // Charging Autoscale CPU/request usage here as well would double-meter it.
        if (fresh.runtimeKind === 'reserved-vm') {
          return;
        }

        const watermarkMs = Date.parse(runtimeWatermarkIso(fresh));
        const elapsedSeconds = Number.isNaN(watermarkMs) ? 0 : (input.nowMs - watermarkMs) / 1000;

        if (elapsedSeconds < MIN_WINDOW_SECONDS) {
          return;
        }

        const live = await input.getLiveStatus(fresh.id);

        if (!live?.exists) {
          // Manifests gone (torn down out-of-band): stop the clock, bill nothing.
          await stampWatermark(store, fresh, new Date(input.nowMs).toISOString());
          return;
        }

        /*
         * Request billing: the manager reports the CUMULATIVE proxied-request
         * counter; bill the delta above our per-row watermark. A counter reset
         * (Deployment recreated) shows as live < watermark → re-anchor without
         * billing, never a negative charge.
         */
        const requestsSeen = Number.isFinite(live.requestCount) ? (live.requestCount as number) : undefined;
        const requestsWatermark = meteredRequestsWatermark(fresh);

        const requestsDelta =
          requestsSeen !== undefined && requestsSeen > requestsWatermark ? requestsSeen - requestsWatermark : 0;

        if (live.replicas === 0) {
          /*
           * Asleep — idle time is free; advance the watermark so a later wake
           * never back-bills the sleep window. (Requests seen while asleep were
           * wake-triggering; they are billed on the next ACTIVE sweep.)
           */
          await stampWatermark(store, fresh, new Date(input.nowMs).toISOString());
          result.slept += 1;

          return;
        }

        const project = await store.getProject(fresh.projectId);

        if (!project) {
          return;
        }

        const size = machineSizeFromCard(input.card, fresh.machineSize);
        const activeSeconds = Math.min(elapsedSeconds, MAX_WINDOW_SECONDS);

        // Replicas can exceed 1 (rolling surge); bill what actually ran.
        const replicaFactor = Math.max(1, live.replicas);
        const units = machineComputeUnits(size, activeSeconds) * replicaFactor;

        await meterDeployment(store, {
          organizationId: project.organizationId,
          kind: 'autoscale',
          computeUnits: units,
          requests: requestsDelta,
          shadow: input.shadow,
          nowMs: input.nowMs,

          // Watermark-scoped dedup: a retried sweep for the SAME window collapses.
          paygReference: `deployment-runtime:${fresh.id}:${watermarkMs}`,
          metadata: {
            machineSize: size.key,
            activeSeconds: Math.round(activeSeconds),
            replicas: live.replicas,
            rateCardVersion: input.card.version,
          },
        });

        await stampWatermark(
          store,
          fresh,
          new Date(input.nowMs).toISOString(),
          requestsSeen !== undefined ? Math.max(requestsSeen, requestsWatermark) : undefined,
        );
        result.billed += 1;
        result.computeUnits += units;
        result.requests += requestsDelta;
      });
    } catch (error) {
      console.error('deploy runtime metering failed for deployment; continuing', {
        deploymentId: row.id,
        error: (error as Error).message,
      });
    }
  }

  return result;
}
