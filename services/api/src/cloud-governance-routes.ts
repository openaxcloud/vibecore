import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodType } from 'zod';
import { appPublicEnglish } from './app-public-copy.js';
import { CloudGovernanceService } from './cloud-governance-service.js';
import { CloudGovernanceError, type MutationContext } from './cloud-governance-store.js';

const id = z.string().min(1).max(100);
const principal = z
  .string()
  .min(3)
  .max(1000)
  .regex(/^(user|group|serviceAccount|domain|principal|principalSet):[^\s]+$/);
const billingAccountId = z.string().regex(/^[0-9A-Z]{6}-[0-9A-Z]{6}-[0-9A-Z]{6}$/);
const gcpProjectId = z
  .string()
  .min(6)
  .max(30)
  .regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/);
const iamRole = z
  .string()
  .max(200)
  .regex(/^roles\/[A-Za-z0-9_.]+$/);
const expectedVersion = z.number().int().positive();
const boundary = z.enum(['PERSON', 'WORKSPACE', 'LEGAL_ENTITY', 'BILLING_ACCOUNT']);
const identityKind = z.enum(['BUILD', 'PROMOTION', 'RUNTIME']);

const tenantFields = z
  .object({
    customerBoundaryType: boundary,
    ownerPrincipalId: principal,
    billingPrincipalId: principal,
    billingAccountId,
    legalEntityId: z.string().min(1).max(200).nullable().optional(),
    residencyPolicy: z
      .string()
      .min(2)
      .max(32)
      .regex(/^[a-z0-9-]+$/)
      .default('eu'),
  })
  .strict();

const createTenantSchema = tenantFields.extend({ organizationId: id }).strict();
const bindSchema = z
  .object({
    expectedTenantVersion: expectedVersion,
    projectId: id,
    gcpProjectId,
    role: z.enum(['PRIMARY', 'REGION_SHARD', 'QUOTA_SHARD', 'MIGRATION_TARGET']).default('PRIMARY'),
    region: z
      .string()
      .min(2)
      .max(32)
      .regex(/^[a-z0-9-]+$/),
    parentFolderId: z.string().regex(/^folders\/\d+$/),
    billingLabels: z.record(z.string().max(63)).optional(),
    capacityPolicy: z
      .object({
        maxWorkspaces: z.number().int().positive().max(1_000_000).optional(),
        maxBucketBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
        createRatePerMinute: z.number().positive().max(10_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const lifecycleSchema = z.object({ expectedVersion, reason: z.string().trim().min(1).max(500).optional() }).strict();
const transferSchema = z
  .object({
    expectedOwnershipVersion: expectedVersion,
    toPrincipalId: principal,
    grantRoles: z.array(iamRole).min(1).max(20),
  })
  .strict();
const mergeSchema = z
  .object({
    sourceTenantId: id,
    sourceVersion: expectedVersion,
    targetTenantId: id,
    targetVersion: expectedVersion,
    grantRoles: z.array(iamRole).min(1).max(20),
  })
  .strict();
const splitSchema = z
  .object({
    sourceVersion: expectedVersion,
    bindingIds: z.array(id).min(1).max(100),
    newOrganizationId: id,
    grantRoles: z.array(iamRole).min(1).max(20),
    newTenant: tenantFields,
  })
  .strict();
const bindingMutationSchema = z.object({ expectedBindingVersion: expectedVersion }).strict();
const advanceSchema = bindingMutationSchema
  .extend({
    services: z
      .array(
        z
          .string()
          .max(200)
          .regex(/^[a-z0-9.-]+\.googleapis\.com$/),
      )
      .max(50)
      .optional(),
  })
  .strict();
const verifyTeardownSchema = bindingMutationSchema.extend({ teardownId: id }).strict();
const identitySchema = bindingMutationSchema
  .extend({
    kind: identityKind,
    app: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .optional(),
    environment: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .optional(),
    privilegeBoundary: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9._-]+$/),
    roles: z.array(iamRole).min(1).max(20),
    workloadIdentityMembers: z
      .array(
        z
          .string()
          .max(1000)
          .regex(
            /^(serviceAccount:[a-z][a-z0-9-]{4,28}\.svc\.id\.goog\[[a-z0-9-]{1,63}\/[a-z0-9-]{1,63}\]|principal(Set)?:\/\/iam\.googleapis\.com\/[^\s]+)$/,
          ),
      )
      .max(20)
      .optional(),
  })
  .strict();
const operationsQuery = z
  .object({
    tenantId: id.optional(),
    bindingId: id.optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const identitiesQuery = z
  .object({
    bindingId: id.optional(),
    kind: identityKind.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new CloudGovernanceError(
      'VALIDATION_FAILED',
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; '),
      400,
    );
  }
  return parsed.data;
}

interface OperationViewInput {
  id: string;
  kind: string;
  status: string;
  tenantId: string | null;
  relatedTenantId: string | null;
  bindingId: string | null;
  step: string;
  fence: number;
  attempts: number;
  nextAttemptAt: Date;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  result: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  events?: unknown[];
}

function operationView(operation: OperationViewInput) {
  return {
    id: operation.id,
    kind: operation.kind,
    status: operation.status,
    tenantId: operation.tenantId,
    relatedTenantId: operation.relatedTenantId,
    bindingId: operation.bindingId,
    step: operation.step,
    fence: operation.fence,
    attempts: operation.attempts,
    nextAttemptAt: operation.nextAttemptAt,
    lastErrorCode: operation.lastErrorCode,
    lastErrorMessage: operation.lastErrorMessage,
    result: operation.result,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    completedAt: operation.completedAt,
    events: operation.events ?? [],
  };
}

function context(request: FastifyRequest): MutationContext {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
    throw new CloudGovernanceError(
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key must contain 16..128 safe characters',
      400,
    );
  }
  const auth = request as FastifyRequest & {
    currentUser?: { id?: string };
    currentSession?: { lastReauthAt?: string | Date | null };
  };
  if (!auth.currentUser?.id) throw new CloudGovernanceError('AUTH_REQUIRED', 'Authentication required', 401);
  const raw = auth.currentSession?.lastReauthAt;
  return {
    idempotencyKey: key,
    actorUserId: auth.currentUser.id,
    reauthenticatedAt: raw ? new Date(raw) : undefined,
  };
}

export interface CloudGovernanceRouteDependencies {
  service?: CloudGovernanceService;
  guardAdmin: (request: FastifyRequest, options: { reauth: boolean }) => Promise<void>;
  audit: (
    request: FastifyRequest,
    entry: { action: string; resourceId?: string; metadata?: Record<string, unknown> },
  ) => Promise<void>;
  enabled?: () => boolean;
}

export function registerCloudGovernanceRoutes(app: FastifyInstance, deps: CloudGovernanceRouteDependencies): void {
  const enabled = deps.enabled ?? (() => process.env.CLOUD_TENANT_FACTORY_ENABLED === 'true');

  function requireService(reply: FastifyReply): CloudGovernanceService | null {
    if (!enabled()) {
      reply.code(503).send({
        code: 'CLOUD_TENANT_FACTORY_DISABLED',
        error: appPublicEnglish('CLOUD_TENANT_FACTORY_DISABLED'),
      });
      return null;
    }
    if (!deps.service) {
      reply.code(503).send({
        code: 'CLOUD_TENANT_FACTORY_NOT_CONFIGURED',
        error: appPublicEnglish('CLOUD_TENANT_FACTORY_NOT_CONFIGURED'),
      });
      return null;
    }
    return deps.service;
  }

  type Handler = (service: CloudGovernanceService, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  const route = (reauth: boolean, handler: Handler) => async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await deps.guardAdmin(request, { reauth });
      const service = requireService(reply);
      if (!service) return reply;
      return await handler(service, request, reply);
    } catch (error) {
      if (error instanceof CloudGovernanceError) {
        return reply
          .code(error.statusCode)
          .send({ code: error.code, error: error.message, retryable: error.retryable });
      }
      throw error;
    }
  };

  async function executeAccepted(
    service: CloudGovernanceService,
    request: FastifyRequest,
    reply: FastifyReply,
    operationId: string,
    action: string,
    metadata?: Record<string, unknown>,
    prepare?: () => Promise<void>,
  ) {
    // The request audit is durable before the first external GCP effect.
    await deps.audit(request, { action: `${action}.requested`, resourceId: operationId, metadata });
    await prepare?.();
    const operation = await service.executeOperation(operationId);
    await deps.audit(request, {
      action: `${action}.attempted`,
      resourceId: operationId,
      metadata: { ...metadata, status: operation.status, step: operation.step, attempts: operation.attempts },
    });
    return reply.code(202).send({ operation: operationView(operation) });
  }

  app.post(
    '/admin/cloud-tenants',
    route(true, async (service, request, reply) => {
      const body = parse(createTenantSchema, request.body ?? {});
      const result = await service.createTenant({ context: context(request), ...body });
      await deps.audit(request, {
        action: 'admin.cloud_tenant.create',
        resourceId: result.tenant.id,
        metadata: { organizationId: body.organizationId, replayed: result.replayed },
      });
      return reply
        .code(result.replayed ? 200 : 201)
        .send({ tenant: result.tenant, operation: operationView(result.operation), replayed: result.replayed });
    }),
  );

  app.get(
    '/admin/cloud-tenants/:id',
    route(false, async (service, request, reply) => {
      const tenantId = parse(z.object({ id }).strict(), request.params).id;
      const tenant = await service.store.getTenant(tenantId);
      if (!tenant) throw new CloudGovernanceError('TENANT_NOT_FOUND', 'CloudTenant not found', 404);
      return reply.send({ tenant });
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/bindings',
    route(true, async (service, request, reply) => {
      const tenantId = parse(z.object({ id }).strict(), request.params).id;
      const body = parse(bindSchema, request.body ?? {});
      const result = await service.bindProject({
        context: context(request),
        tenantId,
        ...body,
        role: body.role ?? 'PRIMARY',
      });
      await deps.audit(request, {
        action: 'admin.cloud_tenant.bind_project',
        resourceId: result.binding.id,
        metadata: { tenantId, projectId: body.projectId, gcpProjectId: body.gcpProjectId, replayed: result.replayed },
      });
      return reply
        .code(result.replayed ? 200 : 201)
        .send({ binding: result.binding, operation: operationView(result.operation), replayed: result.replayed });
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/suspend',
    route(true, async (service, request, reply) => {
      const tenantId = parse(z.object({ id }).strict(), request.params).id;
      const body = parse(lifecycleSchema, request.body ?? {});
      const started = await service.changeTenantLifecycle({
        context: context(request),
        tenantId,
        expectedVersion: body.expectedVersion,
        to: 'SUSPENDED',
        reason: body.reason,
      });
      return executeAccepted(service, request, reply, started.operation.id, 'admin.cloud_tenant.suspend', { tenantId });
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/restore',
    route(true, async (service, request, reply) => {
      const tenantId = parse(z.object({ id }).strict(), request.params).id;
      const body = parse(lifecycleSchema, request.body ?? {});
      const started = await service.changeTenantLifecycle({
        context: context(request),
        tenantId,
        expectedVersion: body.expectedVersion,
        to: 'ACTIVE',
      });
      return executeAccepted(service, request, reply, started.operation.id, 'admin.cloud_tenant.restore', { tenantId });
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/transfer',
    route(true, async (service, request, reply) => {
      const tenantId = parse(z.object({ id }).strict(), request.params).id;
      const body = parse(transferSchema, request.body ?? {});
      const started = await service.startTransfer({ context: context(request), tenantId, ...body });
      return executeAccepted(service, request, reply, started.operation.id, 'admin.cloud_tenant.transfer', {
        tenantId,
      });
    }),
  );

  app.post(
    '/admin/cloud-tenants/merge',
    route(true, async (service, request, reply) => {
      const body = parse(mergeSchema, request.body ?? {});
      const started = await service.mergeTenants({ context: context(request), ...body });
      return executeAccepted(service, request, reply, started.operation.id, 'admin.cloud_tenant.merge', {
        sourceTenantId: body.sourceTenantId,
        targetTenantId: body.targetTenantId,
      });
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/split',
    route(true, async (service, request, reply) => {
      const sourceTenantId = parse(z.object({ id }).strict(), request.params).id;
      const body = parse(splitSchema, request.body ?? {});
      const started = await service.splitTenant({
        context: context(request),
        sourceTenantId,
        ...body,
        newTenant: { ...body.newTenant, residencyPolicy: body.newTenant.residencyPolicy ?? 'eu' },
      });
      return executeAccepted(service, request, reply, started.operation.id, 'admin.cloud_tenant.split', {
        sourceTenantId,
        bindingIds: body.bindingIds,
      });
    }),
  );

  app.post(
    '/admin/cloud-project-bindings/:id/advance',
    route(true, async (service, request, reply) => {
      const bindingId = parse(z.object({ id }).strict(), request.params).id;
      const body = parse(advanceSchema, request.body ?? {});
      const started = await service.startProjectAdvance({ context: context(request), bindingId, ...body });
      return executeAccepted(service, request, reply, started.operation.id, 'admin.cloud_project.advance', {
        bindingId,
      });
    }),
  );

  const bindingOperation = (
    path: string,
    action: string,
    start: (
      service: CloudGovernanceService,
      input: { context: MutationContext; bindingId: string; expectedBindingVersion: number },
    ) => Promise<{ operation: { id: string } }>,
  ) => {
    app.post(
      path,
      route(true, async (service, request, reply) => {
        const bindingId = parse(z.object({ id }).strict(), request.params).id;
        const body = parse(bindingMutationSchema, request.body ?? {});
        const started = await start(service, { context: context(request), bindingId, ...body });
        return executeAccepted(service, request, reply, started.operation.id, action, { bindingId });
      }),
    );
  };
  bindingOperation(
    '/admin/cloud-project-bindings/:id/teardown/request',
    'admin.cloud_project.teardown_request',
    (s, i) => s.startTeardownRequest(i),
  );
  bindingOperation(
    '/admin/cloud-project-bindings/:id/teardown/execute',
    'admin.cloud_project.teardown_execute',
    (s, i) => s.startTeardownExecution(i),
  );
  bindingOperation('/admin/cloud-project-bindings/:id/restore', 'admin.cloud_project.restore', (s, i) =>
    s.startProjectRestore(i),
  );
  bindingOperation('/admin/cloud-project-bindings/:id/purge', 'admin.cloud_project.purge', (s, i) =>
    s.startProjectPurge(i),
  );

  app.post(
    '/admin/cloud-project-bindings/:id/teardown/verify',
    route(true, async (service, request, reply) => {
      const bindingId = parse(z.object({ id }).strict(), request.params).id;
      const body = parse(verifyTeardownSchema, request.body ?? {});
      const started = await service.startTeardownVerification({ context: context(request), bindingId, ...body });
      return executeAccepted(service, request, reply, started.operation.id, 'admin.cloud_project.teardown_verify', {
        bindingId,
        teardownId: body.teardownId,
      });
    }),
  );

  app.post(
    '/admin/cloud-project-bindings/:id/iam-identities',
    route(true, async (service, request, reply) => {
      const bindingId = parse(z.object({ id }).strict(), request.params).id;
      const body = parse(identitySchema, request.body ?? {});
      const started = await service.startIdentityEnsure({ context: context(request), bindingId, ...body });
      return executeAccepted(service, request, reply, started.operation.id, 'admin.cloud_iam.ensure', {
        bindingId,
        kind: body.kind,
      });
    }),
  );

  app.get(
    '/admin/cloud-project-bindings/:id/iam-separation',
    route(false, async (service, request, reply) => {
      const bindingId = parse(z.object({ id }).strict(), request.params).id;
      return reply.send(await service.verifyIdentitySeparation(bindingId));
    }),
  );

  app.get(
    '/admin/cloud-project-bindings/:id/events',
    route(false, async (service, request, reply) => {
      const bindingId = parse(z.object({ id }).strict(), request.params).id;
      return reply.send({ events: await service.store.listBindingEvents(bindingId, 100) });
    }),
  );

  app.get(
    '/admin/cloud-operations',
    route(false, async (service, request, reply) => {
      const query = parse(operationsQuery, request.query ?? {});
      const page = await service.store.listOperations({ ...query, limit: query.limit ?? 50 });
      return reply.send({
        operations: page.items.map((operation) => operationView({ ...operation, events: [] })),
        nextCursor: page.nextCursor,
      });
    }),
  );

  app.get(
    '/admin/cloud-operations/:id',
    route(false, async (service, request, reply) => {
      const operationId = parse(z.object({ id }).strict(), request.params).id;
      const operation = await service.store.getOperation(operationId);
      if (!operation) throw new CloudGovernanceError('OPERATION_NOT_FOUND', 'Cloud operation not found', 404);
      return reply.send({ operation: operationView(operation) });
    }),
  );

  app.post(
    '/admin/cloud-operations/:id/resume',
    route(true, async (service, request, reply) => {
      const operationId = parse(z.object({ id }).strict(), request.params).id;
      const operation = await service.store.getOperation(operationId);
      if (!operation) throw new CloudGovernanceError('OPERATION_NOT_FOUND', 'Cloud operation not found', 404);
      return executeAccepted(
        service,
        request,
        reply,
        operationId,
        'admin.cloud_operation.resume',
        {
          originalKind: operation.kind,
        },
        () => service.store.prepareOperationForResume(operationId),
      );
    }),
  );

  app.get(
    '/admin/cloud-iam-identities',
    route(false, async (service, request, reply) => {
      const query = parse(identitiesQuery, request.query ?? {});
      return reply.send({ identities: await service.store.listIdentities({ ...query, limit: query.limit ?? 50 }) });
    }),
  );
}
