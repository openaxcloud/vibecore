/*
 * Admin routes for the CloudTenant / Project Factory / Platform IAM domain.
 * Registered from buildApiApp as one self-contained module (keeps the app.ts
 * footprint to a single call). Everything is:
 *   - platform-admin only (the caller passes the app's own guards),
 *   - gated behind the CLOUD_TENANT_FACTORY_ENABLED kill-switch,
 *   - audited via the app's audit sink.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodSchema } from 'zod';
import {
  advanceCloudProjectBinding,
  executeTeardown,
  markPurged,
  requestTeardown,
  resolveCustomerShardFolder,
  restoreFromRecoveryWindow,
  verifyTeardown,
} from './cloud-project-factory.js';
import type { CloudGovernanceStore } from './cloud-governance-store.js';
import {
  bindProjectToTenant,
  CloudTenantError,
  createCloudTenant,
  mergeCloudTenants,
  restoreCloudTenant,
  splitCloudTenant,
  suspendCloudTenant,
  transferTenantOwnership,
} from './cloud-tenant-service.js';
import type { GcpCloudClient } from './gcp-cloud-client.js';
import {
  ensureBuildIdentity,
  ensurePromotionIdentity,
  ensureRuntimeIdentity,
  recordImpersonation,
  verifyIdentitySeparation,
} from './iam-identity-service.js';

export function isCloudTenantFactoryEnabled(): boolean {
  return process.env.CLOUD_TENANT_FACTORY_ENABLED === 'true';
}

export interface CloudGovernanceRouteDeps {
  governance?: CloudGovernanceStore;
  gcp?: GcpCloudClient;

  /** Platform-admin guard; `reauth: true` additionally demands recent MFA. */
  guardAdmin: (request: FastifyRequest, opts?: { reauth?: boolean }) => Promise<void>;
  audit: (
    request: FastifyRequest,
    entry: { action: string; resourceType: string; resourceId?: string; metadata?: Record<string, unknown> },
  ) => Promise<void>;
}

const principal = z
  .string()
  .min(3)
  .regex(/^[a-zA-Z]+:.+$/, 'IAM member string required (e.g. "user:x@y.z")');

const createTenantSchema = z.object({
  customerBoundaryType: z.enum(['PERSON', 'WORKSPACE', 'LEGAL_ENTITY', 'BILLING_ACCOUNT']),
  ownerPrincipalId: principal,
  billingPrincipalId: principal,
  legalEntityId: z.string().optional(),
  residencyPolicy: z.string().optional(),
});

const bindProjectSchema = z.object({
  gcpProjectId: z
    .string()
    .min(6)
    .max(30)
    .regex(/^[a-z][a-z0-9-]+[a-z0-9]$/),
  role: z.enum(['PRIMARY', 'REGION_SHARD', 'QUOTA_SHARD', 'MIGRATION_TARGET']).optional(),
  region: z.string().min(2),
  parentFolderId: z.string().optional(),
  billingLabels: z.record(z.string()).optional(),
  capacityPolicy: z
    .object({
      maxWorkspaces: z.number().int().positive().optional(),
      maxBucketBytes: z.number().int().positive().optional(),

      /** Creation rate limits are part of capacity, per contract. */
      createRatePerMinute: z.number().positive().optional(),
    })
    .passthrough()
    .optional(),
});

const transferSchema = z.object({
  toPrincipalId: principal,
  grantRoles: z.array(z.string().regex(/^roles\//)).min(1),
});

const mergeSchema = z.object({
  sourceTenantId: z.string().min(1),
  targetTenantId: z.string().min(1),
});

const splitSchema = z.object({
  bindingIds: z.array(z.string().min(1)).min(1),
  newTenant: createTenantSchema,
});

const advanceSchema = z.object({
  billingAccountId: z.string().min(6),
  parent: z.string().optional(),
  services: z.array(z.string()).optional(),
});

const runtimeIdentitySchema = z.object({
  app: z.string().min(1),
  environment: z.string().min(1),
  privilegeBoundary: z.string().min(1),
  gcpProjectId: z.string().min(6),
});

const projectIdentitySchema = z.object({ gcpProjectId: z.string().min(6) });

const impersonationSchema = z.object({
  actorPrincipal: principal,
  purpose: z.string().min(1),
  tokenLifetimeSeconds: z.number().int().positive(),
});

const shardSchema = z.object({ customersFolderName: z.string().regex(/^folders\/\d+$/) });

function parseBody<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new CloudTenantError('VALIDATION_FAILED', result.error.issues.map((i) => i.message).join('; '), 400);
  }

  return result.data;
}

function sendCloudTenantError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof CloudTenantError) {
    reply.code(error.statusCode).send({ error: error.message, code: error.code });

    return true;
  }

  return false;
}

export function registerCloudGovernanceRoutes(app: FastifyInstance, deps: CloudGovernanceRouteDeps): void {
  const requireEnabled = (reply: FastifyReply): { governance: CloudGovernanceStore; gcp: GcpCloudClient } | null => {
    if (!isCloudTenantFactoryEnabled()) {
      reply.code(503).send({
        error: 'CloudTenant factory is disabled (set CLOUD_TENANT_FACTORY_ENABLED=true)',
        code: 'CLOUD_TENANT_FACTORY_DISABLED',
      });

      return null;
    }

    if (!deps.governance || !deps.gcp) {
      reply.code(503).send({
        error: 'CloudTenant factory requires the Prisma-backed store and GCP credentials',
        code: 'CLOUD_TENANT_FACTORY_UNCONFIGURED',
      });

      return null;
    }

    return { governance: deps.governance, gcp: deps.gcp };
  };

  type Handler = (
    ctx: { governance: CloudGovernanceStore; gcp: GcpCloudClient },
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<unknown>;

  const route =
    (opts: { reauth?: boolean }, handler: Handler) => async (request: FastifyRequest, reply: FastifyReply) => {
      await deps.guardAdmin(request, opts);

      const ctx = requireEnabled(reply);

      if (!ctx) {
        return reply;
      }

      try {
        return await handler(ctx, request, reply);
      } catch (error) {
        if (sendCloudTenantError(reply, error)) {
          return reply;
        }

        throw error;
      }
    };

  // ── CloudTenant ──
  app.post(
    '/admin/cloud-tenants',
    route({}, async ({ governance }, request, reply) => {
      const body = parseBody(createTenantSchema, request.body ?? {});
      const tenant = await createCloudTenant(governance, body);

      await deps.audit(request, {
        action: 'admin.cloud_tenant.create',
        resourceType: 'cloudTenant',
        resourceId: tenant.id,
        metadata: { customerBoundaryType: tenant.customerBoundaryType },
      });

      return reply.code(201).send({ tenant });
    }),
  );

  app.get(
    '/admin/cloud-tenants/:id',
    route({}, async ({ governance }, request, reply) => {
      const { id } = request.params as { id: string };
      const tenant = await governance.getCloudTenant(id);

      if (!tenant) {
        return reply.code(404).send({ error: `CloudTenant ${id} not found`, code: 'TENANT_NOT_FOUND' });
      }

      return reply.send({ tenant });
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/bindings',
    route({}, async ({ governance }, request, reply) => {
      const { id } = request.params as { id: string };
      const body = parseBody(bindProjectSchema, request.body ?? {});
      const binding = await bindProjectToTenant(governance, {
        cloudTenantId: id,
        ...body,
        // zod passthrough objects are plain JSON at runtime; Prisma's
        // InputJsonValue is narrower than zod's inferred type.
        capacityPolicy: body.capacityPolicy as import('./cloud-governance-store.js').JsonValue | undefined,
      });

      await deps.audit(request, {
        action: 'admin.cloud_tenant.bind_project',
        resourceType: 'cloudProjectBinding',
        resourceId: binding.id,
        metadata: { gcpProjectId: binding.gcpProjectId, role: binding.role },
      });

      return reply.code(201).send({ binding });
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/transfer',
    route({ reauth: true }, async ({ governance, gcp }, request, reply) => {
      const { id } = request.params as { id: string };
      const body = parseBody(transferSchema, request.body ?? {});
      const result = await transferTenantOwnership(governance, gcp, { cloudTenantId: id, ...body });

      await deps.audit(request, {
        action: 'admin.cloud_tenant.transfer_ownership',
        resourceType: 'cloudTenant',
        resourceId: id,
        metadata: {
          transferId: result.transfer.id,
          fromPrincipalId: result.transfer.fromPrincipalId,
          toPrincipalId: result.transfer.toPrincipalId,
        },
      });

      return reply.send(result);
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/suspend',
    route({}, async ({ governance }, request, reply) => {
      const { id } = request.params as { id: string };
      const tenant = await suspendCloudTenant(governance, id);

      await deps.audit(request, { action: 'admin.cloud_tenant.suspend', resourceType: 'cloudTenant', resourceId: id });

      return reply.send({ tenant });
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/restore',
    route({}, async ({ governance }, request, reply) => {
      const { id } = request.params as { id: string };
      const tenant = await restoreCloudTenant(governance, id);

      await deps.audit(request, { action: 'admin.cloud_tenant.restore', resourceType: 'cloudTenant', resourceId: id });

      return reply.send({ tenant });
    }),
  );

  app.post(
    '/admin/cloud-tenants/merge',
    route({ reauth: true }, async ({ governance }, request, reply) => {
      const body = parseBody(mergeSchema, request.body ?? {});
      const result = await mergeCloudTenants(governance, body);

      await deps.audit(request, {
        action: 'admin.cloud_tenant.merge',
        resourceType: 'cloudTenant',
        resourceId: body.targetTenantId,
        metadata: { sourceTenantId: body.sourceTenantId },
      });

      return reply.send(result);
    }),
  );

  app.post(
    '/admin/cloud-tenants/:id/split',
    route({ reauth: true }, async ({ governance }, request, reply) => {
      const { id } = request.params as { id: string };
      const body = parseBody(splitSchema, request.body ?? {});
      const result = await splitCloudTenant(governance, { sourceTenantId: id, ...body });

      await deps.audit(request, {
        action: 'admin.cloud_tenant.split',
        resourceType: 'cloudTenant',
        resourceId: id,
        metadata: { createdTenantId: result.created.id, bindingIds: body.bindingIds },
      });

      return reply.send(result);
    }),
  );

  // ── Project Factory ──
  app.post(
    '/admin/cloud-project-bindings/:id/advance',
    route({}, async ({ governance, gcp }, request, reply) => {
      const { id } = request.params as { id: string };
      const body = parseBody(advanceSchema, request.body ?? {});
      const binding = await advanceCloudProjectBinding(governance, gcp, id, {
        ...body,
        actor: (request as { currentUser?: { email?: string } }).currentUser?.email,
      });

      await deps.audit(request, {
        action: 'admin.cloud_project.advance',
        resourceType: 'cloudProjectBinding',
        resourceId: id,
        metadata: { state: binding.state },
      });

      return reply.send({ binding });
    }),
  );

  app.get(
    '/admin/cloud-project-bindings/:id/events',
    route({}, async ({ governance }, request, reply) => {
      const { id } = request.params as { id: string };

      return reply.send({ events: await governance.listFactoryEvents(id) });
    }),
  );

  app.post(
    '/admin/cloud-project-bindings/:id/teardown/request',
    route({ reauth: true }, async ({ governance, gcp }, request, reply) => {
      const { id } = request.params as { id: string };
      const result = await requestTeardown(governance, gcp, id);

      await deps.audit(request, {
        action: 'admin.cloud_project.teardown_request',
        resourceType: 'cloudProjectBinding',
        resourceId: id,
        metadata: { teardownId: result.teardown.id },
      });

      return reply.send(result);
    }),
  );

  app.post(
    '/admin/cloud-project-bindings/:id/teardown/execute',
    route({ reauth: true }, async ({ governance, gcp }, request, reply) => {
      const { id } = request.params as { id: string };
      const binding = await executeTeardown(governance, gcp, id);

      await deps.audit(request, {
        action: 'admin.cloud_project.teardown_execute',
        resourceType: 'cloudProjectBinding',
        resourceId: id,
        metadata: { recoveryWindowEndsAt: binding.recoveryWindowEndsAt?.toISOString() },
      });

      return reply.send({ binding });
    }),
  );

  app.post(
    '/admin/cloud-teardowns/:id/verify',
    route({}, async ({ governance, gcp }, request, reply) => {
      const { id } = request.params as { id: string };
      const result = await verifyTeardown(governance, gcp, id);

      await deps.audit(request, {
        action: 'admin.cloud_project.teardown_verify',
        resourceType: 'cloudTeardownRecord',
        resourceId: id,
        metadata: { status: result.teardown.status, orphanCount: result.orphans.length },
      });

      return reply.send(result);
    }),
  );

  app.post(
    '/admin/cloud-project-bindings/:id/restore',
    route({ reauth: true }, async ({ governance, gcp }, request, reply) => {
      const { id } = request.params as { id: string };
      const binding = await restoreFromRecoveryWindow(governance, gcp, id);

      await deps.audit(request, {
        action: 'admin.cloud_project.restore',
        resourceType: 'cloudProjectBinding',
        resourceId: id,
      });

      return reply.send({ binding });
    }),
  );

  app.post(
    '/admin/cloud-project-bindings/:id/purge',
    route({ reauth: true }, async ({ governance }, request, reply) => {
      const { id } = request.params as { id: string };
      const binding = await markPurged(governance, id);

      await deps.audit(request, {
        action: 'admin.cloud_project.purge',
        resourceType: 'cloudProjectBinding',
        resourceId: id,
      });

      return reply.send({ binding });
    }),
  );

  app.post(
    '/admin/cloud-shards/resolve',
    route({}, async ({ governance, gcp }, request, reply) => {
      const body = parseBody(shardSchema, request.body ?? {});
      const shard = await resolveCustomerShardFolder(governance, gcp, body.customersFolderName);

      return reply.send({ shard });
    }),
  );

  // ── Platform IAM identities ──
  app.post(
    '/admin/iam-identities/runtime',
    route({}, async ({ governance, gcp }, request, reply) => {
      const body = parseBody(runtimeIdentitySchema, request.body ?? {});
      const result = await ensureRuntimeIdentity(governance, gcp, body);

      await deps.audit(request, {
        action: 'admin.iam_identity.ensure_runtime',
        resourceType: 'platformIamIdentity',
        resourceId: result.identity.id,
        metadata: { created: result.created, revisionsServed: result.identity.revisionsServed },
      });

      return reply.code(result.created ? 201 : 200).send(result);
    }),
  );

  app.post(
    '/admin/iam-identities/build',
    route({}, async ({ governance, gcp }, request, reply) => {
      const body = parseBody(projectIdentitySchema, request.body ?? {});
      const result = await ensureBuildIdentity(governance, gcp, body.gcpProjectId);

      await deps.audit(request, {
        action: 'admin.iam_identity.ensure_build',
        resourceType: 'platformIamIdentity',
        resourceId: result.identity.id,
        metadata: { created: result.created },
      });

      return reply.code(result.created ? 201 : 200).send(result);
    }),
  );

  app.post(
    '/admin/iam-identities/promotion',
    route({}, async ({ governance, gcp }, request, reply) => {
      const body = parseBody(projectIdentitySchema, request.body ?? {});
      const result = await ensurePromotionIdentity(governance, gcp, body.gcpProjectId);

      await deps.audit(request, {
        action: 'admin.iam_identity.ensure_promotion',
        resourceType: 'platformIamIdentity',
        resourceId: result.identity.id,
        metadata: { created: result.created },
      });

      return reply.code(result.created ? 201 : 200).send(result);
    }),
  );

  app.get(
    '/admin/iam-identities',
    route({}, async ({ governance }, request, reply) => {
      const query = request.query as { gcpProjectId?: string; kind?: string };

      return reply.send({
        identities: await governance.listPlatformIamIdentities({
          gcpProjectId: query.gcpProjectId,
          kind: query.kind as 'BUILD' | 'PROMOTION' | 'RUNTIME' | undefined,
        }),
      });
    }),
  );

  app.get(
    '/admin/iam-identities/separation',
    route({}, async ({ governance, gcp }, request, reply) => {
      const query = parseBody(projectIdentitySchema, request.query ?? {});
      const violations = await verifyIdentitySeparation(governance, gcp, query.gcpProjectId);

      return reply.send({ violations, separationHolds: violations.length === 0 });
    }),
  );

  app.post(
    '/admin/iam-identities/:id/impersonations',
    route({}, async ({ governance }, request, reply) => {
      const { id } = request.params as { id: string };
      const body = parseBody(impersonationSchema, request.body ?? {});
      await recordImpersonation(governance, { identityId: id, ...body });

      await deps.audit(request, {
        action: 'admin.iam_identity.impersonation',
        resourceType: 'platformIamIdentity',
        resourceId: id,
        metadata: { actorPrincipal: body.actorPrincipal, tokenLifetimeSeconds: body.tokenLifetimeSeconds },
      });

      return reply.code(201).send({ recorded: true });
    }),
  );

  app.get(
    '/admin/iam-identities/:id/impersonations',
    route({}, async ({ governance }, request, reply) => {
      const { id } = request.params as { id: string };

      return reply.send({ impersonations: await governance.listImpersonations(id) });
    }),
  );
}
