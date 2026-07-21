/*
 * Persistence boundary for the CloudTenant / Project Factory / Platform IAM
 * domain. A dedicated store (same pattern as McpMarketplaceService) so the
 * services stay testable with an in-memory double and app.ts can build the
 * Prisma-backed one from the existing DatabaseClient.
 */

import type { DatabaseClient, Prisma } from '@vibecore/database';

export type JsonValue = Prisma.InputJsonValue;

/*
 * Local record types (the generated Prisma model types are not re-exported by
 * @vibecore/database — same approach as store.ts). They are structurally
 * identical to the generated models, so the Prisma-backed implementation
 * returns its rows unchanged.
 */
export type CloudTenantBoundaryType = 'PERSON' | 'WORKSPACE' | 'LEGAL_ENTITY' | 'BILLING_ACCOUNT';
export type CloudTenantLifecycle = 'ACTIVE' | 'SUSPENDED' | 'MERGED' | 'SPLIT' | 'CLOSED';
export type CloudProjectBindingRole = 'PRIMARY' | 'REGION_SHARD' | 'QUOTA_SHARD' | 'MIGRATION_TARGET';
export type CloudProjectBindingState =
  | 'REQUESTED'
  | 'CREATING'
  | 'BILLING_LINKED'
  | 'APIS_ENABLING'
  | 'SERVICE_AGENTS_READY'
  | 'IAM_BOUND'
  | 'EDGE_READY'
  | 'ACTIVE'
  | 'BILLING_SUSPENDED'
  | 'QUOTA_EXHAUSTED'
  | 'DRIFT_DETECTED'
  | 'DELETE_REQUESTED'
  | 'RECOVERY_WINDOW'
  | 'RESTORING'
  | 'PURGING'
  | 'PURGED';
export type CloudTenantTransferState = 'REQUESTED' | 'REVOKING' | 'REVOKED' | 'REGRANTING' | 'COMPLETED' | 'FAILED';
export type PlatformIamIdentityKind = 'BUILD' | 'PROMOTION' | 'RUNTIME';

export interface CloudTenant {
  id: string;
  customerBoundaryType: CloudTenantBoundaryType;
  ownerPrincipalId: string;
  billingPrincipalId: string;
  legalEntityId: string | null;
  ownershipVersion: number;
  residencyPolicy: string;
  lifecycle: CloudTenantLifecycle;
  mergedIntoTenantId: string | null;
  splitFromTenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CloudProjectBinding {
  id: string;
  cloudTenantId: string;
  gcpProjectId: string;
  gcpProjectNumber: string | null;
  role: CloudProjectBindingRole;
  region: string;
  state: CloudProjectBindingState;
  parentFolderId: string | null;
  quotas: unknown;
  billingLabels: unknown;
  capacityPolicy: unknown;
  reconciliationStatus: string;
  recoveryWindowEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CloudProjectFactoryEvent {
  id: string;
  bindingId: string;
  fromState: string | null;
  toState: string;
  actor: string | null;
  detail: unknown;
  createdAt: Date;
}

export interface CloudTenantTransfer {
  id: string;
  cloudTenantId: string;
  fromPrincipalId: string;
  toPrincipalId: string;
  state: CloudTenantTransferState;
  revokeEvidence: unknown;
  revokeVerifiedAt: Date | null;
  regrantEvidence: unknown;
  error: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CloudTeardownRecord {
  id: string;
  bindingId: string;
  status: string;
  resourceInventory: unknown;
  erasureProof: unknown;
  orphans: unknown;
  startedAt: Date;
  completedAt: Date | null;
}

export interface PlatformIamIdentity {
  id: string;
  kind: PlatformIamIdentityKind;
  app: string;
  environment: string;
  privilegeBoundary: string;
  gcpProjectId: string;
  gcpServiceAccountEmail: string;
  persistentKeys: number;
  revisionsServed: number;
  lastRotatedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformIamImpersonationAudit {
  id: string;
  identityId: string;
  actorPrincipal: string;
  purpose: string;
  tokenLifetimeSeconds: number;
  createdAt: Date;
}

export interface CreateCloudTenantInput {
  customerBoundaryType: CloudTenantBoundaryType;
  ownerPrincipalId: string;
  billingPrincipalId: string;
  legalEntityId?: string | null;
  residencyPolicy?: string;
  splitFromTenantId?: string | null;
}

export interface CreateCloudProjectBindingInput {
  cloudTenantId: string;
  gcpProjectId: string;
  role: CloudProjectBindingRole;
  region: string;
  parentFolderId?: string | null;
  billingLabels?: JsonValue;
  capacityPolicy?: JsonValue;
}

export interface PlatformIamIdentityBoundary {
  kind: PlatformIamIdentityKind;
  app: string;
  environment: string;
  privilegeBoundary: string;
  gcpProjectId: string;
}

export interface CloudGovernanceStore {
  createCloudTenant(input: CreateCloudTenantInput): Promise<CloudTenant>;
  getCloudTenant(id: string): Promise<(CloudTenant & { bindings: CloudProjectBinding[] }) | null>;
  updateCloudTenant(
    id: string,
    data: Partial<{
      ownerPrincipalId: string;
      billingPrincipalId: string;
      lifecycle: CloudTenantLifecycle;
      ownershipVersion: number;
      mergedIntoTenantId: string | null;
    }>,
  ): Promise<CloudTenant>;

  createCloudProjectBinding(input: CreateCloudProjectBindingInput): Promise<CloudProjectBinding>;
  getCloudProjectBinding(id: string): Promise<(CloudProjectBinding & { tenant: CloudTenant }) | null>;
  findCloudProjectBindingByProject(gcpProjectId: string): Promise<CloudProjectBinding | null>;
  updateCloudProjectBinding(
    id: string,
    data: Partial<{
      state: CloudProjectBindingState;
      cloudTenantId: string;
      role: CloudProjectBindingRole;
      gcpProjectNumber: string | null;
      parentFolderId: string | null;
      quotas: JsonValue;
      capacityPolicy: JsonValue;
      reconciliationStatus: string;
      recoveryWindowEndsAt: Date | null;
    }>,
  ): Promise<CloudProjectBinding>;
  listCloudProjectBindings(filter: {
    cloudTenantId?: string;
    parentFolderId?: string;
    state?: CloudProjectBindingState;
  }): Promise<CloudProjectBinding[]>;
  countCloudProjectBindingsInFolder(parentFolderId: string): Promise<number>;

  recordFactoryEvent(input: {
    bindingId: string;
    fromState: string | null;
    toState: string;
    actor?: string | null;
    detail?: JsonValue;
  }): Promise<CloudProjectFactoryEvent>;
  listFactoryEvents(bindingId: string): Promise<CloudProjectFactoryEvent[]>;

  createCloudTenantTransfer(input: {
    cloudTenantId: string;
    fromPrincipalId: string;
    toPrincipalId: string;
  }): Promise<CloudTenantTransfer>;
  getCloudTenantTransfer(id: string): Promise<CloudTenantTransfer | null>;
  updateCloudTenantTransfer(
    id: string,
    data: Partial<{
      state: CloudTenantTransferState;
      revokeEvidence: JsonValue;
      revokeVerifiedAt: Date | null;
      regrantEvidence: JsonValue;
      error: string | null;
      completedAt: Date | null;
    }>,
  ): Promise<CloudTenantTransfer>;

  createTeardownRecord(input: { bindingId: string }): Promise<CloudTeardownRecord>;
  getTeardownRecord(id: string): Promise<CloudTeardownRecord | null>;
  updateTeardownRecord(
    id: string,
    data: Partial<{
      status: string;
      resourceInventory: JsonValue;
      erasureProof: JsonValue;
      orphans: JsonValue;
      completedAt: Date | null;
    }>,
  ): Promise<CloudTeardownRecord>;

  findPlatformIamIdentity(boundary: PlatformIamIdentityBoundary): Promise<PlatformIamIdentity | null>;
  createPlatformIamIdentity(
    input: PlatformIamIdentityBoundary & { gcpServiceAccountEmail: string },
  ): Promise<PlatformIamIdentity>;
  updatePlatformIamIdentity(
    id: string,
    data: Partial<{
      persistentKeys: number;
      revisionsServed: number;
      lastRotatedAt: Date | null;
      lastUsedAt: Date | null;
    }>,
  ): Promise<PlatformIamIdentity>;
  listPlatformIamIdentities(filter: {
    gcpProjectId?: string;
    kind?: PlatformIamIdentityKind;
  }): Promise<PlatformIamIdentity[]>;

  recordImpersonation(input: {
    identityId: string;
    actorPrincipal: string;
    purpose: string;
    tokenLifetimeSeconds: number;
  }): Promise<PlatformIamImpersonationAudit>;
  listImpersonations(identityId: string): Promise<PlatformIamImpersonationAudit[]>;
}

/** True when `error` is the Prisma unique-constraint violation (P2002). */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
  );
}

export class PrismaCloudGovernanceStore implements CloudGovernanceStore {
  constructor(private readonly _prisma: DatabaseClient) {}

  createCloudTenant(input: CreateCloudTenantInput): Promise<CloudTenant> {
    return this._prisma.cloudTenant.create({
      data: {
        customerBoundaryType: input.customerBoundaryType,
        ownerPrincipalId: input.ownerPrincipalId,
        billingPrincipalId: input.billingPrincipalId,
        legalEntityId: input.legalEntityId ?? null,
        residencyPolicy: input.residencyPolicy ?? 'eu',
        splitFromTenantId: input.splitFromTenantId ?? null,
      },
    });
  }

  getCloudTenant(id: string): Promise<(CloudTenant & { bindings: CloudProjectBinding[] }) | null> {
    return this._prisma.cloudTenant.findUnique({ where: { id }, include: { bindings: true } });
  }

  updateCloudTenant(id: string, data: Parameters<CloudGovernanceStore['updateCloudTenant']>[1]): Promise<CloudTenant> {
    return this._prisma.cloudTenant.update({ where: { id }, data });
  }

  createCloudProjectBinding(input: CreateCloudProjectBindingInput): Promise<CloudProjectBinding> {
    return this._prisma.cloudProjectBinding.create({
      data: {
        cloudTenantId: input.cloudTenantId,
        gcpProjectId: input.gcpProjectId,
        role: input.role,
        region: input.region,
        parentFolderId: input.parentFolderId ?? null,
        billingLabels: input.billingLabels,
        capacityPolicy: input.capacityPolicy,
      },
    });
  }

  getCloudProjectBinding(id: string): Promise<(CloudProjectBinding & { tenant: CloudTenant }) | null> {
    return this._prisma.cloudProjectBinding.findUnique({ where: { id }, include: { tenant: true } });
  }

  findCloudProjectBindingByProject(gcpProjectId: string): Promise<CloudProjectBinding | null> {
    return this._prisma.cloudProjectBinding.findUnique({ where: { gcpProjectId } });
  }

  updateCloudProjectBinding(
    id: string,
    data: Parameters<CloudGovernanceStore['updateCloudProjectBinding']>[1],
  ): Promise<CloudProjectBinding> {
    return this._prisma.cloudProjectBinding.update({ where: { id }, data });
  }

  listCloudProjectBindings(filter: {
    cloudTenantId?: string;
    parentFolderId?: string;
    state?: CloudProjectBindingState;
  }): Promise<CloudProjectBinding[]> {
    return this._prisma.cloudProjectBinding.findMany({
      where: {
        cloudTenantId: filter.cloudTenantId,
        parentFolderId: filter.parentFolderId,
        state: filter.state,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  countCloudProjectBindingsInFolder(parentFolderId: string): Promise<number> {
    return this._prisma.cloudProjectBinding.count({ where: { parentFolderId } });
  }

  recordFactoryEvent(input: {
    bindingId: string;
    fromState: string | null;
    toState: string;
    actor?: string | null;
    detail?: JsonValue;
  }): Promise<CloudProjectFactoryEvent> {
    return this._prisma.cloudProjectFactoryEvent.create({
      data: {
        bindingId: input.bindingId,
        fromState: input.fromState,
        toState: input.toState,
        actor: input.actor ?? null,
        detail: input.detail,
      },
    });
  }

  listFactoryEvents(bindingId: string): Promise<CloudProjectFactoryEvent[]> {
    return this._prisma.cloudProjectFactoryEvent.findMany({
      where: { bindingId },
      orderBy: { createdAt: 'asc' },
    });
  }

  createCloudTenantTransfer(input: {
    cloudTenantId: string;
    fromPrincipalId: string;
    toPrincipalId: string;
  }): Promise<CloudTenantTransfer> {
    return this._prisma.cloudTenantTransfer.create({ data: input });
  }

  getCloudTenantTransfer(id: string): Promise<CloudTenantTransfer | null> {
    return this._prisma.cloudTenantTransfer.findUnique({ where: { id } });
  }

  updateCloudTenantTransfer(
    id: string,
    data: Parameters<CloudGovernanceStore['updateCloudTenantTransfer']>[1],
  ): Promise<CloudTenantTransfer> {
    return this._prisma.cloudTenantTransfer.update({ where: { id }, data });
  }

  createTeardownRecord(input: { bindingId: string }): Promise<CloudTeardownRecord> {
    return this._prisma.cloudTeardownRecord.create({ data: input });
  }

  getTeardownRecord(id: string): Promise<CloudTeardownRecord | null> {
    return this._prisma.cloudTeardownRecord.findUnique({ where: { id } });
  }

  updateTeardownRecord(
    id: string,
    data: Parameters<CloudGovernanceStore['updateTeardownRecord']>[1],
  ): Promise<CloudTeardownRecord> {
    return this._prisma.cloudTeardownRecord.update({ where: { id }, data });
  }

  findPlatformIamIdentity(boundary: PlatformIamIdentityBoundary): Promise<PlatformIamIdentity | null> {
    return this._prisma.platformIamIdentity.findUnique({
      where: {
        kind_app_environment_privilegeBoundary_gcpProjectId: boundary,
      },
    });
  }

  createPlatformIamIdentity(
    input: PlatformIamIdentityBoundary & { gcpServiceAccountEmail: string },
  ): Promise<PlatformIamIdentity> {
    return this._prisma.platformIamIdentity.create({ data: input });
  }

  updatePlatformIamIdentity(
    id: string,
    data: Parameters<CloudGovernanceStore['updatePlatformIamIdentity']>[1],
  ): Promise<PlatformIamIdentity> {
    return this._prisma.platformIamIdentity.update({ where: { id }, data });
  }

  listPlatformIamIdentities(filter: {
    gcpProjectId?: string;
    kind?: PlatformIamIdentityKind;
  }): Promise<PlatformIamIdentity[]> {
    return this._prisma.platformIamIdentity.findMany({
      where: { gcpProjectId: filter.gcpProjectId, kind: filter.kind },
      orderBy: { createdAt: 'asc' },
    });
  }

  recordImpersonation(input: {
    identityId: string;
    actorPrincipal: string;
    purpose: string;
    tokenLifetimeSeconds: number;
  }): Promise<PlatformIamImpersonationAudit> {
    return this._prisma.platformIamImpersonationAudit.create({ data: input });
  }

  listImpersonations(identityId: string): Promise<PlatformIamImpersonationAudit[]> {
    return this._prisma.platformIamImpersonationAudit.findMany({
      where: { identityId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
