import { createDatabaseClient, Prisma } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';
import { assertAccountPurgeMutationAllowed } from '../account-purge-state-machine-fence.js';
import { PrismaCloudGovernanceStore } from '../cloud-governance-store.js';
import { lockProjectAfterPurgeTopology, lockProjectMutation } from '../project-mutation-lock.js';
import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';
import { PrismaApiStore } from '../prisma-store.js';

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

const runDbTests = (await canReachDatabase()) ? describe.sequential : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function timeout<T>(promise: Promise<T>, milliseconds = 10_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('POSTGRES_INTERLEAVING_TIMEOUT')), milliseconds);
      timer.unref?.();
    }),
  ]);
}

async function waitUntilBlocked(prisma: ReturnType<typeof createDatabaseClient>, blockerPid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity activity
        WHERE ${blockerPid} = ANY(pg_blocking_pids(activity.pid))
      ) AS blocked
    `;

    if (rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('EXPECTED_POSTGRES_WAITER_NOT_OBSERVED');
}

async function seedOrganizations(prisma: ReturnType<typeof createDatabaseClient>, label: string) {
  const token = suffix();
  const source = await prisma.organization.create({
    data: { name: `${label} source ${token}`, slug: `${label}-source-${token}` },
  });
  const target = await prisma.organization.create({
    data: { name: `${label} target ${token}`, slug: `${label}-target-${token}` },
  });

  return { source, target };
}

async function seedManifest(store: PrismaApiStore, projectId: string) {
  const manifest = createDefaultProjectManifest(projectId);
  return store.createProjectManifestRevision({
    projectId,
    schemaVersion: manifest.schemaVersion,
    manifestVersion: manifest.manifestVersion,
    digest: projectManifestDigest(manifest),
    manifest,
  });
}

runDbTests('tenant transfer + release — PostgreSQL lock/fence interleavings', () => {
  it('lets concurrent actor-fenced project mutations share topology without an advisory-lock upgrade deadlock', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const organizations = await seedOrganizations(prismaA, 'shared-topology');
    const actorA = await prismaA.user.create({ data: { email: `shared-topology-a-${suffix()}@example.test` } });
    const actorB = await prismaA.user.create({ data: { email: `shared-topology-b-${suffix()}@example.test` } });
    const projectA = await prismaA.project.create({
      data: { organizationId: organizations.source.id, name: 'Shared topology A', slug: `shared-a-${suffix()}` },
    });
    const projectB = await prismaA.project.create({
      data: { organizationId: organizations.target.id, name: 'Shared topology B', slug: `shared-b-${suffix()}` },
    });
    let readyCount = 0;
    let releaseBoth!: () => void;
    const bothReady = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });

    const mutate = (
      prisma: ReturnType<typeof createDatabaseClient>,
      actorUserId: string,
      organizationId: string,
      projectId: string,
    ) =>
      prisma.$transaction(async (tx) => {
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [actorUserId],
          organizationIds: [organizationId],
          projectIds: [projectId],
        });
        readyCount += 1;
        if (readyCount === 2) releaseBoth();
        await bothReady;
        await lockProjectAfterPurgeTopology(tx, projectId);
      });

    const mutations = [
      mutate(prismaA, actorA.id, organizations.source.id, projectA.id),
      mutate(prismaB, actorB.id, organizations.target.id, projectB.id),
    ];

    try {
      await timeout(Promise.all(mutations));
    } finally {
      releaseBoth();
      await Promise.allSettled(mutations);
      await prismaA.project.deleteMany({ where: { id: { in: [projectA.id, projectB.id] } } }).catch(() => undefined);
      await prismaA.organization.deleteMany({
        where: { id: { in: [organizations.source.id, organizations.target.id] } },
      });
      await prismaA.user.deleteMany({ where: { id: { in: [actorA.id, actorB.id] } } });
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('revalidates Project organization after a blocked CloudTenant bind', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const cloudStore = new PrismaCloudGovernanceStore(prismaB);
    const organizations = await seedOrganizations(prismaA, 'bind-race');
    const actor = await prismaA.user.create({ data: { email: `bind-race-${suffix()}@example.test` } });
    const project = await prismaA.project.create({
      data: { organizationId: organizations.source.id, name: 'Bind race', slug: `bind-race-${suffix()}` },
    });
    const tenant = await prismaA.cloudTenant.create({
      data: {
        organizationId: organizations.source.id,
        customerBoundaryType: 'WORKSPACE',
        ownerPrincipalId: 'user:owner@example.test',
        billingPrincipalId: 'group:billing@example.test',
        billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
      },
    });

    let unlock!: () => void;
    const latch = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    let locked!: (pid: number) => void;
    const lockedLatch = new Promise<number>((resolve) => {
      locked = resolve;
    });

    try {
      const transfer = prismaA.$transaction(async (tx) => {
        const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        await lockProjectMutation(tx, project.id);
        await tx.project.update({ where: { id: project.id }, data: { organizationId: organizations.target.id } });
        locked(pid);
        await latch;
      });
      const blockerPid = await lockedLatch;
      const bind = cloudStore.bindProject({
        context: { actorUserId: actor.id, idempotencyKey: `bind-race-${suffix()}` },
        tenantId: tenant.id,
        expectedTenantVersion: tenant.version,
        projectId: project.id,
        gcpProjectId: `bind-race-${suffix()}`,
        role: 'PRIMARY',
        region: 'europe-west1',
      });

      await waitUntilBlocked(prismaA, blockerPid);
      unlock();
      await transfer;
      await expect(bind).rejects.toMatchObject({ code: 'PROJECT_TENANT_ISOLATION_VIOLATION' });

      await expect(prismaA.project.findUniqueOrThrow({ where: { id: project.id } })).resolves.toMatchObject({
        organizationId: organizations.target.id,
      });
      expect(await prismaA.cloudProjectBinding.count({ where: { projectId: project.id } })).toBe(0);
    } finally {
      unlock();
      await prismaA.cloudOperation.deleteMany({ where: { actorUserId: actor.id } }).catch(() => undefined);
      await prismaA.cloudProjectBinding.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
      await prismaA.cloudTenant.delete({ where: { id: tenant.id } }).catch(() => undefined);
      await prismaA.project.delete({ where: { id: project.id } }).catch(() => undefined);
      await prismaA.organization.deleteMany({
        where: { id: { in: [organizations.source.id, organizations.target.id] } },
      });
      await prismaA.user.delete({ where: { id: actor.id } }).catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('serializes grant creation with transfer and never resurrects an org-A grant after B -> A', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const organizations = await seedOrganizations(prismaA, 'grant-transfer');
    const actor = await prismaA.user.create({ data: { email: `grant-actor-${suffix()}@example.test` } });
    const subject = await prismaA.user.create({ data: { email: `grant-subject-${suffix()}@example.test` } });
    const project = await prismaA.project.create({
      data: { organizationId: organizations.source.id, name: 'Grant transfer', slug: `grant-transfer-${suffix()}` },
    });
    await seedManifest(storeA, project.id);

    try {
      const settled = await timeout(
        Promise.allSettled([
          storeA.transferProject({ projectId: project.id, targetOrganizationId: organizations.target.id }),
          storeB.createResourceAccessGrant({
            organizationId: organizations.source.id,
            subjectType: 'USER',
            subjectUserId: subject.id,
            resourceType: 'PROJECT',
            resourceId: project.id,
            roleKey: 'viewer',
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 60_000),
            acceptedAt: new Date(),
            grantedByUserId: actor.id,
            idempotencyKey: `grant-transfer-${suffix()}`,
            requestHash: 'a'.repeat(64),
          }),
        ]),
      );

      expect(settled[0].status).toBe('fulfilled');
      expect(settled.every((result) => result.status !== 'rejected' || !String(result.reason).includes('40P01'))).toBe(
        true,
      );
      expect((await prismaA.project.findUniqueOrThrow({ where: { id: project.id } })).organizationId).toBe(
        organizations.target.id,
      );
      expect(
        await prismaA.resourceAccessGrant.count({
          where: { resourceType: 'PROJECT', resourceId: project.id, status: { not: 'REVOKED' } },
        }),
      ).toBe(0);

      await storeA.transferProject({ projectId: project.id, targetOrganizationId: organizations.source.id });
      expect(
        await prismaA.resourceAccessGrant.count({
          where: { resourceType: 'PROJECT', resourceId: project.id, status: { not: 'REVOKED' } },
        }),
      ).toBe(0);
    } finally {
      await prismaA.organization.deleteMany({
        where: { id: { in: [organizations.source.id, organizations.target.id] } },
      });
      await prismaA.user.deleteMany({ where: { id: { in: [actor.id, subject.id] } } });
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('fails transfer before any mutation for every tenant-owned or active resource', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const organizations = await seedOrganizations(prisma, 'transfer-gates');
    const collaborator = await prisma.user.create({ data: { email: `transfer-collab-${suffix()}@example.test` } });
    const project = await prisma.project.create({
      data: { organizationId: organizations.source.id, name: 'Transfer gates', slug: `transfer-gates-${suffix()}` },
    });
    const other = await prisma.project.create({
      data: { organizationId: organizations.source.id, name: 'Other', slug: `transfer-other-${suffix()}` },
    });
    const revision = await seedManifest(store, project.id);
    await prisma.projectCollaborator.create({
      data: { projectId: project.id, userId: collaborator.id, roleKey: 'viewer' },
    });

    const cases: Array<{ name: string; setup(): Promise<() => Promise<unknown>> }> = [
      {
        name: 'CloudProjectBinding',
        setup: async () => {
          const tenant = await prisma.cloudTenant.create({
            data: {
              organizationId: organizations.source.id,
              customerBoundaryType: 'WORKSPACE',
              ownerPrincipalId: 'user:owner@example.test',
              billingPrincipalId: 'group:billing@example.test',
              billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
            },
          });
          const binding = await prisma.cloudProjectBinding.create({
            data: {
              cloudTenantId: tenant.id,
              projectId: project.id,
              gcpProjectId: `transfer-gate-${suffix()}`,
              role: 'PRIMARY',
              region: 'europe-west1',
            },
          });
          return async () => {
            await prisma.cloudProjectBinding.delete({ where: { id: binding.id } });
            return prisma.cloudTenant.delete({ where: { id: tenant.id } });
          };
        },
      },
      {
        name: 'DatabaseInstance',
        setup: async () => {
          const row = await prisma.databaseInstance.create({
            data: {
              projectId: project.id,
              organizationId: organizations.source.id,
              environment: 'development',
              status: 'ACTIVE',
            },
          });
          return () => prisma.databaseInstance.delete({ where: { id: row.id } });
        },
      },
      {
        name: 'Deployment BUILDING',
        setup: async () => {
          const row = await store.createDeployment({
            projectId: project.id,
            provider: 'server',
            environment: 'preview',
            status: 'BUILDING',
            metadata: { projectManifestDigest: revision.digest },
          });
          return () => prisma.deployment.delete({ where: { id: row.id } });
        },
      },
      {
        name: 'DBMigrationExecution MANUAL_RECOVERY',
        setup: async () => {
          const row = await prisma.dBMigrationExecution.create({
            data: {
              projectId: project.id,
              organizationId: organizations.source.id,
              environment: 'production',
              state: 'MANUAL_RECOVERY',
              idempotencyKey: `migration-${suffix()}`,
              requestHash: 'b'.repeat(64),
              plan: {},
              statementsSha256: 'c'.repeat(64),
              backwardCompatible: true,
              forwardCompatible: true,
            },
          });
          return () => prisma.dBMigrationExecution.delete({ where: { id: row.id } });
        },
      },
      {
        name: 'ImportJob ROLLING_BACK',
        setup: async () => {
          const row = await prisma.importJob.create({
            data: {
              organizationId: organizations.source.id,
              idempotencyKey: `import-${suffix()}`,
              requestHash: 'd'.repeat(64),
              provider: 'empty',
              state: 'ROLLING_BACK',
              targetProjectId: project.id,
            },
          });
          return () => prisma.importJob.delete({ where: { id: row.id } });
        },
      },
      {
        name: 'RemixJob active',
        setup: async () => {
          const row = await prisma.remixJob.create({
            data: {
              sourceProjectId: project.id,
              organizationId: organizations.source.id,
              state: 'CLONING',
              idempotencyKey: `remix-${suffix()}`,
              requestHash: 'e'.repeat(64),
            },
          });
          return () => prisma.remixJob.delete({ where: { id: row.id } });
        },
      },
      ...(['source', 'target'] as const).map((side) => ({
        name: `RemixStorageShare ACTIVE (${side})`,
        setup: async () => {
          const row = await prisma.remixStorageShare.create({
            data: {
              sourceProjectId: side === 'source' ? project.id : other.id,
              targetProjectId: side === 'target' ? project.id : other.id,
              sourceOrganizationId: organizations.source.id,
              targetOrganizationId: organizations.source.id,
              consentVersion: 'test-v1',
              sourceInventory: {},
              state: 'ACTIVE',
            },
          });
          return () => prisma.remixStorageShare.delete({ where: { id: row.id } });
        },
      })),
    ];

    try {
      for (const candidate of cases) {
        const cleanup = await candidate.setup();

        await expect(
          store.transferProject({ projectId: project.id, targetOrganizationId: organizations.target.id }),
          candidate.name,
        ).rejects.toMatchObject({ code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE' });
        expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).organizationId).toBe(
          organizations.source.id,
        );
        expect(await prisma.projectCollaborator.count({ where: { projectId: project.id } })).toBe(1);
        expect(await prisma.projectManifestRevision.count({ where: { projectId: project.id } })).toBe(1);
        expect((await store.getLatestProjectManifest(project.id))?.digest).toBe(revision.digest);
        await cleanup();
      }
    } finally {
      await prisma.cloudProjectBinding.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
      await prisma.cloudTenant
        .deleteMany({ where: { organizationId: organizations.source.id } })
        .catch(() => undefined);
      await prisma.organization.deleteMany({
        where: { id: { in: [organizations.source.id, organizations.target.id] } },
      });
      await prisma.user.delete({ where: { id: collaborator.id } }).catch(() => undefined);
      await store.disconnect();
    }
  });

  it('fences transfer/manifest append and detects raw org or digest drift before READY', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const organizations = await seedOrganizations(prismaA, 'release-fence');
    const project = await prismaA.project.create({
      data: { organizationId: organizations.source.id, name: 'Release fence', slug: `release-fence-${suffix()}` },
    });
    const revision = await seedManifest(storeA, project.id);
    const provisioning = await prismaA.databaseInstance.create({
      data: {
        projectId: project.id,
        organizationId: organizations.source.id,
        environment: 'production',
        status: 'PROVISIONING',
      },
    });
    const ownerToken = `release-owner-${suffix()}`;
    const lease = await storeA.acquireProjectReleaseBarrier({
      projectId: project.id,
      expectedOrganizationId: organizations.source.id,
      expectedManifestDigest: revision.digest,
      operationId: `release-${suffix()}`,
      ownerToken,
      ttlSeconds: 60,
    });

    try {
      expect(lease).toBeDefined();
      const nextManifest = { ...createDefaultProjectManifest(project.id), manifestVersion: 2 };
      const attempts = await Promise.allSettled([
        storeB.transferProject({ projectId: project.id, targetOrganizationId: organizations.target.id }),
        storeB.createProjectManifestRevision({
          projectId: project.id,
          schemaVersion: nextManifest.schemaVersion,
          manifestVersion: nextManifest.manifestVersion,
          expectedDigest: revision.digest,
          digest: projectManifestDigest(nextManifest),
          manifest: nextManifest,
        }),
        storeB.upsertProjectEnvVar({
          projectId: project.id,
          expectedOrganizationId: organizations.source.id,
          key: 'DATABASE_URL',
          value: 'postgres://release-race.invalid/app',
          scope: 'preview',
        }),
        storeB.upsertProjectSecret({
          projectId: project.id,
          expectedOrganizationId: organizations.source.id,
          key: 'DATABASE_URL',
          valueEncrypted: 'encrypted:release-race',
        }),
        storeB.acquireDatabaseProvisioning({
          projectId: project.id,
          expectedOrganizationId: organizations.source.id,
          organizationId: organizations.source.id,
          retentionDays: 7,
          environment: 'development',
          provisioningDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        storeB.completeDatabaseProvisioning(provisioning.id, {
          projectId: project.id,
          expectedOrganizationId: organizations.source.id,
          key: 'PROD_DATABASE_URL',
          valueEncrypted: 'encrypted:release-race-production',
        }),
      ]);

      expect(attempts).toHaveLength(6);
      for (const attempt of attempts) {
        expect(attempt.status).toBe('rejected');
        expect((attempt as PromiseRejectedResult).reason).toMatchObject({ code: 'CHECKPOINT_BARRIER_ACTIVE' });
      }

      await prismaA.project.update({ where: { id: project.id }, data: { organizationId: organizations.target.id } });
      await expect(
        storeA.assertProjectReleaseBarrier({
          checkpointId: lease!.checkpointId,
          projectId: project.id,
          expectedOrganizationId: organizations.source.id,
          expectedManifestDigest: revision.digest,
          ownerToken,
          fence: lease!.fence,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_ORGANIZATION_CHANGED_DURING_RELEASE' });

      await prismaA.project.update({ where: { id: project.id }, data: { organizationId: organizations.source.id } });
      await prismaA.projectManifestRevision.create({
        data: {
          projectId: project.id,
          schemaVersion: nextManifest.schemaVersion,
          manifestVersion: nextManifest.manifestVersion,
          digest: projectManifestDigest(nextManifest),
          manifest: nextManifest as Prisma.InputJsonValue,
        },
      });
      await expect(
        storeA.assertProjectReleaseBarrier({
          checkpointId: lease!.checkpointId,
          projectId: project.id,
          expectedOrganizationId: organizations.source.id,
          expectedManifestDigest: revision.digest,
          ownerToken,
          fence: lease!.fence,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH' });

      const staleWorkerDeployment = await storeA.createDeployment({
        projectId: project.id,
        provider: 'server',
        environment: 'preview',
        status: 'BUILDING',
        metadata: { projectManifestDigest: revision.digest },
      });
      await prismaA.$executeRaw`
        UPDATE "ProjectCheckpoint"
        SET "barrierExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${lease!.checkpointId}
      `;

      await expect(
        storeB.transferProject({ projectId: project.id, targetOrganizationId: organizations.target.id }),
      ).rejects.toMatchObject({ code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE' });
      await expect(
        storeA.assertProjectReleaseBarrier({
          checkpointId: lease!.checkpointId,
          projectId: project.id,
          expectedOrganizationId: organizations.source.id,
          expectedManifestDigest: revision.digest,
          ownerToken,
          fence: lease!.fence,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
      expect((await storeA.getDeployment(project.id, staleWorkerDeployment.id))?.status).toBe('BUILDING');
      expect(await prismaA.releaseManifest.count({ where: { deploymentId: staleWorkerDeployment.id } })).toBe(0);
    } finally {
      if (lease) {
        await storeA.releaseProjectReleaseBarrier({
          checkpointId: lease.checkpointId,
          projectId: project.id,
          ownerToken,
          fence: lease.fence,
        });
      }
      expect(
        await prismaA.projectCheckpoint.count({ where: { projectId: project.id, state: 'RELEASE_BARRIER' } }),
      ).toBe(0);
      await prismaA.organization.deleteMany({
        where: { id: { in: [organizations.source.id, organizations.target.id] } },
      });
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('refuses purge for CloudProjectBinding before Stripe, GCS, or workspace/PVC effects', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const token = suffix();
    const owner = await store.createUser({ email: `purge-binding-${token}@example.test`, passwordHash: 'test-hash' });
    const organization = await store.createOrganization({
      name: `Purge binding ${token}`,
      slug: `purge-binding-${token}`,
      ownerUserId: owner.id,
    });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'Purge binding',
      slug: `purge-binding-${token}`,
    });
    const tenant = await prisma.cloudTenant.create({
      data: {
        organizationId: organization.id,
        customerBoundaryType: 'WORKSPACE',
        ownerPrincipalId: 'user:owner@example.test',
        billingPrincipalId: 'group:billing@example.test',
        billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
      },
    });
    const binding = await prisma.cloudProjectBinding.create({
      data: {
        cloudTenantId: tenant.id,
        projectId: project.id,
        gcpProjectId: `purge-binding-${token}`,
        role: 'PRIMARY',
        region: 'europe-west1',
      },
    });
    const plan = await prisma.plan.create({
      data: { key: `purge-binding-${token}`, name: 'Purge test', monthlyCents: 1, limits: {} },
    });
    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        planId: plan.id,
        externalId: `sub_${token}`,
        status: 'ACTIVE',
      },
    });
    await store.requestAccountDeletion(owner.id);
    await prisma.user.update({
      where: { id: owner.id },
      data: { preferences: { accountDeletion: { requestedAt: '2000-01-01T00:00:00.000Z' } } },
    });
    const cancelExternalBilling = vi.fn(async () => ({ canceled: true }));
    const eraseStorage = vi.fn(async () => ({ verified: true, classes: [] }));

    try {
      await expect(
        store.purgeUserAccount(
          { userId: owner.id, correlationId: `purge-binding-${token}` },
          { cancelExternalBilling, eraseStorage },
        ),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_CLOUD_PROJECT_BINDING_ACTIVE' });
      expect(cancelExternalBilling).not.toHaveBeenCalled();
      expect(eraseStorage).not.toHaveBeenCalled();
      expect(await prisma.purgePlan.count({ where: { userId: owner.id } })).toBe(0);
      expect(await prisma.cloudProjectBinding.count({ where: { id: binding.id } })).toBe(1);
      expect(await prisma.subscription.count({ where: { organizationId: organization.id, status: 'ACTIVE' } })).toBe(1);
    } finally {
      await prisma.cloudProjectBinding.delete({ where: { id: binding.id } }).catch(() => undefined);
      await prisma.cloudTenant.delete({ where: { id: tenant.id } }).catch(() => undefined);
      await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
      await prisma.plan.delete({ where: { id: plan.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: owner.id } }).catch(() => undefined);
      await store.disconnect();
    }
  });
});
