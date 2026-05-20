import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createHmac } from 'node:crypto';
import { createDatabaseClient } from '@vibecore/database';
import { decryptJson } from '@vibecore/security';
import { runConnectorReconnectionNotifier, runConnectorTokenHealthCheck } from './connector-jobs.js';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const workspaceQueue = new Queue('workspace-jobs', { connection });
export const enterpriseQueue = new Queue('enterprise-jobs', { connection });

async function deliverSiemAuditEvents() {
  const prisma = createDatabaseClient();
  const webhooks = await prisma.siemWebhook.findMany({ where: { enabled: true } });

  for (const webhook of webhooks) {
    if (!webhook.secretCiphertext) {
      throw new Error(`SIEM webhook ${webhook.id} is missing an encrypted signing secret`);
    }

    const events = await prisma.auditLog.findMany({
      where: {
        organizationId: webhook.organizationId,
        ...(webhook.lastDeliveredAt ? { createdAt: { gt: webhook.lastDeliveredAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 250,
    });

    if (events.length === 0) {
      continue;
    }

    const { secret } = decryptJson<{ secret: string }>(webhook.secretCiphertext);
    const body = JSON.stringify({ type: 'audit.batch', organizationId: webhook.organizationId, events });
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
    });

    if (!response.ok) {
      throw new Error(`SIEM webhook delivery failed: ${response.status}`);
    }

    await prisma.siemWebhook.update({
      where: { id: webhook.id },
      data: { lastDeliveredAt: events.at(-1)!.createdAt },
    });
  }
}

async function enforceDataRetention() {
  const prisma = createDatabaseClient();
  const settings = await prisma.enterpriseOrganizationSettings.findMany({ where: { legalHoldEnabled: false } });

  for (const setting of settings) {
    const cutoff = new Date(Date.now() - setting.dataRetentionDays * 24 * 60 * 60 * 1000);
    await prisma.auditLog.deleteMany({ where: { organizationId: setting.organizationId, createdAt: { lt: cutoff } } });
    await prisma.projectActivity.deleteMany({
      where: {
        project: { organizationId: setting.organizationId },
        createdAt: { lt: cutoff },
      },
    });
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

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/workspaces/gc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`workspace.gc upstream failed: ${response.status}`);
  }
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
      const result = await runConnectorTokenHealthCheck({ prisma: createDatabaseClient() });
      return result;
    }

    if (job.name === 'connector.notify.reconnect') {
      const result = await runConnectorReconnectionNotifier({ prisma: createDatabaseClient() });
      return result;
    }

    throw new Error(`Unsupported enterprise job: ${job.name}`);
  },
  { connection },
);

worker.on('failed', (job, error) => {
  console.error(JSON.stringify({ level: 'error', service: 'worker', jobId: job?.id, error: error.message }));
});

enterpriseWorker.on('failed', (job, error) => {
  console.error(JSON.stringify({ level: 'error', service: 'enterprise-worker', jobId: job?.id, error: error.message }));
});

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ level: 'info', service: 'worker', message: 'worker started' }));
}
