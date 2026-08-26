import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';
import { CloudGovernanceService } from '../cloud-governance-service.js';
import { CloudGovernanceError, PrismaCloudGovernanceStore } from '../cloud-governance-store.js';
import { FakeGcpCloudClient } from './helpers/fake-gcp-cloud-client.js';

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) return false;
  const prisma = createDatabaseClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function seedActor(prisma: ReturnType<typeof createDatabaseClient>) {
  return prisma.user.create({
    data: { email: `cloud-admin-${suffix()}@example.com`, name: 'Cloud Admin', platformAdmin: true },
  });
}

async function seedOrganizationProject(prisma: ReturnType<typeof createDatabaseClient>, label: string) {
  const token = suffix();
  const organization = await prisma.organization.create({
    data: { name: `${label} ${token}`, slug: `${label}-${token}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: organization.id, name: `${label} project`, slug: `project-${token}` },
  });
  return { organization, project };
}

function mutation(actorUserId: string, key: string) {
  return { actorUserId, idempotencyKey: `${key}-${suffix()}` };
}

async function seedTenantBinding(input: {
  prisma: ReturnType<typeof createDatabaseClient>;
  store: PrismaCloudGovernanceStore;
  actorUserId: string;
  label: string;
  gcpProjectId: string;
  owner: string;
  billingAccountId?: string;
  role?: 'PRIMARY' | 'QUOTA_SHARD';
}) {
  const { organization, project } = await seedOrganizationProject(input.prisma, input.label);
  const created = await input.store.createTenant({
    context: mutation(input.actorUserId, `create-${input.label}`),
    organizationId: organization.id,
    customerBoundaryType: 'WORKSPACE',
    ownerPrincipalId: input.owner,
    billingPrincipalId: input.owner,
    billingAccountId: input.billingAccountId ?? 'AAAAAA-BBBBBB-CCCCCC',
    residencyPolicy: 'eu',
  });
  const bound = await input.store.bindProject({
    context: mutation(input.actorUserId, `bind-${input.label}`),
    tenantId: created.tenant.id,
    expectedTenantVersion: created.tenant.version,
    projectId: project.id,
    gcpProjectId: input.gcpProjectId,
    role: input.role ?? 'PRIMARY',
    region: 'europe-west1',
    parentFolderId: 'folders/123456',
  });
  const binding = await input.prisma.cloudProjectBinding.update({
    where: { id: bound.binding.id },
    data: { state: 'ACTIVE' },
  });
  return {
    organization,
    project,
    tenant: await input.prisma.cloudTenant.findUniqueOrThrow({ where: { id: created.tenant.id } }),
    binding,
  };
}

async function cleanup(prisma: ReturnType<typeof createDatabaseClient>, actorUserId: string) {
  const operations = await prisma.cloudOperation.findMany({ where: { actorUserId }, select: { id: true } });
  const operationIds = operations.map((operation) => operation.id);
  const tenants = await prisma.cloudTenant.findMany({
    where: {
      OR: [{ operations: { some: { actorUserId } } }, { relatedOperations: { some: { actorUserId } } }],
    },
    select: { id: true, organizationId: true },
  });
  const tenantIds = tenants.map((tenant) => tenant.id);
  const organizationIds = tenants.map((tenant) => tenant.organizationId).filter((id): id is string => Boolean(id));
  const bindings = await prisma.cloudProjectBinding.findMany({
    where: { cloudTenantId: { in: tenantIds } },
    select: { id: true },
  });
  const bindingIds = bindings.map((binding) => binding.id);

  await prisma.cloudOperationEvent.deleteMany({ where: { operationId: { in: operationIds } } });
  await prisma.cloudTenantTransfer.deleteMany({ where: { operationId: { in: operationIds } } });
  await prisma.cloudProjectFactoryEvent.deleteMany({ where: { bindingId: { in: bindingIds } } });
  await prisma.cloudTeardownRecord.deleteMany({ where: { bindingId: { in: bindingIds } } });
  await prisma.cloudOperation.deleteMany({ where: { id: { in: operationIds } } });
  await prisma.platformIamImpersonationAudit.deleteMany({ where: { identity: { bindingId: { in: bindingIds } } } });
  await prisma.platformIamIdentity.deleteMany({ where: { bindingId: { in: bindingIds } } });
  await prisma.cloudProjectBinding.deleteMany({ where: { id: { in: bindingIds } } });
  await prisma.cloudTenant.updateMany({
    where: { id: { in: tenantIds } },
    data: { mergedIntoTenantId: null, splitFromTenantId: null },
  });
  await prisma.cloudTenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.project.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.delete({ where: { id: actorUserId } }).catch(() => undefined);
}

runDbTests('CloudTenant control plane — real PostgreSQL, fencing and recovery', () => {
  it('replays idempotently and enforces project isolation under two independent clients', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const actor = await seedActor(prismaA);
    try {
      const storeA = new PrismaCloudGovernanceStore(prismaA);
      const storeB = new PrismaCloudGovernanceStore(prismaB);
      const a = await seedOrganizationProject(prismaA, 'isolation-a');
      const b = await seedOrganizationProject(prismaA, 'isolation-b');
      const createContext = mutation(actor.id, 'tenant-replay');
      const first = await storeA.createTenant({
        context: createContext,
        organizationId: a.organization.id,
        customerBoundaryType: 'WORKSPACE',
        ownerPrincipalId: 'user:owner-a@example.com',
        billingPrincipalId: 'group:billing-a@example.com',
        billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
        residencyPolicy: 'eu',
      });
      const replay = await storeB.createTenant({
        context: createContext,
        organizationId: a.organization.id,
        customerBoundaryType: 'WORKSPACE',
        ownerPrincipalId: 'user:owner-a@example.com',
        billingPrincipalId: 'group:billing-a@example.com',
        billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
        residencyPolicy: 'eu',
      });
      expect(replay.replayed).toBe(true);
      expect(replay.tenant.id).toBe(first.tenant.id);
      await expect(
        storeA.createTenant({
          context: createContext,
          organizationId: a.organization.id,
          customerBoundaryType: 'WORKSPACE',
          ownerPrincipalId: 'user:different@example.com',
          billingPrincipalId: 'group:billing-a@example.com',
          billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
          residencyPolicy: 'eu',
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

      const second = await storeA.createTenant({
        context: mutation(actor.id, 'tenant-b'),
        organizationId: b.organization.id,
        customerBoundaryType: 'WORKSPACE',
        ownerPrincipalId: 'user:owner-b@example.com',
        billingPrincipalId: 'group:billing-b@example.com',
        billingAccountId: 'DDDDDD-EEEEEE-FFFFFF',
        residencyPolicy: 'eu',
      });
      const raced = await Promise.allSettled([
        storeA.bindProject({
          context: mutation(actor.id, 'binding-a'),
          tenantId: first.tenant.id,
          expectedTenantVersion: first.tenant.version,
          projectId: a.project.id,
          gcpProjectId: 'shared-project-123',
          role: 'PRIMARY',
          region: 'europe-west1',
          parentFolderId: 'folders/123456',
        }),
        storeB.bindProject({
          context: mutation(actor.id, 'binding-b'),
          tenantId: second.tenant.id,
          expectedTenantVersion: second.tenant.version,
          projectId: b.project.id,
          gcpProjectId: 'shared-project-123',
          role: 'PRIMARY',
          region: 'europe-west1',
          parentFolderId: 'folders/123456',
        }),
      ]);
      expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(raced.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(await prismaA.cloudProjectBinding.count({ where: { gcpProjectId: 'shared-project-123' } })).toBe(1);
    } finally {
      await cleanup(prismaA, actor.id);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('uses the DB clock and fencing so an expired owner cannot renew or checkpoint', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const actor = await seedActor(prismaA);
    try {
      const storeA = new PrismaCloudGovernanceStore(prismaA);
      const storeB = new PrismaCloudGovernanceStore(prismaB);
      const seeded = await seedTenantBinding({
        prisma: prismaA,
        store: storeA,
        actorUserId: actor.id,
        label: 'lease',
        gcpProjectId: 'lease-project-123',
        owner: 'user:lease-owner@example.com',
      });
      const started = await storeA.beginTransfer({
        context: mutation(actor.id, 'lease-transfer'),
        tenantId: seeded.tenant.id,
        expectedOwnershipVersion: seeded.tenant.ownershipVersion,
        toPrincipalId: 'user:new-owner@example.com',
        grantRoles: ['roles/viewer'],
      });
      // A fresh PENDING operation is immediately claimable even if two DB
      // connections observe a small backwards clock step. nextAttemptAt gates
      // only WAITING retries, never first execution.
      await prismaA.$executeRaw`
        UPDATE "CloudOperation" SET "nextAttemptAt" = NOW() + INTERVAL '10 seconds'
        WHERE "id" = ${started.operation.id}
      `;
      const first = await storeA.claimOperation(started.operation.id, 'worker-a', 60);
      expect(first?.fence).toBe(1);
      await prismaA.$executeRaw`
        UPDATE "CloudOperation" SET "leaseExpiresAt" = NOW() - INTERVAL '1 second'
        WHERE "id" = ${started.operation.id}
      `;
      await expect(storeA.renewOperationLease(started.operation.id, 'worker-a', first!.fence, 60)).resolves.toBe(false);
      const second = await storeB.claimOperation(started.operation.id, 'worker-b', 60);
      expect(second?.fence).toBe(2);
      await expect(storeA.prepareOperationForResume(started.operation.id)).rejects.toMatchObject({
        code: 'OPERATION_ALREADY_RUNNING',
      });
      await expect(
        storeA.checkpointOperation({
          id: started.operation.id,
          owner: 'worker-a',
          fence: first!.fence,
          step: 'STALE',
          checkpoint: {},
          eventType: 'STALE',
        }),
      ).rejects.toMatchObject({ code: 'OPERATION_LEASE_LOST' });
      await storeB.failOperation({
        id: started.operation.id,
        owner: 'worker-b',
        fence: second!.fence,
        error: new Error('operator intervention required'),
        retryable: false,
      });
      expect((await storeA.getOperation(started.operation.id))?.status).toBe('FAILED');
      await storeA.prepareOperationForResume(started.operation.id);
      const resumed = await storeA.claimOperation(started.operation.id, 'worker-c', 60);
      expect(resumed?.fence).toBe(3);
    } finally {
      await cleanup(prismaA, actor.id);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('runs the Project Factory to ACTIVE through durable one-step operations', async () => {
    const prisma = createDatabaseClient();
    const actor = await seedActor(prisma);
    try {
      const store = new PrismaCloudGovernanceStore(prisma);
      const fake = new FakeGcpCloudClient();
      const service = new CloudGovernanceService(store, fake, { workerId: 'factory-test' });
      const product = await seedOrganizationProject(prisma, 'factory');
      const tenantResult = await store.createTenant({
        context: mutation(actor.id, 'factory-tenant'),
        organizationId: product.organization.id,
        customerBoundaryType: 'WORKSPACE',
        ownerPrincipalId: 'user:factory-owner@example.com',
        billingPrincipalId: 'group:factory-billing@example.com',
        billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
        residencyPolicy: 'eu',
      });
      const bindingResult = await store.bindProject({
        context: mutation(actor.id, 'factory-binding'),
        tenantId: tenantResult.tenant.id,
        expectedTenantVersion: tenantResult.tenant.version,
        projectId: product.project.id,
        gcpProjectId: 'factory-project-123',
        role: 'PRIMARY',
        region: 'europe-west1',
        parentFolderId: 'folders/123456',
      });

      let binding = bindingResult.binding;
      for (let index = 0; index < 7; index += 1) {
        const started = await service.startProjectAdvance({
          context: mutation(actor.id, `factory-step-${index}`),
          bindingId: binding.id,
          expectedBindingVersion: binding.version,
        });
        const operation = await service.executeOperation(started.operation.id);
        expect(operation.status).toBe('SUCCEEDED');
        binding = await prisma.cloudProjectBinding.findUniqueOrThrow({ where: { id: binding.id } });
      }
      expect(binding.state).toBe('ACTIVE');
      expect(binding.gcpProjectNumber).toBeTruthy();
      const project = fake.projects.get(binding.gcpProjectId)!;
      expect(project.billingAccountName).toBe('billingAccounts/AAAAAA-BBBBBB-CCCCCC');
      expect([...project.services]).toEqual(expect.arrayContaining(['iam.googleapis.com', 'storage.googleapis.com']));
      expect(project.policy.bindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'roles/viewer', members: ['user:factory-owner@example.com'] }),
        ]),
      );
      expect(await prisma.cloudProjectFactoryEvent.count({ where: { bindingId: binding.id } })).toBe(7);
    } finally {
      await cleanup(prisma, actor.id);
      await prisma.$disconnect();
    }
  });

  it('inventories, deletes, verifies and purges only through the durable teardown states', async () => {
    const prisma = createDatabaseClient();
    const actor = await seedActor(prisma);
    try {
      const store = new PrismaCloudGovernanceStore(prisma);
      const fake = new FakeGcpCloudClient();
      const service = new CloudGovernanceService(store, fake, { workerId: 'teardown-test' });
      const seeded = await seedTenantBinding({
        prisma,
        store,
        actorUserId: actor.id,
        label: 'teardown',
        gcpProjectId: 'teardown-project-123',
        owner: 'user:teardown-owner@example.com',
      });
      const project = fake.seedProject({
        projectId: seeded.binding.gcpProjectId,
        owner: seeded.tenant.ownerPrincipalId,
        ownerRoles: ['roles/viewer'],
        billingAccountId: seeded.tenant.billingAccountId,
      });
      project.buckets.add('teardown-bucket-a');
      fake.addServiceAccount(
        seeded.binding.gcpProjectId,
        `runtime@${seeded.binding.gcpProjectId}.iam.gserviceaccount.com`,
      );
      project.services.add('storage.googleapis.com');

      const request = await service.startTeardownRequest({
        context: mutation(actor.id, 'teardown-request'),
        bindingId: seeded.binding.id,
        expectedBindingVersion: seeded.binding.version,
      });
      expect((await service.executeOperation(request.operation.id)).status).toBe('SUCCEEDED');
      let binding = await prisma.cloudProjectBinding.findUniqueOrThrow({ where: { id: seeded.binding.id } });
      const teardown = await prisma.cloudTeardownRecord.findFirstOrThrow({ where: { bindingId: binding.id } });
      expect(binding.state).toBe('DELETE_REQUESTED');
      expect(teardown.resourceInventory).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'bucket', name: 'teardown-bucket-a' })]),
      );

      const execute = await service.startTeardownExecution({
        context: mutation(actor.id, 'teardown-execute'),
        bindingId: binding.id,
        expectedBindingVersion: binding.version,
      });
      expect((await service.executeOperation(execute.operation.id)).status).toBe('SUCCEEDED');
      binding = await prisma.cloudProjectBinding.findUniqueOrThrow({ where: { id: binding.id } });
      expect(binding.state).toBe('RECOVERY_WINDOW');
      expect(project.state).toBe('DELETE_REQUESTED');
      expect(project.buckets.size).toBe(0);

      const verify = await service.startTeardownVerification({
        context: mutation(actor.id, 'teardown-verify'),
        bindingId: binding.id,
        expectedBindingVersion: binding.version,
        teardownId: teardown.id,
      });
      expect((await service.executeOperation(verify.operation.id)).status).toBe('SUCCEEDED');
      expect(await prisma.cloudTeardownRecord.findUnique({ where: { id: teardown.id } })).toMatchObject({
        status: 'COMPLETE',
      });

      await prisma.$executeRaw`
        UPDATE "CloudProjectBinding" SET "recoveryWindowEndsAt" = NOW() - INTERVAL '1 second'
        WHERE "id" = ${binding.id}
      `;
      const purge = await service.startProjectPurge({
        context: mutation(actor.id, 'teardown-purge'),
        bindingId: binding.id,
        expectedBindingVersion: binding.version,
      });
      const premature = await service.executeOperation(purge.operation.id);
      expect(premature).toMatchObject({ status: 'WAITING', lastErrorCode: 'PROJECT_PURGE_PENDING' });
      expect(await prisma.cloudProjectBinding.findUnique({ where: { id: binding.id } })).toMatchObject({
        state: 'RECOVERY_WINDOW',
      });
      fake.finalizeProjectDeletion(binding.gcpProjectId);
      await prisma.cloudOperation.update({ where: { id: purge.operation.id }, data: { nextAttemptAt: new Date(0) } });
      expect((await service.executeOperation(purge.operation.id)).status).toBe('SUCCEEDED');
      expect(await prisma.cloudProjectBinding.findUnique({ where: { id: binding.id } })).toMatchObject({
        state: 'PURGED',
      });
    } finally {
      await cleanup(prisma, actor.id);
      await prisma.$disconnect();
    }
  });

  it('keeps suspend ACTIVE through a mid-saga failure, then resumes and restores with verified IAM/billing', async () => {
    const prisma = createDatabaseClient();
    const actor = await seedActor(prisma);
    try {
      const store = new PrismaCloudGovernanceStore(prisma);
      const fake = new FakeGcpCloudClient();
      const service = new CloudGovernanceService(store, fake, { workerId: 'suspend-test' });
      const seeded = await seedTenantBinding({
        prisma,
        store,
        actorUserId: actor.id,
        label: 'suspend',
        gcpProjectId: 'suspend-project-123',
        owner: 'user:suspend-owner@example.com',
      });
      const project = fake.seedProject({
        projectId: seeded.binding.gcpProjectId,
        owner: seeded.tenant.ownerPrincipalId,
        ownerRoles: ['roles/viewer'],
        billingAccountId: seeded.tenant.billingAccountId,
      });
      const identity = await prisma.platformIamIdentity.create({
        data: {
          bindingId: seeded.binding.id,
          kind: 'RUNTIME',
          app: 'app',
          environment: 'production',
          privilegeBoundary: 'default',
          gcpProjectId: seeded.binding.gcpProjectId,
          gcpServiceAccountEmail: `runtime@${seeded.binding.gcpProjectId}.iam.gserviceaccount.com`,
        },
      });
      fake.addServiceAccount(seeded.binding.gcpProjectId, identity.gcpServiceAccountEmail);
      fake.failOnCall('getProjectBillingInfo', 2);

      const started = await service.changeTenantLifecycle({
        context: mutation(actor.id, 'suspend-saga'),
        tenantId: seeded.tenant.id,
        expectedVersion: seeded.tenant.version,
        to: 'SUSPENDED',
        reason: 'security incident',
      });
      const failedAttempt = await service.executeOperation(started.operation.id);
      expect(failedAttempt.status).toBe('WAITING');
      expect((await prisma.cloudTenant.findUniqueOrThrow({ where: { id: seeded.tenant.id } })).lifecycle).toBe(
        'ACTIVE',
      );
      expect(failedAttempt.checkpoint).toMatchObject({
        evidence: [expect.objectContaining({ bindingId: seeded.binding.id })],
      });

      // Simulate drift after a durable per-binding checkpoint. A resumed worker
      // must reconverge this binding instead of trusting the stale completed id.
      const suspendedProject = fake.projects.get(seeded.binding.gcpProjectId)!;
      suspendedProject.billingAccountName = `billingAccounts/${seeded.tenant.billingAccountId}`;
      suspendedProject.policy = {
        ...suspendedProject.policy,
        bindings: [{ role: 'roles/viewer', members: [seeded.tenant.ownerPrincipalId] }],
      };
      await prisma.cloudOperation.update({
        where: { id: started.operation.id },
        data: {
          checkpoint: {
            ...(failedAttempt.checkpoint as Record<string, unknown>),
            completed: [seeded.binding.id],
          },
        },
      });

      await prisma.cloudOperation.update({ where: { id: started.operation.id }, data: { nextAttemptAt: new Date(0) } });
      const workerPass = await service.executeDueOperations(10);
      expect(workerPass).toMatchObject({ attempted: 1, succeeded: 1 });
      const suspended = await prisma.cloudOperation.findUniqueOrThrow({ where: { id: started.operation.id } });
      expect(suspended.status).toBe('SUCCEEDED');
      const tenant = await prisma.cloudTenant.findUniqueOrThrow({ where: { id: seeded.tenant.id } });
      expect(tenant.lifecycle).toBe('SUSPENDED');
      expect(project.billingAccountName).toBeUndefined();
      expect(project.policy.bindings?.some((binding) => binding.members.includes(seeded.tenant.ownerPrincipalId))).toBe(
        false,
      );
      expect(
        (await fake.getServiceAccount(seeded.binding.gcpProjectId, identity.gcpServiceAccountEmail))?.disabled,
      ).toBe(true);
      expect(await prisma.platformIamIdentity.findUniqueOrThrow({ where: { id: identity.id } })).toMatchObject({
        complianceStatus: 'DISABLED',
      });

      const restoreContext = mutation(actor.id, 'restore-saga');
      const restore = await service.changeTenantLifecycle({
        context: restoreContext,
        tenantId: tenant.id,
        expectedVersion: tenant.version,
        to: 'ACTIVE',
      });
      fake.setUserManagedKeyCount(seeded.binding.gcpProjectId, identity.gcpServiceAccountEmail, 1);
      const blockedRestore = await service.executeOperation(restore.operation.id);
      expect(blockedRestore).toMatchObject({ status: 'WAITING', lastErrorCode: 'IAM_PERSISTENT_KEY_FORBIDDEN' });
      expect((await prisma.cloudTenant.findUniqueOrThrow({ where: { id: tenant.id } })).lifecycle).toBe('SUSPENDED');
      expect(
        (await fake.getServiceAccount(seeded.binding.gcpProjectId, identity.gcpServiceAccountEmail))?.disabled,
      ).toBe(true);

      fake.setUserManagedKeyCount(seeded.binding.gcpProjectId, identity.gcpServiceAccountEmail, 0);
      await prisma.cloudOperation.update({
        where: { id: restore.operation.id },
        data: { checkpoint: { completed: [seeded.binding.id] } },
      });
      await prisma.cloudOperation.update({ where: { id: restore.operation.id }, data: { nextAttemptAt: new Date(0) } });
      const restoreWorkerPass = await service.executeDueOperations(10);
      expect(restoreWorkerPass).toMatchObject({ attempted: 1, succeeded: 1 });
      const restored = await prisma.cloudOperation.findUniqueOrThrow({ where: { id: restore.operation.id } });
      expect(restored.status).toBe('SUCCEEDED');
      expect((await prisma.cloudTenant.findUniqueOrThrow({ where: { id: tenant.id } })).lifecycle).toBe('ACTIVE');
      expect(project.billingAccountName).toBe(`billingAccounts/${seeded.tenant.billingAccountId}`);
      expect(project.policy.bindings).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: 'roles/viewer' })]),
      );
      expect(
        (await fake.getServiceAccount(seeded.binding.gcpProjectId, identity.gcpServiceAccountEmail))?.disabled,
      ).toBe(false);
      expect(await prisma.platformIamIdentity.findUniqueOrThrow({ where: { id: identity.id } })).toMatchObject({
        complianceStatus: 'COMPLIANT',
      });

      const linkCalls = fake.callCount('linkProjectBilling');
      const replay = await service.changeTenantLifecycle({
        context: restoreContext,
        tenantId: tenant.id,
        expectedVersion: tenant.version,
        to: 'ACTIVE',
      });
      await service.executeOperation(replay.operation.id);
      expect(fake.callCount('linkProjectBilling')).toBe(linkCalls);
    } finally {
      await cleanup(prisma, actor.id);
      await prisma.$disconnect();
    }
  });

  it('recovers an IAM-to-DB ownership transfer gap without exposing a false owner', async () => {
    const prisma = createDatabaseClient();
    const actor = await seedActor(prisma);
    try {
      const store = new PrismaCloudGovernanceStore(prisma);
      const fake = new FakeGcpCloudClient();
      const service = new CloudGovernanceService(store, fake, { workerId: 'transfer-test' });
      const seeded = await seedTenantBinding({
        prisma,
        store,
        actorUserId: actor.id,
        label: 'transfer',
        gcpProjectId: 'transfer-project-123',
        owner: 'user:old-owner@example.com',
      });
      fake.seedProject({
        projectId: seeded.binding.gcpProjectId,
        owner: seeded.tenant.ownerPrincipalId,
        ownerRoles: ['roles/viewer'],
        billingAccountId: seeded.tenant.billingAccountId,
      });
      await expect(
        service.startTransfer({
          context: mutation(actor.id, 'ownership-transfer-forbidden'),
          tenantId: seeded.tenant.id,
          expectedOwnershipVersion: seeded.tenant.ownershipVersion,
          toPrincipalId: 'user:privileged-owner@example.com',
          grantRoles: ['roles/owner'],
        }),
      ).rejects.toMatchObject({ code: 'TENANT_PRINCIPAL_ROLE_FORBIDDEN' });
      // get #1 inventories, set revokes, get #2 is the live verification.
      fake.failOnCall('getProjectIamPolicy', 2);
      const started = await service.startTransfer({
        context: mutation(actor.id, 'ownership-transfer'),
        tenantId: seeded.tenant.id,
        expectedOwnershipVersion: seeded.tenant.ownershipVersion,
        toPrincipalId: 'user:new-owner@example.com',
        grantRoles: ['roles/viewer'],
      });
      const interrupted = await service.executeOperation(started.operation.id);
      expect(interrupted.status).toBe('WAITING');
      expect((await prisma.cloudTenant.findUniqueOrThrow({ where: { id: seeded.tenant.id } })).ownerPrincipalId).toBe(
        seeded.tenant.ownerPrincipalId,
      );

      // Model a crash after both durable checkpoints, followed by out-of-band
      // IAM drift. Replay must revoke/regrant again and enforce the exact safe role.
      const transferProject = fake.projects.get(seeded.binding.gcpProjectId)!;
      transferProject.policy = {
        ...transferProject.policy,
        bindings: [
          { role: 'roles/viewer', members: [seeded.tenant.ownerPrincipalId] },
          { role: 'roles/owner', members: ['user:new-owner@example.com'] },
        ],
      };
      await prisma.cloudTenantTransfer.update({
        where: { operationId: started.operation.id },
        data: { state: 'REGRANTING', revokeVerifiedAt: new Date() },
      });
      await prisma.cloudOperation.update({
        where: { id: started.operation.id },
        data: {
          checkpoint: {
            revokeDone: [seeded.binding.id],
            grantDone: [seeded.binding.id],
          },
        },
      });

      await prisma.cloudOperation.update({ where: { id: started.operation.id }, data: { nextAttemptAt: new Date(0) } });
      const completed = await service.executeOperation(started.operation.id);
      expect(completed.status).toBe('SUCCEEDED');
      const tenant = await prisma.cloudTenant.findUniqueOrThrow({ where: { id: seeded.tenant.id } });
      expect(tenant.ownerPrincipalId).toBe('user:new-owner@example.com');
      expect(tenant.ownershipVersion).toBe(seeded.tenant.ownershipVersion + 1);
      const policy = await fake.getProjectIamPolicy(seeded.binding.gcpProjectId);
      expect(policy.bindings?.some((binding) => binding.members.includes(seeded.tenant.ownerPrincipalId))).toBe(false);
      expect(policy.bindings?.some((binding) => binding.members.includes('user:new-owner@example.com'))).toBe(true);
      expect(
        policy.bindings
          ?.filter((binding) => binding.members.includes('user:new-owner@example.com'))
          .map((binding) => binding.role),
      ).toEqual(['roles/viewer']);
    } finally {
      await cleanup(prisma, actor.id);
      await prisma.$disconnect();
    }
  });

  it('keeps merge topology unchanged until the target IAM and billing boundary is verified', async () => {
    const prisma = createDatabaseClient();
    const actor = await seedActor(prisma);
    try {
      const store = new PrismaCloudGovernanceStore(prisma);
      const fake = new FakeGcpCloudClient();
      const service = new CloudGovernanceService(store, fake, { workerId: 'merge-test' });
      const source = await seedTenantBinding({
        prisma,
        store,
        actorUserId: actor.id,
        label: 'merge-source',
        gcpProjectId: 'merge-source-project',
        owner: 'user:merge-source@example.com',
        billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
      });
      const target = await seedTenantBinding({
        prisma,
        store,
        actorUserId: actor.id,
        label: 'merge-target',
        gcpProjectId: 'merge-target-project',
        owner: 'user:merge-target@example.com',
        billingAccountId: 'DDDDDD-EEEEEE-FFFFFF',
      });
      fake.seedProject({
        projectId: source.binding.gcpProjectId,
        owner: source.tenant.ownerPrincipalId,
        ownerRoles: ['roles/viewer'],
        billingAccountId: source.tenant.billingAccountId,
      });
      fake.seedProject({
        projectId: target.binding.gcpProjectId,
        owner: target.tenant.ownerPrincipalId,
        ownerRoles: ['roles/viewer'],
        billingAccountId: target.tenant.billingAccountId,
      });
      fake.failOnCall('getProjectBillingInfo', 1);

      const started = await service.mergeTenants({
        context: mutation(actor.id, 'merge-saga'),
        sourceTenantId: source.tenant.id,
        sourceVersion: source.tenant.version,
        targetTenantId: target.tenant.id,
        targetVersion: target.tenant.version,
        grantRoles: ['roles/viewer'],
      });
      const interrupted = await service.executeOperation(started.operation.id);
      expect(interrupted.status).toBe('WAITING');
      expect((await prisma.cloudTenant.findUniqueOrThrow({ where: { id: source.tenant.id } })).lifecycle).toBe(
        'ACTIVE',
      );
      expect(
        (await prisma.cloudProjectBinding.findUniqueOrThrow({ where: { id: source.binding.id } })).cloudTenantId,
      ).toBe(source.tenant.id);
      expect((await prisma.project.findUniqueOrThrow({ where: { id: source.project.id } })).organizationId).toBe(
        source.organization.id,
      );

      const sourceCloudProject = fake.projects.get(source.binding.gcpProjectId)!;
      sourceCloudProject.billingAccountName = `billingAccounts/${source.tenant.billingAccountId}`;
      sourceCloudProject.policy = {
        ...sourceCloudProject.policy,
        bindings: [
          { role: 'roles/viewer', members: [source.tenant.ownerPrincipalId] },
          { role: 'roles/owner', members: [target.tenant.ownerPrincipalId] },
        ],
      };
      await prisma.cloudOperation.update({
        where: { id: started.operation.id },
        data: { checkpoint: { completed: [source.binding.id] } },
      });

      await prisma.cloudOperation.update({ where: { id: started.operation.id }, data: { nextAttemptAt: new Date(0) } });
      const completed = await service.executeOperation(started.operation.id);
      expect(completed.status).toBe('SUCCEEDED');
      expect((await prisma.cloudTenant.findUniqueOrThrow({ where: { id: source.tenant.id } })).lifecycle).toBe(
        'MERGED',
      );
      expect(
        (await prisma.cloudProjectBinding.findUniqueOrThrow({ where: { id: source.binding.id } })).cloudTenantId,
      ).toBe(target.tenant.id);
      expect((await prisma.project.findUniqueOrThrow({ where: { id: source.project.id } })).organizationId).toBe(
        target.organization.id,
      );
      const policy = await fake.getProjectIamPolicy(source.binding.gcpProjectId);
      expect(policy.bindings?.some((binding) => binding.members.includes(source.tenant.ownerPrincipalId))).toBe(false);
      expect(policy.bindings?.some((binding) => binding.members.includes(target.tenant.ownerPrincipalId))).toBe(true);
      expect(
        policy.bindings
          ?.filter((binding) => binding.members.includes(target.tenant.ownerPrincipalId))
          .map((binding) => binding.role),
      ).toEqual(['roles/viewer']);
      expect(fake.projects.get(source.binding.gcpProjectId)?.billingAccountName).toBe(
        `billingAccounts/${target.tenant.billingAccountId}`,
      );
    } finally {
      await cleanup(prisma, actor.id);
      await prisma.$disconnect();
    }
  });

  it('does not move split topology until new owner IAM and billing are verified', async () => {
    const prisma = createDatabaseClient();
    const actor = await seedActor(prisma);
    try {
      const store = new PrismaCloudGovernanceStore(prisma);
      const fake = new FakeGcpCloudClient();
      const service = new CloudGovernanceService(store, fake, { workerId: 'split-test' });
      const first = await seedTenantBinding({
        prisma,
        store,
        actorUserId: actor.id,
        label: 'split-source',
        gcpProjectId: 'split-project-one',
        owner: 'user:split-old@example.com',
      });
      const secondProduct = await prisma.project.create({
        data: {
          organizationId: first.organization.id,
          name: 'Second split project',
          slug: `second-${suffix()}`,
        },
      });
      const secondBindingResult = await store.bindProject({
        context: mutation(actor.id, 'split-second-binding'),
        tenantId: first.tenant.id,
        expectedTenantVersion: first.tenant.version,
        projectId: secondProduct.id,
        gcpProjectId: 'split-project-two',
        role: 'QUOTA_SHARD',
        region: 'europe-west1',
        parentFolderId: 'folders/123456',
      });
      const secondBinding = await prisma.cloudProjectBinding.update({
        where: { id: secondBindingResult.binding.id },
        data: { state: 'ACTIVE' },
      });
      const currentSource = await prisma.cloudTenant.findUniqueOrThrow({ where: { id: first.tenant.id } });
      const destination = await seedOrganizationProject(prisma, 'split-destination');
      fake.seedProject({
        projectId: secondBinding.gcpProjectId,
        owner: currentSource.ownerPrincipalId,
        ownerRoles: ['roles/viewer'],
        billingAccountId: currentSource.billingAccountId,
      });
      fake.failOnCall('getProjectBillingInfo', 1);

      const started = await service.splitTenant({
        context: mutation(actor.id, 'split-saga'),
        sourceTenantId: currentSource.id,
        sourceVersion: currentSource.version,
        bindingIds: [secondBinding.id],
        newOrganizationId: destination.organization.id,
        grantRoles: ['roles/viewer'],
        newTenant: {
          customerBoundaryType: 'WORKSPACE',
          ownerPrincipalId: 'user:split-new@example.com',
          billingPrincipalId: 'group:split-billing@example.com',
          billingAccountId: 'DDDDDD-EEEEEE-FFFFFF',
          residencyPolicy: 'eu',
        },
      });
      expect(started.created?.lifecycle).toBe('PROVISIONING');
      const interrupted = await service.executeOperation(started.operation.id);
      expect(interrupted.status).toBe('WAITING');
      expect(
        (await prisma.cloudProjectBinding.findUniqueOrThrow({ where: { id: secondBinding.id } })).cloudTenantId,
      ).toBe(currentSource.id);
      expect((await prisma.project.findUniqueOrThrow({ where: { id: secondProduct.id } })).organizationId).toBe(
        first.organization.id,
      );

      const splitCloudProject = fake.projects.get(secondBinding.gcpProjectId)!;
      splitCloudProject.billingAccountName = `billingAccounts/${currentSource.billingAccountId}`;
      splitCloudProject.policy = {
        ...splitCloudProject.policy,
        bindings: [
          { role: 'roles/viewer', members: [currentSource.ownerPrincipalId] },
          { role: 'roles/owner', members: ['user:split-new@example.com'] },
        ],
      };
      await prisma.cloudOperation.update({
        where: { id: started.operation.id },
        data: { checkpoint: { completed: [secondBinding.id] } },
      });

      await prisma.cloudOperation.update({ where: { id: started.operation.id }, data: { nextAttemptAt: new Date(0) } });
      const completed = await service.executeOperation(started.operation.id);
      expect(completed.status).toBe('SUCCEEDED');
      const destinationTenant = await prisma.cloudTenant.findUniqueOrThrow({
        where: { organizationId: destination.organization.id },
      });
      expect(destinationTenant.lifecycle).toBe('ACTIVE');
      expect(
        (await prisma.cloudProjectBinding.findUniqueOrThrow({ where: { id: secondBinding.id } })).cloudTenantId,
      ).toBe(destinationTenant.id);
      expect((await prisma.project.findUniqueOrThrow({ where: { id: secondProduct.id } })).organizationId).toBe(
        destination.organization.id,
      );
      const policy = await fake.getProjectIamPolicy(secondBinding.gcpProjectId);
      expect(policy.bindings?.some((binding) => binding.members.includes('user:split-new@example.com'))).toBe(true);
      expect(
        policy.bindings
          ?.filter((binding) => binding.members.includes('user:split-new@example.com'))
          .map((binding) => binding.role),
      ).toEqual(['roles/viewer']);
      expect(fake.projects.get(secondBinding.gcpProjectId)?.billingAccountName).toBe(
        'billingAccounts/DDDDDD-EEEEEE-FFFFFF',
      );
    } finally {
      await cleanup(prisma, actor.id);
      await prisma.$disconnect();
    }
  });

  it('creates reusable Workload Identity service accounts and fails closed on a user-managed key', async () => {
    const prisma = createDatabaseClient();
    const actor = await seedActor(prisma);
    try {
      const store = new PrismaCloudGovernanceStore(prisma);
      const fake = new FakeGcpCloudClient();
      const service = new CloudGovernanceService(store, fake, { workerId: 'iam-test' });
      const seeded = await seedTenantBinding({
        prisma,
        store,
        actorUserId: actor.id,
        label: 'iam',
        gcpProjectId: 'iam-project-12345',
        owner: 'user:iam-owner@example.com',
      });
      fake.seedProject({
        projectId: seeded.binding.gcpProjectId,
        owner: seeded.tenant.ownerPrincipalId,
        ownerRoles: ['roles/viewer'],
        billingAccountId: seeded.tenant.billingAccountId,
      });
      const ensureContext = mutation(actor.id, 'iam-ensure');
      const input = {
        context: ensureContext,
        bindingId: seeded.binding.id,
        expectedBindingVersion: seeded.binding.version,
        kind: 'RUNTIME' as const,
        app: 'checkout',
        environment: 'production',
        privilegeBoundary: 'payments-read',
        roles: ['roles/logging.logWriter'],
        workloadIdentityMembers: ['serviceAccount:tenant.svc.id.goog[apps/checkout]'],
      };
      const started = await service.startIdentityEnsure(input);
      const completed = await service.executeOperation(started.operation.id);
      expect(completed.status).toBe('SUCCEEDED');
      const identity = await prisma.platformIamIdentity.findFirstOrThrow({ where: { bindingId: seeded.binding.id } });
      expect(identity).toMatchObject({ complianceStatus: 'COMPLIANT', persistentKeys: 0, revisionsServed: 1 });
      const accountPolicy = await fake.getServiceAccountIamPolicy(identity.gcpServiceAccountEmail);
      expect(accountPolicy.bindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'roles/iam.workloadIdentityUser',
            members: ['serviceAccount:tenant.svc.id.goog[apps/checkout]'],
          }),
        ]),
      );
      const createCalls = fake.callCount('createServiceAccount');
      const replay = await service.startIdentityEnsure(input);
      await service.executeOperation(replay.operation.id);
      expect(fake.callCount('createServiceAccount')).toBe(createCalls);

      fake.setUserManagedKeyCount(seeded.binding.gcpProjectId, identity.gcpServiceAccountEmail, 1);
      const drift = await service.startIdentityEnsure({ ...input, context: mutation(actor.id, 'iam-drift') });
      const detected = await service.executeOperation(drift.operation.id);
      expect(detected.status).toBe('FAILED');
      expect(detected.lastErrorCode).toBe('IAM_PERSISTENT_KEY_FORBIDDEN');
      expect(await prisma.platformIamIdentity.findUnique({ where: { id: identity.id } })).toMatchObject({
        complianceStatus: 'KEY_DRIFT',
        persistentKeys: 1,
        revisionsServed: 1,
      });
      const quarantinedPolicy = await fake.getProjectIamPolicy(seeded.binding.gcpProjectId);
      expect(
        quarantinedPolicy.bindings?.some((binding) =>
          binding.members.includes(`serviceAccount:${identity.gcpServiceAccountEmail}`),
        ) ?? false,
      ).toBe(false);
      const quarantinedAccountPolicy = await fake.getServiceAccountIamPolicy(identity.gcpServiceAccountEmail);
      expect(
        quarantinedAccountPolicy.bindings?.some((binding) => binding.role === 'roles/iam.workloadIdentityUser') ??
          false,
      ).toBe(false);
      expect(
        (await fake.getServiceAccount(seeded.binding.gcpProjectId, identity.gcpServiceAccountEmail))?.disabled,
      ).toBe(true);
    } finally {
      await cleanup(prisma, actor.id);
      await prisma.$disconnect();
    }
  });
});
