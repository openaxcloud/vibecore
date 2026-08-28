import { describe, expect, it, vi } from 'vitest';

import {
  parseServerRollbackPromotionEvidence,
  parseServerRollbackRuntimeSpec,
  rollbackManifestDigest,
} from '../deterministic-rollback.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the store spec service-local.
import type { DeploymentRecord, ReleasePlanEntitlementsPin, ServerImageReleaseCommitInput } from '../store.js';
import { deterministicServerReleaseFixture } from './deterministic-release-fixture.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';
import { TestApiStore } from './test-api-store.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const IMAGE_REF = 'europe-west9-docker.pkg.dev/tenant-project/release-repo/p-project';

async function fixture() {
  const store = new TestApiStore();

  const owner = await store.createUser({
    email: 'release-store@example.test',
    passwordHash: 'test-only-hash',
  });
  const organization = await store.createOrganization({
    name: 'Release Store',
    slug: 'release-store',
    ownerUserId: owner.id,
  });
  const project = await store.createProject({
    organizationId: organization.id,
    name: 'Release Project',
    slug: 'release-project',
  });
  const release = await acquireTestProjectReleaseFence(store, {
    projectId: project.id,
    organizationId: organization.id,
  });
  const pins = deterministicServerReleaseFixture({
    organizationId: organization.id,
    projectId: project.id,
    projectManifestDigest: release.digest,
    accessPolicyVersion: 1,
    artifactRef: IMAGE_REF,
    artifactDigest: DIGEST,
    promotionId: 'promo-store-test',
  });
  const deployment = await store.createDeployment({
    projectId: project.id,
    expectedOrganizationId: project.organizationId,
    releaseFence: release.releaseFence,
    provider: 'server',
    environment: 'preview',
    status: 'BUILDING',
    machineSize: 'shared-0.5',
    metadata: {
      planEntitlements: pins.planEntitlements,
      projectManifestDigest: release.digest,
      serverDeploy: {
        image: { imageRef: IMAGE_REF, imageDigest: DIGEST },
        promotion: pins.promotion,
        rollbackRuntimeSpec: pins.runtimeSpec,
      },
    },
  });
  const input: ServerImageReleaseCommitInput = {
    projectId: project.id,
    organizationId: organization.id,
    deploymentId: deployment.id,
    environment: 'preview',
    artifactRef: IMAGE_REF,
    artifactDigest: DIGEST,
    runtimeSpec: pins.runtimeSpec,
    promotionEvidence: pins.promotionEvidence,
    url: 'https://release.example.test',
    previewUrl: 'https://release.example.test',
    metadata: deployment.metadata as Record<string, unknown>,
    logs: [],
    finishedAt: '2026-08-26T00:00:02.000Z',
    releaseFence: release.releaseFence,
  };

  return { store, organization, project, deployment, input, release };
}

function withoutPromotion(metadata: DeploymentRecord['metadata']): Record<string, unknown> {
  const serverDeploy = (metadata as Record<string, unknown>).serverDeploy as Record<string, unknown>;
  const { promotion: _promotion, ...rest } = serverDeploy;

  return { serverDeploy: rest };
}

describe('commitServerImageRelease', () => {
  it('commits READY and exactly one immutable manifest atomically and idempotently', async () => {
    const { store, input } = await fixture();

    const [first, retry] = await Promise.all([
      store.commitServerImageRelease(input),
      store.commitServerImageRelease(input),
    ]);

    expect(first.committed).toBe(true);
    expect(retry.committed).toBe(true);
    expect(first.deployment.status).toBe('READY');
    expect(retry.deployment.status).toBe('READY');
    expect(first.manifest?.id).toBe(retry.manifest?.id);
    expect(store.releaseManifests).toHaveLength(1);
    expect(
      store.adminAuditLogs.filter((event) => event.action === 'deployment.server_image_release_committed'),
    ).toHaveLength(1);
    await expect(store.getServerImageReleasePromotion(input.deploymentId)).resolves.toEqual(
      (input.metadata.serverDeploy as Record<string, unknown>).promotion,
    );

    await expect(store.commitServerImageRelease({ ...input, organizationId: 'org-cross-tenant' })).rejects.toThrow(
      /SERVER_RELEASE_PROMOTION_NOT_COMMITTED/u,
    );
    expect(store.releaseManifests).toHaveLength(1);
  });

  it.each([
    [
      'missing promotion',
      (input: ServerImageReleaseCommitInput) => ({ ...input, metadata: withoutPromotion(input.metadata) }),
    ],
    [
      'wrong organization',
      (input: ServerImageReleaseCommitInput) => ({ ...input, organizationId: 'org-cross-tenant' }),
    ],
    [
      'metadata image mismatch',
      (input: ServerImageReleaseCommitInput) => ({
        ...input,
        metadata: {
          ...input.metadata,
          serverDeploy: {
            ...(input.metadata.serverDeploy as Record<string, unknown>),
            image: { imageRef: `${IMAGE_REF}-other`, imageDigest: DIGEST },
          },
        },
      }),
    ],
  ])('fails closed for %s: no READY and no manifest', async (_label, mutate) => {
    const { store, deployment, input } = await fixture();

    await expect(store.commitServerImageRelease(mutate(input))).rejects.toThrow(
      /SERVER_RELEASE_PROMOTION_NOT_COMMITTED/u,
    );
    expect((await store.getDeployment(input.projectId, deployment.id))?.status).toBe('BUILDING');
    expect(store.releaseManifests).toEqual([]);
  });

  it.each([
    ['cpu', { cpuMillicores: 501 }],
    ['memory', { memoryMb: 2_049 }],
    ['rate-card version', { rateCardVersion: 2 }],
  ])('rejects a self-consistent runtime %s claim that disagrees with the historical card', async (_label, patch) => {
    const { store, deployment, input } = await fixture();
    const { hash: _hash, ...body } = input.runtimeSpec as Record<string, unknown>;
    const machine = { ...(body.machine as Record<string, unknown>), ...patch };
    const tamperedBody = { ...body, machine };
    const tamperedRuntime = { ...tamperedBody, hash: rollbackManifestDigest(tamperedBody) };

    await expect(store.commitServerImageRelease({ ...input, runtimeSpec: tamperedRuntime })).rejects.toThrow(
      /SERVER_RELEASE_PROMOTION_NOT_COMMITTED/u,
    );
    expect((await store.getDeployment(input.projectId, deployment.id))?.status).toBe('BUILDING');
    expect(store.releaseManifests).toEqual([]);
  });

  it('keeps the public manifest append API closed to null or tampered server envelopes', async () => {
    const { store, deployment, input } = await fixture();
    const planEntitlements = input.metadata.planEntitlements as ReleasePlanEntitlementsPin;
    const projectManifestDigest = input.metadata.projectManifestDigest as string;
    const base = {
      projectId: input.projectId,
      deploymentId: input.deploymentId,
      environment: input.environment,
      version: 1,
      provider: 'server',
      artifactKind: 'server-image' as const,
      artifactRef: input.artifactRef,
      artifactDigest: input.artifactDigest,
      accessPolicyVersion: deployment.accessPolicyVersion,
      planEntitlements,
      projectManifestDigest,
    };

    await expect(store.createReleaseManifest(base)).rejects.toMatchObject({
      code: 'ROLLBACK_MANIFEST_LEGACY_UNSUPPORTED',
    });
    await expect(
      store.createReleaseManifest({
        ...base,
        runtimeSpec: { ...(input.runtimeSpec as Record<string, unknown>), hash: `sha256:${'0'.repeat(64)}` },
        promotionEvidence: input.promotionEvidence,
      }),
    ).rejects.toMatchObject({ code: 'ROLLBACK_RUNTIME_SPEC_TAMPERED' });
    expect(store.releaseManifests).toEqual([]);
    expect((await store.getDeployment(input.projectId, deployment.id))?.status).toBe('BUILDING');
  });

  it('lets a terminal cancel win without manufacturing a release', async () => {
    const { store, deployment, input } = await fixture();
    await store.updateDeployment(input.projectId, deployment.id, {
      status: 'CANCELED',
      canceledAt: '2026-08-26T00:00:01.000Z',
    });

    const result = await store.commitServerImageRelease(input);
    expect(result.committed).toBe(false);
    expect(result.deployment.status).toBe('CANCELED');
    expect(store.releaseManifests).toEqual([]);
  });

  it('rebinds both deterministic envelopes atomically when READY access policy changes', async () => {
    const { store, deployment, input, release } = await fixture();
    const committed = await store.commitServerImageRelease(input);
    const source = committed.manifest!;
    const sourceRuntime = parseServerRollbackRuntimeSpec(source.runtimeSpec);
    const assertDatabasePinHeld = vi.fn(async () => {});

    const policy = await store.setDeploymentAccessPolicy({
      projectId: input.projectId,
      deploymentId: deployment.id,
      mode: 'INVITE_ONLY',
      expectedVersion: 1,
      releaseSource: source,
      releaseFence: release.releaseFence,
      releaseDatabasePin: sourceRuntime.spec.database,
      assertDatabasePinHeld,
    });

    expect(policy?.version).toBe(2);
    expect(assertDatabasePinHeld).toHaveBeenCalledTimes(1);
    const releases = await store.listReleaseManifests(input.projectId, input.environment);
    expect(releases).toHaveLength(2);
    const rebound = releases[0]!;
    const reboundRuntime = parseServerRollbackRuntimeSpec(rebound.runtimeSpec);

    expect(rebound.accessPolicyVersion).toBe(2);
    expect(reboundRuntime.spec.accessPolicyVersion).toBe(2);
    expect(reboundRuntime.spec.envOverrides).toEqual(sourceRuntime.spec.envOverrides);
    expect(reboundRuntime.spec.machine).toEqual(sourceRuntime.spec.machine);
    expect(reboundRuntime.spec.port).toBe(sourceRuntime.spec.port);
    expect(reboundRuntime.spec.healthPath).toBe(sourceRuntime.spec.healthPath);
    expect(reboundRuntime.spec.database).toEqual(sourceRuntime.spec.database);
    expect(parseServerRollbackPromotionEvidence(rebound.promotionEvidence)).toEqual(
      parseServerRollbackPromotionEvidence(source.promotionEvidence),
    );
    expect((await store.getDeployment(input.projectId, deployment.id))?.accessPolicyVersion).toBe(2);
  });
});
