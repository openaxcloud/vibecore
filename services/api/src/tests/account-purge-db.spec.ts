import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDatabaseClient, Prisma } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';

import type { AccountPurgeProjectDeletionAuthority, PurgeStorageDeps } from '../account-purge.js';
import type { ObjectStorage } from '../object-storage.js';
import { PrismaApiStore } from '../prisma-store.js';
import { LocalProjectStorage, type ProjectStaticErasureAuthority } from '../project-storage.js';
import { emptyManagedDatabaseErasureCallbacks } from './project-database-erasure-test-support.js';
import { persistEmptyProjectRegistryErasure } from './project-registry-erasure-test-helper.js';
import { seedVerifiedEmptyProjectVolumeErasure } from './project-volume-erasure-fixture.js';

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
const lease = { ttlMs: 120, renewIntervalMs: 60_000, reclaimGraceMs: 0 };

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function seedDueUser(prisma: ReturnType<typeof createDatabaseClient>) {
  const id = suffix();
  const requestedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  return prisma.user.create({
    data: {
      email: `account-purge-${id}@example.test`,
      preferences: { accountDeletion: { requestedAt } } as Prisma.InputJsonValue,
    },
  });
}

async function cleanup(
  prisma: ReturnType<typeof createDatabaseClient>,
  userIds: string[],
  organizationIds: string[] = [],
) {
  await prisma.purgeReceipt.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.purgePlan.deleteMany({ where: { userId: { in: userIds } } });
  if (organizationIds.length) await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function createSessionFencePlan(tx: Prisma.TransactionClient, userId: string) {
  const requestedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1_000);
  return tx.purgePlan.create({
    data: {
      userId,
      ownerToken: `session-fence-${suffix()}`,
      status: 'ACTIVE',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      requestedAt,
      purgeDueAt: new Date(requestedAt.getTime() + 14 * 24 * 60 * 60 * 1_000),
      topologyFingerprint: '{}',
      inventory: {
        ownedProjects: [],
        bucketProjectIds: [],
        workspaceProjectIds: [],
        localSnapshotObjects: [],
        staticDeploymentIds: [],
        staticArtifactRefs: [],
        staticAliasDeploymentIds: [],
      },
    },
  });
}

runDbTests('account purge — PostgreSQL multi-client fencing', () => {
  it('blocks an active retained-source Remix share before billing or provider effects', async () => {
    const prisma = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const eraseStorage = vi.fn(async () => ({ classes: [], verified: true }));
    const permanentlyDeleteOwnedProject = vi.fn(async () => undefined);

    try {
      const [subject, targetOwner] = await Promise.all([seedDueUser(prisma), seedDueUser(prisma)]);
      userIds.push(subject.id, targetOwner.id);
      const role = await prisma.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const [sourceOrganization, targetOrganization] = await Promise.all([
        prisma.organization.create({
          data: {
            name: `Shared source ${suffix()}`,
            slug: `shared-source-${suffix()}`,
            members: { create: { userId: subject.id, roleId: role.id } },
            projects: { create: { name: 'Retained source', slug: `retained-source-${suffix()}` } },
          },
          include: { projects: true },
        }),
        prisma.organization.create({
          data: {
            name: `Shared target ${suffix()}`,
            slug: `shared-target-${suffix()}`,
            members: { create: { userId: targetOwner.id, roleId: role.id } },
            projects: { create: { name: 'Retained target', slug: `retained-target-${suffix()}` } },
          },
          include: { projects: true },
        }),
      ]);
      organizationIds.push(sourceOrganization.id, targetOrganization.id);
      await prisma.remixStorageShare.create({
        data: {
          sourceProjectId: sourceOrganization.projects[0]!.id,
          targetProjectId: targetOrganization.projects[0]!.id,
          sourceOrganizationId: sourceOrganization.id,
          targetOrganizationId: targetOrganization.id,
          consentVersion: 'account-purge-preflight-v1',
          sourceInventory: [],
          state: 'ACTIVE',
        },
      });
      const store = new PrismaApiStore(prisma);

      await expect(
        store.purgeUserAccount({ userId: subject.id }, { eraseStorage, permanentlyDeleteOwnedProject }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_REMIX_STORAGE_SHARE_ACTIVE', statusCode: 409 });
      expect(eraseStorage).not.toHaveBeenCalled();
      expect(permanentlyDeleteOwnedProject).not.toHaveBeenCalled();
      await expect(prisma.purgePlan.count({ where: { userId: subject.id } })).resolves.toBe(0);
    } finally {
      await cleanup(prisma, userIds, organizationIds).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('refuses a foreign physical operation before any purge effect and admits a retry after safe resolution', async () => {
    const prisma = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    let operationId: string | undefined;
    const eraseStorage = vi.fn(async () => ({ classes: [], verified: true }));
    const permanentlyDeleteOwnedProject = vi.fn(async () => undefined);

    try {
      const user = await seedDueUser(prisma);
      userIds.push(user.id);
      const role = await prisma.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prisma.organization.create({
        data: {
          name: `Foreign physical operation ${suffix()}`,
          slug: `foreign-physical-${suffix()}`,
          members: { create: { userId: user.id, roleId: role.id } },
          projects: { create: { name: 'Foreign physical project', slug: `foreign-project-${suffix()}` } },
        },
        include: { projects: true },
      });
      organizationIds.push(organization.id);
      const project = organization.projects[0]!;
      const deletionFence = new Date();
      await prisma.project.update({
        where: { id: project.id },
        data: { permanentDeletionStartedAt: deletionFence, deletedAt: deletionFence },
      });
      const operation = await prisma.objectStorageOperation.create({
        data: {
          kind: 'PROJECT_PERMANENT_DELETE',
          status: 'PREPARED',
          scopeHash: createHash('sha256').update(`foreign-scope:${project.id}`).digest('hex'),
          idempotencyScopeHash: createHash('sha256').update(`foreign-idem-scope:${project.id}`).digest('hex'),
          idempotencyKey: `foreign-delete-${suffix()}`,
          requestHash: createHash('sha256').update(`foreign-request:${project.id}`).digest('hex'),
          payload: {
            command: 'project-permanent-delete',
            actorUserIdHash: createHash('sha256').update(user.id).digest('hex'),
            expectedProjectNameHash: createHash('sha256').update(project.name).digest('hex'),
          },
          preconditions: {},
          ownerToken: `foreign-owner-${suffix()}`,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          scopes: {
            create: {
              ordinal: 0,
              projectIdSnapshot: project.id,
              projectId: project.id,
              expectedOrganizationId: organization.id,
              expectedDeletedAt: null,
              expectedPermanentDeletionStartedAt: deletionFence,
              deletionFenceDeletedAt: deletionFence,
            },
          },
        },
      });
      operationId = operation.id;
      const store = new PrismaApiStore(prisma);

      await expect(
        store.purgeUserAccount({ userId: user.id }, { eraseStorage, permanentlyDeleteOwnedProject }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_PROJECT_PHYSICAL_OPERATION_ACTIVE', statusCode: 409 });
      expect(eraseStorage).not.toHaveBeenCalled();
      expect(permanentlyDeleteOwnedProject).not.toHaveBeenCalled();
      await expect(prisma.purgePlan.count({ where: { userId: user.id } })).resolves.toBe(0);

      await prisma.$transaction([
        prisma.objectStorageOperation.update({
          where: { id: operation.id },
          data: {
            status: 'FAILED_SAFE',
            ownerToken: null,
            leaseExpiresAt: null,
            failedSafeAt: new Date(),
          },
        }),
        prisma.project.update({
          where: { id: project.id },
          data: { permanentDeletionStartedAt: null, deletedAt: null },
        }),
      ]);

      await expect(store.purgeUserAccount({ userId: user.id }, { eraseStorage })).rejects.toMatchObject({
        code: 'ACCOUNT_PURGE_PROJECT_DELETER_UNAVAILABLE',
        statusCode: 503,
      });
      expect(eraseStorage).not.toHaveBeenCalled();
    } finally {
      if (operationId) {
        await prisma.objectStorageOperation.delete({ where: { id: operationId } }).catch(() => undefined);
      }
      await cleanup(prisma, userIds, organizationIds).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('does not leave a surviving project fenced by completed purge inventory', async () => {
    const prisma = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];

    try {
      const subject = await seedDueUser(prisma);
      userIds.push(subject.id);
      const projectId = `retained-project-${suffix()}`;
      const organization = await prisma.organization.create({
        data: { name: `Retained ${projectId}`, slug: `retained-${suffix()}` },
      });
      organizationIds.push(organization.id);
      await prisma.project.create({
        data: { id: projectId, organizationId: organization.id, name: 'Retained project', slug: `project-${suffix()}` },
      });
      const requestedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1_000);
      await prisma.purgePlan.create({
        data: {
          userId: subject.id,
          ownerToken: `completed-workspace-${suffix()}`,
          status: 'COMPLETED',
          leaseExpiresAt: new Date(),
          requestedAt,
          purgeDueAt: new Date(requestedAt.getTime() + 14 * 24 * 60 * 60 * 1_000),
          topologyFingerprint: '{}',
          completedAt: new Date(),
          inventory: {
            ownedProjects: [],
            bucketProjectIds: [],
            workspaceProjectIds: [projectId],
            localSnapshotObjects: [],
            staticDeploymentIds: [],
            staticArtifactRefs: [],
            staticAliasDeploymentIds: [],
          },
        },
      });
      const store = new PrismaApiStore(prisma);
      const digest = createHash('sha256').update(`${projectId}:${subject.id}`).digest('hex').slice(0, 16);

      await expect(
        store.assertProjectStorageMutable({
          projectId,
          expectedOrganizationId: organization.id,
          workspaceId: `ws-${digest}`,
        }),
      ).resolves.toBeUndefined();
      await expect(
        store.assertProjectStorageMutable({
          projectId,
          expectedOrganizationId: organization.id,
          workspaceId: 'ws-other-collaborator',
        }),
      ).resolves.toBeUndefined();
      await expect(
        store.assertProjectStorageMutable({ projectId, expectedOrganizationId: organization.id }),
      ).resolves.toBeUndefined();

      let bucketExists = false;
      const ensureBucket = vi.fn(async () => {
        bucketExists = true;
        return { bucket: `projects-${projectId}`, created: true, location: 'test' };
      });
      const storage = {
        active: true,
        ensureBucket,
        bucketExists: vi.fn(async () => bucketExists),
        bucketVersioningEnabled: vi.fn(async () => bucketExists),
      } as unknown as ObjectStorage;

      await expect(
        store.executeTenantObjectStorageCommand({
          scopes: [{ projectId, expectedOrganizationId: organization.id }],
          command: { type: 'ENSURE_BUCKET', projectId },
          storage,
          idempotencyKey: `completed-purge-${suffix()}`,
        }),
      ).resolves.toMatchObject({ type: 'ENSURE_BUCKET' });
      expect(ensureBucket).toHaveBeenCalledOnce();
    } finally {
      await cleanup(prisma, userIds, organizationIds).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('linearizes late session INSERT and token lookup behind a newly committed purge plan', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];

    try {
      const insertUser = await seedDueUser(prismaA);
      const lookupUser = await seedDueUser(prismaA);
      userIds.push(insertUser.id, lookupUser.id);
      const storeA = new PrismaApiStore(prismaA);
      const existingToken = `lookup-before-plan-${suffix()}`;
      await storeA.createSession({
        userId: lookupUser.id,
        token: existingToken,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const exerciseFence = async (userId: string, operation: () => Promise<unknown>) => {
        const locked = deferred();
        const commitPlan = deferred();
        const blocker = prismaB.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
          locked.resolve();
          await commitPlan.promise;
          await createSessionFencePlan(tx, userId);
        });

        await locked.promise;
        const pending = operation();
        await new Promise((resolve) => setTimeout(resolve, 40));
        commitPlan.resolve();
        await blocker;
        return pending;
      };

      const insert = exerciseFence(insertUser.id, () =>
        storeA.createSession({
          userId: insertUser.id,
          token: `login-read-before-plan-${suffix()}`,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );
      await expect(insert).rejects.toMatchObject({ code: 'SESSION_ACCOUNT_PURGE_FENCED' });
      await expect(prismaA.session.count({ where: { userId: insertUser.id } })).resolves.toBe(0);

      const lookup = exerciseFence(lookupUser.id, () => storeA.findSessionByToken(existingToken));
      await expect(lookup).resolves.toBeUndefined();
      await expect(prismaA.session.count({ where: { userId: lookupUser.id } })).resolves.toBe(1);
    } finally {
      await cleanup(prismaA, userIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('refuses a token row rebound after candidate discovery to principals that were not locked', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const prismaC = createDatabaseClient();
    const userIds: string[] = [];
    const lockEntered = deferred();
    const lockRelease = deferred();

    try {
      const originalTarget = await seedDueUser(prismaA);
      const reboundTarget = await seedDueUser(prismaA);
      const reboundImpersonator = await seedDueUser(prismaA);
      userIds.push(originalTarget.id, reboundTarget.id, reboundImpersonator.id);
      const store = new PrismaApiStore(prismaA);
      const token = `session-rebind-${suffix()}`;
      const session = await store.createSession({
        userId: originalTarget.id,
        token,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const blocker = prismaB.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${originalTarget.id}`);
        lockEntered.resolve();
        await lockRelease.promise;
      });

      await lockEntered.promise;
      const lookup = store.findSessionByToken(token);
      let lookupWaitingOnOriginalSubject = false;

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = await prismaC.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
            FROM pg_stat_activity
           WHERE pid <> pg_backend_pid()
             AND wait_event = 'advisory'
             AND query LIKE '%pg_advisory_xact_lock(hashtext(%'
        `;
        if ((waiting[0]?.count ?? 0n) > 0n) {
          lookupWaitingOnOriginalSubject = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(lookupWaitingOnOriginalSubject).toBe(true);
      await prismaC.session.update({
        where: { id: session.id },
        data: { userId: reboundTarget.id, impersonatedBy: reboundImpersonator.id },
      });
      lockRelease.resolve();
      await blocker;

      await expect(lookup).resolves.toBeUndefined();
    } finally {
      lockRelease.resolve();
      await cleanup(prismaA, userIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect(), prismaC.$disconnect()]);
    }
  });

  it('deletes a soft-deleted owned project with exhaustive proof and keeps its writer fenced', async () => {
    const prisma = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const releaseManifestIds: string[] = [];
    const base = await mkdtemp(join(tmpdir(), 'vibecore-purge-db-fs-'));
    const projectRoot = join(base, 'projects');
    const staticRoot = join(base, 'static');
    const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;
    const previousStaticDeployStorageDir = process.env.STATIC_DEPLOY_STORAGE_DIR;
    process.env.PROJECT_STORAGE_DIR = projectRoot;
    process.env.STATIC_DEPLOY_STORAGE_DIR = staticRoot;

    try {
      const user = await seedDueUser(prisma);
      userIds.push(user.id);
      const role = await prisma.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prisma.organization.create({
        data: {
          name: 'Purge local storage org',
          slug: `purge-local-${suffix()}`,
          members: { create: { userId: user.id, roleId: role.id } },
          projects: { create: { name: 'Physical project', slug: 'physical-project' } },
        },
        include: { projects: true },
      });
      organizationIds.push(organization.id);
      const project = organization.projects[0];
      await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
      const storageKey = `snapshots/${project.id}/checkpoint.zip`;
      await prisma.projectSnapshot.create({
        data: { projectId: project.id, manifest: {}, storageKey, byteLength: 7 },
      });
      const deployment = await prisma.deployment.create({
        data: { projectId: project.id, provider: 'static', status: 'READY' },
      });
      const manifestOnlyDeploymentId = `manifest-only-${suffix()}`;
      const staticArtifactDigest = 'a'.repeat(64);
      const staticArtifactRef = `static-artifacts/sha256/${staticArtifactDigest}`;
      const releaseManifest = await prisma.releaseManifest.create({
        data: {
          projectId: project.id,
          deploymentId: manifestOnlyDeploymentId,
          environment: 'preview',
          version: 1,
          provider: 'static',
          artifactKind: 'static-snapshot',
          artifactRef: staticArtifactRef,
          artifactDigest: `sha256:${staticArtifactDigest}`,
        },
      });
      releaseManifestIds.push(releaseManifest.id);

      const files = [
        join(projectRoot, project.id, 'src', 'secret.ts'),
        join(projectRoot, '_objects', 'exports', project.id, 'archive.zip'),
        join(projectRoot, '_objects', 'snapshots', project.id, 'checkpoint.zip'),
        join(staticRoot, deployment.id, 'index.html'),
        join(staticRoot, manifestOnlyDeploymentId, 'index.html'),
        join(staticRoot, '.artifacts', 'sha256', staticArtifactDigest, 'index.html'),
        join(staticRoot, '.aliases', manifestOnlyDeploymentId),
        join(staticRoot, '.aliases', 'outside-source'),
      ];
      for (const path of files) {
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(
          path,
          path.endsWith(manifestOnlyDeploymentId)
            ? 'outside-target\n'
            : path.endsWith('outside-source')
              ? `${manifestOnlyDeploymentId}\n`
              : 'subject-data',
          'utf8',
        );
      }

      const store = new PrismaApiStore(prisma, undefined, { ...lease, ttlMs: 5_000 });
      const staticAuthority: ProjectStaticErasureAuthority = {
        resolveInventory: (projectId) => store.resolveProjectStaticErasureInventory(projectId),
        resolveArtifact: (projectId, artifactRef) =>
          store.resolveProjectStaticArtifactAuthority(projectId, artifactRef),
      };
      const projectStorage = new LocalProjectStorage(undefined, undefined, undefined, staticAuthority);
      let projectDeletionAttempts = 0;
      const projectDeletionKeys: string[] = [];
      const purgeDeps: PurgeStorageDeps = {
        permanentlyDeleteOwnedProject: async (authority) => {
          projectDeletionAttempts += 1;
          projectDeletionKeys.push(authority.idempotencyKey);
          let volumeProof: Awaited<ReturnType<typeof seedVerifiedEmptyProjectVolumeErasure>> | undefined;
          let registryReceipt: Awaited<ReturnType<typeof persistEmptyProjectRegistryErasure>> | undefined;
          await expect(
            prisma.purgeEffect.findUnique({
              where: {
                planId_effectKey: {
                  planId: authority.planId,
                  effectKey: `project-permanent-delete:${authority.projectId}`,
                },
              },
            }),
          ).resolves.toMatchObject({
            status: 'RUNNING',
            resourceType: 'project_permanent_delete',
            resourceId: authority.projectId,
            receipt: null,
          });
          const replay = await store.replayProjectPermanentDeletion({
            projectId: authority.projectId,
            expectedOrganizationId: authority.expectedOrganizationId,
            idempotencyKey: authority.idempotencyKey,
            requestHash: authority.requestHash,
          });
          if (!replay) {
            await store.hardDeleteProject({
              projectId: authority.projectId,
              expectedOrganizationId: authority.expectedOrganizationId,
              expectedProjectName: authority.expectedProjectName,
              idempotencyKey: authority.idempotencyKey,
              requestHash: authority.requestHash,
              actorUserId: authority.userId,
              accountPurgeDeletionAuthority: authority,
              ...emptyManagedDatabaseErasureCallbacks(),
              preflightPhysicalErasure: () =>
                projectStorage.prepareProjectStaticErasureWithinPhysicalAccess!(authority.projectId),
              erasePhysical: async (assertLease, lease) => {
                await assertLease();
                if (projectDeletionAttempts === 1) {
                  /* The callback starts only after EFFECT_STARTED committed.
                   * Expire/rebind the coordinator now: the exact child lease
                   * must finish safely and leave a durable receipt for replay. */
                  await prisma.purgePlan.update({
                    where: { id: authority.planId },
                    data: {
                      ownerToken: `lost-after-dispatch-${suffix()}`,
                      leaseExpiresAt: new Date(Date.now() - 1_000),
                    },
                  });
                }
                await projectStorage.eraseProjectDataWithinPhysicalAccess(authority.projectId);
                await projectStorage.eraseProjectStaticDataWithinPhysicalAccess!(authority.projectId);
                registryReceipt = await persistEmptyProjectRegistryErasure(store, lease, authority.projectId);
                volumeProof = await seedVerifiedEmptyProjectVolumeErasure(prisma, {
                  operationId: lease.operationId,
                  projectId: authority.projectId,
                  organizationId: authority.expectedOrganizationId,
                  ownershipEpoch: authority.expectedOwnershipEpoch,
                  fencingToken: lease.fencingToken,
                });
              },
              verifyPhysicalAbsence: async (assertLease, lease) => {
                await assertLease();
                registryReceipt ??= await persistEmptyProjectRegistryErasure(store, lease, authority.projectId);
                const filesystem = await projectStorage.verifyProjectDataAbsentWithinPhysicalAccess!(
                  authority.projectId,
                );
                if (
                  filesystem.staticSnapshotsAbsent === undefined ||
                  filesystem.staticAliasesAbsent === undefined ||
                  !filesystem.staticArtifactSummary
                ) {
                  throw new Error('PROJECT_STATIC_ERASURE_VERIFICATION_UNAVAILABLE');
                }
                return {
                  outcome: 'VERIFIED_ABSENT',
                  verifiedAt: new Date().toISOString(),
                  verifier: 'account-purge-project-receipt-db-test',
                  evidence: {
                    schemaVersion: 'project-permanent-erasure-v3',
                    filesystem: {
                      projectTreeAbsent: filesystem.treeAbsent,
                      workspaceTreesAbsent: true,
                      objectCacheAbsent: filesystem.exportsAbsent,
                      staticSnapshotsAbsent: filesystem.staticSnapshotsAbsent,
                      staticAliasesAbsent: filesystem.staticAliasesAbsent,
                      staticArtifactSummary: filesystem.staticArtifactSummary,
                    },
                    gcs: { bucketAbsent: true, objectCount: 0 },
                    projectImages: {
                      schemaVersion: 1,
                      projectId: authority.projectId,
                      operationId: lease.operationId,
                      cloudBuild: { producerCount: 0, terminalProofCount: 0, lateSuccessCount: 0 },
                      registry: registryReceipt,
                    },
                    workspaceManager: {
                      schemaVersion: 'workspace-project-erasure-v3',
                      projectId: authority.projectId,
                      organizationId: authority.expectedOrganizationId,
                      databaseInventoryRetained: true,
                      runtimeEffectsDrained: true,
                      kubernetes: {
                        deploymentsAbsent: true,
                        replicaSetsAbsent: true,
                        podsAbsent: true,
                        servicesAbsent: true,
                        endpointsAbsent: true,
                        endpointSlicesAbsent: true,
                        ingressesAbsent: true,
                        ownedRuntimeSecretsAbsent: true,
                        persistentVolumeClaimsAbsent: true,
                      },
                      volumes: volumeProof!,
                    },
                  },
                };
              },
            });
          }
        },
        eraseStorage: async (inventory) => ({
          classes: [],
          verified:
            inventory.ownedProjects.length === 0 &&
            inventory.bucketProjectIds.length === 0 &&
            inventory.localSnapshotObjects.length === 0 &&
            inventory.staticDeploymentIds.length === 0 &&
            inventory.staticArtifactRefs.length === 0,
        }),
      };

      await expect(store.purgeUserAccount({ userId: user.id }, purgeDeps)).rejects.toMatchObject({
        code: 'ACCOUNT_PURGE_LEASE_LOST',
      });
      await expect(prisma.project.findUnique({ where: { id: project.id } })).resolves.toBeNull();
      await expect(
        prisma.projectPermanentDeletionReceipt.findUnique({ where: { projectId: project.id } }),
      ).resolves.toBeTruthy();
      await expect(store.reconcilePurgeFreezes()).resolves.toMatchObject({ reconciled: 1 });
      await expect(prisma.purgePlan.findUniqueOrThrow({ where: { userId: user.id } })).resolves.toMatchObject({
        status: 'ABANDONED',
        inventory: expect.objectContaining({
          ownedProjects: [expect.objectContaining({ projectId: project.id, projectName: project.name })],
        }),
      });

      const result = await store.purgeUserAccount({ userId: user.id }, purgeDeps);

      expect(result).toMatchObject({ outcome: 'purged' });
      if (result.outcome !== 'purged') throw new Error('expected purged outcome');
      expect(result.proof.verifiedZeroRemaining).toBe(true);
      expect(result.proof.classes).toContainEqual(
        expect.objectContaining({
          dataClass: 'projects',
          action: 'deleted',
          models: { Project: 1 },
          evidence: expect.objectContaining({ receiptCount: 1, receiptDigest: expect.any(String) }),
          remainingAfterPurge: 0,
        }),
      );
      for (const path of files) {
        await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
      }
      const completedPlan = await prisma.purgePlan.findUniqueOrThrow({ where: { id: result.planId } });
      expect(completedPlan.topologyFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(JSON.stringify(completedPlan.inventory)).not.toContain(project.name);
      const completedInventory = JSON.parse(JSON.stringify(completedPlan.inventory)) as {
        schemaVersion?: unknown;
        projectDeletionReceipts?: Array<Record<string, unknown>>;
      };
      expect(completedInventory.schemaVersion).toBe('account-purge-completed-v2');
      expect(completedInventory.projectDeletionReceipts).toHaveLength(1);
      expect(completedInventory.projectDeletionReceipts?.[0]?.projectId).toBe(project.id);
      expect(completedInventory.projectDeletionReceipts?.[0]?.requestHash).toMatch(/^[0-9a-f]{64}$/);
      expect(projectDeletionAttempts).toBe(2);
      expect(new Set(projectDeletionKeys)).toEqual(new Set([`account-purge:${result.planId}:${project.id}`]));
      await expect(
        prisma.purgeEffect.findUnique({
          where: {
            planId_effectKey: {
              planId: result.planId,
              effectKey: `project-permanent-delete:${project.id}`,
            },
          },
        }),
      ).resolves.toMatchObject({ status: 'SUCCEEDED', attempt: 2 });
      await expect(
        store.assertProjectStorageMutable({
          projectId: project.id,
          expectedOrganizationId: organization.id,
        }),
      ).rejects.toMatchObject({
        code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
      });
    } finally {
      if (userIds[0]) {
        await prisma.adminAuditLog
          .deleteMany({
            where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: userIds[0] } },
          })
          .catch(() => undefined);
      }
      if (releaseManifestIds.length) {
        await prisma.releaseManifest.deleteMany({ where: { id: { in: releaseManifestIds } } }).catch(() => undefined);
      }
      await cleanup(prisma, userIds, organizationIds).catch(() => undefined);
      await prisma.$disconnect();
      await rm(base, { recursive: true, force: true });
      if (previousProjectStorageDir === undefined) delete process.env.PROJECT_STORAGE_DIR;
      else process.env.PROJECT_STORAGE_DIR = previousProjectStorageDir;
      if (previousStaticDeployStorageDir === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
      else process.env.STATIC_DEPLOY_STORAGE_DIR = previousStaticDeployStorageDir;
    }
  });

  it('runs irreversible provider I/O outside transactions and finalizes its durable receipt afterward', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];
    const entered = deferred();
    const release = deferred();

    try {
      const user = await seedDueUser(prismaA);
      userIds.push(user.id);
      const longLease = { ttlMs: 5_000, renewIntervalMs: 1_000, reclaimGraceMs: 0 };
      const storeA = new PrismaApiStore(prismaA, undefined, longLease);
      const purge = storeA.purgeUserAccount(
        { userId: user.id, correlationId: `corr-${suffix()}` },
        {
          eraseStorage: async (_inventory, purgeLease) => {
            await purgeLease.executeEffect(
              { key: 'gcs-bucket:test', resourceType: 'gcs_bucket', resourceId: 'test' },
              async () => {
                entered.resolve();
                await release.promise;
                return { deleted: true, verifiedAbsent: true };
              },
            );
            return { classes: [], verified: false };
          },
        },
      );

      await entered.promise;

      /*
       * NOWAIT would fail immediately if executeEffect still held the plan's
       * FOR UPDATE transaction across provider I/O. Acquiring it here proves
       * the effect latch has no open database transaction behind it.
       */
      await expect(
        prismaB.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(`SELECT id FROM "PurgePlan" WHERE "userId" = $1 FOR UPDATE NOWAIT`, user.id);
        }),
      ).resolves.toBeUndefined();

      release.resolve();
      await expect(purge).rejects.toMatchObject({ code: expect.any(String) });
      expect(await prismaA.purgeEffect.findFirst({ where: { plan: { userId: user.id } } })).toMatchObject({
        status: 'SUCCEEDED',
        receipt: { deleted: true, verifiedAbsent: true },
      });
    } finally {
      release.resolve();
      await cleanup(prismaA, userIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('reuses a verified effect receipt after failure and writes receipt, plan completion and audit atomically', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];
    let providerCalls = 0;

    try {
      const user = await seedDueUser(prismaA);
      userIds.push(user.id);
      const storeA = new PrismaApiStore(prismaA, undefined, { ...lease, ttlMs: 5_000 });
      const storeB = new PrismaApiStore(prismaB, undefined, { ...lease, ttlMs: 5_000 });
      const storage = (verified: boolean): PurgeStorageDeps => ({
        eraseStorage: async (_inventory, purgeLease) => {
          await purgeLease.executeEffect(
            { key: 'gcs-bucket:resume', resourceType: 'gcs_bucket', resourceId: 'resume' },
            async () => {
              providerCalls += 1;
              return { deleted: true, verifiedAbsent: true };
            },
          );
          return { classes: [], verified };
        },
      });

      await expect(storeA.purgeUserAccount({ userId: user.id }, storage(false))).rejects.toMatchObject({
        code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE',
      });
      const completed = await storeB.purgeUserAccount(
        { userId: user.id, correlationId: `corr-${suffix()}` },
        storage(true),
      );

      expect(completed.outcome).toBe('purged');
      expect(providerCalls).toBe(1);
      const [receipt, plan, audits, effect] = await Promise.all([
        prismaA.purgeReceipt.findUnique({ where: { userId: user.id } }),
        prismaA.purgePlan.findUnique({ where: { userId: user.id } }),
        prismaA.adminAuditLog.count({
          where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: user.id } },
        }),
        prismaA.purgeEffect.findFirst({ where: { plan: { userId: user.id }, effectKey: 'gcs-bucket:resume' } }),
      ]);
      expect(receipt).toBeTruthy();
      expect(plan).toMatchObject({ status: 'COMPLETED', completedAt: expect.any(Date) });
      expect(audits).toBe(1);
      expect(effect).toMatchObject({ status: 'SUCCEEDED', attempt: 1 });
    } finally {
      await cleanup(prismaA, userIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('keeps the physical freeze after a crash between provider success and receipt, then verifies live before retry certification', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    let providerDeleted = false;
    let providerCalls = 0;

    try {
      const user = await seedDueUser(prismaA);
      const retainedOwner = await prismaA.user.create({ data: { email: `retained-owner-${suffix()}@example.test` } });
      userIds.push(user.id, retainedOwner.id);
      const role = await prismaA.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prismaA.organization.create({
        data: {
          name: 'Purge GCS recovery org',
          slug: `purge-gcs-recovery-${suffix()}`,
          members: {
            create: [
              { userId: user.id, roleId: role.id },
              { userId: retainedOwner.id, roleId: role.id },
            ],
          },
          projects: { create: { name: 'GCS recovery project', slug: `gcs-recovery-${suffix()}` } },
        },
        include: { projects: true },
      });
      organizationIds.push(organization.id);
      const project = organization.projects[0];
      const slowRenewLease = { ttlMs: 5_000, renewIntervalMs: 60_000, reclaimGraceMs: 0 };
      const storeA = new PrismaApiStore(prismaA, undefined, slowRenewLease);
      const storeB = new PrismaApiStore(prismaB, undefined, slowRenewLease);
      const effectDescriptor = {
        key: `workspace-pvc:${project.id}`,
        resourceType: 'k8s_pvc',
        resourceId: project.id,
      } as const;

      await expect(
        storeA.purgeUserAccount(
          { userId: user.id },
          {
            eraseStorage: async (_inventory, purgeLease) => {
              await purgeLease.executeEffect(effectDescriptor, async () => {
                providerCalls += 1;
                providerDeleted = true;

                /* Simulate process/session loss after GCS accepted the delete. */
                await prismaB.purgePlan.update({
                  where: { userId: user.id },
                  data: {
                    ownerToken: `crashed-owner-${suffix()}`,
                    leaseExpiresAt: new Date(Date.now() - 1_000),
                  },
                });
                return { deleted: true, verifiedAbsent: true, bucketStillExists: false, objectsRemaining: 0 };
              });
              return { classes: [], verified: true };
            },
          },
        ),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_LEASE_LOST' });

      expect(providerDeleted).toBe(true);
      expect(providerCalls).toBe(1);
      await expect(prismaA.purgeReceipt.findUnique({ where: { userId: user.id } })).resolves.toBeNull();
      await expect(
        prismaA.purgeEffect.findFirstOrThrow({ where: { plan: { userId: user.id }, effectKey: effectDescriptor.key } }),
      ).resolves.toMatchObject({ status: 'RUNNING', receipt: null });
      await expect(
        prismaA.purgeFreeze.findFirst({
          where: {
            plan: { userId: user.id },
            resourceType: 'projectTopology',
            resourceId: project.id,
          },
        }),
      ).resolves.toBeTruthy();
      await expect(prismaA.project.findUnique({ where: { id: project.id } })).resolves.toBeTruthy();
      await expect(storeB.reconcilePurgeFreezes()).resolves.toMatchObject({ reconciled: 1 });
      await expect(prismaA.purgePlan.findUniqueOrThrow({ where: { userId: user.id } })).resolves.toMatchObject({
        status: 'ABANDONED',
      });
      await expect(
        storeB.assertProjectStorageMutable({
          projectId: project.id,
          expectedOrganizationId: organization.id,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_FROZEN_FOR_ACCOUNT_PURGE' });
      await expect(storeB.cancelAccountDeletion(user.id)).rejects.toMatchObject({
        code: 'ACCOUNT_PURGE_ALREADY_STARTED',
      });

      const recovered = await storeB.purgeUserAccount(
        { userId: user.id },
        {
          eraseStorage: async (_inventory, purgeLease) => {
            const execution = await purgeLease.executeEffect(effectDescriptor, async () => {
              providerCalls += 1;

              /* Recovery is delete-idempotent but still requires LIVE absence. */
              if (!providerDeleted) throw new Error('GCS_BUCKET_STILL_PRESENT');
              return { deleted: false, verifiedAbsent: true, bucketStillExists: false, objectsRemaining: 0 };
            });
            return {
              classes: [],
              verified:
                execution.receipt.verifiedAbsent === true &&
                execution.receipt.bucketStillExists === false &&
                execution.receipt.objectsRemaining === 0,
            };
          },
        },
      );

      expect(recovered.outcome).toBe('purged');
      expect(providerCalls).toBe(2);
      await expect(prismaA.purgeReceipt.findUnique({ where: { userId: user.id } })).resolves.toBeTruthy();
      await expect(
        prismaA.purgeEffect.findFirstOrThrow({ where: { plan: { userId: user.id }, effectKey: effectDescriptor.key } }),
      ).resolves.toMatchObject({ status: 'SUCCEEDED', attempt: 2 });
    } finally {
      await cleanup(prismaA, userIds, organizationIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('cancels external billing exactly once across a failed attempt and its durable retry', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    let billingPlanId: string | undefined;
    let subscriptionId: string | undefined;
    const cancelExternalBilling = vi.fn(async () => {
      if (!subscriptionId) throw new Error('subscription was not seeded');
      await prismaB.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'CANCELED', cancelAtPeriodEnd: true },
      });
      return { canceled: true, providerStatus: 'canceled' };
    });

    try {
      const user = await seedDueUser(prismaA);
      userIds.push(user.id);
      const role = await prismaA.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prismaA.organization.create({
        data: {
          name: 'Purge billing org',
          slug: `purge-billing-${suffix()}`,
          members: { create: { userId: user.id, roleId: role.id } },
        },
      });
      organizationIds.push(organization.id);
      const plan = await prismaA.plan.create({
        data: {
          key: `purge-test-${suffix()}`,
          name: 'Purge test plan',
          monthlyCents: 1,
          limits: {},
        },
      });
      billingPlanId = plan.id;
      const subscription = await prismaA.subscription.create({
        data: {
          organizationId: organization.id,
          planId: plan.id,
          externalId: `sub_${suffix()}`,
          status: 'ACTIVE',
        },
      });
      subscriptionId = subscription.id;
      const storeA = new PrismaApiStore(prismaA, undefined, { ...lease, ttlMs: 5_000 });
      const storeB = new PrismaApiStore(prismaB, undefined, { ...lease, ttlMs: 5_000 });
      const deps = (verified: boolean): PurgeStorageDeps => ({
        cancelExternalBilling,
        eraseStorage: async () => ({ classes: [], verified }),
      });

      await expect(storeA.purgeUserAccount({ userId: user.id }, deps(false))).rejects.toMatchObject({
        code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE',
      });
      await expect(storeB.purgeUserAccount({ userId: user.id }, deps(true))).resolves.toMatchObject({
        outcome: 'purged',
      });

      expect(cancelExternalBilling).toHaveBeenCalledOnce();
      expect(cancelExternalBilling).toHaveBeenCalledWith(
        subscription.externalId,
        expect.stringMatching(/^account-purge-.+-/),
      );
      await expect(prismaA.subscription.findUnique({ where: { id: subscription.id } })).resolves.toMatchObject({
        status: 'CANCELED',
        cancelAtPeriodEnd: true,
      });
      await expect(
        prismaA.purgeEffect.findFirst({
          where: {
            plan: { userId: user.id },
            effectKey: `billing-subscription:${subscription.id}`,
          },
        }),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        attempt: 1,
        receipt: { canceled: true, providerStatus: 'canceled' },
      });
    } finally {
      await cleanup(prismaA, userIds, organizationIds).catch(() => undefined);
      if (billingPlanId) await prismaA.plan.delete({ where: { id: billingPlanId } }).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('removes public snapshots and scrubs retained free-form and audit PII', async () => {
    const prisma = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const auditIds: string[] = [];
    const adminAuditIds: string[] = [];
    let ticketId: string | undefined;
    let emailEventId: string | undefined;

    try {
      const user = await seedDueUser(prisma);
      const other = await prisma.user.create({ data: { email: `pii-other-${suffix()}@example.test` } });
      userIds.push(user.id, other.id);
      const role = await prisma.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prisma.organization.create({
        data: {
          name: 'Shared PII purge org',
          slug: `purge-pii-${suffix()}`,
          members: {
            create: [
              { userId: user.id, roleId: role.id },
              { userId: other.id, roleId: role.id },
            ],
          },
          projects: { create: { name: 'Retained shared project', slug: 'retained-shared-project' } },
        },
        include: { projects: true },
      });
      organizationIds.push(organization.id);
      const project = organization.projects[0];
      const impersonationSession = await prisma.session.create({
        data: {
          userId: other.id,
          tokenHash: `impersonation-token-${suffix()}`,
          expiresAt: new Date(Date.now() + 60_000),
          impersonatedBy: user.id,
        },
      });
      const snapshot = await prisma.projectSnapshot.create({
        data: {
          projectId: project.id,
          label: 'Customer SSN 123-45-6789',
          manifest: {},
          createdByUserId: user.id,
        },
      });
      const ticket = await prisma.supportTicket.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          subject: 'Refund card 4242-4242',
          metadata: { email: user.email },
          messages: {
            create: [
              { authorType: 'USER', authorUserId: user.id, body: 'My SSN is 123-45-6789' },
              { authorType: 'ADMIN', authorUserId: other.id, body: `Reply to ${user.email}` },
            ],
          },
        },
      });
      ticketId = ticket.id;
      const share = await prisma.chatShare.create({
        data: {
          tokenHash: `token-${suffix()}`,
          conversationId: `conversation-${suffix()}`,
          projectId: project.id,
          authorUserId: user.id,
          title: 'Public PII snapshot',
          payloadJson: { messages: [{ content: user.email }] },
        },
      });
      const emailEvent = await prisma.emailDeliveryEvent.create({
        data: {
          provider: 'test',
          providerEventId: `provider-${suffix()}`,
          type: 'delivered',
          email: user.email,
          subject: 'PII subject',
          fromAddress: 'pii@example.test',
          payload: { name: 'Personal Name', email: user.email },
        },
      });
      emailEventId = emailEvent.id;
      const audit = await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'pii.audit',
          resourceType: 'user',
          metadata: { email: user.email },
          ipAddress: '203.0.113.10',
        },
      });
      auditIds.push(audit.id);
      const actorAudit = await prisma.adminAuditLog.create({
        data: {
          actorUserId: user.id,
          action: 'pii.actor',
          metadata: { email: user.email },
          ipAddress: '203.0.113.11',
        },
      });
      const targetAudit = await prisma.adminAuditLog.create({
        data: {
          actorUserId: other.id,
          action: 'admin.user.suspend',
          metadata: { userId: user.id, reason: `PII ${user.email}` },
          ipAddress: '203.0.113.12',
        },
      });
      adminAuditIds.push(actorAudit.id, targetAudit.id);

      const store = new PrismaApiStore(prisma, undefined, { ...lease, ttlMs: 5_000 });
      await expect(
        store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: true }) }),
      ).resolves.toMatchObject({ outcome: 'purged' });

      await expect(prisma.chatShare.findUnique({ where: { id: share.id } })).resolves.toBeNull();
      await expect(prisma.session.findUnique({ where: { id: impersonationSession.id } })).resolves.toBeNull();
      await expect(prisma.projectSnapshot.findUnique({ where: { id: snapshot.id } })).resolves.toMatchObject({
        label: null,
        createdByUserId: null,
      });
      await expect(prisma.supportTicket.findUnique({ where: { id: ticket.id } })).resolves.toMatchObject({
        userId: null,
        subject: '[redacted]',
        metadata: expect.objectContaining({ redacted: true }),
      });
      const ticketMessages = await prisma.ticketMessage.findMany({ where: { ticketId: ticket.id } });
      expect(ticketMessages.map(({ body }) => body)).toEqual(['[redacted]', '[redacted]']);
      expect(ticketMessages.find(({ authorType }) => authorType === 'USER')?.authorUserId).toBeNull();
      await expect(prisma.emailDeliveryEvent.findUnique({ where: { id: emailEvent.id } })).resolves.toMatchObject({
        email: `purged-${user.id}@erased.invalid`,
        subject: null,
        fromAddress: null,
        payload: expect.objectContaining({ redacted: true }),
      });
      await expect(prisma.auditLog.findUnique({ where: { id: audit.id } })).resolves.toMatchObject({
        ipAddress: null,
        metadata: expect.objectContaining({ redacted: true }),
      });
      await expect(prisma.adminAuditLog.findUnique({ where: { id: actorAudit.id } })).resolves.toMatchObject({
        ipAddress: null,
        metadata: expect.objectContaining({ redacted: true }),
      });
      await expect(prisma.adminAuditLog.findUnique({ where: { id: targetAudit.id } })).resolves.toMatchObject({
        metadata: expect.objectContaining({ redacted: true, target: 'purged-user' }),
      });
    } finally {
      if (ticketId) await prisma.ticketMessage.deleteMany({ where: { ticketId } }).catch(() => undefined);
      if (ticketId) await prisma.supportTicket.delete({ where: { id: ticketId } }).catch(() => undefined);
      if (emailEventId) await prisma.emailDeliveryEvent.delete({ where: { id: emailEventId } }).catch(() => undefined);
      if (auditIds.length) await prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } }).catch(() => undefined);
      if (adminAuditIds.length) {
        await prisma.adminAuditLog.deleteMany({ where: { id: { in: adminAuditIds } } }).catch(() => undefined);
      }
      if (userIds[0]) {
        await prisma.adminAuditLog
          .deleteMany({
            where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: userIds[0] } },
          })
          .catch(() => undefined);
      }
      await cleanup(prisma, userIds, organizationIds).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('blocks cancellation, topology mutation and GCS mutation while a live plan owns the freeze', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const entered = deferred();
    const release = deferred();
    let liveAuthority: AccountPurgeProjectDeletionAuthority | undefined;

    try {
      const user = await seedDueUser(prismaA);
      const other = await prismaA.user.create({ data: { email: `other-${suffix()}@example.test` } });
      userIds.push(user.id, other.id);
      const role = await prismaA.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prismaA.organization.create({
        data: {
          name: 'Purge fence org',
          slug: `purge-fence-${suffix()}`,
          members: { create: { userId: user.id, roleId: role.id } },
          projects: { create: { name: 'Owned project', slug: 'owned-project' } },
        },
        include: { projects: true },
      });
      const otherOrganization = await prismaA.organization.create({
        data: {
          name: 'Other org',
          slug: `other-${suffix()}`,
          members: { create: { userId: other.id, roleId: role.id } },
          projects: { create: { name: 'Other project', slug: 'other-project' } },
        },
        include: { projects: true },
      });
      organizationIds.push(organization.id, otherOrganization.id);

      const storeA = new PrismaApiStore(prismaA, undefined, { ...lease, ttlMs: 5_000 });
      const storeB = new PrismaApiStore(prismaB, undefined, { ...lease, ttlMs: 5_000 });
      const purge = storeA.purgeUserAccount(
        { userId: user.id },
        {
          permanentlyDeleteOwnedProject: async (authority) => {
            liveAuthority = authority;
            entered.resolve();
            await release.promise;
            throw Object.assign(new Error('Physical deletion intentionally withheld by the fence test'), {
              code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE',
            });
          },
          eraseStorage: async () => ({ classes: [], verified: false }),
        },
      );
      const purgeOutcome = purge.then(
        (result) => ({ result, error: undefined }),
        (error: unknown) => ({ result: undefined, error }),
      );

      await entered.promise;
      expect(liveAuthority).toBeDefined();
      await expect(storeB.cancelAccountDeletion(user.id)).rejects.toMatchObject({
        code: 'ACCOUNT_PURGE_ALREADY_STARTED',
      });
      await expect(
        storeB.addProjectCollaborator({
          projectId: otherOrganization.projects[0].id,
          expectedOrganizationId: otherOrganization.id,
          userId: user.id,
          roleKey: 'editor',
        }),
      ).rejects.toMatchObject({ code: 'USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE' });
      const providerMutation = vi.fn(async () => 'mutated');
      await expect(
        storeB.executeTenantObjectStorageCommand({
          scopes: [
            {
              projectId: organization.projects[0].id,
              expectedOrganizationId: organization.id,
            },
          ],
          command: { type: 'ENSURE_BUCKET', projectId: organization.projects[0].id },
          storage: {
            active: true,
            ensureBucket: providerMutation,
          } as unknown as ObjectStorage,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_FROZEN_FOR_ACCOUNT_PURGE' });
      expect(providerMutation).not.toHaveBeenCalled();

      const permanentDeleteEffect = vi.fn();
      await expect(
        storeB.hardDeleteProject({
          projectId: organization.projects[0].id,
          expectedOrganizationId: organization.id,
          expectedProjectName: organization.projects[0].name,
          idempotencyKey: liveAuthority!.idempotencyKey,
          requestHash: liveAuthority!.requestHash,
          actorUserId: user.id,
          accountPurgeDeletionAuthority: {
            ...liveAuthority!,
            ownerToken: `forged-${suffix()}`,
          },
          ...emptyManagedDatabaseErasureCallbacks(),
          preflightPhysicalErasure: async () => {
            permanentDeleteEffect();
            throw new Error('unreachable');
          },
          erasePhysical: async () => {
            permanentDeleteEffect();
          },
          verifyPhysicalAbsence: async () => {
            permanentDeleteEffect();
            throw new Error('unreachable');
          },
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      expect(permanentDeleteEffect).not.toHaveBeenCalled();

      release.resolve();
      await expect(purgeOutcome).resolves.toMatchObject({
        result: undefined,
        error: { code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE' },
      });
    } finally {
      release.resolve();
      await cleanup(prismaA, userIds, organizationIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
