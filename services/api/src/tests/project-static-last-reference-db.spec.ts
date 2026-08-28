import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';
import { LocalProjectStorage, type ProjectStorage, withProjectLock } from '../project-storage.js';
import { projectPermanentDeletionRequestHash } from '../project-permanent-deletion.js';

async function canReachStaticPlanTables(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = createDatabaseClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ plan: string | null }>>`
      SELECT to_regclass('"ProjectPermanentDeletionArtifactPlan"')::text AS "plan"
    `;
    return rows[0]?.plan !== null;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachStaticPlanTables()) ? describe.sequential : describe.skip;

function token(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

class ObservedStaticBarrierStore extends PrismaApiStore {
  constructor(
    prisma: DatabaseClient,
    private readonly onStaticBarrierAttempt?: () => void,
  ) {
    super(prisma);
  }

  protected override withProjectPhysicalBarriers<T>(projectIds: string[], effect: () => Promise<T>): Promise<T> {
    if (projectIds.includes('static-artifact-erasure-global')) this.onStaticBarrierAttempt?.();
    return super.withProjectPhysicalBarriers(projectIds, effect);
  }

  protected override withProjectFilesystemLock<T>(projectId: string, effect: () => Promise<T>): Promise<T> {
    return withProjectLock(projectId, effect, { forceFileLock: true, bypassProcessQueue: true });
  }
}

runDbTests('static artifact last-reference erasure', () => {
  const previousProjectRoot = process.env.PROJECT_STORAGE_DIR;
  const previousStaticRoot = process.env.STATIC_DEPLOY_STORAGE_DIR;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'vibecore-static-last-ref-'));
    process.env.PROJECT_STORAGE_DIR = join(root, 'projects');
    process.env.STATIC_DEPLOY_STORAGE_DIR = join(root, 'static');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    if (previousProjectRoot === undefined) delete process.env.PROJECT_STORAGE_DIR;
    else process.env.PROJECT_STORAGE_DIR = previousProjectRoot;
    if (previousStaticRoot === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = previousStaticRoot;
  });

  it('holds the global barrier through Project commit so the final owner deletes shared bytes', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const barrierAttemptedByB = deferred();
    const releaseA = deferred();
    const aErased = deferred();
    const storeA = new ObservedStaticBarrierStore(prismaA);
    const storeB = new ObservedStaticBarrierStore(prismaB, barrierAttemptedByB.resolve);
    const suffix = token();
    const actor = await prismaA.user.create({ data: { email: `static-last-ref-${suffix}@example.test` } });
    const organizationA = await prismaA.organization.create({
      data: { name: `Static last ref A ${suffix}`, slug: `static-last-ref-a-${suffix}` },
    });
    const organizationB = await prismaA.organization.create({
      data: { name: `Static last ref B ${suffix}`, slug: `static-last-ref-b-${suffix}` },
    });
    const projectA = await prismaA.project.create({
      data: { organizationId: organizationA.id, name: 'Static owner A', slug: `static-owner-a-${suffix}` },
    });
    const projectB = await prismaA.project.create({
      data: { organizationId: organizationB.id, name: 'Static owner B', slug: `static-owner-b-${suffix}` },
    });
    const digest = createHash('sha256').update(`shared-static-${suffix}`).digest('hex');
    const artifactRef = `static-artifacts/sha256/${digest}`;
    const artifactPath = join(process.env.STATIC_DEPLOY_STORAGE_DIR!, '.artifacts', 'sha256', digest);
    await mkdir(artifactPath, { recursive: true });
    await writeFile(join(artifactPath, 'index.html'), 'shared bytes', 'utf8');
    await prismaA.releaseManifest.createMany({
      data: [
        {
          projectId: projectA.id,
          deploymentId: `deployment-a-${suffix}`,
          environment: 'preview',
          version: 1,
          provider: 'static',
          artifactKind: 'static-snapshot',
          artifactRef,
          artifactDigest: `sha256:${digest}`,
        },
        {
          projectId: projectB.id,
          deploymentId: `deployment-b-${suffix}`,
          environment: 'preview',
          version: 1,
          provider: 'static',
          artifactKind: 'static-snapshot',
          artifactRef,
          artifactDigest: `sha256:${digest}`,
        },
      ],
    });
    const storageA = new LocalProjectStorage(undefined, undefined, undefined, {
      resolveInventory: (projectId) => storeA.resolveProjectStaticErasureInventory(projectId),
      resolveArtifact: (projectId, ref) => storeA.resolveProjectStaticArtifactAuthority(projectId, ref),
    });
    const storageB = new LocalProjectStorage(undefined, undefined, undefined, {
      resolveInventory: (projectId) => storeB.resolveProjectStaticErasureInventory(projectId),
      resolveArtifact: (projectId, ref) => storeB.resolveProjectStaticArtifactAuthority(projectId, ref),
    });
    const preflightB = vi.fn(async () => {
      await expect(prismaB.project.findUnique({ where: { id: projectA.id } })).resolves.toBeNull();
      return storageB.prepareProjectStaticErasureWithinPhysicalAccess(projectB.id);
    });
    const deletion = (
      store: PrismaApiStore,
      storage: LocalProjectStorage,
      project: typeof projectA,
      organizationId: string,
      label: 'a' | 'b',
    ) => {
      const idempotencyKey = `static-last-ref-${label}-${suffix}`;
      return store.hardDeleteProject({
        projectId: project.id,
        expectedOrganizationId: organizationId,
        expectedProjectName: project.name,
        actorUserId: actor.id,
        idempotencyKey,
        requestHash: projectPermanentDeletionRequestHash({
          projectId: project.id,
          organizationId,
          actorUserId: actor.id,
          expectedProjectName: project.name,
        }),
        preflightPhysicalErasure:
          label === 'a' ? () => storage.prepareProjectStaticErasureWithinPhysicalAccess(project.id) : preflightB,
        erasePhysical: async () => {
          await storage.eraseProjectDataWithinPhysicalAccess(project.id);
          await storage.eraseProjectStaticDataWithinPhysicalAccess!(project.id);
          if (label === 'a') {
            aErased.resolve();
            await releaseA.promise;
          }
        },
        verifyPhysicalAbsence: async () => {
          const filesystem = (await storage.verifyProjectDataAbsentWithinPhysicalAccess!(project.id)) as Awaited<
            ReturnType<NonNullable<ProjectStorage['verifyProjectDataAbsentWithinPhysicalAccess']>>
          >;
          await (label === 'a' ? prismaA : prismaB).releaseManifest.deleteMany({ where: { projectId: project.id } });
          return {
            outcome: 'VERIFIED_ABSENT',
            verifier: 'static-last-reference-db-test-v1',
            evidence: {
              schemaVersion: 'project-permanent-erasure-v1',
              filesystem: {
                projectTreeAbsent: filesystem.treeAbsent,
                workspaceTreesAbsent: filesystem.treeAbsent,
                objectCacheAbsent: filesystem.exportsAbsent,
                staticSnapshotsAbsent: filesystem.staticSnapshotsAbsent!,
                staticAliasesAbsent: filesystem.staticAliasesAbsent!,
                staticArtifactSummary: filesystem.staticArtifactSummary!,
              },
              gcs: { bucketAbsent: true, objectCount: 0 },
            },
          };
        },
      });
    };

    try {
      const deleteA = deletion(storeA, storageA, projectA, organizationA.id, 'a');
      await aErased.promise;
      const deleteB = deletion(storeB, storageB, projectB, organizationB.id, 'b');
      await barrierAttemptedByB.promise;
      expect(preflightB).not.toHaveBeenCalled();
      releaseA.resolve();
      await expect(Promise.all([deleteA, deleteB])).resolves.toEqual([
        expect.objectContaining({ project: expect.objectContaining({ id: projectA.id }) }),
        expect.objectContaining({ project: expect.objectContaining({ id: projectB.id }) }),
      ]);

      await expect(exists(artifactPath)).resolves.toBe(false);
      expect(preflightB).toHaveBeenCalledOnce();
      const plans = await prismaA.$queryRaw<
        Array<{ idempotencyKey: string; state: string; finalOtherReferenceCount: number | null }>
      >`
        SELECT operation."idempotencyKey", plan."state"::text AS "state", plan."finalOtherReferenceCount"
        FROM "ProjectPermanentDeletionArtifactPlan" plan
        JOIN "ObjectStorageOperation" operation ON operation."id" = plan."operationId"
        WHERE operation."idempotencyKey" IN (
          ${`static-last-ref-a-${suffix}`}, ${`static-last-ref-b-${suffix}`}
        )
        ORDER BY operation."idempotencyKey" ASC
      `;
      expect(plans).toEqual([
        {
          idempotencyKey: `static-last-ref-a-${suffix}`,
          state: 'RETAINED',
          finalOtherReferenceCount: 1,
        },
        {
          idempotencyKey: `static-last-ref-b-${suffix}`,
          state: 'DELETED',
          finalOtherReferenceCount: 0,
        },
      ]);
    } finally {
      releaseA.resolve();
      await prismaA.releaseManifest.deleteMany({ where: { projectId: { in: [projectA.id, projectB.id] } } });
      await prismaA.project.deleteMany({ where: { id: { in: [projectA.id, projectB.id] } } }).catch(() => undefined);
      await prismaA.organization
        .deleteMany({ where: { id: { in: [organizationA.id, organizationB.id] } } })
        .catch(() => undefined);
      await prismaA.user.deleteMany({ where: { id: actor.id } }).catch(() => undefined);
      await Promise.all([storeA.disconnect(), storeB.disconnect()]);
    }
  }, 60_000);
});
