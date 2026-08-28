import { randomUUID } from 'node:crypto';

import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import {
  appImageBuildIntentHash,
  appImageBuildOperationTag,
  type AppImageBuildSpec,
  type AppImageBuildSubmissionResolutionEvidence,
} from '../app-image-build.js';
import {
  promoteArtifact,
  type OciAttachment,
  type RegistryAdapter,
  type RegistryRequestOptions,
} from '../artifact-promotion.js';
import { PrismaApiStore } from '../prisma-store.js';
import { registryMutationIntentHash } from '../registry-mutation.js';
import type { RegistryMutationRecoveryObservation } from '../store.js';
import { committedPromotionFixture } from './deterministic-release-fixture.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';

const runDbTests = process.env.DATABASE_URL ? describe.sequential : describe.skip;
const DIGEST = `sha256:${'a'.repeat(64)}`;

function unique(label: string): string {
  return `${label}-${randomUUID()}`;
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

runDbTests('app image build + registry store — PostgreSQL', () => {
  it('recovers SUBMITTING under a fresh release fence and protects outside-project references', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const organization = await prismaA.organization.create({
      data: { name: unique('build-registry'), slug: unique('build-registry') },
    });
    const project = await prismaA.project.create({
      data: { organizationId: organization.id, name: 'Durable image build', slug: unique('durable-image-build') },
    });
    const deployment = await prismaA.deployment.create({
      data: { projectId: project.id, provider: 'server' },
    });
    const sourceRepository = `europe-west9-docker.pkg.dev/build-proj/build-repo/p-${project.id.toLowerCase()}`;
    const targetRepository = `europe-west9-docker.pkg.dev/tenant-proj/tenant-repo/p-${project.id.toLowerCase()}`;
    const operationId = `app-image-build:${deployment.id}`;
    const operationTag = appImageBuildOperationTag(operationId);
    const spec: AppImageBuildSpec = {
      gcpProject: 'build-proj',
      region: 'europe-west9',
      sourceBucket: 'build-contexts',
      sourceObject: `projects/${project.id}/${deployment.id}.tar.gz`,
      imageUri: `${sourceRepository}:${deployment.id.toLowerCase()}`,
      cosignKmsKey: 'gcpkms://projects/build-proj/locations/europe-west9/keyRings/signing/cryptoKeys/apps',
      buildServiceAccount: 'projects/build-proj/serviceAccounts/app-builder@build-proj.iam.gserviceaccount.com',
      signingServiceAccount: 'projects/build-proj/serviceAccounts/app-signer@build-proj.iam.gserviceaccount.com',
      baseImage: 'europe-west9-docker.pkg.dev/build-proj/base/workspace@sha256:base',
      buildCommand: 'pnpm build',
      startCommand: 'pnpm start',
      timeoutSeconds: 120,
    };
    const firstFence = await acquireTestProjectReleaseFence(storeA, {
      projectId: project.id,
      organizationId: organization.id,
      operationId,
    });
    let secondFence: Awaited<ReturnType<typeof acquireTestProjectReleaseFence>> | undefined;
    let outsideProjectId: string | undefined;

    try {
      const provider = {
        gcpProject: spec.gcpProject,
        region: spec.region,
        sourceBucket: spec.sourceBucket,
        sourceObject: spec.sourceObject,
        imageUri: spec.imageUri,
        buildServiceAccount: spec.buildServiceAccount,
        timeoutSeconds: spec.timeoutSeconds,
      };
      const prepared = await storeA.prepareAppImageBuild({
        operationId,
        projectId: project.id,
        deploymentId: deployment.id,
        provider,
        operationTag,
        intentHash: appImageBuildIntentHash(spec),
        releaseFence: firstFence.releaseFence,
      });
      expect(prepared.state).toEqual({ phase: 'PREPARED' });
      await expect(
        storeA.prepareAppImageBuild({
          operationId,
          projectId: project.id,
          deploymentId: deployment.id,
          provider,
          operationTag,
          intentHash: `sha256:${'b'.repeat(64)}`,
          releaseFence: firstFence.releaseFence,
        }),
      ).rejects.toMatchObject({ code: 'APP_IMAGE_BUILD_INTENT_CONFLICT' });

      await storeA.markAppImageBuildSubmissionStarted({
        operationId,
        projectId: project.id,
        operationTag,
        releaseFence: firstFence.releaseFence,
      });
      const submissionClock = await prismaA.$queryRaw<
        Array<{ now: Date; submissionStartedAt: Date; submissionResolveAfter: Date }>
      >`
        SELECT clock_timestamp() AS "now", "submissionStartedAt", "submissionResolveAfter"
        FROM "AppImageBuildOperation"
        WHERE "id" = ${operationId}
      `;
      expect(
        submissionClock[0]!.submissionResolveAfter.getTime() - submissionClock[0]!.submissionStartedAt.getTime(),
      ).toBe(15 * 60_000);
      expect(submissionClock[0]!.submissionResolveAfter.getTime()).toBeGreaterThan(submissionClock[0]!.now.getTime());
      const dbNow = submissionClock[0]!.now.getTime();
      const recoveryEvidence: AppImageBuildSubmissionResolutionEvidence = {
        schemaVersion: 'app-image-build-submission-resolution-v1',
        resolution: 'MANUAL_RECOVERY',
        operatorUserId: unique('operator'),
        auditEventId: unique('audit'),
        operationTag,
        gcpProject: spec.gcpProject,
        region: spec.region,
        observationWindowStartedAt: new Date(dbNow - 5 * 60_000).toISOString(),
        observationWindowEndedAt: new Date(dbNow - 2 * 60_000).toISOString(),
        providerQueries: [
          {
            queriedAt: new Date(dbNow - 4 * 60_000).toISOString(),
            filter: `tags="${operationTag}"`,
            result: 'ABSENT',
          },
          {
            queriedAt: new Date(dbNow - 3 * 60_000).toISOString(),
            filter: `tags="${operationTag}"`,
            result: 'AMBIGUOUS',
          },
        ],
      };
      await expect(
        storeB.resolveAppImageBuildSubmission({
          operationId,
          expectedOrganizationId: organization.id,
          evidence: recoveryEvidence,
        }),
      ).rejects.toMatchObject({ code: 'APP_IMAGE_BUILD_RECOVERY_AUTHORITY_INVALID' });
      await prismaA.$executeRaw`
        UPDATE "AppImageBuildOperation"
        SET "submissionStartedAt" = clock_timestamp() - interval '25 minutes',
            "submissionResolveAfter" = clock_timestamp() - interval '10 minutes'
        WHERE "id" = ${operationId}
      `;
      await expect(
        storeB.resolveAppImageBuildSubmission({
          operationId,
          expectedOrganizationId: organization.id,
          evidence: { ...recoveryEvidence, providerQueries: recoveryEvidence.providerQueries.slice(0, 1) },
        }),
      ).rejects.toMatchObject({ code: 'APP_IMAGE_BUILD_RECOVERY_EVIDENCE_INVALID' });
      await expect(
        storeB.resolveAppImageBuildSubmission({
          operationId,
          expectedOrganizationId: organization.id,
          evidence: recoveryEvidence,
        }),
      ).resolves.toMatchObject({ state: { phase: 'MANUAL_RECOVERY' } });
      await expect(prismaA.$executeRaw`DELETE FROM "Project" WHERE "id" = ${project.id}`).rejects.toThrow(
        /PROJECT_IMAGE_ERASURE_RECEIPT_REQUIRED/u,
      );
      expect(
        await storeB.readAppImageBuildState({
          operationId,
          projectId: project.id,
          releaseFence: firstFence.releaseFence,
        }),
      ).toMatchObject({ phase: 'MANUAL_RECOVERY' });

      expect(await firstFence.release()).toBe(true);
      secondFence = await acquireTestProjectReleaseFence(storeB, {
        projectId: project.id,
        organizationId: organization.id,
        operationId: `${operationId}:recovery`,
      });
      await expect(
        storeA.recordAppImageBuildIdentity({
          operationId,
          projectId: project.id,
          buildId: 'build-recovered',
          operationTag,
          releaseFence: firstFence.releaseFence,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
      expect(
        await storeB.readAppImageBuildState({
          operationId,
          projectId: project.id,
          releaseFence: secondFence.releaseFence,
        }),
      ).toMatchObject({ phase: 'MANUAL_RECOVERY' });
      await storeB.recordAppImageBuildIdentity({
        operationId,
        projectId: project.id,
        buildId: 'build-recovered',
        operationTag,
        logUrl: 'https://console.cloud.google.com/cloud-build/builds;region=europe-west9/build-recovered',
        releaseFence: secondFence.releaseFence,
      });
      await storeB.recordAppImageBuildTerminal({
        operationId,
        projectId: project.id,
        buildId: 'build-recovered',
        providerStatus: 'SUCCESS',
        digest: DIGEST,
        releaseFence: secondFence.releaseFence,
      });
      const promotion = {
        ...committedPromotionFixture({
          organizationId: organization.id,
          artifactRef: targetRepository,
          artifactDigest: DIGEST,
          promotionId: unique('promotion'),
        }),
        sourceRepo: sourceRepository,
      };
      await storeB.prepareAppImageBuildPromotion({
        operationId,
        projectId: project.id,
        targetRepository,
        releaseFence: secondFence.releaseFence,
      });
      await expect(
        prismaA.appImageBuildOperation.findUniqueOrThrow({ where: { id: operationId } }),
      ).resolves.toMatchObject({ targetRepository, targetDigest: null, promotionReferences: null });
      await expect(storeA.resolveProjectRegistryErasureAuthority(project.id)).resolves.toMatchObject({
        projectPackages: expect.arrayContaining([sourceRepository, targetRepository]),
      });
      await storeB.recordAppImageBuildPromotion({
        operationId,
        projectId: project.id,
        targetRepository,
        targetDigest: DIGEST,
        promotionReferences: promotion,
        releaseFence: secondFence.releaseFence,
      });
      await expect(
        prismaA.appImageBuildOperation.findUniqueOrThrow({ where: { id: operationId } }),
      ).resolves.toMatchObject({
        phase: 'TERMINAL',
        providerBuildId: 'build-recovered',
        providerStatus: 'SUCCESS',
        imageDigest: DIGEST,
        targetRepository,
        targetDigest: DIGEST,
      });

      const absentDeployment = await prismaA.deployment.create({
        data: { projectId: project.id, provider: 'server' },
      });
      const absentOperationId = `app-image-build:${absentDeployment.id}`;
      const absentOperationTag = appImageBuildOperationTag(absentOperationId);
      const absentImageUri = `${sourceRepository}:${absentDeployment.id.toLowerCase()}`;
      const absentSpec = { ...spec, imageUri: absentImageUri };
      await storeB.prepareAppImageBuild({
        operationId: absentOperationId,
        projectId: project.id,
        deploymentId: absentDeployment.id,
        provider: { ...provider, imageUri: absentImageUri },
        operationTag: absentOperationTag,
        intentHash: appImageBuildIntentHash(absentSpec),
        releaseFence: secondFence.releaseFence,
      });
      await storeB.markAppImageBuildSubmissionStarted({
        operationId: absentOperationId,
        projectId: project.id,
        operationTag: absentOperationTag,
        releaseFence: secondFence.releaseFence,
      });
      await prismaA.$executeRaw`
        UPDATE "AppImageBuildOperation"
        SET "submissionStartedAt" = clock_timestamp() - interval '25 minutes',
            "submissionResolveAfter" = clock_timestamp() - interval '10 minutes'
        WHERE "id" = ${absentOperationId}
      `;
      const absentClock = await prismaA.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const absentNow = absentClock[0]!.now.getTime();
      const absentEvidence: AppImageBuildSubmissionResolutionEvidence = {
        schemaVersion: 'app-image-build-submission-resolution-v1',
        resolution: 'REJECTED_ABSENT',
        operatorUserId: unique('absent-operator'),
        auditEventId: unique('absent-audit'),
        operationTag: absentOperationTag,
        gcpProject: absentSpec.gcpProject,
        region: absentSpec.region,
        observationWindowStartedAt: new Date(absentNow - 9 * 60_000).toISOString(),
        observationWindowEndedAt: new Date(absentNow - 60_000).toISOString(),
        providerQueries: [
          {
            queriedAt: new Date(absentNow - 8 * 60_000).toISOString(),
            filter: `tags="${absentOperationTag}"`,
            result: 'ABSENT',
          },
          {
            queriedAt: new Date(absentNow - 2 * 60_000).toISOString(),
            filter: `tags="${absentOperationTag}"`,
            result: 'ABSENT',
          },
        ],
      };
      await expect(
        storeA.resolveAppImageBuildSubmission({
          operationId: absentOperationId,
          expectedOrganizationId: organization.id,
          evidence: absentEvidence,
        }),
      ).resolves.toMatchObject({ state: { phase: 'REJECTED_ABSENT', evidence: absentEvidence } });

      const outside = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Outside reference', slug: unique('outside-reference') },
      });
      outsideProjectId = outside.id;
      const outsideDeployment = await prismaA.deployment.create({
        data: { projectId: outside.id, provider: 'server' },
      });
      await expect(
        prismaA.appImageBuildOperation.create({
          data: {
            id: unique('outside-build'),
            projectId: outside.id,
            organizationId: organization.id,
            ownershipEpoch: 0,
            deploymentId: outsideDeployment.id,
            phase: 'TERMINAL',
            operationTag: unique('outside-tag'),
            intentHash: `sha256:${'c'.repeat(64)}`,
            gcpProject: spec.gcpProject,
            region: spec.region,
            sourceBucket: spec.sourceBucket,
            sourceObject: unique('outside-source'),
            imageUri: `${sourceRepository}:outside`,
            sourceRepository,
            sourceTag: 'outside',
            buildServiceAccount: spec.buildServiceAccount,
            timeoutSeconds: 120,
            providerBuildId: unique('outside-provider-build'),
            providerStatus: 'SUCCESS',
            imageDigest: DIGEST,
            submissionStartedAt: new Date(),
            identifiedAt: new Date(),
            terminalAt: new Date(),
          },
        }),
      ).rejects.toThrow();
      await expect(
        storeA.countProjectRegistryReferencesOutsideProject(
          { kind: 'manifest', repository: sourceRepository, digest: DIGEST },
          project.id,
        ),
      ).resolves.toBe(0);
    } finally {
      await secondFence?.release().catch(() => false);
      await prismaA.appImageBuildOperation.deleteMany({
        where: { projectId: { in: [project.id, outsideProjectId ?? ''] } },
      });
      await prismaA.project.deleteMany({ where: { id: { in: [project.id, outsideProjectId ?? ''] } } });
      await prismaA.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('moves a known provider id without receipt to audited MANUAL_RECOVERY', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const organization = await prisma.organization.create({
      data: { name: unique('registry-manual'), slug: unique('registry-manual') },
    });
    const project = await prisma.project.create({
      data: { organizationId: organization.id, name: 'Registry manual recovery', slug: unique('registry-manual') },
    });
    const operator = await prisma.user.create({
      data: { email: `${unique('registry-manual-operator')}@example.com`, platformAdmin: true },
    });
    const repository = `europe-west9-docker.pkg.dev/build-proj/build-repo/p-${project.id.toLowerCase()}`;
    const intent = {
      operationId: unique('registry-known-provider'),
      projectId: project.id,
      organizationId: organization.id,
      ownershipEpoch: project.ownershipEpoch,
      kind: 'APP_IMAGE_BUILD' as const,
      repositories: [repository],
      intentHash: registryMutationIntentHash({ repository, purpose: 'known-provider-manual' }),
    };

    try {
      await expect(
        store.withRegistryMutation(intent, async (guard) => {
          await guard.recordProviderOperationId('cloud-build-known-without-receipt');
          throw new Error('simulated crash before provider receipt');
        }),
      ).rejects.toThrow('simulated crash');
      await prisma.$executeRaw`
        UPDATE "RegistryMutationOperation"
        SET "ambiguousAt" = clock_timestamp() - interval '10 minutes',
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${intent.operationId}
      `;
      const clock = await prisma.$queryRaw<Array<{ now: Date; ambiguousAt: Date }>>`
        SELECT clock_timestamp() AS "now", "ambiguousAt"
        FROM "RegistryMutationOperation"
        WHERE "id" = ${intent.operationId}
      `;
      const started = new Date(clock[0]!.ambiguousAt.getTime() + 60_000).toISOString();
      const providerQueries = [60_000, 120_000].map((offset) => ({
        queriedAt: new Date(Date.parse(started) + offset).toISOString(),
        providerOperationId: 'cloud-build-known-without-receipt',
        result: 'UNRESOLVED' as const,
      }));
      const recovery = await store.resolveAmbiguousRegistryMutation({
        operationId: intent.operationId,
        operatorUserId: operator.id,
        observation: {
          resolution: 'MANUAL_RECOVERY',
          observationWindowStartedAt: started,
          observationWindowEndedAt: clock[0]!.now.toISOString(),
          providerQueries,
        },
      });
      expect(recovery.state).toBe('MANUAL_RECOVERY');
      await expect(
        prisma.registryMutationOperation.findUniqueOrThrow({ where: { id: intent.operationId } }),
      ).resolves.toMatchObject({
        state: 'MANUAL_RECOVERY',
        providerOperationId: 'cloud-build-known-without-receipt',
        providerEvidence: null,
        lastErrorCode: 'REGISTRY_MUTATION_MANUAL_RECOVERY',
      });
      await expect(store.withRegistryMutation(intent, async () => undefined)).rejects.toMatchObject({
        code: 'REGISTRY_MUTATION_MANUAL_RECOVERY',
      });
      await expect(prisma.$executeRaw`DELETE FROM "Project" WHERE "id" = ${project.id}`).rejects.toThrow(
        /PROJECT_IMAGE_ERASURE_RECEIPT_REQUIRED/u,
      );
      await expect(
        prisma.registryMutationRecovery.findUniqueOrThrow({
          where: { auditLogId: recovery.auditLogId },
          include: { auditLog: true },
        }),
      ).resolves.toMatchObject({
        resolution: 'MANUAL_RECOVERY',
        auditLog: { actorUserId: operator.id, organizationId: organization.id },
      });
    } finally {
      await prisma.registryMutationOperation.deleteMany({ where: { projectId: project.id } });
      await prisma.auditLog.deleteMany({
        where: { organizationId: organization.id, resourceType: 'registryMutationOperation' },
      });
      await prisma.user.delete({ where: { id: operator.id } }).catch(() => undefined);
      await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
      await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
      await store.disconnect();
    }
  });

  it('reopens the same FAILED_SAFE erasure id only after verify-first under a new durable attempt', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const organization = await prisma.organization.create({
      data: { name: unique('registry-retry'), slug: unique('registry-retry') },
    });
    const project = await prisma.project.create({
      data: { organizationId: organization.id, name: 'Registry retry', slug: unique('registry-retry') },
    });
    const operator = await prisma.user.create({
      data: { email: `${unique('registry-retry-operator')}@example.com`, platformAdmin: true },
    });
    const repository = `europe-west9-docker.pkg.dev/build-proj/build-repo/p-${project.id.toLowerCase()}`;
    const intent = {
      operationId: `registry-mutation:erasure:${unique('permanent-delete')}`,
      projectId: project.id,
      organizationId: organization.id,
      ownershipEpoch: project.ownershipEpoch,
      kind: 'PROJECT_ERASURE' as const,
      repositories: [repository],
      intentHash: registryMutationIntentHash({ repository, purpose: 'crash-before-provider-post' }),
    };

    try {
      await expect(
        store.withRegistryMutation(intent, async () => {
          throw new Error('crash-before-provider-post');
        }),
      ).rejects.toThrow('crash-before-provider-post');
      await expect(
        prisma.registryMutationOperation.findUniqueOrThrow({ where: { id: intent.operationId } }),
      ).resolves.toMatchObject({
        state: 'AMBIGUOUS',
        attemptNumber: 1n,
        fencingToken: 1n,
        attemptId: `${intent.operationId}:attempt:1:fence:1`,
        providerOperationId: null,
        providerEvidence: null,
      });
      await prisma.$executeRaw`
        UPDATE "RegistryMutationOperation"
        SET "ambiguousAt" = clock_timestamp() - interval '10 minutes',
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${intent.operationId}
      `;
      const clock = await prisma.$queryRaw<Array<{ now: Date; ambiguousAt: Date }>>`
        SELECT clock_timestamp() AS "now", "ambiguousAt"
        FROM "RegistryMutationOperation"
        WHERE "id" = ${intent.operationId}
      `;
      const started = new Date(clock[0]!.ambiguousAt.getTime() + 60_000).toISOString();
      await store.resolveAmbiguousRegistryMutation({
        operationId: intent.operationId,
        operatorUserId: operator.id,
        observation: {
          resolution: 'FAILED_SAFE',
          observationWindowStartedAt: started,
          observationWindowEndedAt: clock[0]!.now.toISOString(),
          providerQueries: [60_000, 120_000].map((offset) => ({
            queriedAt: new Date(Date.parse(started) + offset).toISOString(),
            result: 'ABSENT' as const,
          })),
        },
      });
      await expect(store.withRegistryMutation(intent, async () => undefined)).rejects.toMatchObject({
        code: 'REGISTRY_MUTATION_ALREADY_TERMINAL',
      });

      let unsafeEffectStarted = false;
      await expect(
        store.withRegistryMutation(
          intent,
          async () => {
            unsafeEffectStarted = true;
          },
          {
            verifyFailedSafeRetry: async () => {
              throw new Error('provider gained content after the failed-safe proof');
            },
          },
        ),
      ).rejects.toThrow('provider gained content');
      expect(unsafeEffectStarted).toBe(false);
      await expect(
        prisma.registryMutationOperation.findUniqueOrThrow({ where: { id: intent.operationId } }),
      ).resolves.toMatchObject({
        state: 'FAILED_SAFE',
        attemptNumber: 1n,
        fencingToken: 1n,
      });

      let verifyFirstCalls = 0;
      await expect(
        store.withRegistryMutation(
          intent,
          async (guard) => {
            expect(verifyFirstCalls).toBe(1);
            expect(guard.attemptNumber).toBe(2n);
            expect(guard.fencingToken).toBe(2n);
            expect(guard.attemptId).toBe(`${intent.operationId}:attempt:2:fence:2`);
            await guard.recordProviderEvidence({ erased: true, repository });
            return 'retry-verified';
          },
          {
            verifyFailedSafeRetry: async (guard) => {
              verifyFirstCalls += 1;
              expect(guard.attemptNumber).toBe(2n);
              expect(guard.attemptId).toBe(`${intent.operationId}:attempt:2:fence:2`);
              await guard.assertActive();
            },
          },
        ),
      ).resolves.toBe('retry-verified');
      await expect(
        prisma.registryMutationOperation.findUniqueOrThrow({ where: { id: intent.operationId } }),
      ).resolves.toMatchObject({
        state: 'VERIFIED',
        attemptNumber: 2n,
        fencingToken: 2n,
        attemptId: `${intent.operationId}:attempt:2:fence:2`,
        recoveryEvidence: null,
      });
      await expect(prisma.registryMutationRecovery.count({ where: { operationId: intent.operationId } })).resolves.toBe(
        1,
      );
    } finally {
      await prisma.registryMutationOperation.deleteMany({ where: { projectId: project.id } });
      await prisma.auditLog.deleteMany({
        where: { organizationId: organization.id, resourceType: 'registryMutationOperation' },
      });
      await prisma.user.delete({ where: { id: operator.id } }).catch(() => undefined);
      await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
      await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
      await store.disconnect();
    }
  });

  it('propagates pg-session abort into a suspended registry provider and skips stale rollback deletes', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const store = new PrismaApiStore(prismaA, undefined, undefined, {
      registryMutationLeaseMs: 2_000,
      registryMutationHeartbeatMs: 100,
    });
    const organization = await prismaA.organization.create({
      data: { name: unique('registry-abort-provider'), slug: unique('registry-abort-provider') },
    });
    const project = await prismaA.project.create({
      data: { organizationId: organization.id, name: 'Registry abort provider', slug: unique('registry-abort') },
    });
    const sourceRepo = `europe-west9-docker.pkg.dev/build-proj/source-repo/p-${project.id.toLowerCase()}`;
    const targetRepo = `europe-west9-docker.pkg.dev/tenant-proj/target-repo/p-${project.id.toLowerCase()}`;
    const copyEntered = deferred();
    const signalAborted = deferred();
    const deleteCalls: string[] = [];
    let propagatedSignal: AbortSignal | undefined;
    let backendPid = 0;
    const attachments: OciAttachment[] = (['signature', 'sbom', 'provenance'] as const).map((kind, index) => ({
      digest: `sha256:${String(index + 1).repeat(64)}`,
      artifactType: `application/vnd.test.${kind}`,
      subjectDigest: DIGEST,
      payloadDigests: [`sha256:${String(index + 4).repeat(64)}`],
      payloadVerified: true,
      verifiedKind: kind,
    }));
    const adapter: RegistryAdapter = {
      imageExists: async (repo) => repo === sourceRepo,
      listReferrers: async (repo) => (repo === sourceRepo ? attachments : []),
      copyImage: async (_source, _target, options?: RegistryRequestOptions): Promise<{ created: boolean }> => {
        propagatedSignal = options?.signal;
        copyEntered.resolve();
        if (!options?.signal) throw new Error('registry abort signal missing');
        await new Promise<never>((_resolve, reject) => {
          if (options.signal!.aborted) {
            reject(options.signal!.reason);
            return;
          }
          options.signal!.addEventListener(
            'abort',
            () => {
              signalAborted.resolve();
              reject(options.signal!.reason);
            },
            { once: true },
          );
        });
        throw new Error('unreachable suspended provider');
      },
      copyAndRelinkReferrer: async () => {
        throw new Error('copy referrer must not start after the suspended image copy');
      },
      deleteReferrer: async (_repo, digest) => {
        deleteCalls.push(`referrer:${digest}`);
      },
      deleteImage: async (_repo, digest) => {
        deleteCalls.push(`image:${digest}`);
      },
      pinImage: async () => ({ created: true }),
    };
    const intent = {
      operationId: unique('registry-abort-provider'),
      projectId: project.id,
      organizationId: organization.id,
      ownershipEpoch: project.ownershipEpoch,
      kind: 'IMAGE_PROMOTION' as const,
      repositories: [sourceRepo, targetRepo],
      intentHash: registryMutationIntentHash({ sourceRepo, targetRepo, purpose: 'abort-provider' }),
    };
    let holder: Promise<unknown> | undefined;

    try {
      holder = store.withRegistryMutation(intent, async (guard) => {
        backendPid = guard.backendPid;
        return promoteArtifact({
          source: { repo: sourceRepo, digest: DIGEST },
          targetRepo,
          targetTenant: organization.id,
          adapter,
          signal: guard.signal,
        });
      });
      await copyEntered.promise;
      expect(propagatedSignal).toBeDefined();
      expect(propagatedSignal?.aborted).toBe(false);
      const terminated = await prismaB.$queryRaw<Array<{ terminated: boolean }>>`
        SELECT pg_terminate_backend(${backendPid}) AS "terminated"
      `;
      expect(terminated[0]?.terminated).toBe(true);
      await signalAborted.promise;
      await expect(holder).rejects.toBeDefined();
      expect(deleteCalls).toEqual([]);
      await expect(
        prismaA.registryMutationOperation.findUniqueOrThrow({ where: { id: intent.operationId } }),
      ).resolves.toMatchObject({
        state: 'AMBIGUOUS',
        verifiedAt: null,
      });
    } finally {
      await Promise.allSettled(holder ? [holder] : []);
      await prismaA.registryMutationOperation.deleteMany({ where: { projectId: project.id } });
      await prismaA.project.delete({ where: { id: project.id } }).catch(() => undefined);
      await prismaA.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
      await Promise.allSettled([store.disconnect(), prismaB.$disconnect()]);
    }
  });

  it('aborts on pg_terminate_backend and never certifies or supersedes the stale provider effect', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA, undefined, undefined, {
      registryMutationLeaseMs: 2_000,
      registryMutationHeartbeatMs: 100,
    });
    const storeB = new PrismaApiStore(prismaB, undefined, undefined, {
      acquireTimeoutMs: 500,
      registryMutationLeaseMs: 2_000,
      registryMutationHeartbeatMs: 100,
    });
    const organization = await prismaA.organization.create({
      data: { name: unique('registry-fence'), slug: unique('registry-fence') },
    });
    const project = await prismaA.project.create({
      data: { organizationId: organization.id, name: 'Registry fence', slug: unique('registry-fence-project') },
    });
    const recoveryOperator = await prismaA.user.create({
      data: {
        email: `${unique('registry-operator')}@example.com`,
        name: 'Registry recovery operator',
        platformAdmin: true,
      },
    });
    const repository = `europe-west9-docker.pkg.dev/build-proj/build-repo/p-${project.id.toLowerCase()}`;
    const entered = deferred();
    const aborted = deferred();
    const providerRelease = deferred();
    let backendPid = 0;
    let holder: Promise<string> | undefined;

    try {
      const intent = {
        operationId: unique('registry-owner-a'),
        projectId: project.id,
        organizationId: organization.id,
        ownershipEpoch: project.ownershipEpoch,
        kind: 'IMAGE_PROMOTION' as const,
        repositories: [repository],
        intentHash: registryMutationIntentHash({ repository, owner: 'a' }),
      };
      holder = storeA.withRegistryMutation(intent, async (guard) => {
        backendPid = guard.backendPid;
        guard.signal.addEventListener('abort', () => aborted.resolve(), { once: true });
        entered.resolve();
        /* Provider latch deliberately ignores cancellation until released. */
        await providerRelease.promise;
        await guard.assertActive();
        return 'stale-effect-certified';
      });
      await entered.promise;
      expect(backendPid).toBeGreaterThan(0);
      const terminated = await prismaB.$queryRaw<
        Array<{ terminated: boolean }>
      >`SELECT pg_terminate_backend(${backendPid}) AS "terminated"`;
      expect(terminated[0]?.terminated).toBe(true);
      await aborted.promise;

      const secondIntent = {
        ...intent,
        operationId: unique('registry-owner-b'),
        intentHash: registryMutationIntentHash({ repository, owner: 'b' }),
      };
      await expect(storeB.withRegistryMutation(secondIntent, async () => 'second-owner')).rejects.toMatchObject({
        code: expect.stringMatching(/^REGISTRY_MUTATION_(ACTIVE|AMBIGUOUS)$/u),
      });

      providerRelease.resolve();
      await expect(holder).rejects.toMatchObject({ code: 'REGISTRY_MUTATION_FENCE_LOST' });
      await expect(
        prismaA.registryMutationOperation.findUniqueOrThrow({ where: { id: intent.operationId } }),
      ).resolves.toMatchObject({ state: 'AMBIGUOUS', verifiedAt: null });
      await expect(storeB.withRegistryMutation(secondIntent, async () => 'retry-owner')).rejects.toMatchObject({
        code: 'REGISTRY_MUTATION_AMBIGUOUS',
      });

      await prismaA.$executeRaw`
        UPDATE "RegistryMutationOperation"
        SET "ambiguousAt" = clock_timestamp() - interval '10 minutes',
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${intent.operationId}
      `;
      const recoveryClock = await prismaA.$queryRaw<Array<{ now: Date; ambiguousAt: Date }>>`
        SELECT clock_timestamp() AS "now", "ambiguousAt"
        FROM "RegistryMutationOperation"
        WHERE "id" = ${intent.operationId}
      `;
      const observationStartedAt = new Date(recoveryClock[0]!.ambiguousAt.getTime() + 60_000).toISOString();
      const observationEndedAt = recoveryClock[0]!.now.toISOString();
      const commonRecoveryObservation = {
        observationWindowStartedAt: observationStartedAt,
        observationWindowEndedAt: observationEndedAt,
      };
      const matchedQueries = [
        {
          queriedAt: new Date(Date.parse(observationStartedAt) + 60_000).toISOString(),
          result: 'MATCHED_EFFECT' as const,
        },
        {
          queriedAt: new Date(Date.parse(observationStartedAt) + 120_000).toISOString(),
          result: 'MATCHED_EFFECT' as const,
        },
      ];
      const invalidVerifiedObservation: RegistryMutationRecoveryObservation = {
        ...commonRecoveryObservation,
        resolution: 'VERIFIED',
        providerEvidenceHash: registryMutationIntentHash({ provider: 'unrecorded' }),
        providerQueries: matchedQueries,
      };
      await expect(
        storeB.resolveAmbiguousRegistryMutation({
          operationId: intent.operationId,
          operatorUserId: recoveryOperator.id,
          observation: invalidVerifiedObservation,
        }),
      ).rejects.toMatchObject({ code: 'REGISTRY_MUTATION_RECOVERY_AUTHORITY_INVALID' });

      const failedSafeObservation: RegistryMutationRecoveryObservation = {
        ...commonRecoveryObservation,
        resolution: 'FAILED_SAFE',
        providerQueries: matchedQueries.map(({ queriedAt }) => ({ queriedAt, result: 'ABSENT' as const })),
      };
      const recovery = await storeB.resolveAmbiguousRegistryMutation({
        operationId: intent.operationId,
        operatorUserId: recoveryOperator.id,
        ipAddress: '203.0.113.42',
        observation: failedSafeObservation,
      });
      expect(recovery).toMatchObject({
        state: 'FAILED_SAFE',
        operationId: intent.operationId,
        attemptId: `${intent.operationId}:attempt:1:fence:1`,
        attemptNumber: '1',
      });
      await expect(
        prismaA.registryMutationRecovery.findUniqueOrThrow({
          where: { auditLogId: recovery.auditLogId },
          include: { auditLog: true },
        }),
      ).resolves.toMatchObject({
        operationId: intent.operationId,
        attemptNumber: 1n,
        resolution: 'FAILED_SAFE',
        auditLog: {
          id: recovery.auditLogId,
          actorUserId: recoveryOperator.id,
          organizationId: organization.id,
          action: 'registry.mutation.recovery',
          resourceId: intent.operationId,
          ipAddress: '203.0.113.42',
        },
      });
      await expect(
        storeB.withRegistryMutation(secondIntent, async (guard) => {
          await guard.recordProviderEvidence({ provider: 'second-owner', repository });
          return 'recovered-owner';
        }),
      ).resolves.toBe('recovered-owner');
    } finally {
      providerRelease.resolve();
      await Promise.allSettled(holder ? [holder] : []);
      await prismaA.registryMutationOperation.deleteMany({ where: { projectId: project.id } });
      await prismaA.auditLog.deleteMany({
        where: { organizationId: organization.id, resourceType: 'registryMutationOperation' },
      });
      await prismaA.user.delete({ where: { id: recoveryOperator.id } }).catch(() => undefined);
      await prismaA.project.delete({ where: { id: project.id } }).catch(() => undefined);
      await prismaA.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });
});
