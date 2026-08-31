import { hashPassword } from '@vibecore/auth';
import { describe, expect, it, vi } from 'vitest';

import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { PromotionResult } from '../artifact-promotion.js';
import type { DatabaseProvisioner } from '../database-provisioner.js';
import { buildPublishedDeploymentInput, canPublishDeployment } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import { registryMutationIntentHash } from '../registry-mutation.js';
import type { ServerImagePromotionInput } from '../server-image-promotion.js';
import type { DeploymentRecord } from '../store.js';
import { DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS } from './deterministic-release-fixture.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

function testPromotionRepositories(input: ServerImagePromotionInput): readonly string[] {
  return [input.source.repo, `europe-west9-docker.pkg.dev/tenant-project/releases/p-${input.projectId.toLowerCase()}`];
}

function committedPromotion(input: ServerImagePromotionInput, promotionId: string): PromotionResult {
  const targetRepo = `europe-west9-docker.pkg.dev/tenant-project/releases/p-${input.projectId.toLowerCase()}`;
  return {
    ok: true,
    target: { repo: targetRepo, digest: input.source.digest },
    promotedAttestations: ['signature', 'sbom', 'provenance'],
    reused: false,
    manifest: {
      promotionId,
      sourceRepo: input.source.repo,
      sourceDigest: input.source.digest,
      targetRepo,
      targetTenant: input.organizationId,
      retentionTag: `active-promo-${'a'.repeat(32)}`,
      attachments: ['signature', 'sbom', 'provenance'].map((type, index) => ({
        type,
        digest: `sha256:${String(index + 1).repeat(64)}`,
        subjectDigest: input.source.digest,
        relinked: true,
      })),
      binaryAuthorizationResult: 'PASSED',
      binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
      binaryAuthorizationPolicyEtag: 'policy-etag-0001',
      binaryAuthorizationEvaluatedImage: `${targetRepo}@${input.source.digest}`,
      binaryAuthorizationEvaluatedAt: '2026-08-26T00:00:00.500Z',
      state: 'PROMOTION_COMMITTED',
      preparedAt: '2026-08-26T00:00:00.000Z',
      committedAt: '2026-08-26T00:00:01.000Z',
    },
  };
}

const READY_PREVIEW = {
  id: 'dep_src',
  projectId: 'proj_1',
  provider: 'static',
  environment: 'preview',
  status: 'READY',
  url: 'https://preview-app.example/',
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  branch: 'main',
  commitSha: 'abc123',
  logs: [],
} as unknown as DeploymentRecord;

describe('canPublishDeployment', () => {
  it('allows a READY non-production deployment', () => {
    expect(canPublishDeployment({ status: 'READY', environment: 'preview' })).toEqual({ ok: true });
  });

  it('rejects a not-yet-built deployment', () => {
    expect(canPublishDeployment({ status: 'BUILDING', environment: 'preview' })).toMatchObject({
      ok: false,
      code: 'NOT_READY',
    });
  });

  it('rejects an already-production deployment', () => {
    expect(canPublishDeployment({ status: 'READY', environment: 'production' })).toMatchObject({
      ok: false,
      code: 'ALREADY_PRODUCTION',
    });
  });
});

describe('buildPublishedDeploymentInput', () => {
  it('clones the build config into a production deployment linked to its source', () => {
    const input = buildPublishedDeploymentInput(READY_PREVIEW, 'https://prod-app.example/');

    expect(input).toMatchObject({
      projectId: 'proj_1',
      provider: 'static',
      environment: 'production',
      status: 'READY',
      url: 'https://preview-app.example/', // same built artifact
      productionUrl: 'https://prod-app.example/',
      framework: 'vite',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      branch: 'main',
      commitSha: 'abc123',
      parentDeploymentId: 'dep_src',
    });
    expect(input.metadata).toMatchObject({ publishedFrom: 'dep_src' });
  });
});

async function setup(options: ApiAppOptions = {}) {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider(), ...options });

  const user = await store.createUser({
    email: 'pub@example.com',
    name: 'Pub User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Pub Org', slug: 'pub-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'pub-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'Pub Project', slug: 'pub-project' });
  const manifest = await store.getLatestProjectManifest(project.id);

  if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');

  return { app, store, token: 'pub-token', project, projectManifestDigest: manifest.digest };
}

async function seedServerImagePackageAuthority(
  store: TestApiStore,
  project: { id: string; organizationId: string },
  sourceRepository: string,
  targetRepository: string,
  digest: string,
) {
  const operationId = `fixture:image-build:${project.id}`;
  const operationTag = `fixture-${project.id}`;
  const buildId = `build-${project.id}`;
  const release = await acquireTestProjectReleaseFence(store, {
    projectId: project.id,
    organizationId: project.organizationId,
    operationId,
  });

  try {
    await store.prepareAppImageBuild({
      operationId,
      projectId: project.id,
      deploymentId: `fixture-deployment-${project.id}`,
      provider: {
        gcpProject: 'build-project',
        region: 'europe-west9',
        sourceBucket: 'fixture-build-source',
        sourceObject: `${project.id}/context.tgz`,
        imageUri: `${sourceRepository}:fixture`,
        buildServiceAccount: 'fixture-builder@build-project.iam.gserviceaccount.com',
      },
      operationTag,
      intentHash: `fixture-intent-${project.id}`,
      releaseFence: release.releaseFence,
    });
    await store.markAppImageBuildSubmissionStarted({
      operationId,
      projectId: project.id,
      operationTag,
      releaseFence: release.releaseFence,
    });
    await store.recordAppImageBuildIdentity({
      operationId,
      projectId: project.id,
      buildId,
      operationTag,
      releaseFence: release.releaseFence,
    });
    await store.recordAppImageBuildTerminal({
      operationId,
      projectId: project.id,
      buildId,
      providerStatus: 'SUCCESS',
      digest,
      releaseFence: release.releaseFence,
    });
    await store.prepareAppImageBuildPromotion({
      operationId,
      projectId: project.id,
      targetRepository,
      releaseFence: release.releaseFence,
    });
    await store.recordAppImageBuildPromotion({
      operationId,
      projectId: project.id,
      targetRepository,
      targetDigest: digest,
      promotionReferences: { fixture: true },
      releaseFence: release.releaseFence,
    });
  } finally {
    await release.release();
  }
}

describe('POST /projects/:id/deployments/:id/publish', () => {
  it('promotes a READY preview deployment to a linked production deployment', async () => {
    const { app, store, token, project, projectManifestDigest } = await setup();
    const source = await store.createDeployment({
      projectId: project.id,
      expectedOrganizationId: project.organizationId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://preview.example/',
      metadata: { projectManifestDigest },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${source.id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(201);
    const deployment = res.json().deployment;
    expect(deployment).toMatchObject({
      environment: 'production',
      status: 'READY',
      parentDeploymentId: source.id,
      url: 'https://preview.example/',
    });
  });

  it('rejects publishing a deployment that is not READY (409)', async () => {
    const { app, store, token, project, projectManifestDigest } = await setup();
    const source = await store.createDeployment({
      projectId: project.id,
      expectedOrganizationId: project.organizationId,
      provider: 'static',
      environment: 'preview',
      status: 'BUILDING',
      metadata: { projectManifestDigest },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${source.id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('NOT_READY');
  });

  it('404s for an unknown deployment', async () => {
    const { app, token, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/dep_missing/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('provisions a production DatabaseInstance on publish when DB provisioning is enabled (P2d split)', async () => {
    const original = process.env.DB_ROLLBACK_ENABLED;
    const originalBackupBucket = process.env.DB_BACKUP_BUCKET;
    process.env.DB_ROLLBACK_ENABLED = 'true';
    process.env.DB_BACKUP_BUCKET = 'fixture-cnpg-backups';

    try {
      const provisionInstance = vi.fn(async () => ({
        applied: true,
        clusterName: 'db-publish-production',
      }));
      const databaseProvisioner = {
        active: true,
        provisionInstance,
      } as unknown as DatabaseProvisioner;
      const { app, store, token, project, projectManifestDigest } = await setup({ databaseProvisioner });
      const source = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: project.organizationId,
        provider: 'static',
        environment: 'preview',
        status: 'READY',
        url: 'https://preview.example/',
        metadata: { projectManifestDigest },
      });

      // no production DB before publish
      expect(await store.getDatabaseInstanceByProject(project.id, 'production')).toBeUndefined();

      const res = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/deployments/${source.id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(201);

      // a distinct production instance now exists; the development one does not
      const prod = await store.getDatabaseInstanceByProject(project.id, 'production');
      expect(prod?.environment).toBe('production');
      expect(await store.getDatabaseInstanceByProject(project.id, 'development')).toBeUndefined();
      expect(provisionInstance).toHaveBeenCalledOnce();
      expect(provisionInstance).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: project.id, environment: 'production' }),
      );
    } finally {
      if (original === undefined) {
        delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;
      } else {
        process.env.DB_ROLLBACK_ENABLED = original;
      }

      if (originalBackupBucket === undefined) {
        delete process.env.DB_BACKUP_BUCKET;
      } else {
        process.env.DB_BACKUP_BUCKET = originalBackupBucket;
      }
    }
  });

  it('promotes a server image before manager start, then atomically commits READY + ReleaseManifest', async () => {
    const originalManagerUrl = process.env.WORKSPACE_MANAGER_URL;
    const realFetch = globalThis.fetch;
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
    const events: string[] = [];
    const digest = `sha256:${'a'.repeat(64)}`;

    try {
      const promote = vi.fn(async (input: ServerImagePromotionInput): Promise<PromotionResult> => {
        events.push('promote');
        return committedPromotion(input, 'promo-publish-route');
      });
      const { app, store, token, project, projectManifestDigest } = await setup({
        serverImagePromotionRuntime: { packageRepositories: testPromotionRepositories, promote },
      });
      globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
        const href = String(url);

        if (href.includes('/server-deployments/start')) {
          events.push('manager-start');
          const body = JSON.parse(String(init?.body)) as { host: string };
          return new Response(JSON.stringify({ ready: true, readyReplicas: 1, url: `https://${body.host}` }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch;
      const sourceRepo = `europe-west9-docker.pkg.dev/build-project/build-repo/p-${project.id.toLowerCase()}`;
      const targetRepo = `europe-west9-docker.pkg.dev/tenant-project/releases/p-${project.id.toLowerCase()}`;
      await seedServerImagePackageAuthority(store, project, sourceRepo, targetRepo, digest);
      const source = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: project.organizationId,
        provider: 'server',
        environment: 'preview',
        status: 'READY',
        machineSize: 'shared-0.5',
        url: 'https://preview-server.example/',
        metadata: {
          planEntitlements: DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS,
          projectManifestDigest,
          serverDeploy: {
            image: { sourceImageRef: sourceRepo, imageRef: sourceRepo, imageDigest: digest },
          },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/deployments/${source.id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().deployment.status).toBe('READY');
      expect(events).toEqual(['promote', 'manager-start']);
      expect(store.releaseManifests).toHaveLength(1);
      expect(store.releaseManifests[0]).toMatchObject({
        environment: 'production',
        artifactKind: 'server-image',
        artifactDigest: digest,
      });
      await app.close();
    } finally {
      globalThis.fetch = realFetch;

      if (originalManagerUrl === undefined) {
        delete process.env.WORKSPACE_MANAGER_URL;
      } else {
        process.env.WORKSPACE_MANAGER_URL = originalManagerUrl;
      }
    }
  });

  it('replays a verified server promotion after a post-promotion crash under a new release barrier', async () => {
    const originalManagerUrl = process.env.WORKSPACE_MANAGER_URL;
    const realFetch = globalThis.fetch;
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
    const digest = `sha256:${'b'.repeat(64)}`;
    let promotionFinished = false;

    try {
      const promote = vi.fn(async (input: ServerImagePromotionInput): Promise<PromotionResult> => {
        promotionFinished = true;
        return committedPromotion(input, 'promo-publish-retry');
      });
      const { app, store, token, project, projectManifestDigest } = await setup({
        serverImagePromotionRuntime: { packageRepositories: testPromotionRepositories, promote },
      });
      globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
        if (String(url).includes('/server-deployments/start')) {
          const body = JSON.parse(String(init?.body)) as { host: string };
          return new Response(JSON.stringify({ ready: true, readyReplicas: 1, url: `https://${body.host}` }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch;

      const sourceRepo = `europe-west9-docker.pkg.dev/build-project/build-repo/p-${project.id.toLowerCase()}`;
      const targetRepo = `europe-west9-docker.pkg.dev/tenant-project/releases/p-${project.id.toLowerCase()}`;
      await seedServerImagePackageAuthority(store, project, sourceRepo, targetRepo, digest);
      const source = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: project.organizationId,
        provider: 'server',
        environment: 'preview',
        status: 'READY',
        machineSize: 'shared-0.5',
        url: 'https://preview-server.example/',
        metadata: {
          planEntitlements: DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS,
          projectManifestDigest,
          serverDeploy: { image: { sourceImageRef: sourceRepo, imageRef: sourceRepo, imageDigest: digest } },
        },
      });

      const acquiredBarrierIds: string[] = [];
      const acquiredBarrierOwners: string[] = [];
      const acquireReleaseBarrier = store.acquireProjectReleaseBarrier.bind(store);
      vi.spyOn(store, 'acquireProjectReleaseBarrier').mockImplementation(async (input) => {
        const lease = await acquireReleaseBarrier(input);
        if (lease) {
          acquiredBarrierIds.push(lease.checkpointId);
          acquiredBarrierOwners.push(lease.ownerToken);
        }
        return lease;
      });

      const getDeploymentAccessPolicy = store.getDeploymentAccessPolicy.bind(store);
      let crashAfterPromotion = true;
      vi.spyOn(store, 'getDeploymentAccessPolicy').mockImplementation(async (deploymentId) => {
        if (promotionFinished && crashAfterPromotion) {
          crashAfterPromotion = false;
          throw Object.assign(new Error('injected crash after verified promotion'), {
            code: 'INJECTED_POST_PROMOTION_CRASH',
            statusCode: 500,
          });
        }
        return getDeploymentAccessPolicy(deploymentId);
      });

      const first = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/deployments/${source.id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(first.statusCode).toBe(500);
      expect(promote).toHaveBeenCalledOnce();
      expect(store.registryMutationOperations.size).toBe(1);

      const promotionIntentHash = registryMutationIntentHash({
        schemaVersion: 'deployment-publish-image-promotion-v1',
        sourceDeploymentId: source.id,
        projectManifestDigest,
        source: { repo: sourceRepo, digest },
        targetRepository: targetRepo,
      });
      const operationId = `registry-mutation:publish:${source.id}:${promotionIntentHash.slice('sha256:'.length)}`;
      expect([...store.registryMutationOperations.entries()]).toEqual([
        [
          operationId,
          expect.objectContaining({
            state: 'VERIFIED',
            intent: expect.objectContaining({ operationId, intentHash: promotionIntentHash }),
          }),
        ],
      ]);

      const retried = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/deployments/${source.id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(retried.statusCode).toBe(201);
      expect(promote).toHaveBeenCalledOnce();
      expect(store.registryMutationOperations.size).toBe(1);
      expect(acquiredBarrierIds).toHaveLength(2);
      expect(acquiredBarrierIds[1]).not.toBe(acquiredBarrierIds[0]);
      expect(acquiredBarrierOwners[1]).not.toBe(acquiredBarrierOwners[0]);
      await app.close();
    } finally {
      globalThis.fetch = realFetch;
      if (originalManagerUrl === undefined) {
        delete process.env.WORKSPACE_MANAGER_URL;
      } else {
        process.env.WORKSPACE_MANAGER_URL = originalManagerUrl;
      }
    }
  });

  it('fails closed on total promotion-provider failure: no runtime, production row or manifest', async () => {
    const promote = vi.fn(async () => {
      throw Object.assign(new Error('provider unavailable'), { code: 'REGISTRY_REQUEST_FAILED' });
    });
    const realFetch = globalThis.fetch;

    try {
      globalThis.fetch = vi.fn() as unknown as typeof fetch;
      const { app, store, token, project, projectManifestDigest } = await setup({
        serverImagePromotionRuntime: { packageRepositories: testPromotionRepositories, promote },
      });
      const digest = `sha256:${'a'.repeat(64)}`;
      const sourceRepo = `europe-west9-docker.pkg.dev/build-project/build-repo/p-${project.id.toLowerCase()}`;
      const targetRepo = `europe-west9-docker.pkg.dev/tenant-project/releases/p-${project.id.toLowerCase()}`;
      await seedServerImagePackageAuthority(store, project, sourceRepo, targetRepo, digest);
      const source = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: project.organizationId,
        provider: 'server',
        environment: 'preview',
        status: 'READY',
        machineSize: 'shared-0.5',
        metadata: {
          planEntitlements: DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS,
          projectManifestDigest,
          serverDeploy: { image: { sourceImageRef: sourceRepo, imageDigest: digest } },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/deployments/${source.id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'REGISTRY_REQUEST_FAILED', retryable: true });
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect((await store.listDeployments(project.id)).filter((row) => row.environment === 'production')).toEqual([]);
      expect(store.releaseManifests).toEqual([]);
      await app.close();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
