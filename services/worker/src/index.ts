import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createDatabaseClient } from '@vibecore/database';
import { decryptJson } from '@vibecore/security';
import { runConnectorReconnectionNotifier, runConnectorTokenHealthCheck } from './connector-jobs.js';

/*
 * Worker runtime (Redis connection, BullMQ Queues + Workers) is created lazily
 * via startWorkers(), NOT at module load. Importing this module — e.g. the
 * workspace-gc test importing triggerWorkspaceGarbageCollect, or any tooling
 * reusing an exported job handler — must not spin up two live job-consuming
 * Workers and their Redis connections as a side effect. Only the process
 * entrypoint (bottom of file) calls startWorkers().
 */

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
      // Drain several batches per tick (bounded) so a high-volume org doesn't fall
      // permanently behind delivering only 250 events per scheduled run.
      const MAX_BATCHES_PER_TICK = 20;

      const { secret } = decryptJson<{ secret: string }>(webhook.secretCiphertext);
      let cursorAt = webhook.lastDeliveredAt;
      let cursorId = webhook.lastDeliveredId ?? '';

      for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch += 1) {
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
            ...(cursorAt
              ? {
                  OR: [
                    { createdAt: { gt: cursorAt } },
                    {
                      AND: [{ createdAt: cursorAt }, { id: { gt: cursorId } }],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: SIEM_BATCH_SIZE,
        });

        if (events.length === 0) {
          break;
        }

        const deliverable = events;
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
          /*
           * Do NOT follow redirects. The only SSRF protection on a webhook URL is
           * config-time validation of the stored string; a customer endpoint that
           * passes that check can still 3xx-redirect delivery to an internal target
           * (169.254.169.254, RFC1918, in-cluster DNS) — redirect-based blind SSRF
           * from this in-cluster worker. With redirect:'manual' a 3xx surfaces as a
           * non-ok status and is treated as a failed delivery below.
           */
          redirect: 'manual',
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

        cursorAt = deliverable.at(-1)!.createdAt;
        cursorId = deliverable.at(-1)!.id;
        await prisma.siemWebhook.update({
          where: { id: webhook.id },
          data: { lastDeliveredAt: cursorAt, lastDeliveredId: cursorId },
        });

        // Last partial batch — nothing more pending for this webhook this tick.
        if (events.length < SIEM_BATCH_SIZE) {
          break;
        }
      }
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

      /*
       * Never delete audit logs a SIEM webhook hasn't delivered yet — that
       * silently loses the customer's compliance record. Cap the audit-log
       * deletion to the slowest enabled webhook's delivery watermark (a webhook
       * that never delivered → epoch → nothing deleted beyond what's delivered).
       * projectActivity is not SIEM-delivered, so it uses the full retention cutoff.
       */
      let auditCutoff = cutoff;
      const webhooks = await prisma.siemWebhook.findMany({
        where: { organizationId: setting.organizationId, enabled: true },
        select: { lastDeliveredAt: true },
      });

      if (webhooks.length > 0) {
        const watermark = Math.min(...webhooks.map((w) => w.lastDeliveredAt?.getTime() ?? 0));

        if (watermark < auditCutoff.getTime()) {
          auditCutoff = new Date(watermark);
        }
      }

      await prisma.auditLog.deleteMany({
        where: { organizationId: setting.organizationId, createdAt: { lt: auditCutoff } },
      });
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

  // The manager gates its control-plane routes (including /workspaces/gc) behind
  // WORKSPACE_MANAGER_SHARED_SECRET. The PREVIEW_PROXY_SHARED_SECRET fallback was
  // removed from the manager's controlPlaneSecret() in a prior wave, so keeping it
  // here was inconsistent: a worker configured with only PREVIEW_PROXY_SHARED_SECRET
  // would send a secret the manager no longer accepts → 401, GC silently never runs,
  // leaked pods/PVCs accumulate. Use the same single secret the manager expects.
  const managerSecret = process.env.WORKSPACE_MANAGER_SHARED_SECRET?.trim();

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

export function startWorkers() {
  const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  // Queues are created alongside the workers so importing this module never opens
  // a Redis connection; producers (the enqueue-cli CronJob trigger) are standalone.
  const workspaceQueue = new Queue('workspace-jobs', { connection });
  const enterpriseQueue = new Queue('enterprise-jobs', { connection });
  void workspaceQueue;
  void enterpriseQueue;

  const worker = new Worker(
    'workspace-jobs',
    async (job) => {
      // job.log writes a log row to Redis (returns a Promise). Fire-and-forget,
      // but swallow rejection: an unhandled rejection from a transient Redis fault
      // (failover, AUTH rotation, maintenance) would otherwise crash the worker.
      void job.log(`processing ${job.name}`).catch(() => {});

      if (job.name === 'workspace.gc') {
        await triggerWorkspaceGarbageCollect((job.data ?? {}) as Record<string, unknown>);
        return { collected: true };
      }

      throw new Error(`Unsupported workspace job: ${job.name}`);
    },
    { connection },
  );

  const enterpriseWorker = new Worker(
    'enterprise-jobs',
    async (job) => {
      // job.log writes a log row to Redis (returns a Promise). Fire-and-forget,
      // but swallow rejection: an unhandled rejection from a transient Redis fault
      // (failover, AUTH rotation, maintenance) would otherwise crash the worker.
      void job.log(`processing ${job.name}`).catch(() => {});

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
    console.error(
      JSON.stringify({ level: 'error', service: 'enterprise-worker', jobId: job?.id, error: error?.message }),
    );
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
    console.error(
      JSON.stringify({ level: 'error', service: 'enterprise-worker', component: 'bullmq', error: error?.message }),
    );
  });

  return { worker, enterpriseWorker, connection };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = startWorkers();
  console.log(JSON.stringify({ level: 'info', service: 'worker', message: 'worker started' }));

  /*
   * Graceful shutdown on rollout/scale-down (replicas:2 → this fires routinely).
   * Without it, SIGTERM kills in-flight BullMQ jobs mid-execution and drops the
   * Redis/Prisma connections abruptly (job left "active" until stalled-reclaim,
   * possible half-applied side effects). Close the workers (lets active jobs
   * finish), then quit Redis and disconnect Prisma. Bounded so we still exit
   * before the pod's termination grace period elapses.
   */
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(JSON.stringify({ level: 'info', service: 'worker', message: `received ${signal}, shutting down` }));

    const deadline = setTimeout(() => process.exit(0), 25_000);
    deadline.unref();

    try {
      const { worker, enterpriseWorker, connection } = await started;
      await Promise.allSettled([worker.close(), enterpriseWorker.close()]);
      await Promise.allSettled([connection.quit(), getPrisma().$disconnect()]);
    } catch {
      // best-effort shutdown; never block exit on a cleanup error
    } finally {
      clearTimeout(deadline);
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  /*
   * Liveness heartbeat. The worker has no HTTP server, so the Deployment's exec
   * liveness probe (infra/helm/platform/templates/deployments.yaml) checks the
   * freshness of this file. If the event loop hangs, the interval stops firing,
   * the file goes stale, and Kubernetes restarts the otherwise-wedged pod.
   * unref() so the timer never by itself keeps the process alive.
   */
  const heartbeatPath = process.env.WORKER_HEARTBEAT_PATH ?? '/tmp/worker-heartbeat';

  /*
   * Liveness must reflect Redis health, not just event-loop liveness. The Redis
   * connection swallows 'error' (see startWorkers) so a permanent disconnect
   * (AUTH rotation, network policy, instance replace) leaves the process alive
   * but processing NOTHING — yet an unconditional heartbeat kept the probe green
   * forever. Now we only REFRESH the heartbeat while the connection is actually
   * usable (ioredis status 'ready'); a wedged worker lets the file go stale and
   * Kubernetes restarts it.
   *
   * The probe treats a MISSING file as healthy (image-rollout compatibility), so
   * we still write once at startup with `force` — that guarantees the file
   * EXISTS and can therefore go stale even for a worker that never connects to
   * Redis at all (otherwise a never-connected worker would stay false-green).
   */
  const writeHeartbeat = (force = false) => {
    if (!force && started.connection.status !== 'ready') {
      return;
    }

    try {
      writeFileSync(heartbeatPath, String(Date.now()));
    } catch {
      // best-effort: a transient FS error must not crash the worker
    }
  };
  writeHeartbeat(true);
  setInterval(() => writeHeartbeat(false), 15_000).unref();
}
