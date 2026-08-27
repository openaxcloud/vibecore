import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';
import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';

/*
 * Reconcile-on-read for provider='server' deployments.
 *
 * A server deploy applies its k8s Deployment/Service synchronously, then polls
 * readiness for a bounded window. Under capacity pressure (a cold gVisor node:
 * scale-up + image pull + boot) the pod goes Ready AFTER that poll times out, so
 * the create request persists a NON-TERMINAL `BUILDING` row (never a terminal
 * FAILED, which the monotonic status guard would lock, leaving the live app
 * showing "failed" forever and leaking the Deployment). These tests prove the
 * read path re-checks live readiness against the manager and self-heals
 * BUILDING → READY once a replica is up, and holds BUILDING while it is not.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('server deploy reconcile-on-read (false-FAILED self-heal)', () => {
  const previousManagerUrl = process.env.WORKSPACE_MANAGER_URL;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
  });

  afterEach(() => {
    if (previousManagerUrl === undefined) {
      delete process.env.WORKSPACE_MANAGER_URL;
    } else {
      process.env.WORKSPACE_MANAGER_URL = previousManagerUrl;
    }

    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  async function setup(options: ApiAppOptions = {}) {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store, ...options });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'server-reconcile@example.com',
        password: 'password123',
        name: 'Server Reconcile',
        organizationName: 'Server Reconcile Org',
      },
    });
    expect(register.statusCode).toBe(201);
    const auth = register.json() as { token: string; organization: { id: string }; user: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Server Reconcile Project' },
    });
    const projectId = (project.json() as { project: { id: string } }).project.id;
    const manifest = await store.getLatestProjectManifest(projectId);

    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');

    return { app, store, auth, projectId, projectManifestDigest: manifest.digest };
  }

  /** Stub the manager `/server-deployments/:id/status` GET with a fixed readiness. */
  function stubManagerStatus(readyReplicas: number, replicas = 1) {
    globalThis.fetch = vi.fn(async (url: any) => {
      const href = typeof url === 'string' ? url : url.toString();

      if (href.includes('/server-deployments/') && href.endsWith('/status')) {
        return new Response(JSON.stringify({ exists: true, readyReplicas, replicas }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
  }

  const DIGEST = `sha256:${'a'.repeat(64)}`;
  const IMAGE_REF = 'europe-west9-docker.pkg.dev/tenant-proj/tenant-repo/p-project';
  const promotion = (organizationId: string, overrides: Record<string, unknown> = {}) => ({
    promotionId: 'promo-route-test',
    sourceRepo: 'europe-west9-docker.pkg.dev/source-proj/build-repo/p-project',
    sourceDigest: DIGEST,
    targetRepo: IMAGE_REF,
    targetTenant: organizationId,
    retentionTag: `active-promo-${'a'.repeat(32)}`,
    attachments: [
      { type: 'signature', digest: `sha256:${'b'.repeat(64)}`, subjectDigest: DIGEST, relinked: true },
      { type: 'sbom', digest: `sha256:${'c'.repeat(64)}`, subjectDigest: DIGEST, relinked: true },
      { type: 'provenance', digest: `sha256:${'d'.repeat(64)}`, subjectDigest: DIGEST, relinked: true },
    ],
    binaryAuthorizationResult: 'PASSED',
    binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
    binaryAuthorizationPolicyEtag: 'policy-etag-0001',
    binaryAuthorizationEvaluatedImage: `${IMAGE_REF}@${DIGEST}`,
    binaryAuthorizationEvaluatedAt: '2026-08-26T00:00:00.500Z',
    state: 'PROMOTION_COMMITTED',
    preparedAt: '2026-08-26T00:00:00.000Z',
    committedAt: '2026-08-26T00:00:01.000Z',
    ...overrides,
  });

  it('promotes a BUILDING server deploy to READY when the manager reports a ready replica', async () => {
    const { app, store, auth, projectId, projectManifestDigest } = await setup();
    stubManagerStatus(1);

    const host = 'd-reconcileready.preview.e-code.ai';
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      metadata: {
        projectManifestDigest,
        serverDeploy: { host, applied: true, ready: false, readyReplicas: 0 },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    const row = res.json().deployment;
    expect(row.status).toBe('READY');
    expect(row.url).toBe(`https://${host}`);
    expect(row.previewUrl).toBe(`https://${host}`);

    await app.close();
  });

  it('leaves a BUILDING server deploy BUILDING while no replica is ready yet', async () => {
    const { app, store, auth, projectId } = await setup();
    stubManagerStatus(0);

    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      startedAt: new Date().toISOString(),
      metadata: { serverDeploy: { host: 'd-stillbuilding.preview.e-code.ai', applied: true } },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().deployment.status).toBe('BUILDING');

    await app.close();
  });

  it('does not reconcile a BUILDING row whose manifests were never applied', async () => {
    const { app, store, auth, projectId } = await setup();
    // Even if the manager would report ready, an un-applied row must not be touched.
    stubManagerStatus(1);
    const managerCalled = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      startedAt: new Date().toISOString(),
      metadata: { serverDeploy: { host: 'd-notapplied.preview.e-code.ai', applied: false } },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().deployment.status).toBe('BUILDING');
    // The manager status endpoint must not even be consulted for an un-applied row.
    const statusCalls = managerCalled.mock.calls.filter((c: any[]) => String(c[0]).includes('/server-deployments/'));
    expect(statusCalls.length).toBe(0);

    await app.close();
  });

  it('atomically commits ReleaseManifest + READY for a fully promoted server image', async () => {
    const { app, store, auth, projectId, projectManifestDigest } = await setup();
    stubManagerStatus(1);
    const host = 'd-promoted.preview.e-code.ai';
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      metadata: {
        projectManifestDigest,
        serverDeploy: {
          host,
          applied: true,
          image: { imageRef: IMAGE_REF, imageUri: `${IMAGE_REF}@${DIGEST}`, imageDigest: DIGEST },
          promotion: promotion(auth.organization.id),
          releaseConfigDigest: DIGEST,
        },
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deployment.status).toBe('READY');
    expect(store.releaseManifests).toHaveLength(1);
    expect(store.releaseManifests[0]).toMatchObject({
      deploymentId: deployment.id,
      artifactKind: 'server-image',
      artifactRef: IMAGE_REF,
      artifactDigest: DIGEST,
    });
    await app.close();
  });

  it('fails terminally with no manifest when the release fence is lost immediately before commit', async () => {
    const { app, store, auth, projectId, projectManifestDigest } = await setup();
    stubManagerStatus(1);
    const host = 'd-fence-lost.preview.e-code.ai';
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      metadata: {
        projectManifestDigest,
        serverDeploy: {
          host,
          applied: true,
          image: { imageRef: IMAGE_REF, imageUri: `${IMAGE_REF}@${DIGEST}`, imageDigest: DIGEST },
          promotion: promotion(auth.organization.id),
          releaseConfigDigest: DIGEST,
        },
      },
    });
    const assertBarrier = store.assertProjectReleaseBarrier.bind(store);
    let assertions = 0;

    vi.spyOn(store, 'assertProjectReleaseBarrier').mockImplementation(async (input) => {
      assertions += 1;

      if (assertions === 3) {
        const barrier = store.projectCheckpoints.get(input.checkpointId);
        if (barrier) barrier.barrierExpiresAt = new Date(Date.now() - 1_000).toISOString();
      }

      return assertBarrier(input);
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().deployment.status).toBe('FAILED');
    expect(store.releaseManifests).toEqual([]);
    expect([...store.projectCheckpoints.values()].filter((row) => row.state === 'RELEASE_BARRIER')).toEqual([]);
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual(
      expect.arrayContaining([
        [expect.stringContaining(`/server-deployments/${deployment.id}/stop`), expect.anything()],
      ]),
    );
    await app.close();
  });

  it('refuses an artifact whose bound manifest changed before reconcile', async () => {
    const { app, store, auth, projectId, projectManifestDigest: builtManifestDigest } = await setup();
    stubManagerStatus(1);
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      metadata: {
        projectManifestDigest: builtManifestDigest,
        serverDeploy: {
          host: 'd-stale-manifest.preview.e-code.ai',
          applied: true,
          image: { imageRef: IMAGE_REF, imageUri: `${IMAGE_REF}@${DIGEST}`, imageDigest: DIGEST },
          promotion: promotion(auth.organization.id),
          releaseConfigDigest: DIGEST,
        },
      },
    });
    const nextManifest = { ...createDefaultProjectManifest(projectId), manifestVersion: 2 };
    await store.createProjectManifestRevision({
      projectId,
      schemaVersion: nextManifest.schemaVersion,
      manifestVersion: nextManifest.manifestVersion,
      expectedDigest: builtManifestDigest,
      digest: projectManifestDigest(nextManifest),
      manifest: nextManifest,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().deployment).toMatchObject({
      status: 'FAILED',
      metadata: { serverDeploy: { releaseErrorCode: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH' } },
    });
    expect(store.releaseManifests).toEqual([]);
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual(
      expect.arrayContaining([
        [expect.stringContaining(`/server-deployments/${deployment.id}/stop`), expect.anything()],
      ]),
    );
    await app.close();
  });

  it.each([
    ['absent', undefined],
    ['incomplete', promotion('placeholder', { attachments: [], binaryAuthorizationResult: 'UNKNOWN' })],
  ])('fails closed when image promotion evidence is %s: no READY and no release', async (_label, evidence) => {
    const { app, store, auth, projectId, projectManifestDigest } = await setup();
    stubManagerStatus(1);
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      metadata: {
        projectManifestDigest,
        serverDeploy: {
          host: 'd-unverified.preview.e-code.ai',
          applied: true,
          image: { imageRef: IMAGE_REF, imageUri: `${IMAGE_REF}@${DIGEST}`, imageDigest: DIGEST },
          ...(evidence
            ? {
                promotion: {
                  ...evidence,
                  targetTenant: auth.organization.id,
                },
              }
            : {}),
        },
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deployment.status).toBe('FAILED');
    expect(store.releaseManifests).toEqual([]);
    await app.close();
  });

  it('is idempotent under concurrent reconcile requests: one manifest, one version', async () => {
    const { app, store, auth, projectId, projectManifestDigest } = await setup();
    stubManagerStatus(1);
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      metadata: {
        projectManifestDigest,
        serverDeploy: {
          host: 'd-concurrent.preview.e-code.ai',
          applied: true,
          image: { imageRef: IMAGE_REF, imageDigest: DIGEST },
          promotion: promotion(auth.organization.id),
        },
      },
    });
    const request = () =>
      app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${deployment.id}`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
    const [a, b] = await Promise.all([request(), request()]);
    expect([a.json().deployment.status, b.json().deployment.status]).toEqual(['READY', 'READY']);
    expect(store.releaseManifests).toHaveLength(1);
    expect(store.releaseManifests[0]?.version).toBe(1);
    await app.close();
  });
});
