import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createDatabaseClient } from '@vibecore/database';
import { decryptJson } from '@vibecore/security';
import { runConnectorReconnectionNotifier, runConnectorTokenHealthCheck } from './connector-jobs.js';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const workspaceQueue = new Queue('workspace-jobs', { connection });
export const enterpriseQueue = new Queue('enterprise-jobs', { connection });

// Single shared Prisma client for the lifetime of this long-running worker.
// Previously each job handler called createDatabaseClient() per invocation,
// which spins up a brand-new PrismaPg pool and was never $disconnect()'d — so
// every cron tick leaked a Postgres connection pool until the worker (and the
// shared DB) hit `too many clients`. One client, reused, is the correct shape.
//
// Constructed lazily on first DB use rather than at module load so that
// importing this module (e.g. the workspace.gc job, which never touches the DB,
// or tests) doesn't require DATABASE_URL.
let prismaSingleton: ReturnType<typeof createDatabaseClient> | undefined;

function getPrisma() {
  if (!prismaSingleton) {
    prismaSingleton = createDatabaseClient();
  }

  return prismaSingleton;
}

async function deliverSiemAuditEvents() {
  const prisma = getPrisma();
  const webhooks = await prisma.siemWebhook.findMany({ where: { enabled: true } });

  for (const webhook of webhooks) {
    // Isolate each webhook: a missing secret, decrypt failure, or delivery error
    // for one endpoint must not abort the loop and starve every later webhook of
    // its batch (lastDeliveredAt only advances on success, so a failed one is
    // simply retried on the next scheduled run).
    try {
      if (!webhook.secretCiphertext) {
        throw new Error(`SIEM webhook ${webhook.id} is missing an encrypted signing secret`);
      }

      const SIEM_BATCH_SIZE = 250;

      /*
       * Compound keyset cursor on (createdAt, id). A millisecond-resolution
       * DateTime alone can't disambiguate rows sharing the same createdAt, so a
       * batch boundary inside a same-ms group used to silently drop the overflow.
       * The secondary `id` cursor advances strictly within a millisecond, so
       * every row is delivered exactly once with no trimming.
       */
      const events = await prisma.auditLog.findMany({
        where: {
          organizationId: webhook.organizationId,
          ...(webhook.lastDeliveredAt
            ? {
                OR: [
                  { createdAt: { gt: webhook.lastDeliveredAt } },
                  {
                    AND: [{ createdAt: webhook.lastDeliveredAt }, { id: { gt: webhook.lastDeliveredId ?? '' } }],
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: SIEM_BATCH_SIZE,
      });

      if (events.length === 0) {
        continue;
      }

      const deliverable = events;

      const { secret } = decryptJson<{ secret: string }>(webhook.secretCiphertext);
      const body = JSON.stringify({
        type: 'audit.batch',
        organizationId: webhook.organizationId,
        events: deliverable,
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vibecore-timestamp': timestamp,
          'x-vibecore-signature': `sha256=${signature}`,
        },
        body,
        // Webhooks are delivered serially; without a timeout a single hung
        // customer endpoint stalls the whole batch (and the worker tick)
        // indefinitely. Treat a slow/hung call as a failed delivery and retry next run.
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        // Drain the body so the failed-delivery connection is released instead of leaking.
        await response.body?.cancel().catch(() => {});
        throw new Error(`SIEM webhook delivery failed: ${response.status}`);
      }

      // Drain the success body too — an unconsumed response keeps the underlying
      // connection pinned in the pool and eventually exhausts the agent's sockets.
      await response.body?.cancel().catch(() => {});

      await prisma.siemWebhook.update({
        where: { id: webhook.id },
        data: { lastDeliveredAt: deliverable.at(-1)!.createdAt, lastDeliveredId: deliverable.at(-1)!.id },
      });
    } catch (error) {
      console.error(`SIEM webhook ${webhook.id} delivery failed; continuing with remaining webhooks`, error);
    }
  }
}

async function enforceDataRetention() {
  const prisma = getPrisma();
  const settings = await prisma.enterpriseOrganizationSettings.findMany({ where: { legalHoldEnabled: false } });

  for (const setting of settings) {
    // Isolate each organization: a single failing deleteMany (FK contention,
    // timeout) must not abort the sweep and starve every later org of retention.
    // deleteMany is idempotent so a failed org is simply retried next run.
    try {
      const cutoff = new Date(Date.now() - setting.dataRetentionDays * 24 * 60 * 60 * 1000);
      await prisma.auditLog.deleteMany({ where: { organizationId: setting.organizationId, createdAt: { lt: cutoff } } });
      await prisma.projectActivity.deleteMany({
        where: {
          project: { organizationId: setting.organizationId },
          createdAt: { lt: cutoff },
        },
      });
    } catch (error) {
      console.error(`Data retention enforcement failed for org ${setting.organizationId}; continuing`, error);
    }
  }
}

/**
 * GC trigger — POSTs to workspace-manager's /workspaces/gc which iterates
 * the WorkspaceRuntime table and stops/deletes pods past their inactivity
 * thresholds. Inactivity + deletion windows can be overridden per-job via
 * the BullMQ job data, otherwise we default to 30m / 24h which the manager
 * itself uses as the route default.
 */
export async function triggerWorkspaceGarbageCollect(jobData: Record<string, unknown> = {}) {
  const baseUrl = process.env.WORKSPACE_MANAGER_URL;
  if (!baseUrl) {
    throw new Error('WORKSPACE_MANAGER_URL is required to trigger workspace.gc');
  }

  const body = {
    namespace: (jobData.namespace as string | undefined) ?? process.env.WORKSPACE_RUNTIME_NAMESPACE ?? 'workspaces',
    inactiveMs: (jobData.inactiveMs as number | undefined) ?? 30 * 60_000,
    deleteMs: (jobData.deleteMs as number | undefined) ?? 24 * 60 * 60_000,
  };

  // The manager gates its control-plane routes (including /workspaces/gc) behind a shared
  // secret — WORKSPACE_MANAGER_SHARED_SECRET, falling back to PREVIEW_PROXY_SHARED_SECRET,
  // matching the api↔manager wiring. Without the bearer the manager fail-closes with 401 in
  // production and GC silently never runs, so leaked pods/PVCs accumulate. Forward the secret.
  const managerSecret =
    process.env.WORKSPACE_MANAGER_SHARED_SECRET?.trim() || process.env.PREVIEW_PROXY_SHARED_SECRET?.trim();

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/workspaces/gc`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(managerSecret ? { authorization: `Bearer ${managerSecret}` } : {}),
    },
    body: JSON.stringify(body),
    // workspace-jobs runs at concurrency 1; without a timeout a hung manager
    // pins this GC job forever, so no further GC ever runs and leaked pods/PVCs
    // accumulate. Bound the call and let BullMQ retry on the next attempt/tick.
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    // Drain the body so the failed-GC connection is released instead of leaking.
    await response.body?.cancel().catch(() => {});
    throw new Error(`workspace.gc upstream failed: ${response.status}`);
  }

  // Drain the success body as well so the keep-alive connection is returned to
  // the pool instead of being pinned open until GC.
  await response.body?.cancel().catch(() => {});
}

export const worker = new Worker(
  'workspace-jobs',
  async (job) => {
    job.log(`processing ${job.name}`);

    if (job.name === 'workspace.gc') {
      await triggerWorkspaceGarbageCollect((job.data ?? {}) as Record<string, unknown>);
      return { collected: true };
    }

    throw new Error(`Unsupported workspace job: ${job.name}`);
  },
  { connection },
);

export const enterpriseWorker = new Worker(
  'enterprise-jobs',
  async (job) => {
    job.log(`processing ${job.name}`);

    if (job.name === 'siem.deliver') {
      await deliverSiemAuditEvents();
      return { delivered: true };
    }

    if (job.name === 'retention.enforce') {
      await enforceDataRetention();
      return { retained: true };
    }

    if (job.name === 'connector.healthcheck') {
      const result = await runConnectorTokenHealthCheck({ prisma: getPrisma() });
      return result;
    }

    if (job.name === 'connector.notify.reconnect') {
      const result = await runConnectorReconnectionNotifier({ prisma: getPrisma() });
      return result;
    }

    throw new Error(`Unsupported enterprise job: ${job.name}`);
  },
  { connection },
);

worker.on('failed', (job, error) => {
  console.error(JSON.stringify({ level: 'error', service: 'worker', jobId: job?.id, error: error?.message }));
});

enterpriseWorker.on('failed', (job, error) => {
  console.error(JSON.stringify({ level: 'error', service: 'enterprise-worker', jobId: job?.id, error: error?.message }));
});

/*
 * BullMQ Workers/Queues re-emit the underlying ioredis connection's `'error'`
 * event (failover, DNS blip, AUTH failure, Memorystore maintenance). On an
 * EventEmitter, an `'error'` event with no listener is *thrown* — which here
 * would be an uncaught exception that crashes the long-running worker process
 * and stops every cron job until the pod restarts. Log and swallow so a
 * transient Redis fault is survivable.
 */
connection.on('error', (error) => {
  console.error(JSON.stringify({ level: 'error', service: 'worker', component: 'redis', error: error?.message }));
});

worker.on('error', (error) => {
  console.error(JSON.stringify({ level: 'error', service: 'worker', component: 'bullmq', error: error?.message }));
});

enterpriseWorker.on('error', (error) => {
  console.error(JSON.stringify({ level: 'error', service: 'enterprise-worker', component: 'bullmq', error: error?.message }));
});

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ level: 'info', service: 'worker', message: 'worker started' }));

  /*
   * Liveness heartbeat. The worker has no HTTP server, so the Deployment's exec
   * liveness probe (infra/helm/platform/templates/deployments.yaml) checks the
   * freshness of this file. If the event loop hangs, the interval stops firing,
   * the file goes stale, and Kubernetes restarts the otherwise-wedged pod.
   * unref() so the timer never by itself keeps the process alive.
   */
  const heartbeatPath = process.env.WORKER_HEARTBEAT_PATH ?? '/tmp/worker-heartbeat';
  const writeHeartbeat = () => {
    try {
      writeFileSync(heartbeatPath, String(Date.now()));
    } catch {
      // best-effort: a transient FS error must not crash the worker
    }
  };
  writeHeartbeat();
  setInterval(writeHeartbeat, 15_000).unref();
}
