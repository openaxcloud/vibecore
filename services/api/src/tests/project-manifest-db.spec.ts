import { hashPassword } from '@vibecore/auth';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';
import { PrismaApiStore } from '../prisma-store.js';
import { objectStorageStaticArtifactSummary } from '../object-storage-operation.js';
import { projectPermanentDeletionRequestHash } from '../project-permanent-deletion.js';
import {
  canonicalizeProjectManifest,
  createDefaultProjectManifest,
  projectManifestDigest,
  verifyStoredProjectManifestRevision,
} from '../project-manifest.js';
import { seedVerifiedEmptyProjectVolumeErasure } from './project-volume-erasure-fixture.js';
import { emptyManagedDatabaseErasureCallbacks } from './project-database-erasure-test-support.js';

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

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

const runWithPostgres = (await canReachDatabase()) ? describe : describe.skip;

const emptyStaticArtifactSummary = objectStorageStaticArtifactSummary([]);

function hardDeleteProject(
  store: PrismaApiStore,
  prisma: DatabaseClient,
  project: { id: string; organizationId: string; name: string },
  actorUserId: string,
) {
  let volumeProof: Awaited<ReturnType<typeof seedVerifiedEmptyProjectVolumeErasure>> | undefined;
  return store.hardDeleteProject({
    projectId: project.id,
    expectedOrganizationId: project.organizationId,
    expectedProjectName: project.name,
    actorUserId,
    idempotencyKey: `manifest-test-delete-${project.id}`,
    requestHash: projectPermanentDeletionRequestHash({
      projectId: project.id,
      organizationId: project.organizationId,
      actorUserId,
      expectedProjectName: project.name,
    }),
    ...emptyManagedDatabaseErasureCallbacks(),
    preflightPhysicalErasure: async () => emptyStaticArtifactSummary,
    erasePhysical: async (_assertLease, lease) => {
      const current = await prisma.project.findUniqueOrThrow({
        where: { id: project.id },
        select: { ownershipEpoch: true },
      });
      volumeProof = await seedVerifiedEmptyProjectVolumeErasure(prisma, {
        operationId: lease.operationId,
        projectId: project.id,
        organizationId: project.organizationId,
        ownershipEpoch: current.ownershipEpoch,
        fencingToken: lease.fencingToken,
      });
    },
    verifyPhysicalAbsence: async () => ({
      outcome: 'VERIFIED_ABSENT',
      verifier: 'project-manifest-db-test',
      evidence: {
        schemaVersion: 'project-permanent-erasure-v3',
        filesystem: {
          projectTreeAbsent: true,
          workspaceTreesAbsent: true,
          objectCacheAbsent: true,
          staticSnapshotsAbsent: true,
          staticAliasesAbsent: true,
          staticArtifactSummary: emptyStaticArtifactSummary,
        },
        gcs: { bucketAbsent: true, objectCount: 0 },
        workspaceManager: {
          schemaVersion: 'workspace-project-erasure-v3',
          projectId: project.id,
          organizationId: project.organizationId,
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
    }),
  });
}

runWithPostgres('ProjectManifest — real PostgreSQL concurrency and constraints', () => {
  it('creates v1 atomically, admits exactly one stale v2 writer, and cascades history', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const user = await storeA.createUser({
        email: `manifest-db-${suffix}@example.test`,
        passwordHash: hashPassword('correct horse battery staple'),
      });
      const organization = await storeA.createOrganization({
        name: `Manifest DB ${suffix}`,
        slug: `manifest-db-${suffix}`,
        ownerUserId: user.id,
      });
      const project = await storeA.createProject({
        organizationId: organization.id,
        name: 'Manifest DB project',
        slug: `manifest-project-${suffix}`,
      });

      const initial = await storeB.getLatestProjectManifest(project.id);

      expect(initial).toBeDefined();
      expect(verifyStoredProjectManifestRevision(initial!, project.id)).toMatchObject({ manifestVersion: 1 });

      const legacyProject = await prismaA.project.create({
        data: {
          organizationId: organization.id,
          name: 'Legacy project without revision',
          slug: `legacy-manifest-${suffix}`,
        },
      });
      const legacyManifest = createDefaultProjectManifest(legacyProject.id);
      const legacyDigest = projectManifestDigest(legacyManifest);
      const materialized = await Promise.all(
        [storeA, storeB].map((store) =>
          store.createProjectManifestRevision({
            projectId: legacyProject.id,
            expectedOrganizationId: organization.id,
            schemaVersion: legacyManifest.schemaVersion,
            manifestVersion: legacyManifest.manifestVersion,
            digest: legacyDigest,
            manifest: legacyManifest,
          }),
        ),
      );

      expect(materialized[0]!.id).toBe(materialized[1]!.id);
      await expect(prismaA.projectManifestRevision.count({ where: { projectId: legacyProject.id } })).resolves.toBe(1);

      const base = verifyStoredProjectManifestRevision(initial!, project.id);

      const candidates = ['alpha', 'beta'].map((scope) => {
        const manifest = canonicalizeProjectManifest({
          ...base,
          manifestVersion: 2,
          artifacts: [
            {
              ...base.artifacts[0],
              components: [{ componentId: 'api', kind: 'API' }],
            },
          ],
          scopes: [`deploy:${scope}`],
          sharedBackendBinding: { bindingId: 'backend', componentIds: ['api'] },
          sharedDataBindings: [
            {
              bindingId: 'database',
              resourceRef: 'database:source-primary',
              access: 'READ_WRITE',
              componentIds: ['api'],
            },
          ],
          sharedStorageBindings: [
            {
              bindingId: 'assets',
              resourceRef: 'bucket:source-assets',
              access: 'READ_ONLY',
              componentIds: ['api'],
            },
          ],
          entitlementsRef: 'entitlements:source-org',
        });
        return { manifest, digest: projectManifestDigest(manifest) };
      });

      const attempts = await Promise.allSettled(
        candidates.map((candidate, index) =>
          (index === 0 ? storeA : storeB).createProjectManifestRevision({
            projectId: project.id,
            expectedOrganizationId: organization.id,
            schemaVersion: candidate.manifest.schemaVersion,
            manifestVersion: candidate.manifest.manifestVersion,
            digest: candidate.digest,
            manifest: candidate.manifest,
            expectedDigest: initial!.digest,
            createdByUserId: user.id,
          }),
        ),
      );

      expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect((attempts.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({
        code: 'PROJECT_MANIFEST_VERSION_CONFLICT',
      });

      const rows = await prismaA.projectManifestRevision.findMany({ where: { projectId: project.id } });
      expect(rows.map((row) => row.manifestVersion).sort()).toEqual([1, 2]);

      const copy = await storeA.duplicateProject({
        projectId: project.id,
        name: 'Manifest DB copy',
        slug: `manifest-copy-${suffix}`,
      });

      const copiedRevision = await storeA.getLatestProjectManifest(copy.id);
      const copiedManifest = verifyStoredProjectManifestRevision(copiedRevision!, copy.id);
      expect(copiedManifest).toMatchObject({
        projectId: copy.id,
        manifestVersion: 1,
        sharedBackendBinding: { bindingId: 'backend', componentIds: ['api'] },
        entitlementsRef: 'entitlements:source-org',
      });

      const detached = await storeA.duplicateProject({
        projectId: project.id,
        organizationId: organization.id,
        name: 'Manifest DB detached remix',
        slug: `manifest-detached-${suffix}`,
        manifestCloneMode: 'DETACH_EXTERNALS',
      });

      const detachedRevision = await storeA.getLatestProjectManifest(detached.id);
      const detachedManifest = verifyStoredProjectManifestRevision(detachedRevision!, detached.id);
      expect(detachedManifest).not.toHaveProperty('sharedBackendBinding');
      expect(detachedManifest).not.toHaveProperty('sharedDataBindings');
      expect(detachedManifest).not.toHaveProperty('sharedStorageBindings');
      expect(detachedManifest).not.toHaveProperty('entitlementsRef');

      /* DB-level mutation guards: alternate writers cannot alter or erase history. */
      await expect(
        prismaA.projectManifestRevision.update({ where: { id: rows[0]!.id }, data: { digest: 'not-a-digest' } }),
      ).rejects.toThrow();
      await expect(
        prismaA.projectManifestRevision.update({ where: { id: rows[0]!.id }, data: { createdByUserId: user.id } }),
      ).rejects.toThrow(/append-only/u);
      await expect(prismaA.projectManifestRevision.delete({ where: { id: rows[0]!.id } })).rejects.toThrow(
        /append-only/u,
      );

      await hardDeleteProject(storeA, prismaA, copy, user.id);
      await hardDeleteProject(storeA, prismaA, detached, user.id);
      await hardDeleteProject(storeA, prismaA, project, user.id);
      await hardDeleteProject(storeA, prismaA, legacyProject, user.id);
      await expect(prismaA.projectManifestRevision.count({ where: { projectId: project.id } })).resolves.toBe(0);
    } finally {
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    }
  }, 120_000);
});
