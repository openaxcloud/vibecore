import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLAN_ENTITLEMENTS_VERSION } from '@vibecore/billing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import {
  computeStaticArtifactDigest,
  computeStaticSnapshotDigest,
  garbageCollectStaticArtifacts,
  retainStaticSnapshotArtifact,
  resolveStaticDeploymentRoutingAlias,
  staticDeploymentArtifactDir,
  staticDeploymentSnapshotDir,
  writeStaticDeploymentRoutingAlias,
} from '../deployments.js';
import type { EmailProvider } from '../email.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the endpoint spec service-local.
import { canonicalizeProjectManifest, projectManifestDigest } from '../project-manifest.js';
import type { ProjectPhysicalMutationScope } from '../store.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';
import { TestApiStore } from './test-api-store.js';

/*
 * P0-V3-08 — DETERMINISTIC static rollback-to-previous (endpoint wiring).
 *
 * Proves the real POST /projects/:id/deployments/rollback-to-previous restores the
 * PREVIOUS release's exact bytes (verified against the manifest digest) into a new
 * READY deployment, and FAILS CLOSED when there is no previous release or the
 * retained artifact no longer matches its manifest.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class PhysicalReleaseFenceObservingStore extends TestApiStore {
  readonly physicalReleaseScopes: ProjectPhysicalMutationScope[] = [];

  override async assertProjectStorageMutable(
    ...args: Parameters<TestApiStore['assertProjectStorageMutable']>
  ): Promise<void> {
    const [scope] = args;
    if (scope.releaseFence) this.physicalReleaseScopes.push(scope);
    await super.assertProjectStorageMutable(...args);
  }
}

const RELEASE_PLAN_ENTITLEMENTS = {
  version: PLAN_ENTITLEMENTS_VERSION,
  plan: 'pro' as const,
  badgeRequired: false,
  publishRegion: 'platform-default',
  publishRegions: 'all' as const,
};

describe('static rollback-to-previous (deterministic, fail-closed)', () => {
  const previousEnvironment = {
    previewDomain: process.env.PREVIEW_DOMAIN,
    previewProxySecret: process.env.PREVIEW_PROXY_SHARED_SECRET,
    storageDir: process.env.STATIC_DEPLOY_STORAGE_DIR,
  };
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rbtp-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    delete process.env.PREVIEW_DOMAIN;
    process.env.PREVIEW_PROXY_SHARED_SECRET = 'static-alias-proxy-secret';
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries({
      PREVIEW_DOMAIN: previousEnvironment.previewDomain,
      PREVIEW_PROXY_SHARED_SECRET: previousEnvironment.previewProxySecret,
      STATIC_DEPLOY_STORAGE_DIR: previousEnvironment.storageDir,
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(storageDir, { recursive: true, force: true });
  });

  async function setup(store = new TestApiStore()) {
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'rbtp@example.com',
        password: 'password123',
        name: 'RB',
        organizationName: 'RB Org',
      },
    });
    const auth = register.json() as { token: string; user: { id: string }; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'RB Project' },
    });
    const projectId = (project.json() as { project: { id: string } }).project.id;
    return { app, store, auth, projectId };
  }

  /** Materialise a static deployment: a READY row, its on-disk snapshot, and its manifest. */
  async function publishStatic(store: TestApiStore, projectId: string, version: number, marker: string) {
    const project = await store.getProject(projectId);
    const projectManifest = await store.getLatestProjectManifest(projectId);

    if (!project) {
      throw new Error('TEST_PROJECT_MISSING');
    }
    if (!projectManifest) {
      throw new Error('TEST_PROJECT_MANIFEST_MISSING');
    }

    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: project.organizationId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/placeholder',
      metadata: {
        planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
        projectManifestDigest: projectManifest.digest,
      },
    });

    const dir = staticDeploymentSnapshotDir(deployment.id);
    const assetBody = `window.__STATIC_RELEASE__ = ${JSON.stringify(marker)};\n`;
    const indexHtml =
      `<!doctype html><body><h1>${marker}</h1>` +
      `<script src="/static-deployments/${deployment.id}/assets/app.js"></script></body>`;
    await mkdir(join(dir, 'assets'), { recursive: true });
    await writeFile(join(dir, 'index.html'), indexHtml, 'utf8');
    await writeFile(join(dir, 'assets', 'app.js'), assetBody, 'utf8');

    const artifactDigest = (await computeStaticSnapshotDigest(deployment.id))!;
    const artifactRef = await retainStaticSnapshotArtifact(deployment.id, artifactDigest);
    await store.createReleaseManifest({
      projectId,
      deploymentId: deployment.id,
      environment: 'preview',
      version,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef,
      artifactDigest,
      configDigest: 'sha256:' + '0'.repeat(64),
      accessPolicyVersion: 1,
      planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
      projectManifestDigest: projectManifest.digest,
    });

    return {
      deployment,
      artifactDigest,
      artifactRef,
      assetBody,
      indexHtml,
      projectManifestDigest: projectManifest.digest,
    };
  }

  it('restores the previous version bytes into a new READY deployment', async () => {
    const store = new PhysicalReleaseFenceObservingStore();
    const { app, auth, projectId } = await setup(store);
    const v1 = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');
    store.deployments.delete(v1.deployment.id);
    await rm(staticDeploymentSnapshotDir(v1.deployment.id), { recursive: true, force: true });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${auth.token}`,
        'accept-language': 'fr-FR, en;q=0.8',
        'idempotency-key': 'static-success-v1',
      },
      payload: { environment: 'preview' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      deployment: { id: string; status: string; logs: Array<{ message: string }> };
      restoredFromVersion: number;
      verifiedArtifactDigest: string;
    };
    expect(res.headers['content-language']).toBe('fr');
    expect(body.restoredFromVersion).toBe(1);
    expect(body.verifiedArtifactDigest).toBe(v1.artifactDigest);
    expect(body.deployment.status).toBe('READY');
    expect(body.deployment.logs.at(-1)?.message).toContain('Retour effectué vers la version v1');

    // The rollback deployment serves v1's bytes.
    const restoredHtml = await readFile(join(staticDeploymentSnapshotDir(body.deployment.id), 'index.html'), 'utf8');
    expect(restoredHtml).toBe(v1.indexHtml);
    expect(await computeStaticSnapshotDigest(body.deployment.id)).toBe(v1.artifactDigest);

    const legacyAsset = await app.inject({
      method: 'GET',
      url: `/static-deployments/${v1.deployment.id}/assets/app.js`,
    });
    expect(legacyAsset.statusCode).toBe(200);
    expect(legacyAsset.body).toBe(v1.assetBody);
    expect(legacyAsset.headers['x-vibecore-static-deployment']).toBe(body.deployment.id);
    expect(legacyAsset.headers['x-vibecore-static-deployment-alias']).toBe(v1.deployment.id);

    // A new manifest (v3) was appended for the rollback release.
    const releases = await store.listReleaseManifests(projectId, 'preview');
    expect(releases[0].version).toBe(3);
    expect(releases[0].deploymentId).toBe(body.deployment.id);
    expect(releases[0].artifactRef).toBe(v1.artifactRef);
    expect(store.physicalReleaseScopes.length).toBeGreaterThanOrEqual(4);
    expect(store.physicalReleaseScopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId,
          expectedOrganizationId: auth.organization.id,
          releaseFence: expect.objectContaining({
            expectedOrganizationId: auth.organization.id,
            expectedManifestDigest: v1.projectManifestDigest,
          }),
        }),
      ]),
    );

    const gc = await garbageCollectStaticArtifacts((artifactRef) => store.isReleaseArtifactRetained(artifactRef));
    expect(gc.removed).toEqual([]);
    expect(await computeStaticArtifactDigest(v1.artifactRef)).toBe(v1.artifactDigest);
  });

  it('chains two byte-identical rollbacks to the latest READY target and enforces its access policy', async () => {
    const { app, store, auth, projectId } = await setup();
    const v1 = await publishStatic(store, projectId, 1, 'CHAINED VERSION ONE');
    await publishStatic(store, projectId, 2, 'CHAINED VERSION TWO');
    store.deployments.delete(v1.deployment.id);
    await rm(staticDeploymentSnapshotDir(v1.deployment.id), { recursive: true, force: true });

    const first = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-chain-first' },
      payload: { environment: 'preview' },
    });
    expect(first.statusCode).toBe(201);
    const firstRollbackId = first.json().deployment.id as string;

    await publishStatic(store, projectId, 4, 'CHAINED NEW HEAD');
    store.deployments.delete(firstRollbackId);
    await rm(staticDeploymentSnapshotDir(firstRollbackId), { recursive: true, force: true });

    const second = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-chain-second' },
      payload: { environment: 'preview' },
    });
    expect(second.statusCode).toBe(201);
    const secondRollbackId = second.json().deployment.id as string;

    expect(await resolveStaticDeploymentRoutingAlias(v1.deployment.id)).toEqual({
      targetDeploymentId: secondRollbackId,
      edges: [
        { sourceDeploymentId: v1.deployment.id, targetDeploymentId: firstRollbackId },
        { sourceDeploymentId: firstRollbackId, targetDeploymentId: secondRollbackId },
      ],
    });
    expect(await store.getDeployment(projectId, v1.deployment.id)).toBeUndefined();
    expect(await store.getDeployment(projectId, firstRollbackId)).toBeUndefined();
    expect(await computeStaticSnapshotDigest(secondRollbackId)).toBe(v1.artifactDigest);
    expect(await readFile(join(staticDeploymentSnapshotDir(secondRollbackId), 'index.html'), 'utf8')).toBe(
      v1.indexHtml,
    );

    const served = await app.inject({
      method: 'GET',
      url: `/static-deployments/${v1.deployment.id}/assets/app.js`,
    });
    expect(served.statusCode).toBe(200);
    expect(served.body).toBe(v1.assetBody);
    expect(served.headers['x-vibecore-static-deployment']).toBe(secondRollbackId);

    await store.updateDeployment(projectId, secondRollbackId, { status: 'FAILED' });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/static-deployments/${v1.deployment.id}/assets/app.js`,
        })
      ).statusCode,
    ).toBe(404);
    await store.updateDeployment(projectId, secondRollbackId, { status: 'READY' });

    const releaseHead = (await store.listReleaseManifests(projectId, 'preview'))[0];
    const secondRollback = await store.getDeployment(projectId, secondRollbackId);
    expect(releaseHead.deploymentId).toBe(secondRollbackId);
    const policyRelease = await acquireTestProjectReleaseFence(store, {
      projectId,
      organizationId: auth.organization.id,
      operationId: `static-policy:${secondRollbackId}`,
    });
    try {
      await store.setDeploymentAccessPolicy({
        projectId,
        deploymentId: secondRollbackId,
        mode: 'WORKSPACE_ONLY',
        expectedVersion: secondRollback!.accessPolicyVersion,
        releaseSource: releaseHead,
        releaseFence: policyRelease.releaseFence,
      });
    } finally {
      await policyRelease.release();
    }

    const denied = await app.inject({
      method: 'GET',
      url: `/static-deployments/${v1.deployment.id}/assets/app.js`,
    });
    expect(denied.statusCode).toBe(401);

    const proxyAuthorized = await app.inject({
      method: 'GET',
      url: `/static-deployments/${v1.deployment.id}/assets/app.js`,
      headers: { authorization: 'Bearer static-alias-proxy-secret' },
    });
    expect(proxyAuthorized.statusCode).toBe(200);
    expect(proxyAuthorized.body).toBe(v1.assetBody);
    expect(proxyAuthorized.headers['x-vibecore-static-deployment']).toBe(secondRollbackId);
  });

  it('prefers the immutable rollback alias when the mutable source row and snapshot still exist', async () => {
    const { app, store, auth, projectId } = await setup();
    const v1 = await publishStatic(store, projectId, 1, 'SOURCE STILL PRESENT');
    await publishStatic(store, projectId, 2, 'CURRENT');

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-source-present' },
      payload: { environment: 'preview' },
    });
    expect(response.statusCode).toBe(201);
    const rollbackId = response.json().deployment.id as string;

    await writeFile(join(staticDeploymentSnapshotDir(v1.deployment.id), 'assets', 'app.js'), 'TAMPERED SOURCE\n');
    expect(await computeStaticSnapshotDigest(v1.deployment.id)).not.toBe(v1.artifactDigest);
    expect(await computeStaticSnapshotDigest(rollbackId)).toBe(v1.artifactDigest);

    const served = await app.inject({
      method: 'GET',
      url: `/static-deployments/${v1.deployment.id}/assets/app.js`,
    });
    expect(served.statusCode).toBe(200);
    expect(served.body).toBe(v1.assetBody);
    expect(served.headers['x-vibecore-static-deployment']).toBe(rollbackId);
  });

  it('restores from immutable plan/project pins after the source Deployment row is pruned', async () => {
    const { app, store, auth, projectId } = await setup();
    const v1 = await publishStatic(store, projectId, 1, 'PRUNABLE VERSION');
    await publishStatic(store, projectId, 2, 'CURRENT VERSION');

    store.deployments.delete(v1.deployment.id);

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${auth.token}`,
        'idempotency-key': 'static-pruned-source',
      },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { deployment: { id: string; metadata?: Record<string, unknown> } };
    expect(body.deployment.metadata).toMatchObject({ planEntitlements: RELEASE_PLAN_ENTITLEMENTS });
    const releases = await store.listReleaseManifests(projectId, 'preview');
    expect(releases[0]).toMatchObject({
      deploymentId: body.deployment.id,
      planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
      projectManifestDigest: v1.projectManifestDigest,
    });
  });

  it('requires an idempotency key before creating any rollback authority or deployment', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(store.rollbackOperations.size).toBe(0);
    expect(
      (await store.listDeployments(projectId)).filter(
        (deployment) => (deployment.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true,
      ),
    ).toHaveLength(0);
  });

  it.each([
    [
      'missing',
      (store: TestApiStore) => {
        store.deploymentAccessPolicies.splice(0);
      },
    ],
    [
      'malformed',
      (store: TestApiStore) => {
        const policy = store.deploymentAccessPolicies[0];
        if (policy) policy.revision = '';
      },
    ],
    [
      'legacy version',
      (store: TestApiStore) => {
        const previous = [...store.releaseManifests].sort((left, right) => left.version - right.version)[0];
        if (previous) previous.accessPolicyVersion = 0;
      },
    ],
  ])(
    'rejects a %s retained static access policy before authority, copy, alias, or deployment creation',
    async (_, mutate) => {
      const { app, store, auth, projectId } = await setup();
      const previous = await publishStatic(store, projectId, 1, 'POLICY SOURCE');
      await publishStatic(store, projectId, 2, 'POLICY HEAD');
      mutate(store);
      const deploymentCount = store.deployments.size;

      const response = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/rollback-to-previous`,
        headers: {
          authorization: `Bearer ${auth.token}`,
          'idempotency-key': 'static-policy-missing',
        },
        payload: { environment: 'preview' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'RELEASE_ACCESS_POLICY_INVALID' });
      expect(store.rollbackOperations.size).toBe(0);
      expect(store.deployments.size).toBe(deploymentCount);
      expect(await resolveStaticDeploymentRoutingAlias(previous.deployment.id)).toBeUndefined();
      await app.close();
    },
  );

  it('keeps Reserved CHANGE/recovery with legacy manifests inadmissible before any rollback authority', async () => {
    const { app, store, auth, projectId } = await setup();
    const projectManifest = await store.getLatestProjectManifest(projectId);
    if (!projectManifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');
    const created = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'server',
      environment: 'preview',
      status: 'READY',
      machineSize: 'dedicated-1',
      url: 'https://reserved-rollback.example.test',
      metadata: {
        planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
        projectManifestDigest: projectManifest.digest,
      },
    });
    /*
     * This is the durable post-CHANGE/recovery shape: the same Deployment row
     * became a Reserved VM in place, while its historic release manifests are
     * legacy rows with no 0100 runtime/promotion authority. Recovery must never
     * make those null envelopes admissible for either rollback endpoint.
     */
    const reserved = await store.updateDeployment(projectId, created.id, {
      runtimeKind: 'reserved-vm',
      runtimeVersion: 3,
      reservedVmTier: 'dedicated-1',
      persistentStorageClaim: `reserved-data-${created.id}`,
      metadata: { reservedVmChangeRecovered: true },
    });
    for (const version of [1, 2]) {
      store.seedLegacyReleaseManifestForTest({
        projectId,
        deploymentId: reserved.id,
        environment: 'preview',
        version,
        provider: 'server',
        artifactKind: 'server-image',
        artifactRef: `registry.example.test/reserved@sha256:${String(version).repeat(64)}`,
        artifactDigest: `sha256:${String(version).repeat(64)}`,
        accessPolicyVersion: reserved.accessPolicyVersion,
        planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
        projectManifestDigest: projectManifest.digest,
      });
    }
    expect((await store.listReleaseManifests(projectId, 'preview')).every((manifest) => !manifest.runtimeSpec)).toBe(
      true,
    );
    expect(
      (await store.listReleaseManifests(projectId, 'preview')).every((manifest) => !manifest.promotionEvidence),
    ).toBe(true);
    const deploymentCount = (await store.listDeployments(projectId)).length;
    const manager = vi.fn(async () => new Response('unexpected manager call', { status: 500 }));
    globalThis.fetch = manager as typeof fetch;

    const previous = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'reserved-rollback-refused-0001' },
      payload: { environment: 'preview' },
    });
    const direct = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${reserved.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(previous.statusCode).toBe(409);
    expect(previous.json()).toMatchObject({ code: 'RESERVED_VM_ROLLBACK_UNPINNED' });
    expect(direct.statusCode).toBe(409);
    expect(direct.json()).toMatchObject({ code: 'RESERVED_VM_ROLLBACK_UNPINNED' });
    expect(store.rollbackOperations.size).toBe(0);
    expect(await store.listDeployments(projectId)).toHaveLength(deploymentCount);
    expect(manager).not.toHaveBeenCalled();

    /* Pruning the changed/recovered row must not turn its legacy manifests into authority. */
    store.deployments.delete(reserved.id);
    const manifestOnly = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${auth.token}`,
        'idempotency-key': 'reserved-legacy-manifest-only-refused-0002',
      },
      payload: { environment: 'preview' },
    });
    expect(manifestOnly.statusCode).toBe(409);
    expect(manifestOnly.json()).toMatchObject({ code: 'ROLLBACK_RUNTIME_SPEC_INVALID' });
    expect(store.rollbackOperations.size).toBe(0);
    expect(await store.listDeployments(projectId)).toHaveLength(0);
    expect(manager).not.toHaveBeenCalled();
    await app.close();
  });

  it('replays the exact durable 201 and creates one deployment + one release', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const request = {
      method: 'POST' as const,
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${auth.token}`,
        'idempotency-key': 'static-lost-response',
        'accept-language': 'fr',
      },
      payload: { environment: 'preview' },
    };

    const first = await app.inject(request);
    const committedDeploymentId = first.json().deployment.id as string;
    store.deployments.delete(committedDeploymentId);

    const replay = await app.inject({
      ...request,
      headers: { ...request.headers, 'accept-language': 'en' },
    });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.headers['content-language']).toBe('fr');
    expect(replay.json()).toEqual(first.json());
    expect(
      (await store.listDeployments(projectId)).filter(
        (deployment) => (deployment.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true,
      ),
    ).toHaveLength(0);
    expect((await store.listReleaseManifests(projectId, 'preview')).map((manifest) => manifest.version)).toEqual([
      3, 2, 1,
    ]);
  });

  it('recovers a committed release before mutable project-manifest checks', async () => {
    const { app, store, auth, projectId } = await setup();
    const previous = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const projectManifest = await store.getLatestProjectManifest(projectId);
    expect(projectManifest).toBeDefined();
    const project = await store.getProject(projectId);
    if (!project) throw new Error('TEST_PROJECT_MISSING');
    await store.updateDeployment(projectId, previous.deployment.id, {
      metadata: {
        planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
        projectManifestDigest: projectManifest!.digest,
      },
    });

    const idempotencyKey = 'static-committed-before-response';

    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify({ operation: 'rollback-to-previous', environment: 'preview' }))
      .digest('hex');
    const acquired = await store.acquireRollbackOperation({
      projectId,
      actorUserId: auth.user.id,
      idempotencyKey,
      requestFingerprint,
      environment: 'preview',
      ownerToken: 'committed-owner',
      leaseDurationMs: 60_000,
    });
    const release = await acquireTestProjectReleaseFence(store, {
      projectId,
      organizationId: project.organizationId,
    });

    const sourceManifest = (await store.listReleaseManifests(projectId, 'preview'))[1];
    const deploymentId = 'committed-static-rollback';

    const operation = await store.bindRollbackOperationTarget({
      operationId: acquired.record.id,
      ownerToken: 'committed-owner',
      fencingToken: 1,
      deploymentId,
      expectedHeadVersion: 2,
      previousManifestId: sourceManifest.id,
      projectManifestDigest: projectManifest!.digest,
      releaseFence: release.releaseFence,
    });
    const metadata = {
      planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
      rollbackToPrevious: true,
      rollbackOperationId: operation.id,
      projectManifestDigest: projectManifest!.digest,
      restoredFromVersion: 1,
      restoredFromDeploymentId: previous.deployment.id,
      supersededVersion: 2,
      manifestArtifactDigest: previous.artifactDigest,
    };
    await store.ensureRollbackDeployment({
      fence: { operationId: operation.id, ownerToken: 'committed-owner', fencingToken: 1 },
      releaseFence: release.releaseFence,
      deployment: {
        id: deploymentId,
        projectId,
        provider: 'static',
        environment: 'preview',
        status: 'QUEUED',
        accessPolicyVersion: sourceManifest.accessPolicyVersion,
        rolledBackFromId: previous.deployment.id,
        metadata,
      },
    });
    await store.beginRollbackEffect({
      operationId: operation.id,
      ownerToken: 'committed-owner',
      fencingToken: 1,
      releaseFence: release.releaseFence,
    });
    await store.commitStaticRollbackRelease({
      operationId: operation.id,
      ownerToken: 'committed-owner',
      fencingToken: 1,
      expectedHeadVersion: 2,
      projectId,
      deploymentId,
      environment: 'preview',
      provider: 'static',
      artifactRef: sourceManifest.artifactRef,
      artifactDigest: previous.artifactDigest,
      ...(sourceManifest.configDigest ? { configDigest: sourceManifest.configDigest } : {}),
      accessPolicyVersion: sourceManifest.accessPolicyVersion,
      url: 'https://rollback.example.test',
      metadata,
      logs: [],
      finishedAt: new Date().toISOString(),
      releaseFence: release.releaseFence,
      responseContentLanguage: 'en',
    });
    await release.release();

    const changedManifest = canonicalizeProjectManifest({
      ...canonicalizeProjectManifest(projectManifest!.manifest),
      manifestVersion: projectManifest!.manifestVersion + 1,
    });
    await store.createProjectManifestRevision({
      projectId,
      expectedOrganizationId: project.organizationId,
      schemaVersion: changedManifest.schemaVersion,
      manifestVersion: changedManifest.manifestVersion,
      digest: projectManifestDigest(changedManifest),
      manifest: changedManifest,
      expectedDigest: projectManifest!.digest,
    });

    const committedOperation = await store.getRollbackOperation(projectId, idempotencyKey);
    store.rollbackOperations.set(`${projectId}:${idempotencyKey}`, {
      ...committedOperation!,
      leaseExpiresAt: new Date(0).toISOString(),
    });

    const recovered = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': idempotencyKey },
      payload: { environment: 'preview' },
    });

    expect(recovered.statusCode).toBe(201);
    expect(recovered.json()).toMatchObject({
      deployment: { id: deploymentId, status: 'READY' },
      restoredFromVersion: 1,
      supersededVersion: 2,
    });
    expect(await store.getRollbackOperation(projectId, idempotencyKey)).toMatchObject({
      status: 'COMPLETED',
      phase: 'RELEASE_COMMITTED',
      fencingToken: 1,
      responseStatus: 201,
    });
  });

  it('collapses concurrent retries with one key and rejects a different fingerprint', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const request = {
      method: 'POST' as const,
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-concurrent' },
      payload: { environment: 'preview' },
    };

    const [left, right] = await Promise.all([app.inject(request), app.inject(request)]);
    expect([left.statusCode, right.statusCode]).toEqual([201, 201]);
    expect(left.json().deployment.id).toBe(right.json().deployment.id);
    expect(
      (await store.listDeployments(projectId)).filter(
        (deployment) => (deployment.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true,
      ),
    ).toHaveLength(1);

    const conflict = await app.inject({
      ...request,
      payload: { environment: 'production' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('loses release-head CAS honestly, removes rollback bytes, and never appends a false manifest', async () => {
    class PausingRollbackStore extends TestApiStore {
      readonly deploymentEnsured: Promise<void>;
      private _signalDeploymentEnsured!: () => void;
      private _resume!: () => void;
      private readonly _paused = new Promise<void>((resolve) => {
        this._resume = resolve;
      });

      constructor() {
        super();
        this.deploymentEnsured = new Promise<void>((resolve) => {
          this._signalDeploymentEnsured = resolve;
        });
      }

      release() {
        this._resume();
      }

      override async ensureRollbackDeployment(input: Parameters<TestApiStore['ensureRollbackDeployment']>[0]) {
        const deployment = await super.ensureRollbackDeployment(input);
        this._signalDeploymentEnsured();
        await this._paused;

        return deployment;
      }
    }

    const store = new PausingRollbackStore();
    const { app, auth, projectId } = await setup(store);
    const previous = await publishStatic(store, projectId, 1, 'VERSION ONE');

    const current = await publishStatic(store, projectId, 2, 'VERSION TWO');
    store.deployments.delete(previous.deployment.id);
    await rm(staticDeploymentSnapshotDir(previous.deployment.id), { recursive: true, force: true });

    const inFlight = app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-head-cas' },
      payload: { environment: 'preview' },
    });
    await store.deploymentEnsured;
    await store.createReleaseManifest({
      projectId,
      deploymentId: current.deployment.id,
      environment: 'preview',
      version: 3,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: current.artifactRef,
      artifactDigest: current.artifactDigest,
      accessPolicyVersion: current.deployment.accessPolicyVersion,
      planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
      projectManifestDigest: current.projectManifestDigest,
    });
    store.release();

    const response = await inFlight;
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'ROLLBACK_RELEASE_MOVED', expectedVersion: 2, observedVersion: 3 });

    const rollback = (await store.listDeployments(projectId)).find(
      (deployment) => (deployment.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true,
    );
    expect(rollback?.status).toBe('FAILED');
    expect(await computeStaticSnapshotDigest(rollback!.id)).toBeUndefined();
    expect(await resolveStaticDeploymentRoutingAlias(previous.deployment.id)).toBeUndefined();
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/static-deployments/${previous.deployment.id}/assets/app.js`,
        })
      ).statusCode,
    ).toBe(404);
    expect((await store.listReleaseManifests(projectId, 'preview')).map((manifest) => manifest.version)).toEqual([
      3, 2, 1,
    ]);
  });

  it('recovers an expired owner after an external effect, removes orphan bytes, and replays the durable failure', async () => {
    const { app, store, auth, projectId } = await setup();
    const previous = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const projectManifest = await store.getLatestProjectManifest(projectId);
    expect(projectManifest).toBeDefined();
    const project = await store.getProject(projectId);
    if (!project) throw new Error('TEST_PROJECT_MISSING');
    const release = await acquireTestProjectReleaseFence(store, {
      projectId,
      organizationId: project.organizationId,
    });

    const idempotencyKey = 'static-orphaned-effect';

    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify({ operation: 'rollback-to-previous', environment: 'preview' }))
      .digest('hex');
    const acquired = await store.acquireRollbackOperation({
      projectId,
      actorUserId: auth.user.id,
      idempotencyKey,
      requestFingerprint,
      environment: 'preview',
      ownerToken: 'crashed-owner',
      leaseDurationMs: 60_000,
    });
    expect(acquired.kind).toBe('ACQUIRED');

    const deploymentId = 'orphaned-static-rollback';

    const bound = await store.bindRollbackOperationTarget({
      operationId: acquired.record.id,
      ownerToken: 'crashed-owner',
      fencingToken: acquired.record.fencingToken,
      deploymentId,
      expectedHeadVersion: 2,
      previousManifestId: (await store.listReleaseManifests(projectId, 'preview'))[1].id,
      projectManifestDigest: projectManifest!.digest,
      releaseFence: release.releaseFence,
    });
    await store.ensureRollbackDeployment({
      fence: {
        operationId: bound.id,
        ownerToken: 'crashed-owner',
        fencingToken: bound.fencingToken,
      },
      releaseFence: release.releaseFence,
      deployment: {
        id: deploymentId,
        projectId,
        provider: 'static',
        environment: 'preview',
        status: 'QUEUED',
        accessPolicyVersion: previous.deployment.accessPolicyVersion,
        rolledBackFromId: previous.deployment.id,
        metadata: {
          rollbackToPrevious: true,
          rollbackOperationId: bound.id,
          projectManifestDigest: projectManifest!.digest,
          restoredFromVersion: 1,
          restoredFromDeploymentId: previous.deployment.id,
          supersededVersion: 2,
          manifestArtifactDigest: previous.artifactDigest,
        },
      },
    });

    const effect = await store.beginRollbackEffect({
      operationId: bound.id,
      ownerToken: 'crashed-owner',
      fencingToken: bound.fencingToken,
      releaseFence: release.releaseFence,
    });

    const orphanDir = staticDeploymentSnapshotDir(deploymentId);
    await mkdir(orphanDir, { recursive: true });
    await writeFile(join(orphanDir, 'partial.html'), 'PARTIAL ORPHAN', 'utf8');
    await writeStaticDeploymentRoutingAlias(previous.deployment.id, deploymentId);
    expect(await resolveStaticDeploymentRoutingAlias(previous.deployment.id)).toEqual({
      targetDeploymentId: deploymentId,
      edges: [{ sourceDeploymentId: previous.deployment.id, targetDeploymentId: deploymentId }],
    });
    store.rollbackOperations.set(`${projectId}:${idempotencyKey}`, {
      ...effect,
      leaseExpiresAt: new Date(0).toISOString(),
    });
    await release.release();

    const partialArtifact = await app.inject({
      method: 'GET',
      url: `/static-deployments/${deploymentId}/partial.html`,
    });
    expect(partialArtifact.statusCode).toBe(404);

    /*
     * The alias is installed before the release commit. During that crash
     * window the last committed source remains readable, while the guessed
     * target URL must never expose QUEUED/partial bytes.
     */
    const committedSource = await app.inject({
      method: 'GET',
      url: `/static-deployments/${previous.deployment.id}/assets/app.js`,
    });
    expect(committedSource.statusCode).toBe(200);
    expect(committedSource.body).toBe(previous.assetBody);
    expect(committedSource.headers['x-vibecore-static-deployment']).toBe(previous.deployment.id);
    expect(committedSource.headers['x-vibecore-static-deployment-alias']).toBeUndefined();

    const queuedServingState = await app.inject({
      method: 'GET',
      url: `/deployments/${deploymentId}/serving-state`,
    });
    expect(queuedServingState.json()).toEqual({ state: 'not-found' });

    const request = {
      method: 'POST' as const,
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': idempotencyKey },
      payload: { environment: 'preview' },
    };

    const recovered = await app.inject(request);

    expect(recovered.statusCode).toBe(409);
    expect(recovered.json()).toMatchObject({ code: 'ROLLBACK_RECOVERED_FAILED_ATTEMPT' });
    expect(await computeStaticSnapshotDigest(deploymentId)).toBeUndefined();
    expect(await resolveStaticDeploymentRoutingAlias(previous.deployment.id)).toBeUndefined();
    expect((await store.getDeployment(projectId, deploymentId))?.status).toBe('FAILED');

    const failedServingState = await app.inject({
      method: 'GET',
      url: `/deployments/${deploymentId}/serving-state`,
    });
    expect(failedServingState.json()).toEqual({ state: 'not-found' });
    expect(await store.getRollbackOperation(projectId, idempotencyKey)).toMatchObject({
      status: 'COMPLETED',
      phase: 'EFFECT_CLEANED',
      fencingToken: 2,
      effectFencingToken: 1,
      responseStatus: 409,
    });

    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(409);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.json()).toEqual(recovered.json());
  });

  it('rejects forged, cross-project, divergent, cyclic, and corrupt static aliases', async () => {
    const { app, store, auth, projectId } = await setup();
    const source = await publishStatic(store, projectId, 1, 'ALIAS AUTHORITY SOURCE');
    const unrelated = await publishStatic(store, projectId, 2, 'UNRELATED READY TARGET');

    const expectSourceDenied = async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/static-deployments/${source.deployment.id}/assets/app.js`,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'STATIC_DEPLOY_ARTIFACT_NOT_FOUND' });
    };

    /* READY + committed is insufficient: the target must be a rollback of this exact source. */
    await writeStaticDeploymentRoutingAlias(source.deployment.id, unrelated.deployment.id);
    expect(await resolveStaticDeploymentRoutingAlias(source.deployment.id)).toEqual({
      targetDeploymentId: unrelated.deployment.id,
      edges: [{ sourceDeploymentId: source.deployment.id, targetDeploymentId: unrelated.deployment.id }],
    });
    await expectSourceDenied();

    /* Even an exact rolledBackFrom edge cannot substitute different immutable bytes. */
    await store.updateDeployment(projectId, unrelated.deployment.id, {
      rolledBackFromId: source.deployment.id,
    });
    expect(unrelated.artifactDigest).not.toBe(source.artifactDigest);
    await expectSourceDenied();

    const otherProjectResponse = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Alias Cross Project Target' },
    });
    expect(otherProjectResponse.statusCode).toBe(201);
    const otherProjectId = (otherProjectResponse.json() as { project: { id: string } }).project.id;
    const crossProject = await publishStatic(store, otherProjectId, 1, 'CROSS PROJECT TARGET');
    await store.updateDeployment(otherProjectId, crossProject.deployment.id, {
      rolledBackFromId: source.deployment.id,
    });

    /* A syntactically valid rollback edge must not cross the source manifest's project boundary. */
    await writeStaticDeploymentRoutingAlias(source.deployment.id, crossProject.deployment.id);
    await expectSourceDenied();

    /* Cycles are structural corruption and never fall back to mutable source bytes. */
    await writeStaticDeploymentRoutingAlias(source.deployment.id, unrelated.deployment.id);
    await writeStaticDeploymentRoutingAlias(unrelated.deployment.id, source.deployment.id);
    expect(await resolveStaticDeploymentRoutingAlias(source.deployment.id)).toBeNull();
    await expectSourceDenied();

    /* Invalid on-disk targets are likewise corruption, not a routing hint. */
    await mkdir(join(storageDir, '.aliases'), { recursive: true });
    await writeFile(join(storageDir, '.aliases', source.deployment.id), '../outside\n', 'utf8');
    expect(await resolveStaticDeploymentRoutingAlias(source.deployment.id)).toBeNull();
    await expectSourceDenied();
  });

  it('fails closed (409) when there is no previous version', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'ONLY ONE');

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${auth.token}`,
        'accept-language': 'fr',
        'idempotency-key': 'static-no-previous',
      },
      payload: { environment: 'preview' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.headers['content-language']).toBe('fr');
    expect(res.json()).toMatchObject({
      code: 'ROLLBACK_NO_PREVIOUS_MANIFEST',
      error: 'Une seule version existe ; aucune version précédente n’est disponible pour le retour arrière.',
    });
  });

  it('fails closed (409) when the previous artifact no longer matches its manifest', async () => {
    const { app, store, auth, projectId } = await setup();
    const v1 = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    // Tamper v1's retained content AFTER its manifest digest was recorded.
    await writeFile(join(staticDeploymentArtifactDir(v1.artifactRef), 'index.html'), '<body>TAMPERED</body>', 'utf8');

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-digest-mismatch' },
      payload: { environment: 'preview' },
    });

    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ROLLBACK_ARTIFACT_DIGEST_MISMATCH');
  });

  it('fails closed (409) when the previous snapshot bytes are gone', async () => {
    const { app, store, auth, projectId } = await setup();
    const v1 = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    await rm(staticDeploymentArtifactDir(v1.artifactRef), { recursive: true, force: true });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-source-missing' },
      payload: { environment: 'preview' },
    });

    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ROLLBACK_SNAPSHOT_SOURCE_MISSING');
  });

  it('lists the release history newest-first via GET /projects/:id/releases', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'V1');
    await publishStatic(store, projectId, 2, 'V2');

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/releases?environment=preview`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { releases: Array<{ version: number }> };
    expect(body.releases.map((r) => r.version)).toEqual([2, 1]);
  });
});
