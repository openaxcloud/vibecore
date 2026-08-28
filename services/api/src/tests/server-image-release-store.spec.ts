import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the store spec service-local.
import type { DeploymentRecord, ServerImageReleaseCommitInput } from '../store.js';
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
  const promotion = {
    promotionId: 'promo-store-test',
    sourceRepo: 'europe-west9-docker.pkg.dev/build-project/build-repo/p-project',
    sourceDigest: DIGEST,
    targetRepo: IMAGE_REF,
    targetTenant: organization.id,
    retentionTag: `active-promo-${'a'.repeat(32)}`,
    attachments: ['signature', 'sbom', 'provenance'].map((type, index) => ({
      type,
      digest: `sha256:${String(index + 1).repeat(64)}`,
      subjectDigest: DIGEST,
      relinked: true,
    })),
    binaryAuthorizationResult: 'PASSED',
    binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
    binaryAuthorizationPolicyEtag: 'policy-etag-0001',
    binaryAuthorizationEvaluatedImage: `${IMAGE_REF}@${DIGEST}`,
    binaryAuthorizationEvaluatedAt: '2026-08-26T00:00:00.500Z',
    state: 'PROMOTION_COMMITTED',
    preparedAt: '2026-08-26T00:00:00.000Z',
    committedAt: '2026-08-26T00:00:01.000Z',
  };
  const deployment = await store.createDeployment({
    projectId: project.id,
    expectedOrganizationId: project.organizationId,
    provider: 'server',
    environment: 'preview',
    status: 'BUILDING',
    metadata: {
      projectManifestDigest: release.digest,
      serverDeploy: {
        image: { imageRef: IMAGE_REF, imageDigest: DIGEST },
        promotion,
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
    url: 'https://release.example.test',
    previewUrl: 'https://release.example.test',
    metadata: deployment.metadata as Record<string, unknown>,
    logs: [],
    finishedAt: '2026-08-26T00:00:02.000Z',
    releaseFence: release.releaseFence,
  };

  return { store, organization, project, deployment, input };
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
});
