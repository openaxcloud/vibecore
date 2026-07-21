/*
 * Project Factory (DOMAIN_MODEL.md — Project Factory state machine).
 *
 *   REQUESTED → CREATING → BILLING_LINKED → APIS_ENABLING
 *     → SERVICE_AGENTS_READY → IAM_BOUND → EDGE_READY → ACTIVE
 *   ACTIVE ⇄ BILLING_SUSPENDED · QUOTA_EXHAUSTED · DRIFT_DETECTED
 *   ACTIVE → DELETE_REQUESTED → RECOVERY_WINDOW → PURGING → PURGED
 *   RECOVERY_WINDOW → RESTORING → ACTIVE
 *
 * Ground truth encoded here:
 *  - GCP project deletion is reversible ~30 days, but SOME SERVICES may purge
 *    earlier and quota stays consumed during the window — RECOVERY_WINDOW is
 *    a maximum, not a promise. (Both ends of the window were PROVEN live on
 *    2026-07-17 — see docs/deploy-evidence/2026-07-17-cloud-tenant-factory-iam/.)
 *  - Project IDs are NEVER reusable: the CloudProjectBinding row (with its
 *    UNIQUE gcpProjectId) is kept forever, PURGED included — that row IS the
 *    name reservation.
 *  - Folders are scarce: creation measured 2026-07-17 at 5.8/min sustained
 *    (429 "Folder V3 create requests per minute" beyond a ~10 burst) and 300
 *    children max per parent. Tenants therefore NEVER get a dedicated folder;
 *    projects land in shared shard folders (customers/shard-<n>) kept under
 *    SHARD_CAPACITY.
 */

import type {
  CloudGovernanceStore,
  CloudProjectBinding,
  CloudProjectBindingState,
  CloudTeardownRecord,
  JsonValue,
} from './cloud-governance-store.js';
import { CloudTenantError } from './cloud-tenant-service.js';
import { GcpApiError, type GcpCloudClient } from './gcp-cloud-client.js';

/** Hard GCP limit is 300 direct children; stay well under it. */
export const SHARD_CAPACITY = 280;

/** Recovery window (GCP soft-delete); a maximum, not a promise. */
export const RECOVERY_WINDOW_DAYS = 30;

/** Baseline APIs every tenant project gets. */
export const BASELINE_SERVICES = [
  'iam.googleapis.com',
  'cloudresourcemanager.googleapis.com',
  'serviceusage.googleapis.com',
  'storage.googleapis.com',
];

export const FACTORY_TRANSITIONS: Record<CloudProjectBindingState, CloudProjectBindingState[]> = {
  REQUESTED: ['CREATING'],
  CREATING: ['BILLING_LINKED'],
  BILLING_LINKED: ['APIS_ENABLING'],
  APIS_ENABLING: ['SERVICE_AGENTS_READY'],
  SERVICE_AGENTS_READY: ['IAM_BOUND'],
  IAM_BOUND: ['EDGE_READY'],
  EDGE_READY: ['ACTIVE'],
  ACTIVE: ['BILLING_SUSPENDED', 'QUOTA_EXHAUSTED', 'DRIFT_DETECTED', 'DELETE_REQUESTED'],
  BILLING_SUSPENDED: ['ACTIVE', 'DELETE_REQUESTED'],
  QUOTA_EXHAUSTED: ['ACTIVE', 'DELETE_REQUESTED'],
  DRIFT_DETECTED: ['ACTIVE', 'DELETE_REQUESTED'],
  DELETE_REQUESTED: ['RECOVERY_WINDOW'],
  RECOVERY_WINDOW: ['RESTORING', 'PURGING'],
  RESTORING: ['ACTIVE'],
  PURGING: ['PURGED'],
  PURGED: [],
};

export function assertFactoryTransition(from: CloudProjectBindingState, to: CloudProjectBindingState): void {
  if (!FACTORY_TRANSITIONS[from]?.includes(to)) {
    throw new CloudTenantError('FACTORY_TRANSITION_INVALID', `Project binding cannot go ${from} → ${to}`, 409);
  }
}

async function transition(
  store: CloudGovernanceStore,
  binding: CloudProjectBinding,
  to: CloudProjectBindingState,
  detail?: JsonValue,
  actor?: string,
): Promise<CloudProjectBinding> {
  assertFactoryTransition(binding.state, to);

  const updated = await store.updateCloudProjectBinding(binding.id, { state: to });
  await store.recordFactoryEvent({
    bindingId: binding.id,
    fromState: binding.state,
    toState: to,
    actor: actor ?? null,
    detail,
  });

  return updated;
}

export interface FactoryProvisionOptions {
  billingAccountId: string;

  /** Parent for the project (folder or organization resource name). */
  parent?: string;

  /** Extra services on top of BASELINE_SERVICES. */
  services?: string[];
  actor?: string;
}

/**
 * Execute ONE forward step of the provisioning pipeline based on the
 * binding's current state. Idempotent per step: a step that finds its work
 * already done records that and still advances.
 */
export async function advanceCloudProjectBinding(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  bindingId: string,
  opts: FactoryProvisionOptions,
): Promise<CloudProjectBinding> {
  const binding = await store.getCloudProjectBinding(bindingId);

  if (!binding) {
    throw new CloudTenantError('BINDING_NOT_FOUND', `CloudProjectBinding ${bindingId} not found`, 404);
  }

  switch (binding.state) {
    case 'REQUESTED': {
      try {
        await gcp.createProject({
          projectId: binding.gcpProjectId,
          displayName: binding.gcpProjectId,
          parent: opts.parent ?? binding.parentFolderId ?? undefined,
          labels: {
            'ecode-tenant': binding.cloudTenantId.toLowerCase(),
            'ecode-role': binding.role.toLowerCase().replace(/_/g, '-'),
          },
        });
      } catch (error) {
        if (!(error instanceof GcpApiError && error.isAlreadyExists)) {
          throw error;
        }
      }

      return transition(store, binding, 'CREATING', { parent: opts.parent ?? binding.parentFolderId }, opts.actor);
    }

    case 'CREATING': {
      const project = await gcp.getProject(binding.gcpProjectId);

      if (!project || project.state !== 'ACTIVE') {
        throw new CloudTenantError(
          'FACTORY_PROJECT_NOT_READY',
          `Project ${binding.gcpProjectId} is ${project?.state ?? 'absent'}; retry once creation settles`,
          409,
        );
      }

      if (project.projectNumber) {
        await store.updateCloudProjectBinding(binding.id, { gcpProjectNumber: project.projectNumber });
      }

      await gcp.linkProjectBilling(binding.gcpProjectId, opts.billingAccountId);

      const billing = await gcp.getProjectBillingInfo(binding.gcpProjectId);

      if (!billing.billingEnabled) {
        throw new CloudTenantError('FACTORY_BILLING_NOT_LINKED', 'Billing link did not take effect', 500);
      }

      return transition(store, binding, 'BILLING_LINKED', { billingAccountId: opts.billingAccountId }, opts.actor);
    }

    case 'BILLING_LINKED': {
      const services = [...new Set([...BASELINE_SERVICES, ...(opts.services ?? [])])];
      await gcp.enableServices(binding.gcpProjectId, services);

      return transition(store, binding, 'APIS_ENABLING', { services }, opts.actor);
    }

    case 'APIS_ENABLING': {
      const wanted = [...new Set([...BASELINE_SERVICES, ...(opts.services ?? [])])];
      const enabled = await gcp.listEnabledServices(binding.gcpProjectId);
      const missing = wanted.filter((s) => !enabled.includes(s));

      if (missing.length > 0) {
        throw new CloudTenantError('FACTORY_SERVICES_PENDING', `Services not yet enabled: ${missing.join(', ')}`, 409);
      }

      /*
       * Service agents (the per-API Google-managed SAs) are provisioned as a
       * side effect of enablement; observing every requested API ENABLED is
       * the readiness signal this step verifies.
       */
      return transition(store, binding, 'SERVICE_AGENTS_READY', { enabledCount: enabled.length }, opts.actor);
    }

    case 'SERVICE_AGENTS_READY': {
      // Baseline IAM: the tenant OWNER gets read-only visibility; all write
      // paths go through platform identities (see iam-identity-service).
      const policy = await gcp.getProjectIamPolicy(binding.gcpProjectId);
      const bindings = policy.bindings ?? [];
      const viewer = bindings.find((b) => b.role === 'roles/viewer' && !b.condition);
      const owner = binding.tenant.ownerPrincipalId;

      if (viewer) {
        if (!viewer.members.includes(owner)) {
          viewer.members.push(owner);
        }
      } else {
        bindings.push({ role: 'roles/viewer', members: [owner] });
      }

      await gcp.setProjectIamPolicy(binding.gcpProjectId, { ...policy, bindings });

      return transition(store, binding, 'IAM_BOUND', { ownerGranted: 'roles/viewer' }, opts.actor);
    }

    case 'IAM_BOUND': {
      /*
       * Edge readiness: tenant apps are served through the platform's SHARED
       * ingress (LB 34.1.6.93 / *.preview.e-code.ai) — there is no per-tenant
       * edge resource to create today. Recorded explicitly so the step is an
       * auditable fact, not a silent no-op.
       */
      return transition(store, binding, 'EDGE_READY', { edge: 'platform-shared-ingress' }, opts.actor);
    }

    case 'EDGE_READY':
      return transition(store, binding, 'ACTIVE', undefined, opts.actor);

    default:
      throw new CloudTenantError(
        'FACTORY_NOT_ADVANCEABLE',
        `Binding is ${binding.state}; advance only applies to the forward pipeline`,
        409,
      );
  }
}

export interface TeardownInventoryItem {
  kind: 'bucket' | 'serviceAccount' | 'enabledService';
  name: string;
}

/**
 * ACTIVE (or suspended/exhausted/drifted) → DELETE_REQUESTED, with the full
 * resource inventory captured BEFORE anything is deleted.
 */
export async function requestTeardown(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  bindingId: string,
  actor?: string,
): Promise<{ binding: CloudProjectBinding; teardown: CloudTeardownRecord }> {
  const binding = await store.getCloudProjectBinding(bindingId);

  if (!binding) {
    throw new CloudTenantError('BINDING_NOT_FOUND', `CloudProjectBinding ${bindingId} not found`, 404);
  }

  assertFactoryTransition(binding.state, 'DELETE_REQUESTED');

  const [buckets, serviceAccounts, enabledServices] = await Promise.all([
    gcp.listBuckets(binding.gcpProjectId),
    gcp.listServiceAccounts(binding.gcpProjectId),
    gcp.listEnabledServices(binding.gcpProjectId),
  ]);

  const inventory: TeardownInventoryItem[] = [
    ...buckets.map((b) => ({ kind: 'bucket' as const, name: b.name })),
    ...serviceAccounts.map((sa) => ({ kind: 'serviceAccount' as const, name: sa.email })),
    ...enabledServices.map((s) => ({ kind: 'enabledService' as const, name: s })),
  ];

  const teardown = await store.createTeardownRecord({ bindingId });
  await store.updateTeardownRecord(teardown.id, {
    status: 'DELETING',
    resourceInventory: inventory as unknown as JsonValue,
  });

  const updated = await transition(store, binding, 'DELETE_REQUESTED', { inventoryCount: inventory.length }, actor);

  return { binding: updated, teardown: (await store.getTeardownRecord(teardown.id))! };
}

/**
 * Delete the project (GCP soft delete) and enter RECOVERY_WINDOW. Data-bearing
 * resources (buckets) are deleted EXPLICITLY first so erasure is provable per
 * resource rather than implied by the project's pending deletion.
 */
export async function executeTeardown(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  bindingId: string,
  actor?: string,
): Promise<CloudProjectBinding> {
  const binding = await store.getCloudProjectBinding(bindingId);

  if (!binding) {
    throw new CloudTenantError('BINDING_NOT_FOUND', `CloudProjectBinding ${bindingId} not found`, 404);
  }

  if (binding.state !== 'DELETE_REQUESTED') {
    throw new CloudTenantError('FACTORY_TEARDOWN_NOT_REQUESTED', `Binding is ${binding.state}`, 409);
  }

  const buckets = await gcp.listBuckets(binding.gcpProjectId);

  for (const bucket of buckets) {
    await gcp.deleteBucket(bucket.name);
  }

  await gcp.deleteProject(binding.gcpProjectId);

  const ends = new Date(Date.now() + RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  await store.updateCloudProjectBinding(binding.id, { recoveryWindowEndsAt: ends });

  return transition(
    store,
    binding,
    'RECOVERY_WINDOW',
    { recoveryWindowEndsAt: ends.toISOString(), deletedBuckets: buckets.map((b) => b.name) },
    actor,
  );
}

export interface TeardownVerification {
  teardown: CloudTeardownRecord;
  orphans: TeardownInventoryItem[];
  projectState: string | null;
}

/**
 * Verify erasure against LIVE GCP state: the project must be pending deletion
 * (or gone) and every inventoried resource unreachable. Any survivor is an
 * ORPHAN — the teardown is marked ORPHANS_DETECTED, never silently COMPLETE.
 */
export async function verifyTeardown(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  teardownId: string,
): Promise<TeardownVerification> {
  const teardown = await store.getTeardownRecord(teardownId);

  if (!teardown) {
    throw new CloudTenantError('TEARDOWN_NOT_FOUND', `CloudTeardownRecord ${teardownId} not found`, 404);
  }

  const binding = await store.getCloudProjectBinding(teardown.bindingId);

  if (!binding) {
    throw new CloudTenantError('BINDING_NOT_FOUND', `CloudProjectBinding ${teardown.bindingId} not found`, 404);
  }

  const inventory = (teardown.resourceInventory ?? []) as TeardownInventoryItem[];
  const project = await gcp.getProject(binding.gcpProjectId);
  const projectErased = project === null || project.state !== 'ACTIVE';

  const orphans: TeardownInventoryItem[] = [];

  if (!projectErased) {
    /*
     * Project still ACTIVE: every inventoried data-bearing resource that is
     * still reachable is an orphan. (enabledService entries are config, not
     * data; they die with the project and are not orphan candidates.)
     */
    const [buckets, serviceAccounts] = await Promise.all([
      gcp.listBuckets(binding.gcpProjectId),
      gcp.listServiceAccounts(binding.gcpProjectId),
    ]);
    const liveBuckets = new Set(buckets.map((b) => b.name));
    const liveSas = new Set(serviceAccounts.map((sa) => sa.email));

    for (const item of inventory) {
      if (item.kind === 'bucket' && liveBuckets.has(item.name)) {
        orphans.push(item);
      }

      if (item.kind === 'serviceAccount' && liveSas.has(item.name)) {
        orphans.push(item);
      }
    }
  }

  const proof = {
    checkedAt: new Date().toISOString(),
    gcpProjectId: binding.gcpProjectId,
    projectState: project?.state ?? 'NOT_FOUND',
    projectErased,
    inventoryCount: inventory.length,
    orphanCount: orphans.length,
  };

  const status = orphans.length > 0 || !projectErased ? 'ORPHANS_DETECTED' : 'COMPLETE';

  const updated = await store.updateTeardownRecord(teardown.id, {
    status,
    erasureProof: proof as unknown as JsonValue,
    orphans: orphans as unknown as JsonValue,
    completedAt: status === 'COMPLETE' ? new Date() : null,
  });

  return { teardown: updated, orphans, projectState: project?.state ?? null };
}

/** RECOVERY_WINDOW → RESTORING → ACTIVE via projects.undelete. */
export async function restoreFromRecoveryWindow(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  bindingId: string,
  actor?: string,
): Promise<CloudProjectBinding> {
  const binding = await store.getCloudProjectBinding(bindingId);

  if (!binding) {
    throw new CloudTenantError('BINDING_NOT_FOUND', `CloudProjectBinding ${bindingId} not found`, 404);
  }

  const current = await transition(store, binding, 'RESTORING', undefined, actor);
  await gcp.undeleteProject(binding.gcpProjectId);

  const project = await gcp.getProject(binding.gcpProjectId);

  if (!project || project.state !== 'ACTIVE') {
    throw new CloudTenantError(
      'FACTORY_RESTORE_FAILED',
      `Project is ${project?.state ?? 'absent'} after undelete`,
      500,
    );
  }

  await transition(store, current, 'ACTIVE', { restored: true }, actor);

  return store.updateCloudProjectBinding(binding.id, { recoveryWindowEndsAt: null });
}

/**
 * Mark a binding PURGED once the recovery window has lapsed. The binding row
 * is KEPT: project IDs are never reusable, and the UNIQUE gcpProjectId row is
 * the platform's name reservation.
 */
export async function markPurged(
  store: CloudGovernanceStore,
  bindingId: string,
  actor?: string,
): Promise<CloudProjectBinding> {
  const binding = await store.getCloudProjectBinding(bindingId);

  if (!binding) {
    throw new CloudTenantError('BINDING_NOT_FOUND', `CloudProjectBinding ${bindingId} not found`, 404);
  }

  if (binding.recoveryWindowEndsAt && binding.recoveryWindowEndsAt.getTime() > Date.now()) {
    throw new CloudTenantError(
      'FACTORY_RECOVERY_WINDOW_OPEN',
      `Recovery window runs until ${binding.recoveryWindowEndsAt.toISOString()}`,
      409,
    );
  }

  const purging = await transition(store, binding, 'PURGING', undefined, actor);

  return transition(store, purging, 'PURGED', undefined, actor);
}

/**
 * Resolve the shard folder a new tenant project should land in. Shards are
 * shared folders (customers/shard-<n>) kept under SHARD_CAPACITY. A new shard
 * folder is created ONLY when every existing shard is full — folder creation
 * is the measured-scarce operation (5.8/min sustained), never a per-tenant
 * default.
 */
export async function resolveCustomerShardFolder(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  customersFolderName: string,
): Promise<{ folderId: string; created: boolean }> {
  const shards = (await gcp.listFolders(customersFolderName))
    .filter((f) => /^shard-\d+$/.test(f.displayName))
    .sort((a, b) => Number(a.displayName.slice(6)) - Number(b.displayName.slice(6)));

  for (const shard of shards) {
    const count = await store.countCloudProjectBindingsInFolder(shard.name);

    if (count < SHARD_CAPACITY) {
      return { folderId: shard.name, created: false };
    }
  }

  const next = shards.length === 0 ? 0 : Number(shards[shards.length - 1].displayName.slice(6)) + 1;

  try {
    const created = await gcp.createFolder(customersFolderName, `shard-${next}`);

    return { folderId: created.name, created: true };
  } catch (error) {
    if (error instanceof GcpApiError && error.isRateLimit) {
      throw new CloudTenantError(
        'FOLDER_CREATE_RATE_LIMITED',
        'GCP folder creation quota exhausted (measured: ~6/min); retry after backoff',
        429,
      );
    }

    throw error;
  }
}
