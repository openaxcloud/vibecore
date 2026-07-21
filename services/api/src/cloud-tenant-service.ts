/*
 * CloudTenant domain service (DOMAIN_MODEL.md §3).
 *
 * A CloudTenant is the billing/quota/isolation boundary between a customer
 * and the platform's GCP footprint. The hard rules live here:
 *
 *  - I-TEN-1  a GCP project is NEVER shared between two tenants. The DB
 *             UNIQUE on CloudProjectBinding.gcpProjectId is the invariant;
 *             this service translates the violation into a typed 409.
 *  - Transfer an ownership transfer REVOKES the old principal's grants and
 *             then RE-GRANTS an explicit role set to the new principal. It
 *             never renames, and re-granting is structurally unreachable
 *             until the revocation has been VERIFIED against the live IAM
 *             policy of every bound project.
 */

import type {
  CloudGovernanceStore,
  CloudProjectBinding,
  CloudProjectBindingRole,
  CloudTenant,
  CloudTenantBoundaryType,
  CloudTenantLifecycle,
  CloudTenantTransfer,
  CloudTenantTransferState,
  JsonValue,
} from './cloud-governance-store.js';
import { isUniqueConstraintViolation } from './cloud-governance-store.js';
import type { GcpCloudClient, GcpIamPolicy } from './gcp-cloud-client.js';

export class CloudTenantError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'CloudTenantError';
  }
}

const TENANT_LIFECYCLE_TRANSITIONS: Record<CloudTenantLifecycle, CloudTenantLifecycle[]> = {
  ACTIVE: ['SUSPENDED', 'MERGED', 'CLOSED'],
  SUSPENDED: ['ACTIVE', 'CLOSED'],
  MERGED: [],
  SPLIT: [],
  CLOSED: [],
};

const TRANSFER_TRANSITIONS: Record<CloudTenantTransferState, CloudTenantTransferState[]> = {
  REQUESTED: ['REVOKING', 'FAILED'],
  REVOKING: ['REVOKED', 'FAILED'],
  REVOKED: ['REGRANTING', 'FAILED'],
  REGRANTING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function assertTenantLifecycleTransition(from: CloudTenantLifecycle, to: CloudTenantLifecycle): void {
  if (!TENANT_LIFECYCLE_TRANSITIONS[from]?.includes(to)) {
    throw new CloudTenantError('TENANT_LIFECYCLE_INVALID', `Tenant lifecycle cannot go ${from} → ${to}`, 409);
  }
}

export function assertTransferTransition(from: CloudTenantTransferState, to: CloudTenantTransferState): void {
  if (!TRANSFER_TRANSITIONS[from]?.includes(to)) {
    throw new CloudTenantError('TRANSFER_TRANSITION_INVALID', `Transfer cannot go ${from} → ${to}`, 409);
  }
}

/**
 * The transfer invariant, as a single reusable guard: re-granting is FORBIDDEN
 * unless the transfer sits in REVOKED with a recorded, verified revocation.
 * The old tenant's rights are never silently reused by the new owner.
 */
export function assertRegrantAllowed(transfer: CloudTenantTransfer): void {
  if (transfer.state !== 'REVOKED' || !transfer.revokeVerifiedAt) {
    throw new CloudTenantError(
      'TRANSFER_REGRANT_BEFORE_REVOKE',
      "Re-granting is forbidden before the previous owner's access has been revoked AND verified",
      409,
    );
  }
}

export interface CreateTenantInput {
  customerBoundaryType: CloudTenantBoundaryType;
  ownerPrincipalId: string;
  billingPrincipalId: string;
  legalEntityId?: string | null;
  residencyPolicy?: string;
}

export async function createCloudTenant(store: CloudGovernanceStore, input: CreateTenantInput): Promise<CloudTenant> {
  if (!input.ownerPrincipalId.includes(':')) {
    throw new CloudTenantError(
      'TENANT_PRINCIPAL_INVALID',
      'ownerPrincipalId must be an IAM member string (e.g. "user:x@y.z", "serviceAccount:sa@…")',
    );
  }

  return store.createCloudTenant(input);
}

export interface BindProjectInput {
  cloudTenantId: string;
  gcpProjectId: string;
  role?: CloudProjectBindingRole;
  region: string;
  parentFolderId?: string | null;
  billingLabels?: JsonValue;
  capacityPolicy?: JsonValue;
}

export async function bindProjectToTenant(
  store: CloudGovernanceStore,
  input: BindProjectInput,
): Promise<CloudProjectBinding> {
  const tenant = await store.getCloudTenant(input.cloudTenantId);

  if (!tenant) {
    throw new CloudTenantError('TENANT_NOT_FOUND', `CloudTenant ${input.cloudTenantId} not found`, 404);
  }

  if (tenant.lifecycle !== 'ACTIVE') {
    throw new CloudTenantError('TENANT_NOT_ACTIVE', `CloudTenant is ${tenant.lifecycle}, not ACTIVE`, 409);
  }

  const role = input.role ?? 'PRIMARY';

  // Pre-check for a readable 409 (the DB UNIQUE remains the real barrier).
  const existing = await store.findCloudProjectBindingByProject(input.gcpProjectId);

  if (existing) {
    throw new CloudTenantError(
      existing.cloudTenantId === input.cloudTenantId ? 'PROJECT_ALREADY_BOUND' : 'TENANT_PROJECT_CONFLICT',
      existing.cloudTenantId === input.cloudTenantId
        ? `Project ${input.gcpProjectId} is already bound to this tenant`
        : `Project ${input.gcpProjectId} is already bound to another CloudTenant — a GCP project is never shared between two tenants (I-TEN-1)`,
      409,
    );
  }

  // Default: exactly ONE live primary project per tenant.
  if (role === 'PRIMARY') {
    const primaries = tenant.bindings.filter((b) => b.role === 'PRIMARY' && b.state !== 'PURGED');

    if (primaries.length > 0) {
      throw new CloudTenantError(
        'TENANT_PRIMARY_EXISTS',
        'Tenant already has a live PRIMARY project; bind additional projects as REGION_SHARD / QUOTA_SHARD / MIGRATION_TARGET',
        409,
      );
    }
  }

  try {
    return await store.createCloudProjectBinding({ ...input, role });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      // Raced writer: the DB constraint (I-TEN-1) held. Same typed refusal.
      throw new CloudTenantError(
        'TENANT_PROJECT_CONFLICT',
        `Project ${input.gcpProjectId} is already bound to another CloudTenant — a GCP project is never shared between two tenants (I-TEN-1)`,
        409,
      );
    }

    throw error;
  }
}

function rolesHeldBy(policy: GcpIamPolicy, principal: string): string[] {
  return (policy.bindings ?? []).filter((b) => b.members?.includes(principal)).map((b) => b.role);
}

function stripPrincipal(policy: GcpIamPolicy, principal: string): GcpIamPolicy {
  return {
    ...policy,
    bindings: (policy.bindings ?? [])
      .map((b) => ({ ...b, members: b.members.filter((m) => m !== principal) }))
      .filter((b) => b.members.length > 0),
  };
}

/** Binding states whose GCP project actually exists and carries IAM. */
const LIVE_PROJECT_STATES: CloudProjectBinding['state'][] = [
  'BILLING_LINKED',
  'APIS_ENABLING',
  'SERVICE_AGENTS_READY',
  'IAM_BOUND',
  'EDGE_READY',
  'ACTIVE',
  'BILLING_SUSPENDED',
  'QUOTA_EXHAUSTED',
  'DRIFT_DETECTED',
  'CREATING',
];

export interface TransferOwnershipInput {
  cloudTenantId: string;
  toPrincipalId: string;

  /**
   * Explicit roles granted to the NEW owner. The transfer never copies the
   * old owner's role list — revoke then re-grant, not rename.
   */
  grantRoles: string[];
  actor?: string;
}

export interface TransferOwnershipResult {
  transfer: CloudTenantTransfer;
  tenant: CloudTenant;
}

/**
 * Full ownership transfer pipeline:
 *   REQUESTED → REVOKING (strip old principal from every live project's IAM
 *   policy) → REVOKED (re-read every policy and PROVE the old principal holds
 *   no role) → REGRANTING (grant the explicit role set to the new principal)
 *   → COMPLETED (owner swapped, ownershipVersion bumped).
 *
 * Any failure lands in FAILED with the error recorded; a FAILED transfer
 * never touched the tenant row, so the owner of record stays the old
 * principal until a fresh transfer succeeds end-to-end.
 */
export async function transferTenantOwnership(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  input: TransferOwnershipInput,
): Promise<TransferOwnershipResult> {
  const tenant = await store.getCloudTenant(input.cloudTenantId);

  if (!tenant) {
    throw new CloudTenantError('TENANT_NOT_FOUND', `CloudTenant ${input.cloudTenantId} not found`, 404);
  }

  if (tenant.lifecycle !== 'ACTIVE') {
    throw new CloudTenantError('TENANT_NOT_ACTIVE', `CloudTenant is ${tenant.lifecycle}, not ACTIVE`, 409);
  }

  if (!input.toPrincipalId.includes(':')) {
    throw new CloudTenantError('TENANT_PRINCIPAL_INVALID', 'toPrincipalId must be an IAM member string');
  }

  if (input.toPrincipalId === tenant.ownerPrincipalId) {
    throw new CloudTenantError('TRANSFER_NOOP', 'New owner is already the current owner', 409);
  }

  if (input.grantRoles.length === 0) {
    throw new CloudTenantError('TRANSFER_GRANT_ROLES_REQUIRED', 'grantRoles must list the roles for the new owner');
  }

  const fromPrincipal = tenant.ownerPrincipalId;
  const liveBindings = tenant.bindings.filter((b) => LIVE_PROJECT_STATES.includes(b.state));

  let transfer = await store.createCloudTenantTransfer({
    cloudTenantId: tenant.id,
    fromPrincipalId: fromPrincipal,
    toPrincipalId: input.toPrincipalId,
  });

  const fail = async (error: unknown): Promise<never> => {
    transfer = await store.updateCloudTenantTransfer(transfer.id, {
      state: 'FAILED',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  };

  try {
    // ── REVOKE ──
    assertTransferTransition(transfer.state, 'REVOKING');
    transfer = await store.updateCloudTenantTransfer(transfer.id, { state: 'REVOKING' });

    const revokeEvidence: Array<{ gcpProjectId: string; removedRoles: string[] }> = [];

    for (const binding of liveBindings) {
      const policy = await gcp.getProjectIamPolicy(binding.gcpProjectId);
      const held = rolesHeldBy(policy, fromPrincipal);

      if (held.length > 0) {
        await gcp.setProjectIamPolicy(binding.gcpProjectId, stripPrincipal(policy, fromPrincipal));
      }

      revokeEvidence.push({ gcpProjectId: binding.gcpProjectId, removedRoles: held });
    }

    // ── VERIFY the revocation against the LIVE policies (not our own writes) ──
    for (const binding of liveBindings) {
      const after = await gcp.getProjectIamPolicy(binding.gcpProjectId);
      const stillHeld = rolesHeldBy(after, fromPrincipal);

      if (stillHeld.length > 0) {
        throw new CloudTenantError(
          'TRANSFER_REVOKE_UNVERIFIED',
          `Old owner still holds ${stillHeld.join(', ')} on ${binding.gcpProjectId} after revocation`,
          500,
        );
      }
    }

    assertTransferTransition(transfer.state, 'REVOKED');
    transfer = await store.updateCloudTenantTransfer(transfer.id, {
      state: 'REVOKED',
      revokeEvidence: revokeEvidence as unknown as JsonValue,
      revokeVerifiedAt: new Date(),
    });

    // ── RE-GRANT (guarded: unreachable without a verified revocation) ──
    assertRegrantAllowed(transfer);
    transfer = await store.updateCloudTenantTransfer(transfer.id, { state: 'REGRANTING' });

    const regrantEvidence: Array<{ gcpProjectId: string; grantedRoles: string[] }> = [];

    for (const binding of liveBindings) {
      const policy = await gcp.getProjectIamPolicy(binding.gcpProjectId);
      const bindings = policy.bindings ?? [];

      for (const role of input.grantRoles) {
        const existing = bindings.find((b) => b.role === role && !b.condition);

        if (existing) {
          if (!existing.members.includes(input.toPrincipalId)) {
            existing.members.push(input.toPrincipalId);
          }
        } else {
          bindings.push({ role, members: [input.toPrincipalId] });
        }
      }

      await gcp.setProjectIamPolicy(binding.gcpProjectId, { ...policy, bindings });
      regrantEvidence.push({ gcpProjectId: binding.gcpProjectId, grantedRoles: input.grantRoles });
    }

    transfer = await store.updateCloudTenantTransfer(transfer.id, {
      state: 'COMPLETED',
      regrantEvidence: regrantEvidence as unknown as JsonValue,
      completedAt: new Date(),
    });

    const updatedTenant = await store.updateCloudTenant(tenant.id, {
      ownerPrincipalId: input.toPrincipalId,
      ownershipVersion: tenant.ownershipVersion + 1,
    });

    return { transfer, tenant: updatedTenant };
  } catch (error) {
    return fail(error);
  }
}

export async function suspendCloudTenant(store: CloudGovernanceStore, tenantId: string): Promise<CloudTenant> {
  const tenant = await store.getCloudTenant(tenantId);

  if (!tenant) {
    throw new CloudTenantError('TENANT_NOT_FOUND', `CloudTenant ${tenantId} not found`, 404);
  }

  assertTenantLifecycleTransition(tenant.lifecycle, 'SUSPENDED');

  return store.updateCloudTenant(tenantId, { lifecycle: 'SUSPENDED' });
}

export async function restoreCloudTenant(store: CloudGovernanceStore, tenantId: string): Promise<CloudTenant> {
  const tenant = await store.getCloudTenant(tenantId);

  if (!tenant) {
    throw new CloudTenantError('TENANT_NOT_FOUND', `CloudTenant ${tenantId} not found`, 404);
  }

  assertTenantLifecycleTransition(tenant.lifecycle, 'ACTIVE');

  return store.updateCloudTenant(tenantId, { lifecycle: 'ACTIVE' });
}

/**
 * Merge: every binding of `sourceTenantId` moves to `targetTenantId` (project
 * uniqueness is preserved — each project still has exactly one tenant), the
 * source is closed as MERGED with provenance, the target's ownershipVersion
 * is bumped. PRIMARY bindings of the source are demoted to QUOTA_SHARD when
 * the target already has a live primary.
 */
export async function mergeCloudTenants(
  store: CloudGovernanceStore,
  input: { sourceTenantId: string; targetTenantId: string },
): Promise<{ source: CloudTenant; target: CloudTenant }> {
  if (input.sourceTenantId === input.targetTenantId) {
    throw new CloudTenantError('TENANT_MERGE_SELF', 'Cannot merge a tenant into itself', 409);
  }

  const source = await store.getCloudTenant(input.sourceTenantId);
  const target = await store.getCloudTenant(input.targetTenantId);

  if (!source || !target) {
    throw new CloudTenantError('TENANT_NOT_FOUND', 'Source or target CloudTenant not found', 404);
  }

  if (source.lifecycle !== 'ACTIVE' || target.lifecycle !== 'ACTIVE') {
    throw new CloudTenantError('TENANT_NOT_ACTIVE', 'Both tenants must be ACTIVE to merge', 409);
  }

  assertTenantLifecycleTransition(source.lifecycle, 'MERGED');

  const targetHasPrimary = target.bindings.some((b) => b.role === 'PRIMARY' && b.state !== 'PURGED');

  for (const binding of source.bindings) {
    await store.updateCloudProjectBinding(binding.id, {
      cloudTenantId: target.id,
      ...(binding.role === 'PRIMARY' && targetHasPrimary ? { role: 'QUOTA_SHARD' as const } : {}),
    });
  }

  const mergedSource = await store.updateCloudTenant(source.id, {
    lifecycle: 'MERGED',
    mergedIntoTenantId: target.id,
  });
  const bumpedTarget = await store.updateCloudTenant(target.id, {
    ownershipVersion: target.ownershipVersion + 1,
  });

  return { source: mergedSource, target: bumpedTarget };
}

/**
 * Split: the listed bindings move to a NEW tenant (with its own owner /
 * billing principal). The source stays ACTIVE with its remaining bindings.
 */
export async function splitCloudTenant(
  store: CloudGovernanceStore,
  input: {
    sourceTenantId: string;
    bindingIds: string[];
    newTenant: CreateTenantInput;
  },
): Promise<{ source: CloudTenant; created: CloudTenant }> {
  const source = await store.getCloudTenant(input.sourceTenantId);

  if (!source) {
    throw new CloudTenantError('TENANT_NOT_FOUND', `CloudTenant ${input.sourceTenantId} not found`, 404);
  }

  if (source.lifecycle !== 'ACTIVE') {
    throw new CloudTenantError('TENANT_NOT_ACTIVE', `CloudTenant is ${source.lifecycle}, not ACTIVE`, 409);
  }

  if (input.bindingIds.length === 0) {
    throw new CloudTenantError('TENANT_SPLIT_EMPTY', 'bindingIds must list at least one binding to split out');
  }

  const ownedIds = new Set(source.bindings.map((b) => b.id));

  for (const id of input.bindingIds) {
    if (!ownedIds.has(id)) {
      throw new CloudTenantError(
        'TENANT_SPLIT_FOREIGN_BINDING',
        `Binding ${id} does not belong to the source tenant`,
        409,
      );
    }
  }

  const created = await store.createCloudTenant({
    ...input.newTenant,
    splitFromTenantId: source.id,
  });

  for (const id of input.bindingIds) {
    await store.updateCloudProjectBinding(id, { cloudTenantId: created.id });
  }

  const bumped = await store.updateCloudTenant(source.id, {
    ownershipVersion: source.ownershipVersion + 1,
  });

  return { source: bumped, created };
}
