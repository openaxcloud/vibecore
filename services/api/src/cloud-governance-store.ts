import { createHash } from 'node:crypto';
import { Prisma, type DatabaseClient } from '@vibecore/database';
import { AccountPurgeStore } from './account-purge-store.js';
import { lockProjectMutation } from './project-mutation-lock.js';

export type CloudTenantBoundaryType = 'PERSON' | 'WORKSPACE' | 'LEGAL_ENTITY' | 'BILLING_ACCOUNT';
export type CloudTenantLifecycle = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'MERGED' | 'CLOSED';
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
export type CloudOperationKind =
  | 'TENANT_CREATE'
  | 'PROJECT_BIND'
  | 'TENANT_SUSPEND'
  | 'TENANT_RESTORE'
  | 'TENANT_MERGE'
  | 'TENANT_SPLIT'
  | 'TENANT_TRANSFER'
  | 'PROJECT_ADVANCE'
  | 'TEARDOWN_REQUEST'
  | 'TEARDOWN_EXECUTE'
  | 'TEARDOWN_VERIFY'
  | 'PROJECT_RESTORE'
  | 'PROJECT_PURGE'
  | 'IAM_ENSURE';
export type PlatformIamIdentityKind = 'BUILD' | 'PROMOTION' | 'RUNTIME';

const TOPOLOGY_MOVABLE_BINDING_STATES = new Set<CloudProjectBindingState>([
  'REQUESTED',
  'CREATING',
  'BILLING_LINKED',
  'APIS_ENABLING',
  'SERVICE_AGENTS_READY',
  'IAM_BOUND',
  'EDGE_READY',
  'ACTIVE',
  'DRIFT_DETECTED',
]);

export class CloudGovernanceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'CloudGovernanceError';
  }
}

export interface MutationContext {
  idempotencyKey: string;
  actorUserId: string;
  reauthenticatedAt?: Date;
}

export interface ClaimedOperation {
  id: string;
  kind: CloudOperationKind;
  tenantId: string | null;
  bindingId: string | null;
  payload: unknown;
  checkpoint: unknown;
  step: string;
  fence: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

export function requestHash(kind: CloudOperationKind, payload: unknown): string {
  return createHash('sha256')
    .update(`${kind}\n${canonicalJson(payload)}`)
    .digest('hex');
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function resultId(value: unknown, key: string): string {
  if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>)[key] !== 'string') {
    throw new CloudGovernanceError('OPERATION_RESULT_CORRUPT', `Operation result has no ${key}`, 500);
  }

  return (value as Record<string, string>)[key];
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002',
  );
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 1000);
}

type Tx = Prisma.TransactionClient;

export class PrismaCloudGovernanceStore {
  private readonly accountPurge: AccountPurgeStore;

  constructor(readonly prisma: DatabaseClient) {
    this.accountPurge = new AccountPurgeStore(prisma);
  }

  private async _lockIdempotency(tx: Tx, key: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cloud-governance:${key}`}, 0))`;
  }

  private async _existingOperation(
    tx: Tx,
    input: { idempotencyKey: string; kind: CloudOperationKind; payload: unknown },
  ) {
    const existing = await tx.cloudOperation.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (!existing) return null;

    if (existing.kind !== input.kind || existing.requestHash !== requestHash(input.kind, input.payload)) {
      throw new CloudGovernanceError(
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key was already used with a different request',
        409,
      );
    }

    return existing;
  }

  private _operationData(input: {
    context: MutationContext;
    kind: CloudOperationKind;
    payload: unknown;
    tenantId?: string;
    relatedTenantId?: string;
    bindingId?: string;
    status?: 'PENDING' | 'SUCCEEDED';
    result?: unknown;
  }) {
    return {
      idempotencyKey: input.context.idempotencyKey,
      requestHash: requestHash(input.kind, input.payload),
      kind: input.kind,
      status: input.status ?? ('PENDING' as const),
      tenantId: input.tenantId,
      relatedTenantId: input.relatedTenantId,
      bindingId: input.bindingId,
      actorUserId: input.context.actorUserId,
      reauthenticatedAt: input.context.reauthenticatedAt,
      payload: json(input.payload),
      result: input.result === undefined ? undefined : json(input.result),
      completedAt: input.status === 'SUCCEEDED' ? new Date() : undefined,
      events: {
        create: {
          fence: 0,
          type: input.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'REQUESTED',
          detail: json({ kind: input.kind }),
        },
      },
    };
  }

  async getTenant(id: string) {
    return this.prisma.cloudTenant.findUnique({
      where: { id },
      include: { bindings: { orderBy: { createdAt: 'asc' } }, organization: true },
    });
  }

  async getBinding(id: string) {
    return this.prisma.cloudProjectBinding.findUnique({
      where: { id },
      include: { tenant: true, project: true },
    });
  }

  async getOperation(id: string) {
    return this.prisma.cloudOperation.findUnique({
      where: { id },
      include: { transfer: true, events: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async prepareOperationForResume(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          status: 'PENDING' | 'RUNNING' | 'WAITING' | 'SUCCEEDED' | 'FAILED';
          leaseActive: boolean;
          fence: number;
        }>
      >`
        SELECT "status", "fence", COALESCE("leaseExpiresAt" > NOW(), FALSE) AS "leaseActive"
        FROM "CloudOperation"
        WHERE "id" = ${id}
        FOR UPDATE
      `;
      const operation = rows[0];
      if (!operation) throw new CloudGovernanceError('OPERATION_NOT_FOUND', 'Cloud operation not found', 404);
      if (operation.status === 'SUCCEEDED') {
        throw new CloudGovernanceError('OPERATION_ALREADY_SUCCEEDED', 'A succeeded operation cannot be resumed', 409);
      }
      if (operation.status === 'RUNNING' && operation.leaseActive) {
        throw new CloudGovernanceError('OPERATION_ALREADY_RUNNING', 'Cloud operation still has a live owner', 409);
      }
      if (operation.status === 'PENDING') return;

      await tx.$executeRaw`
        UPDATE "CloudOperation"
        SET "status" = 'PENDING'::"CloudOperationStatus",
            "leaseOwner" = NULL,
            "leaseExpiresAt" = NULL,
            "nextAttemptAt" = NOW(),
            "lastErrorCode" = NULL,
            "lastErrorMessage" = NULL,
            "completedAt" = NULL,
            "version" = "version" + 1,
            "updatedAt" = NOW()
        WHERE "id" = ${id}
      `;
      await tx.cloudOperationEvent.create({
        data: {
          operationId: id,
          fence: operation.fence,
          type: 'RESUMED',
          detail: json({ previousStatus: operation.status }),
        },
      });
    });
  }

  async createTenant(input: {
    context: MutationContext;
    organizationId: string;
    customerBoundaryType: CloudTenantBoundaryType;
    ownerPrincipalId: string;
    billingPrincipalId: string;
    billingAccountId: string;
    legalEntityId?: string | null;
    residencyPolicy: string;
  }) {
    const payload = {
      organizationId: input.organizationId,
      customerBoundaryType: input.customerBoundaryType,
      ownerPrincipalId: input.ownerPrincipalId,
      billingPrincipalId: input.billingPrincipalId,
      billingAccountId: input.billingAccountId,
      legalEntityId: input.legalEntityId ?? null,
      residencyPolicy: input.residencyPolicy,
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this._lockIdempotency(tx, input.context.idempotencyKey);
        const existing = await this._existingOperation(tx, {
          idempotencyKey: input.context.idempotencyKey,
          kind: 'TENANT_CREATE',
          payload,
        });

        if (existing) {
          const tenant = await tx.cloudTenant.findUnique({ where: { id: resultId(existing.result, 'tenantId') } });
          if (!tenant) throw new CloudGovernanceError('OPERATION_RESULT_CORRUPT', 'Created tenant is missing', 500);
          return { tenant, operation: existing, replayed: true };
        }

        await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${input.organizationId} FOR UPDATE`;
        const organization = await tx.organization.findUnique({
          where: { id: input.organizationId },
          select: { id: true },
        });
        if (!organization) throw new CloudGovernanceError('ORGANIZATION_NOT_FOUND', 'Organization not found', 404);

        const tenant = await tx.cloudTenant.create({ data: payload });
        const result = { tenantId: tenant.id, version: tenant.version };
        const operation = await tx.cloudOperation.create({
          data: this._operationData({
            context: input.context,
            kind: 'TENANT_CREATE',
            payload,
            tenantId: tenant.id,
            status: 'SUCCEEDED',
            result,
          }),
        });
        return { tenant, operation, replayed: false };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CloudGovernanceError(
          'ORGANIZATION_TENANT_EXISTS',
          'This Organization already owns a CloudTenant',
          409,
        );
      }
      throw error;
    }
  }

  async bindProject(input: {
    context: MutationContext;
    tenantId: string;
    expectedTenantVersion: number;
    projectId: string;
    gcpProjectId: string;
    role: CloudProjectBindingRole;
    region: string;
    parentFolderId?: string | null;
    billingLabels?: unknown;
    capacityPolicy?: unknown;
  }) {
    const payload = {
      tenantId: input.tenantId,
      expectedTenantVersion: input.expectedTenantVersion,
      projectId: input.projectId,
      gcpProjectId: input.gcpProjectId,
      role: input.role,
      region: input.region,
      parentFolderId: input.parentFolderId ?? null,
      billingLabels: input.billingLabels ?? null,
      capacityPolicy: input.capacityPolicy ?? null,
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        /*
         * Cloud-governance's global idempotency prefix must precede every
         * tenant/project row lock: lifecycle/merge/split/transfer paths take
         * the same prefix before CloudTenant. No non-cloud Project mutation
         * ever waits on this key, so topology follows without an inverse edge.
         */
        await this._lockIdempotency(tx, input.context.idempotencyKey);

        /*
         * Global ownership order: account-purge topology -> project checkpoint
         * -> Project row -> CloudTenant row. Both the project Organization and
         * tenant Organization are re-read after their rows are locked. This
         * prevents a bind which read org A from committing behind an A->B
         * transfer and leaving project B attached to tenant A.
         */
        await this.accountPurge.assertProjectMutable(tx, input.projectId);
        await lockProjectMutation(tx, input.projectId);
        await tx.$queryRaw`SELECT "id" FROM "CloudTenant" WHERE "id" = ${input.tenantId} FOR UPDATE`;

        const project = await tx.project.findUnique({ where: { id: input.projectId } });
        if (!project) throw new CloudGovernanceError('PROJECT_NOT_FOUND', 'Vibecore Project not found', 404);

        const tenant = await tx.cloudTenant.findUnique({ where: { id: input.tenantId } });
        if (!tenant) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'CloudTenant not found', 404);

        if (!tenant.organizationId || project.organizationId !== tenant.organizationId) {
          throw new CloudGovernanceError(
            'PROJECT_TENANT_ISOLATION_VIOLATION',
            'Project and CloudTenant must belong to the same Organization',
            403,
          );
        }

        await this.accountPurge.assertMembershipMutable(tx, tenant.organizationId);

        const existing = await this._existingOperation(tx, {
          idempotencyKey: input.context.idempotencyKey,
          kind: 'PROJECT_BIND',
          payload,
        });
        if (existing) {
          const binding = await tx.cloudProjectBinding.findUnique({
            where: { id: resultId(existing.result, 'bindingId') },
          });
          if (!binding) throw new CloudGovernanceError('OPERATION_RESULT_CORRUPT', 'Created binding is missing', 500);
          return { binding, operation: existing, replayed: true };
        }

        if (tenant.lifecycle !== 'ACTIVE') {
          throw new CloudGovernanceError('TENANT_NOT_ACTIVE', `CloudTenant is ${tenant.lifecycle}`, 409);
        }
        if (tenant.version !== input.expectedTenantVersion) {
          throw new CloudGovernanceError('TENANT_VERSION_CONFLICT', 'CloudTenant changed; reload and retry', 409);
        }
        const active = await tx.cloudOperation.findFirst({
          where: {
            OR: [{ tenantId: tenant.id }, { relatedTenantId: tenant.id }],
            status: { in: ['PENDING', 'RUNNING', 'WAITING'] },
          },
        });
        if (active) throw new CloudGovernanceError('TENANT_OPERATION_ACTIVE', `Operation ${active.id} is active`, 409);

        const binding = await tx.cloudProjectBinding.create({
          data: {
            cloudTenantId: tenant.id,
            projectId: project.id,
            gcpProjectId: input.gcpProjectId,
            role: input.role,
            region: input.region,
            parentFolderId: input.parentFolderId ?? null,
            billingLabels: input.billingLabels === undefined ? undefined : json(input.billingLabels),
            capacityPolicy: input.capacityPolicy === undefined ? undefined : json(input.capacityPolicy),
          },
        });
        const bumped = await tx.cloudTenant.updateMany({
          where: { id: tenant.id, version: input.expectedTenantVersion },
          data: { version: { increment: 1 } },
        });
        if (bumped.count !== 1) throw new CloudGovernanceError('TENANT_VERSION_CONFLICT', 'CloudTenant changed', 409);

        const result = { bindingId: binding.id, tenantVersion: input.expectedTenantVersion + 1 };
        const operation = await tx.cloudOperation.create({
          data: this._operationData({
            context: input.context,
            kind: 'PROJECT_BIND',
            payload,
            tenantId: tenant.id,
            bindingId: binding.id,
            status: 'SUCCEEDED',
            result,
          }),
        });
        return { binding, operation, replayed: false };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CloudGovernanceError(
          'PROJECT_BINDING_CONFLICT',
          'The Vibecore project, GCP project id, or live PRIMARY slot is already bound',
          409,
        );
      }
      throw error;
    }
  }

  async changeTenantLifecycle(input: {
    context: MutationContext;
    tenantId: string;
    expectedVersion: number;
    to: 'ACTIVE' | 'SUSPENDED';
    reason?: string;
  }) {
    const kind = input.to === 'SUSPENDED' ? ('TENANT_SUSPEND' as const) : ('TENANT_RESTORE' as const);
    const payload = {
      tenantId: input.tenantId,
      expectedVersion: input.expectedVersion,
      to: input.to,
      reason: input.reason ?? null,
    };
    return this.prisma.$transaction(async (tx) => {
      await this._lockIdempotency(tx, input.context.idempotencyKey);
      const existing = await this._existingOperation(tx, {
        idempotencyKey: input.context.idempotencyKey,
        kind,
        payload,
      });
      if (existing) {
        const tenant = await tx.cloudTenant.findUnique({ where: { id: input.tenantId } });
        if (!tenant) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'CloudTenant not found', 404);
        return { tenant, operation: existing, replayed: true };
      }

      await tx.$queryRaw`SELECT "id" FROM "CloudTenant" WHERE "id" = ${input.tenantId} FOR UPDATE`;
      const tenant = await tx.cloudTenant.findUnique({ where: { id: input.tenantId } });
      if (!tenant) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'CloudTenant not found', 404);
      const valid = input.to === 'SUSPENDED' ? tenant.lifecycle === 'ACTIVE' : tenant.lifecycle === 'SUSPENDED';
      if (!valid) {
        throw new CloudGovernanceError(
          'TENANT_LIFECYCLE_CONFLICT',
          `CloudTenant cannot transition ${tenant.lifecycle} → ${input.to}`,
          409,
        );
      }
      if (tenant.version !== input.expectedVersion) {
        throw new CloudGovernanceError('TENANT_VERSION_CONFLICT', 'CloudTenant changed; reload and retry', 409);
      }
      const active = await tx.cloudOperation.findFirst({
        where: {
          OR: [{ tenantId: tenant.id }, { relatedTenantId: tenant.id }],
          status: { in: ['PENDING', 'RUNNING', 'WAITING'] },
        },
      });
      if (active) {
        throw new CloudGovernanceError('TENANT_OPERATION_ACTIVE', `Operation ${active.id} is already active`, 409);
      }
      const operation = await tx.cloudOperation.create({
        data: this._operationData({
          context: input.context,
          kind,
          payload,
          tenantId: tenant.id,
        }),
      });
      return { tenant, operation, replayed: false };
    });
  }

  async mergeTenants(input: {
    context: MutationContext;
    sourceTenantId: string;
    sourceVersion: number;
    targetTenantId: string;
    targetVersion: number;
    grantRoles: string[];
  }) {
    const payload = {
      sourceTenantId: input.sourceTenantId,
      sourceVersion: input.sourceVersion,
      targetTenantId: input.targetTenantId,
      targetVersion: input.targetVersion,
      grantRoles: [...input.grantRoles].sort(),
    };
    if (input.sourceTenantId === input.targetTenantId) {
      throw new CloudGovernanceError('TENANT_MERGE_SELF', 'Cannot merge a CloudTenant into itself', 409);
    }

    return this.prisma.$transaction(async (tx) => {
      await this._lockIdempotency(tx, input.context.idempotencyKey);
      const existing = await this._existingOperation(tx, {
        idempotencyKey: input.context.idempotencyKey,
        kind: 'TENANT_MERGE',
        payload,
      });
      if (existing) {
        const [source, target] = await Promise.all([
          tx.cloudTenant.findUnique({ where: { id: input.sourceTenantId } }),
          tx.cloudTenant.findUnique({ where: { id: input.targetTenantId } }),
        ]);
        if (!source || !target)
          throw new CloudGovernanceError('OPERATION_RESULT_CORRUPT', 'Merged tenant missing', 500);
        return { source, target, operation: existing, replayed: true };
      }

      const ids = [input.sourceTenantId, input.targetTenantId].sort();
      await tx.$queryRaw`SELECT "id" FROM "CloudTenant" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
      const [source, target] = await Promise.all([
        tx.cloudTenant.findUnique({ where: { id: input.sourceTenantId }, include: { bindings: true } }),
        tx.cloudTenant.findUnique({ where: { id: input.targetTenantId }, include: { bindings: true } }),
      ]);
      if (!source || !target)
        throw new CloudGovernanceError('TENANT_NOT_FOUND', 'Source or target CloudTenant not found', 404);
      if (source.lifecycle !== 'ACTIVE' || target.lifecycle !== 'ACTIVE') {
        throw new CloudGovernanceError('TENANT_NOT_ACTIVE', 'Both CloudTenants must be ACTIVE', 409);
      }
      if (source.version !== input.sourceVersion || target.version !== input.targetVersion) {
        throw new CloudGovernanceError('TENANT_VERSION_CONFLICT', 'A CloudTenant changed; reload and retry', 409);
      }
      if (
        [...source.bindings, ...target.bindings].some(
          (binding) => binding.state !== 'PURGED' && !TOPOLOGY_MOVABLE_BINDING_STATES.has(binding.state),
        )
      ) {
        throw new CloudGovernanceError(
          'TENANT_TOPOLOGY_BINDING_STATE_CONFLICT',
          'A binding is suspended, quota-blocked, or in a teardown/recovery transition',
          409,
        );
      }

      const busy = await tx.cloudOperation.count({
        where: {
          OR: [{ tenantId: { in: [source.id, target.id] } }, { relatedTenantId: { in: [source.id, target.id] } }],
          status: { in: ['PENDING', 'RUNNING', 'WAITING'] },
        },
      });
      if (busy > 0) throw new CloudGovernanceError('TENANT_OPERATION_ACTIVE', 'A CloudTenant operation is active', 409);
      const operation = await tx.cloudOperation.create({
        data: this._operationData({
          context: input.context,
          kind: 'TENANT_MERGE',
          payload,
          tenantId: source.id,
          relatedTenantId: target.id,
        }),
      });
      return { source, target, operation, replayed: false };
    });
  }

  async splitTenant(input: {
    context: MutationContext;
    sourceTenantId: string;
    sourceVersion: number;
    bindingIds: string[];
    newOrganizationId: string;
    grantRoles: string[];
    newTenant: {
      customerBoundaryType: CloudTenantBoundaryType;
      ownerPrincipalId: string;
      billingPrincipalId: string;
      billingAccountId: string;
      legalEntityId?: string | null;
      residencyPolicy: string;
    };
  }) {
    const uniqueBindingIds = [...new Set(input.bindingIds)].sort();
    const payload = {
      sourceTenantId: input.sourceTenantId,
      sourceVersion: input.sourceVersion,
      bindingIds: uniqueBindingIds,
      newOrganizationId: input.newOrganizationId,
      grantRoles: [...input.grantRoles].sort(),
      newTenant: input.newTenant,
    };
    if (uniqueBindingIds.length === 0) {
      throw new CloudGovernanceError('TENANT_SPLIT_EMPTY', 'At least one binding is required', 400);
    }

    return this.prisma.$transaction(async (tx) => {
      await this._lockIdempotency(tx, input.context.idempotencyKey);
      const existing = await this._existingOperation(tx, {
        idempotencyKey: input.context.idempotencyKey,
        kind: 'TENANT_SPLIT',
        payload,
      });
      if (existing) {
        const source = await tx.cloudTenant.findUnique({ where: { id: input.sourceTenantId } });
        if (!source) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'Source CloudTenant not found', 404);
        const createdId = existing.relatedTenantId;
        const created = createdId ? await tx.cloudTenant.findUnique({ where: { id: createdId } }) : null;
        return { source, created, operation: existing, replayed: true };
      }

      await tx.$queryRaw`SELECT "id" FROM "CloudTenant" WHERE "id" = ${input.sourceTenantId} FOR UPDATE`;
      const source = await tx.cloudTenant.findUnique({
        where: { id: input.sourceTenantId },
        include: { bindings: true },
      });
      if (!source) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'Source CloudTenant not found', 404);
      if (source.lifecycle !== 'ACTIVE')
        throw new CloudGovernanceError('TENANT_NOT_ACTIVE', 'Source must be ACTIVE', 409);
      if (source.version !== input.sourceVersion) {
        throw new CloudGovernanceError('TENANT_VERSION_CONFLICT', 'CloudTenant changed; reload and retry', 409);
      }
      await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${input.newOrganizationId} FOR UPDATE`;
      const org = await tx.organization.findUnique({ where: { id: input.newOrganizationId }, select: { id: true } });
      if (!org) throw new CloudGovernanceError('ORGANIZATION_NOT_FOUND', 'Destination Organization not found', 404);
      const reserved = await tx.cloudTenant.findUnique({ where: { organizationId: input.newOrganizationId } });
      if (reserved)
        throw new CloudGovernanceError(
          'ORGANIZATION_TENANT_EXISTS',
          'Destination Organization already has a CloudTenant',
          409,
        );

      const selected = source.bindings.filter((binding) => uniqueBindingIds.includes(binding.id));
      if (selected.length !== uniqueBindingIds.length) {
        throw new CloudGovernanceError(
          'TENANT_SPLIT_FOREIGN_BINDING',
          'Every binding must belong to the source tenant',
          409,
        );
      }
      if (
        selected.some((binding) => binding.state === 'PURGED' || !TOPOLOGY_MOVABLE_BINDING_STATES.has(binding.state))
      ) {
        throw new CloudGovernanceError(
          'TENANT_TOPOLOGY_BINDING_STATE_CONFLICT',
          'Split bindings must be live and outside suspension or teardown/recovery transitions',
          409,
        );
      }
      const remaining = source.bindings.filter(
        (binding) => !uniqueBindingIds.includes(binding.id) && binding.state !== 'PURGED',
      );
      if (remaining.length === 0) {
        throw new CloudGovernanceError(
          'TENANT_SPLIT_SOURCE_EMPTY',
          'Split must leave a live binding on the source',
          409,
        );
      }
      const busy = await tx.cloudOperation.findFirst({
        where: {
          OR: [{ tenantId: source.id }, { relatedTenantId: source.id }],
          status: { in: ['PENDING', 'RUNNING', 'WAITING'] },
        },
      });
      if (busy) throw new CloudGovernanceError('TENANT_OPERATION_ACTIVE', `Operation ${busy.id} is active`, 409);
      const created = await tx.cloudTenant.create({
        data: {
          organizationId: input.newOrganizationId,
          ...input.newTenant,
          legalEntityId: input.newTenant.legalEntityId ?? null,
          lifecycle: 'PROVISIONING',
          splitFromTenantId: source.id,
        },
      });
      const operation = await tx.cloudOperation.create({
        data: this._operationData({
          context: input.context,
          kind: 'TENANT_SPLIT',
          payload,
          tenantId: source.id,
          relatedTenantId: created.id,
        }),
      });
      return { source, created, operation, replayed: false };
    });
  }

  async beginTransfer(input: {
    context: MutationContext;
    tenantId: string;
    expectedOwnershipVersion: number;
    toPrincipalId: string;
    grantRoles: string[];
  }) {
    const payload = {
      tenantId: input.tenantId,
      expectedOwnershipVersion: input.expectedOwnershipVersion,
      toPrincipalId: input.toPrincipalId,
      grantRoles: [...input.grantRoles].sort(),
    };
    return this.prisma.$transaction(async (tx) => {
      await this._lockIdempotency(tx, input.context.idempotencyKey);
      const existing = await this._existingOperation(tx, {
        idempotencyKey: input.context.idempotencyKey,
        kind: 'TENANT_TRANSFER',
        payload,
      });
      if (existing) {
        const transfer = await tx.cloudTenantTransfer.findUnique({ where: { operationId: existing.id } });
        if (!transfer) throw new CloudGovernanceError('OPERATION_RESULT_CORRUPT', 'Transfer is missing', 500);
        return { operation: existing, transfer, replayed: true };
      }

      await tx.$queryRaw`SELECT "id" FROM "CloudTenant" WHERE "id" = ${input.tenantId} FOR UPDATE`;
      const tenant = await tx.cloudTenant.findUnique({ where: { id: input.tenantId } });
      if (!tenant) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'CloudTenant not found', 404);
      if (tenant.lifecycle !== 'ACTIVE')
        throw new CloudGovernanceError('TENANT_NOT_ACTIVE', 'CloudTenant must be ACTIVE', 409);
      if (tenant.ownershipVersion !== input.expectedOwnershipVersion) {
        throw new CloudGovernanceError(
          'OWNERSHIP_VERSION_CONFLICT',
          'CloudTenant ownership changed; reload and retry',
          409,
        );
      }
      if (tenant.ownerPrincipalId === input.toPrincipalId) {
        throw new CloudGovernanceError('TRANSFER_NOOP', 'New principal is already the owner', 409);
      }
      const active = await tx.cloudTenantTransfer.count({
        where: { cloudTenantId: tenant.id, state: { in: ['REQUESTED', 'REVOKING', 'REVOKED', 'REGRANTING'] } },
      });
      if (active > 0) throw new CloudGovernanceError('TRANSFER_ALREADY_ACTIVE', 'An ownership transfer is active', 409);
      const activeOperation = await tx.cloudOperation.findFirst({
        where: {
          OR: [{ tenantId: tenant.id }, { relatedTenantId: tenant.id }],
          status: { in: ['PENDING', 'RUNNING', 'WAITING'] },
        },
      });
      if (activeOperation) {
        throw new CloudGovernanceError('TENANT_OPERATION_ACTIVE', `Operation ${activeOperation.id} is active`, 409);
      }

      const operation = await tx.cloudOperation.create({
        data: this._operationData({
          context: input.context,
          kind: 'TENANT_TRANSFER',
          payload,
          tenantId: tenant.id,
        }),
      });
      const transfer = await tx.cloudTenantTransfer.create({
        data: {
          operationId: operation.id,
          cloudTenantId: tenant.id,
          expectedOwnershipVersion: input.expectedOwnershipVersion,
          fromPrincipalId: tenant.ownerPrincipalId,
          toPrincipalId: input.toPrincipalId,
          grantRoles: json(input.grantRoles),
        },
      });
      return { operation, transfer, replayed: false };
    });
  }

  async beginBindingOperation(input: {
    context: MutationContext;
    kind: Exclude<
      CloudOperationKind,
      | 'TENANT_CREATE'
      | 'PROJECT_BIND'
      | 'TENANT_SUSPEND'
      | 'TENANT_RESTORE'
      | 'TENANT_MERGE'
      | 'TENANT_SPLIT'
      | 'TENANT_TRANSFER'
    >;
    bindingId: string;
    expectedBindingVersion: number;
    payload: Record<string, unknown>;
  }) {
    const payload = {
      ...input.payload,
      bindingId: input.bindingId,
      expectedBindingVersion: input.expectedBindingVersion,
    };
    return this.prisma.$transaction(async (tx) => {
      await this._lockIdempotency(tx, input.context.idempotencyKey);
      const existing = await this._existingOperation(tx, {
        idempotencyKey: input.context.idempotencyKey,
        kind: input.kind,
        payload,
      });
      if (existing) return { operation: existing, replayed: true };

      const initial = await tx.cloudProjectBinding.findUnique({
        where: { id: input.bindingId },
        select: { cloudTenantId: true },
      });
      if (!initial) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
      // Canonical topology lock order: tenant, then binding.
      await tx.$queryRaw`SELECT "id" FROM "CloudTenant" WHERE "id" = ${initial.cloudTenantId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "CloudProjectBinding" WHERE "id" = ${input.bindingId} FOR UPDATE`;
      const binding = await tx.cloudProjectBinding.findUnique({
        where: { id: input.bindingId },
        include: { tenant: true },
      });
      if (!binding) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
      if (binding.version !== input.expectedBindingVersion) {
        throw new CloudGovernanceError(
          'BINDING_VERSION_CONFLICT',
          'CloudProjectBinding changed; reload and retry',
          409,
        );
      }
      if (binding.tenant.lifecycle !== 'ACTIVE' && !['TEARDOWN_VERIFY', 'PROJECT_RESTORE'].includes(input.kind)) {
        throw new CloudGovernanceError('TENANT_NOT_ACTIVE', `CloudTenant is ${binding.tenant.lifecycle}`, 409);
      }
      const tenantOperation = await tx.cloudOperation.findFirst({
        where: {
          OR: [{ tenantId: binding.cloudTenantId }, { relatedTenantId: binding.cloudTenantId }],
          status: { in: ['PENDING', 'RUNNING', 'WAITING'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (tenantOperation) {
        throw new CloudGovernanceError(
          'TENANT_OPERATION_ACTIVE',
          `Operation ${tenantOperation.id} is already active for this CloudTenant`,
          409,
        );
      }
      const active = await tx.cloudOperation.findFirst({
        where: { bindingId: binding.id, status: { in: ['PENDING', 'RUNNING', 'WAITING'] } },
        orderBy: { createdAt: 'asc' },
      });
      if (active) {
        throw new CloudGovernanceError(
          'BINDING_OPERATION_ACTIVE',
          `Operation ${active.id} is already active for this binding`,
          409,
        );
      }

      const operation = await tx.cloudOperation.create({
        data: this._operationData({
          context: input.context,
          kind: input.kind,
          payload,
          tenantId: binding.cloudTenantId,
          bindingId: binding.id,
        }),
      });
      return { operation, replayed: false };
    });
  }

  async claimOperation(id: string, owner: string, leaseSeconds: number): Promise<ClaimedOperation | null> {
    const rows = await this.prisma.$queryRaw<Array<ClaimedOperation>>`
      UPDATE "CloudOperation"
      SET "status" = 'RUNNING'::"CloudOperationStatus",
          "leaseOwner" = ${owner},
          "leaseExpiresAt" = NOW() + make_interval(secs => ${leaseSeconds}),
          "fence" = "fence" + 1,
          "version" = "version" + 1,
          "attempts" = "attempts" + 1,
          "updatedAt" = NOW()
      WHERE "id" = ${id}
        AND (
          "status" = 'PENDING'::"CloudOperationStatus"
          OR (
            "status" = 'WAITING'::"CloudOperationStatus"
            AND "nextAttemptAt" <= NOW()
          )
          OR ("status" = 'RUNNING'::"CloudOperationStatus" AND "leaseExpiresAt" < NOW())
        )
      RETURNING "id", "kind", "tenantId", "bindingId", "payload", "checkpoint", "step",
                "fence", "leaseOwner", "leaseExpiresAt"
    `;
    const claimed = rows[0] ?? null;
    if (claimed) {
      await this.prisma.cloudOperationEvent.create({
        data: { operationId: claimed.id, fence: claimed.fence, type: 'CLAIMED', detail: json({ owner }) },
      });
    }
    return claimed;
  }

  async renewOperationLease(id: string, owner: string, fence: number, leaseSeconds: number): Promise<boolean> {
    const changed = await this.prisma.$executeRaw`
      UPDATE "CloudOperation"
      SET "leaseExpiresAt" = NOW() + make_interval(secs => ${leaseSeconds}),
          "version" = "version" + 1,
          "updatedAt" = NOW()
      WHERE "id" = ${id}
        AND "status" = 'RUNNING'::"CloudOperationStatus"
        AND "leaseOwner" = ${owner}
        AND "fence" = ${fence}
        AND "leaseExpiresAt" > NOW()
    `;
    return changed === 1;
  }

  async assertOperationLease(id: string, owner: string, fence: number): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ valid: boolean }>>`
      SELECT TRUE AS "valid" FROM "CloudOperation"
      WHERE "id" = ${id}
        AND "status" = 'RUNNING'::"CloudOperationStatus"
        AND "leaseOwner" = ${owner}
        AND "fence" = ${fence}
        AND "leaseExpiresAt" > NOW()
    `;
    if (!rows[0]?.valid) {
      throw new CloudGovernanceError('OPERATION_LEASE_LOST', 'Cloud operation lease was lost', 409, true);
    }
  }

  async checkpointOperation(input: {
    id: string;
    owner: string;
    fence: number;
    step: string;
    checkpoint: unknown;
    eventType: string;
    detail?: unknown;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE "CloudOperation"
        SET "step" = ${input.step}, "checkpoint" = ${json(input.checkpoint)},
            "version" = "version" + 1, "updatedAt" = NOW()
        WHERE "id" = ${input.id}
          AND "status" = 'RUNNING'::"CloudOperationStatus"
          AND "leaseOwner" = ${input.owner}
          AND "fence" = ${input.fence}
          AND "leaseExpiresAt" > NOW()
      `;
      if (changed !== 1)
        throw new CloudGovernanceError('OPERATION_LEASE_LOST', 'Cloud operation lease was lost', 409, true);
      await tx.cloudOperationEvent.create({
        data: {
          operationId: input.id,
          fence: input.fence,
          type: input.eventType,
          detail: input.detail === undefined ? undefined : json(input.detail),
        },
      });
    });
  }

  async failOperation(input: {
    id: string;
    owner: string;
    fence: number;
    error: unknown;
    code?: string;
    retryable: boolean;
    retryDelaySeconds?: number;
  }): Promise<void> {
    const message = safeErrorMessage(input.error);
    await this.prisma.$transaction(async (tx) => {
      const status = input.retryable ? 'WAITING' : 'FAILED';
      const changed = await tx.$executeRaw`
        UPDATE "CloudOperation"
        SET "status" = ${status}::"CloudOperationStatus",
            "lastErrorCode" = ${input.code ?? 'CLOUD_OPERATION_FAILED'},
            "lastErrorMessage" = ${message},
            "nextAttemptAt" = NOW() + make_interval(secs => ${input.retryDelaySeconds ?? 5}),
            "completedAt" = CASE WHEN ${status}::"CloudOperationStatus" = 'FAILED'::"CloudOperationStatus" THEN NOW() ELSE NULL END,
            "leaseOwner" = NULL, "leaseExpiresAt" = NULL,
            "version" = "version" + 1, "updatedAt" = NOW()
        WHERE "id" = ${input.id}
          AND "status" = 'RUNNING'::"CloudOperationStatus"
          AND "leaseOwner" = ${input.owner}
          AND "fence" = ${input.fence}
      `;
      if (changed !== 1) return;
      await tx.cloudOperationEvent.create({
        data: {
          operationId: input.id,
          fence: input.fence,
          type: input.retryable ? 'RETRY_SCHEDULED' : 'FAILED',
          detail: json({ code: input.code ?? 'CLOUD_OPERATION_FAILED', message }),
        },
      });
    });
  }

  private async _lockLease(tx: Tx, input: { id: string; owner: string; fence: number }): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "CloudOperation"
      WHERE "id" = ${input.id}
        AND "status" = 'RUNNING'::"CloudOperationStatus"
        AND "leaseOwner" = ${input.owner}
        AND "fence" = ${input.fence}
        AND "leaseExpiresAt" > NOW()
      FOR UPDATE
    `;
    if (!rows[0]) throw new CloudGovernanceError('OPERATION_LEASE_LOST', 'Cloud operation lease was lost', 409, true);
  }

  private async _completeOperationTx(tx: Tx, input: { id: string; fence: number; result: unknown }): Promise<void> {
    await tx.cloudOperation.update({
      where: { id: input.id },
      data: {
        status: 'SUCCEEDED',
        result: json(input.result),
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        version: { increment: 1 },
        events: { create: { fence: input.fence, type: 'SUCCEEDED', detail: json(input.result) } },
      },
    });
  }

  async completeOperation(input: { id: string; owner: string; fence: number; result: unknown }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, input);
      await this._completeOperationTx(tx, input);
    });
  }

  async transitionBinding(input: {
    operationId: string;
    owner: string;
    fence: number;
    bindingId: string;
    from: CloudProjectBindingState;
    expectedVersion: number;
    to: CloudProjectBindingState;
    detail?: unknown;
    gcpProjectNumber?: string;
    recoveryWindowDays?: number;
    clearRecoveryWindow?: boolean;
    complete: boolean;
    result?: unknown;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      const rows = await tx.$queryRaw<
        Array<{ id: string; state: CloudProjectBindingState; version: number; recoveryWindowEndsAt: Date | null }>
      >`
        UPDATE "CloudProjectBinding"
        SET "state" = ${input.to}::"CloudProjectBindingState",
            "gcpProjectNumber" = COALESCE(${input.gcpProjectNumber ?? null}, "gcpProjectNumber"),
            "recoveryWindowEndsAt" = CASE
              WHEN ${input.clearRecoveryWindow ?? false}::boolean THEN NULL
              WHEN ${input.recoveryWindowDays ?? null}::integer IS NULL THEN "recoveryWindowEndsAt"
              ELSE NOW() + make_interval(days => ${input.recoveryWindowDays ?? 0})
            END,
            "version" = "version" + 1,
            "updatedAt" = NOW()
        WHERE "id" = ${input.bindingId}
          AND "state" = ${input.from}::"CloudProjectBindingState"
          AND "version" = ${input.expectedVersion}
        RETURNING "id", "state", "version", "recoveryWindowEndsAt"
      `;
      const binding = rows[0];
      if (!binding) throw new CloudGovernanceError('BINDING_VERSION_CONFLICT', 'CloudProjectBinding changed', 409);
      const operation = await tx.cloudOperation.findUnique({ where: { id: input.operationId } });
      await tx.cloudProjectFactoryEvent.create({
        data: {
          bindingId: input.bindingId,
          operationId: input.operationId,
          fromState: input.from,
          toState: input.to,
          actorUserId: operation?.actorUserId,
          detail: input.detail === undefined ? undefined : json(input.detail),
        },
      });
      if (input.complete) {
        await this._completeOperationTx(tx, {
          id: input.operationId,
          fence: input.fence,
          result: input.result ?? { bindingId: input.bindingId, state: input.to, version: binding.version },
        });
      } else {
        await tx.cloudOperation.update({
          where: { id: input.operationId },
          data: {
            step: input.to,
            checkpoint: json({ bindingVersion: binding.version }),
            version: { increment: 1 },
            events: { create: { fence: input.fence, type: 'CHECKPOINT', detail: json({ state: input.to }) } },
          },
        });
      }
      return binding;
    });
  }

  async completeTeardownRequest(input: {
    operationId: string;
    owner: string;
    fence: number;
    bindingId: string;
    from: CloudProjectBindingState;
    expectedVersion: number;
    inventory: unknown;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      const changed = await tx.cloudProjectBinding.updateMany({
        where: { id: input.bindingId, state: input.from, version: input.expectedVersion },
        data: { state: 'DELETE_REQUESTED', version: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new CloudGovernanceError('BINDING_VERSION_CONFLICT', 'CloudProjectBinding changed', 409);
      const teardown = await tx.cloudTeardownRecord.create({
        data: {
          bindingId: input.bindingId,
          requestOperationId: input.operationId,
          status: 'DELETING',
          resourceInventory: json(input.inventory),
        },
      });
      const operation = await tx.cloudOperation.findUnique({ where: { id: input.operationId } });
      await tx.cloudProjectFactoryEvent.create({
        data: {
          bindingId: input.bindingId,
          operationId: input.operationId,
          fromState: input.from,
          toState: 'DELETE_REQUESTED',
          actorUserId: operation?.actorUserId,
          detail: json({ teardownId: teardown.id }),
        },
      });
      await this._completeOperationTx(tx, {
        id: input.operationId,
        fence: input.fence,
        result: { bindingId: input.bindingId, teardownId: teardown.id, state: 'DELETE_REQUESTED' },
      });
      return teardown;
    });
  }

  async latestTeardown(bindingId: string) {
    return this.prisma.cloudTeardownRecord.findFirst({
      where: { bindingId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async getTeardown(id: string) {
    return this.prisma.cloudTeardownRecord.findUnique({ where: { id } });
  }

  async completeTeardownExecution(input: {
    operationId: string;
    owner: string;
    fence: number;
    bindingId: string;
    expectedVersion: number;
    teardownId: string;
    recoveryWindowDays: number;
    deletedBuckets: string[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      const rows = await tx.$queryRaw<Array<{ version: number; recoveryWindowEndsAt: Date }>>`
        UPDATE "CloudProjectBinding"
        SET "state" = 'RECOVERY_WINDOW'::"CloudProjectBindingState",
            "recoveryWindowEndsAt" = NOW() + make_interval(days => ${input.recoveryWindowDays}),
            "version" = "version" + 1,
            "updatedAt" = NOW()
        WHERE "id" = ${input.bindingId}
          AND "state" = 'DELETE_REQUESTED'::"CloudProjectBindingState"
          AND "version" = ${input.expectedVersion}
        RETURNING "version", "recoveryWindowEndsAt"
      `;
      if (!rows[0]) throw new CloudGovernanceError('BINDING_VERSION_CONFLICT', 'CloudProjectBinding changed', 409);
      const teardown = await tx.cloudTeardownRecord.updateMany({
        where: { id: input.teardownId, bindingId: input.bindingId, status: 'DELETING' },
        data: { status: 'VERIFYING', version: { increment: 1 } },
      });
      if (teardown.count !== 1) throw new CloudGovernanceError('TEARDOWN_STATE_CONFLICT', 'Teardown changed', 409);
      const operation = await tx.cloudOperation.findUnique({ where: { id: input.operationId } });
      await tx.cloudProjectFactoryEvent.create({
        data: {
          bindingId: input.bindingId,
          operationId: input.operationId,
          fromState: 'DELETE_REQUESTED',
          toState: 'RECOVERY_WINDOW',
          actorUserId: operation?.actorUserId,
          detail: json({
            teardownId: input.teardownId,
            recoveryWindowEndsAt: rows[0].recoveryWindowEndsAt.toISOString(),
            deletedBuckets: input.deletedBuckets,
          }),
        },
      });
      await this._completeOperationTx(tx, {
        id: input.operationId,
        fence: input.fence,
        result: {
          bindingId: input.bindingId,
          teardownId: input.teardownId,
          state: 'RECOVERY_WINDOW',
          version: rows[0].version,
          recoveryWindowEndsAt: rows[0].recoveryWindowEndsAt.toISOString(),
        },
      });
      return rows[0];
    });
  }

  async completeTeardownVerification(input: {
    operationId: string;
    owner: string;
    fence: number;
    teardownId: string;
    expectedVersion: number;
    proof: unknown;
    orphans: unknown[];
    complete: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      const updated = await tx.cloudTeardownRecord.updateMany({
        where: { id: input.teardownId, version: input.expectedVersion },
        data: {
          status: input.complete ? 'COMPLETE' : 'ORPHANS_DETECTED',
          erasureProof: json(input.proof),
          orphans: json(input.orphans),
          completedAt: input.complete ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new CloudGovernanceError('TEARDOWN_VERSION_CONFLICT', 'Teardown changed', 409);
      await this._completeOperationTx(tx, {
        id: input.operationId,
        fence: input.fence,
        result: { teardownId: input.teardownId, verified: input.complete, orphanCount: input.orphans.length },
      });
      return tx.cloudTeardownRecord.findUniqueOrThrow({ where: { id: input.teardownId } });
    });
  }

  async purgeBinding(input: {
    operationId: string;
    owner: string;
    fence: number;
    bindingId: string;
    expectedVersion: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      const eligible = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT b."id"
        FROM "CloudProjectBinding" b
        WHERE b."id" = ${input.bindingId}
          AND b."state" = 'RECOVERY_WINDOW'::"CloudProjectBindingState"
          AND b."version" = ${input.expectedVersion}
          AND b."recoveryWindowEndsAt" IS NOT NULL
          AND b."recoveryWindowEndsAt" <= NOW()
          AND EXISTS (
            SELECT 1 FROM "CloudTeardownRecord" t
            WHERE t."bindingId" = b."id" AND t."status" = 'COMPLETE'::"CloudTeardownStatus"
          )
        FOR UPDATE
      `;
      if (!eligible[0]) {
        throw new CloudGovernanceError(
          'PROJECT_PURGE_NOT_ELIGIBLE',
          'Recovery window is open, binding changed, or teardown is not verified COMPLETE',
          409,
        );
      }
      const purging = await tx.cloudProjectBinding.update({
        where: { id: input.bindingId },
        data: { state: 'PURGING', version: { increment: 1 } },
      });
      const purged = await tx.cloudProjectBinding.update({
        where: { id: input.bindingId },
        data: { state: 'PURGED', version: { increment: 1 } },
      });
      const operation = await tx.cloudOperation.findUnique({ where: { id: input.operationId } });
      await tx.cloudProjectFactoryEvent.createMany({
        data: [
          {
            bindingId: input.bindingId,
            operationId: input.operationId,
            fromState: 'RECOVERY_WINDOW',
            toState: 'PURGING',
            actorUserId: operation?.actorUserId,
          },
          {
            bindingId: input.bindingId,
            operationId: input.operationId,
            fromState: 'PURGING',
            toState: 'PURGED',
            actorUserId: operation?.actorUserId,
          },
        ],
      });
      await this._completeOperationTx(tx, {
        id: input.operationId,
        fence: input.fence,
        result: { bindingId: input.bindingId, state: purged.state, version: purged.version },
      });
      void purging;
      return purged;
    });
  }

  async findIdentity(input: {
    kind: PlatformIamIdentityKind;
    app: string;
    environment: string;
    privilegeBoundary: string;
    gcpProjectId: string;
  }) {
    return this.prisma.platformIamIdentity.findUnique({
      where: { kind_app_environment_privilegeBoundary_gcpProjectId: input },
    });
  }

  async completeIdentityEnsure(input: {
    operationId: string;
    owner: string;
    fence: number;
    bindingId: string;
    boundary: {
      kind: PlatformIamIdentityKind;
      app: string;
      environment: string;
      privilegeBoundary: string;
      gcpProjectId: string;
    };
    serviceAccountEmail: string;
    persistentKeys: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      const prior = await tx.platformIamIdentity.findUnique({
        where: { kind_app_environment_privilegeBoundary_gcpProjectId: input.boundary },
      });
      const complianceStatus = input.persistentKeys === 0 ? ('COMPLIANT' as const) : ('KEY_DRIFT' as const);
      const identity = prior
        ? await tx.platformIamIdentity.update({
            where: { id: prior.id },
            data: {
              persistentKeys: input.persistentKeys,
              complianceStatus,
              revisionsServed: input.persistentKeys === 0 ? { increment: 1 } : undefined,
              lastUsedAt: new Date(),
              version: { increment: 1 },
            },
          })
        : await tx.platformIamIdentity.create({
            data: {
              bindingId: input.bindingId,
              ...input.boundary,
              gcpServiceAccountEmail: input.serviceAccountEmail,
              persistentKeys: input.persistentKeys,
              complianceStatus,
              revisionsServed: 1,
              lastUsedAt: new Date(),
            },
          });

      if (input.persistentKeys > 0) {
        await tx.cloudOperation.update({
          where: { id: input.operationId },
          data: {
            status: 'FAILED',
            lastErrorCode: 'IAM_PERSISTENT_KEY_FORBIDDEN',
            lastErrorMessage: `${input.persistentKeys} user-managed key(s) detected`,
            completedAt: new Date(),
            leaseOwner: null,
            leaseExpiresAt: null,
            version: { increment: 1 },
            events: {
              create: {
                fence: input.fence,
                type: 'FAILED',
                detail: json({ code: 'IAM_PERSISTENT_KEY_FORBIDDEN', persistentKeys: input.persistentKeys }),
              },
            },
          },
        });
      } else {
        await this._completeOperationTx(tx, {
          id: input.operationId,
          fence: input.fence,
          result: { identityId: identity.id, created: !prior, complianceStatus },
        });
      }
      return { identity, created: !prior };
    });
  }

  async listIdentities(input: { bindingId?: string; kind?: PlatformIamIdentityKind; limit: number }) {
    return this.prisma.platformIamIdentity.findMany({
      where: { bindingId: input.bindingId, kind: input.kind },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
    });
  }

  async recordImpersonation(input: {
    identityId: string;
    actorPrincipal: string;
    purpose: string;
    tokenLifetimeSeconds: number;
  }) {
    const identity = await this.prisma.platformIamIdentity.findUnique({ where: { id: input.identityId } });
    if (!identity) throw new CloudGovernanceError('IAM_IDENTITY_NOT_FOUND', 'Platform IAM identity not found', 404);
    return this.prisma.platformIamImpersonationAudit.create({ data: input });
  }

  async completeTransfer(input: {
    operationId: string;
    owner: string;
    fence: number;
    transferId: string;
    expectedOwnershipVersion: number;
    toPrincipalId: string;
    regrantEvidence: unknown;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      const transfer = await tx.cloudTenantTransfer.findUnique({ where: { id: input.transferId } });
      if (!transfer || transfer.state !== 'REGRANTING' || !transfer.revokeVerifiedAt) {
        throw new CloudGovernanceError('TRANSFER_STATE_CONFLICT', 'Transfer is not safely regranting', 409);
      }
      const changed = await tx.cloudTenant.updateMany({
        where: {
          id: transfer.cloudTenantId,
          ownershipVersion: input.expectedOwnershipVersion,
          ownerPrincipalId: transfer.fromPrincipalId,
          lifecycle: 'ACTIVE',
        },
        data: {
          ownerPrincipalId: input.toPrincipalId,
          ownershipVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new CloudGovernanceError('OWNERSHIP_VERSION_CONFLICT', 'CloudTenant ownership changed', 409);
      }
      const completed = await tx.cloudTenantTransfer.update({
        where: { id: transfer.id },
        data: {
          state: 'COMPLETED',
          regrantEvidence: json(input.regrantEvidence),
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this._completeOperationTx(tx, {
        id: input.operationId,
        fence: input.fence,
        result: {
          tenantId: transfer.cloudTenantId,
          transferId: transfer.id,
          ownershipVersion: input.expectedOwnershipVersion + 1,
        },
      });
      return completed;
    });
  }

  async completeLifecycleChange(input: {
    operationId: string;
    owner: string;
    fence: number;
    tenantId: string;
    expectedVersion: number;
    from: 'ACTIVE' | 'SUSPENDED';
    to: 'ACTIVE' | 'SUSPENDED';
    reason?: string;
    evidence?: unknown;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      const changed = await tx.cloudTenant.updateMany({
        where: { id: input.tenantId, version: input.expectedVersion, lifecycle: input.from },
        data: {
          lifecycle: input.to,
          suspensionReason: input.to === 'SUSPENDED' ? (input.reason ?? 'ADMIN') : null,
          suspensionEvidence: input.to === 'SUSPENDED' ? json(input.evidence ?? []) : Prisma.DbNull,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new CloudGovernanceError('TENANT_VERSION_CONFLICT', 'CloudTenant changed', 409);
      await tx.platformIamIdentity.updateMany({
        where: {
          binding: { is: { cloudTenantId: input.tenantId } },
          ...(input.to === 'ACTIVE' ? { persistentKeys: 0 } : {}),
        },
        data: { complianceStatus: input.to === 'SUSPENDED' ? 'DISABLED' : 'COMPLIANT', version: { increment: 1 } },
      });
      const tenant = await tx.cloudTenant.findUniqueOrThrow({ where: { id: input.tenantId } });
      await this._completeOperationTx(tx, {
        id: input.operationId,
        fence: input.fence,
        result: { tenantId: tenant.id, lifecycle: tenant.lifecycle, version: tenant.version, externalVerified: true },
      });
      return tenant;
    });
  }

  async completeMerge(input: {
    operationId: string;
    owner: string;
    fence: number;
    sourceTenantId: string;
    sourceVersion: number;
    targetTenantId: string;
    targetVersion: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      const ids = [input.sourceTenantId, input.targetTenantId].sort();
      await tx.$queryRaw`SELECT "id" FROM "CloudTenant" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
      const [source, target] = await Promise.all([
        tx.cloudTenant.findUnique({ where: { id: input.sourceTenantId }, include: { bindings: true } }),
        tx.cloudTenant.findUnique({ where: { id: input.targetTenantId }, include: { bindings: true } }),
      ]);
      if (!source || !target)
        throw new CloudGovernanceError('TENANT_NOT_FOUND', 'Source or target CloudTenant not found', 404);
      if (
        source.lifecycle !== 'ACTIVE' ||
        target.lifecycle !== 'ACTIVE' ||
        source.version !== input.sourceVersion ||
        target.version !== input.targetVersion
      ) {
        throw new CloudGovernanceError('TENANT_VERSION_CONFLICT', 'CloudTenant changed during merge', 409);
      }
      if (
        [...source.bindings, ...target.bindings].some(
          (binding) => binding.state !== 'PURGED' && !TOPOLOGY_MOVABLE_BINDING_STATES.has(binding.state),
        )
      ) {
        throw new CloudGovernanceError(
          'TENANT_TOPOLOGY_BINDING_STATE_CONFLICT',
          'A binding entered suspension or teardown/recovery during merge',
          409,
          true,
        );
      }
      const targetHasPrimary = target.bindings.some(
        (binding) => binding.role === 'PRIMARY' && binding.state !== 'PURGED',
      );
      if (targetHasPrimary) {
        await tx.cloudProjectBinding.updateMany({
          where: { cloudTenantId: source.id, role: 'PRIMARY', state: { not: 'PURGED' } },
          data: { role: 'QUOTA_SHARD', version: { increment: 1 } },
        });
      }
      const linkedProjectIds = source.bindings
        .map((binding) => binding.projectId)
        .filter((projectId): projectId is string => Boolean(projectId));
      if (linkedProjectIds.length > 0) {
        if (!source.organizationId || !target.organizationId) {
          throw new CloudGovernanceError(
            'TENANT_MERGE_PRODUCT_BOUNDARY_MISSING',
            'Linked Vibecore Projects require source and target Organizations',
            409,
            true,
          );
        }
        const sourceProjects = await tx.project.findMany({
          where: { id: { in: linkedProjectIds }, organizationId: source.organizationId },
          select: { id: true, slug: true },
        });
        if (sourceProjects.length !== linkedProjectIds.length) {
          throw new CloudGovernanceError(
            'TENANT_MERGE_PROJECT_DRIFT',
            'A linked Vibecore Project left the source Organization',
            409,
            true,
          );
        }
        const conflictingSlug = await tx.project.findFirst({
          where: {
            organizationId: target.organizationId,
            slug: { in: sourceProjects.map((project) => project.slug) },
            id: { notIn: linkedProjectIds },
          },
          select: { id: true },
        });
        if (conflictingSlug) {
          throw new CloudGovernanceError(
            'TENANT_MERGE_PROJECT_SLUG_CONFLICT',
            'A destination Vibecore Project already uses a source project slug',
            409,
            true,
          );
        }
        const movedProjects = await tx.project.updateMany({
          where: { id: { in: linkedProjectIds }, organizationId: source.organizationId },
          data: { organizationId: target.organizationId },
        });
        if (movedProjects.count !== linkedProjectIds.length) {
          throw new CloudGovernanceError(
            'TENANT_MERGE_PROJECT_DRIFT',
            'A linked Vibecore Project changed during merge',
            409,
            true,
          );
        }
      }
      await tx.cloudProjectBinding.updateMany({
        where: { cloudTenantId: source.id },
        data: { cloudTenantId: target.id, version: { increment: 1 } },
      });
      const mergedSource = await tx.cloudTenant.update({
        where: { id: source.id },
        data: { lifecycle: 'MERGED', mergedIntoTenantId: target.id, version: { increment: 1 } },
      });
      const bumpedTarget = await tx.cloudTenant.update({
        where: { id: target.id },
        data: { version: { increment: 1 }, ownershipVersion: { increment: 1 } },
      });
      await this._completeOperationTx(tx, {
        id: input.operationId,
        fence: input.fence,
        result: {
          sourceTenantId: source.id,
          targetTenantId: target.id,
          sourceVersion: mergedSource.version,
          targetVersion: bumpedTarget.version,
          externalVerified: true,
        },
      });
      return { source: mergedSource, target: bumpedTarget };
    });
  }

  async completeSplit(input: {
    operationId: string;
    owner: string;
    fence: number;
    sourceTenantId: string;
    sourceVersion: number;
    bindingIds: string[];
    newOrganizationId: string;
    newTenant: {
      customerBoundaryType: CloudTenantBoundaryType;
      ownerPrincipalId: string;
      billingPrincipalId: string;
      billingAccountId: string;
      legalEntityId?: string | null;
      residencyPolicy: string;
    };
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
        await tx.$queryRaw`SELECT "id" FROM "CloudTenant" WHERE "id" = ${input.sourceTenantId} FOR UPDATE`;
        const source = await tx.cloudTenant.findUnique({
          where: { id: input.sourceTenantId },
          include: { bindings: true },
        });
        if (!source || source.lifecycle !== 'ACTIVE' || source.version !== input.sourceVersion) {
          throw new CloudGovernanceError('TENANT_VERSION_CONFLICT', 'Source CloudTenant changed during split', 409);
        }
        const selected = source.bindings.filter((binding) => input.bindingIds.includes(binding.id));
        const remaining = source.bindings.filter(
          (binding) => !input.bindingIds.includes(binding.id) && binding.state !== 'PURGED',
        );
        if (selected.length !== input.bindingIds.length || remaining.length === 0) {
          throw new CloudGovernanceError('TENANT_SPLIT_DRIFT', 'Split binding set changed', 409);
        }
        if (
          selected.some((binding) => binding.state === 'PURGED' || !TOPOLOGY_MOVABLE_BINDING_STATES.has(binding.state))
        ) {
          throw new CloudGovernanceError(
            'TENANT_TOPOLOGY_BINDING_STATE_CONFLICT',
            'A split binding entered suspension or teardown/recovery',
            409,
            true,
          );
        }
        const operation = await tx.cloudOperation.findUnique({
          where: { id: input.operationId },
          select: { relatedTenantId: true },
        });
        const created = operation?.relatedTenantId
          ? await tx.cloudTenant.findUnique({ where: { id: operation.relatedTenantId } })
          : null;
        if (
          !created ||
          created.lifecycle !== 'PROVISIONING' ||
          created.organizationId !== input.newOrganizationId ||
          created.splitFromTenantId !== source.id
        ) {
          throw new CloudGovernanceError('TENANT_SPLIT_DESTINATION_DRIFT', 'Split destination changed', 409);
        }
        const linkedProjectIds = selected
          .map((binding) => binding.projectId)
          .filter((projectId): projectId is string => Boolean(projectId));
        if (linkedProjectIds.length > 0) {
          const movedProjects = await tx.project.updateMany({
            where: { id: { in: linkedProjectIds }, organizationId: source.organizationId ?? '__unlinked__' },
            data: { organizationId: input.newOrganizationId },
          });
          if (movedProjects.count !== linkedProjectIds.length) {
            throw new CloudGovernanceError('TENANT_SPLIT_PROJECT_DRIFT', 'Linked Project ownership changed', 409);
          }
        }
        const movingPrimary = selected.find((binding) => binding.role === 'PRIMARY' && binding.state !== 'PURGED');
        await tx.cloudProjectBinding.updateMany({
          where: { id: { in: input.bindingIds } },
          data: { cloudTenantId: created.id, version: { increment: 1 } },
        });
        if (!movingPrimary) {
          await tx.cloudProjectBinding.update({
            where: { id: selected.find((binding) => binding.state !== 'PURGED')?.id ?? selected[0].id },
            data: { role: 'PRIMARY', version: { increment: 1 } },
          });
        } else if (!remaining.some((binding) => binding.role === 'PRIMARY')) {
          await tx.cloudProjectBinding.update({
            where: { id: remaining[0].id },
            data: { role: 'PRIMARY', version: { increment: 1 } },
          });
        }
        const bumped = await tx.cloudTenant.update({
          where: { id: source.id },
          data: { version: { increment: 1 }, ownershipVersion: { increment: 1 } },
        });
        const activated = await tx.cloudTenant.update({
          where: { id: created.id },
          data: { lifecycle: 'ACTIVE', version: { increment: 1 } },
        });
        await this._completeOperationTx(tx, {
          id: input.operationId,
          fence: input.fence,
          result: {
            sourceTenantId: source.id,
            createdTenantId: created.id,
            sourceVersion: bumped.version,
            externalVerified: true,
          },
        });
        return { source: bumped, created: activated };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CloudGovernanceError(
          'TENANT_SPLIT_CONFLICT',
          'Destination Organization or project slug conflicts',
          409,
        );
      }
      throw error;
    }
  }

  async updateTransferCheckpoint(input: {
    operationId: string;
    owner: string;
    fence: number;
    transferId: string;
    state: 'REVOKING' | 'REVOKED' | 'REGRANTING';
    revokeEvidence?: unknown;
    revokeVerified?: boolean;
    regrantEvidence?: unknown;
    checkpoint: unknown;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this._lockLease(tx, { id: input.operationId, owner: input.owner, fence: input.fence });
      await tx.cloudTenantTransfer.update({
        where: { id: input.transferId },
        data: {
          state: input.state,
          revokeEvidence: input.revokeEvidence === undefined ? undefined : json(input.revokeEvidence),
          revokeVerifiedAt: input.revokeVerified ? new Date() : undefined,
          regrantEvidence: input.regrantEvidence === undefined ? undefined : json(input.regrantEvidence),
          version: { increment: 1 },
        },
      });
      await tx.cloudOperation.update({
        where: { id: input.operationId },
        data: {
          step: input.state,
          checkpoint: json(input.checkpoint),
          version: { increment: 1 },
          events: { create: { fence: input.fence, type: 'CHECKPOINT', detail: json({ state: input.state }) } },
        },
      });
    });
  }

  async failTransfer(
    operationId: string,
    transferId: string,
    owner: string,
    fence: number,
    error: unknown,
    retryable: boolean,
  ): Promise<void> {
    if (!retryable) {
      await this.prisma.cloudTenantTransfer.updateMany({
        where: { id: transferId, operationId, state: { notIn: ['COMPLETED', 'FAILED'] } },
        data: {
          state: 'FAILED',
          errorCode: 'TRANSFER_FAILED',
          errorMessage: safeErrorMessage(error),
          version: { increment: 1 },
        },
      });
    }
    await this.failOperation({ id: operationId, owner, fence, error, retryable, code: 'TRANSFER_FAILED' });
  }

  async listOperations(input: { tenantId?: string; bindingId?: string; cursor?: string; limit: number }) {
    const cursor = input.cursor
      ? await this.prisma.cloudOperation.findUnique({ where: { id: input.cursor }, select: { id: true } })
      : null;
    if (input.cursor && !cursor) throw new CloudGovernanceError('CURSOR_INVALID', 'Operation cursor is invalid', 400);
    const rows = await this.prisma.cloudOperation.findMany({
      where: {
        ...(input.tenantId ? { OR: [{ tenantId: input.tenantId }, { relatedTenantId: input.tenantId }] } : {}),
        bindingId: input.bindingId,
      },
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      take: input.limit + 1,
    });
    return {
      items: rows.slice(0, input.limit),
      nextCursor: rows.length > input.limit ? rows[input.limit - 1].id : null,
    };
  }

  async listDueOperationIds(limit: number): Promise<string[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "CloudOperation"
      WHERE (
          "status" = 'PENDING'::"CloudOperationStatus"
          OR (
            "status" = 'WAITING'::"CloudOperationStatus"
            AND "nextAttemptAt" <= NOW()
          )
          OR (
            "status" = 'RUNNING'::"CloudOperationStatus"
            AND "leaseExpiresAt" < NOW()
          )
        )
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC, "id" ASC
      LIMIT ${safeLimit}
    `;
    return rows.map((row) => row.id);
  }

  async listBindingEvents(bindingId: string, limit: number) {
    const exists = await this.prisma.cloudProjectBinding.findUnique({ where: { id: bindingId }, select: { id: true } });
    if (!exists) throw new CloudGovernanceError('BINDING_NOT_FOUND', 'CloudProjectBinding not found', 404);
    return this.prisma.cloudProjectFactoryEvent.findMany({
      where: { bindingId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
}
