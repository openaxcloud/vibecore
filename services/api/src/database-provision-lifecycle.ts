import type { DatabaseProvisioner } from './database-provisioner.js';
import type { ApiStore, DatabaseInstanceRecord } from './store.js';

export const DEFAULT_DATABASE_PROVISION_TIMEOUT_MS = 10 * 60 * 1000;
const MIN_DATABASE_PROVISION_TIMEOUT_MS = 30 * 1000;
const MAX_DATABASE_PROVISION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export const DATABASE_PROVISION_FAILURE = {
  providerUnavailable: 'DATABASE_PROVISIONER_UNAVAILABLE',
  kickoffFailed: 'DATABASE_PROVISION_KICKOFF_FAILED',
  rejected: 'DATABASE_PROVISION_REJECTED',
  timedOut: 'DATABASE_PROVISION_TIMED_OUT',
} as const;

export function databaseProvisionTimeoutMs(raw = process.env.DB_PROVISION_TIMEOUT_MS): number {
  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_DATABASE_PROVISION_TIMEOUT_MS;
  }

  return Math.min(MAX_DATABASE_PROVISION_TIMEOUT_MS, Math.max(MIN_DATABASE_PROVISION_TIMEOUT_MS, Math.trunc(parsed)));
}

export function databaseProvisionDeadline(nowMs = Date.now()): string {
  return new Date(nowMs + databaseProvisionTimeoutMs()).toISOString();
}

export function databaseProvisionExpired(instance: DatabaseInstanceRecord, nowMs = Date.now()): boolean {
  const explicit = instance.provisioningDeadlineAt ? Date.parse(instance.provisioningDeadlineAt) : Number.NaN;
  const fallback = Date.parse(instance.createdAt) + databaseProvisionTimeoutMs();
  const deadline = Number.isFinite(explicit) ? explicit : fallback;

  return Number.isFinite(deadline) && deadline <= nowMs;
}

export type DatabaseProvisionReconcileResult = {
  instance: DatabaseInstanceRecord;
  transition: 'none' | 'active' | 'failed';
  probeFailed: boolean;
};

/**
 * Reconcile a single durable provisioning row. Readiness means the exact
 * application URI has executed SQL (the provisioner contract), then secret
 * persistence + ACTIVE transition commit atomically in the platform database.
 */
export async function reconcileDatabaseProvisioning(input: {
  store: ApiStore;
  provisioner: DatabaseProvisioner;
  instance: DatabaseInstanceRecord;
  nowMs?: number;
  encryptConnectionUri: (uri: string) => string;
}): Promise<DatabaseProvisionReconcileResult> {
  const nowMs = input.nowMs ?? Date.now();

  if (input.instance.status !== 'PROVISIONING') {
    return { instance: input.instance, transition: 'none', probeFailed: false };
  }

  if (!input.provisioner.active) {
    const failed = await input.store.failDatabaseProvisioning(input.instance.id, {
      expectedGeneration: input.instance.provisioningGeneration,
      errorCode: DATABASE_PROVISION_FAILURE.providerUnavailable,
      failedAt: new Date(nowMs).toISOString(),
    });

    return {
      instance: failed ?? input.instance,
      transition: failed ? 'failed' : 'none',
      probeFailed: false,
    };
  }

  let uri: string | undefined;
  let probeFailed = false;

  try {
    const authority = input.instance.physicalAuthority;
    if (!authority) {
      throw Object.assign(new Error('Legacy database physical authority is not reconciled'), {
        code: 'DATABASE_PHYSICAL_AUTHORITY_RECONCILIATION_REQUIRED',
      });
    }
    uri = await input.provisioner.getConnectionUri({
      projectId: input.instance.projectId,
      tier: authority.tier,
      ...(authority.tier === 'shared' ? { sharedClusterName: authority.clusterName } : {}),
      ...(authority.tier === 'isolated' ? { physicalClusterName: authority.clusterName } : {}),
      environment: input.instance.environment,
    });
  } catch {
    // A transient manager/SQL probe failure is not a durable failure until the
    // deadline. It is returned to the caller for structured warning logs.
    probeFailed = true;
  }

  if (uri) {
    const active = await input.store.completeDatabaseProvisioning(input.instance.id, {
      projectId: input.instance.projectId,
      expectedOrganizationId: input.instance.organizationId,
      expectedGeneration: input.instance.provisioningGeneration,
      key: input.instance.environment === 'production' ? 'PROD_DATABASE_URL' : 'DATABASE_URL',
      valueEncrypted: input.encryptConnectionUri(uri),
    });

    if (active) {
      return { instance: active, transition: 'active', probeFailed };
    }
  }

  if (databaseProvisionExpired(input.instance, nowMs)) {
    const failed = await input.store.failDatabaseProvisioning(input.instance.id, {
      expectedGeneration: input.instance.provisioningGeneration,
      errorCode: DATABASE_PROVISION_FAILURE.timedOut,
      failedAt: new Date(nowMs).toISOString(),
      ...(input.instance.provisioningDeadlineAt ? { deadlineBefore: new Date(nowMs).toISOString() } : {}),
    });

    if (failed) {
      return { instance: failed, transition: 'failed', probeFailed };
    }
  }

  return { instance: input.instance, transition: 'none', probeFailed };
}
