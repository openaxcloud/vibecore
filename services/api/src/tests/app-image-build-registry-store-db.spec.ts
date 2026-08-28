import { randomUUID } from 'node:crypto';

import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import {
  appImageBuildIntentHash,
  appImageBuildOperationTag,
  type AppImageBuildSpec,
  type AppImageBuildSubmissionResolutionEvidence,
} from '../app-image-build.js';
import { PrismaApiStore } from '../prisma-store.js';
import { registryMutationIntentHash } from '../registry-mutation.js';
import type { RegistryMutationRecoveryEvidence } from '../store.js';
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
      const commonRecoveryEvidence = {
        schemaVersion: 'registry-mutation-recovery-v1' as const,
        operatorUserId: unique('registry-recovery-operator'),
        auditEventId: unique('registry-recovery-audit'),
        operationId: intent.operationId,
        projectId: project.id,
        organizationId: organization.id,
        intentHash: intent.intentHash,
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
      const invalidVerifiedEvidence: RegistryMutationRecoveryEvidence = {
        ...commonRecoveryEvidence,
        resolution: 'VERIFIED',
        providerEvidenceHash: registryMutationIntentHash({ provider: 'unrecorded' }),
        providerQueries: matchedQueries,
      };
      await expect(
        storeB.resolveAmbiguousRegistryMutation({
          operationId: intent.operationId,
          expectedOrganizationId: organization.id,
          evidence: invalidVerifiedEvidence,
        }),
      ).rejects.toMatchObject({ code: 'REGISTRY_MUTATION_RECOVERY_AUTHORITY_INVALID' });

      const failedSafeEvidence: RegistryMutationRecoveryEvidence = {
        ...commonRecoveryEvidence,
        resolution: 'FAILED_SAFE',
        providerQueries: matchedQueries.map(({ queriedAt }) => ({ queriedAt, result: 'ABSENT' as const })),
      };
      await expect(
        storeB.resolveAmbiguousRegistryMutation({
          operationId: intent.operationId,
          expectedOrganizationId: organization.id,
          evidence: failedSafeEvidence,
        }),
      ).resolves.toBeUndefined();
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
      await prismaA.project.delete({ where: { id: project.id } }).catch(() => undefined);
      await prismaA.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });
});
