import { randomUUID } from 'node:crypto';

import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { appImageBuildIntentHash, appImageBuildOperationTag, type AppImageBuildSpec } from '../app-image-build.js';
import { PrismaApiStore } from '../prisma-store.js';
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
      expect(
        await storeB.readAppImageBuildState({
          operationId,
          projectId: project.id,
          releaseFence: firstFence.releaseFence,
        }),
      ).toEqual({
        phase: 'SUBMITTING',
      });

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
      ).toEqual({ phase: 'SUBMITTING' });
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

      const outside = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Outside reference', slug: unique('outside-reference') },
      });
      outsideProjectId = outside.id;
      const outsideDeployment = await prismaA.deployment.create({
        data: { projectId: outside.id, provider: 'server' },
      });
      await prismaA.appImageBuildOperation.create({
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
      });
      await expect(
        storeA.countProjectRegistryReferencesOutsideProject(
          { kind: 'manifest', repository: sourceRepository, digest: DIGEST },
          project.id,
        ),
      ).resolves.toBe(1);
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

  it('holds a sorted package session fence without keeping provider I/O in a transaction', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient(), undefined, undefined, { acquireTimeoutMs: 40 });
    const repository = 'europe-west9-docker.pkg.dev/build-proj/build-repo/p-lock-test';
    const entered = deferred();
    const release = deferred();

    try {
      const holder = storeA.withRegistryPackageFences([repository], async () => {
        entered.resolve();
        await storeA.ping();
        await release.promise;
      });
      await entered.promise;
      await expect(storeB.withRegistryPackageFences([repository], async () => undefined)).rejects.toMatchObject({
        code: 'REGISTRY_PACKAGE_LOCK_TIMEOUT',
      });
      release.resolve();
      await holder;
      await expect(storeB.withRegistryPackageFences([repository], async () => storeB.ping())).resolves.toBeUndefined();
    } finally {
      release.resolve();
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });
});
