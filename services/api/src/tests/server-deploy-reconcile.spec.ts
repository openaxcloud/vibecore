import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';
import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';
import { deterministicServerReleaseFixture } from './deterministic-release-fixture.js';
import { RESERVED_VM_TERMS_VERSION } from '../reserved-vm.js';

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

  function deterministicImageMetadata(input: {
    organizationId: string;
    projectId: string;
    projectManifestDigest: string;
    host: string;
    serverDeploy?: Record<string, unknown>;
  }) {
    const pins = deterministicServerReleaseFixture({
      organizationId: input.organizationId,
      projectId: input.projectId,
      projectManifestDigest: input.projectManifestDigest,
      accessPolicyVersion: 1,
      artifactRef: IMAGE_REF,
      artifactDigest: DIGEST,
      healthPath: '/health',
    });
    return {
      pins,
      metadata: {
        planEntitlements: pins.planEntitlements,
        projectManifestDigest: input.projectManifestDigest,
        serverDeploy: {
          host: input.host,
          applied: true,
          image: { imageRef: IMAGE_REF, imageUri: `${IMAGE_REF}@${DIGEST}`, imageDigest: DIGEST },
          promotion: pins.promotion,
          rollbackRuntimeSpec: pins.runtimeSpec,
          rollbackPromotionEvidence: pins.promotionEvidence,
          releaseConfigDigest: DIGEST,
          ...(input.serverDeploy ?? {}),
        },
      },
    };
  }

  it('promotes a BUILDING server deploy to READY when the manager reports a ready replica', async () => {
    const { app, store, auth, projectId, projectManifestDigest } = await setup();
    stubManagerStatus(1);

    const host = 'd-reconcileready.preview.e-code.ai';
    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
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
      expectedOrganizationId: auth.organization.id,
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
      expectedOrganizationId: auth.organization.id,
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
    const release = deterministicImageMetadata({
      organizationId: auth.organization.id,
      projectId,
      projectManifestDigest,
      host,
    });
    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      machineSize: 'shared-0.5',
      metadata: release.metadata,
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

  it('reconciles a Reserved CREATE with operation-pinned resources after active rate-card drift', async () => {
    const { app, store, auth, projectId, projectManifestDigest } = await setup();
    const operationKey = 'reserved-reconcile-rate-card-drift-0001';
    const release = deterministicImageMetadata({
      organizationId: auth.organization.id,
      projectId,
      projectManifestDigest,
      host: 'd-reserved-reconcile.preview.e-code.ai',
    });
    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      machineSize: 'shared-0.5',
      metadata: { ...release.metadata, reservedVmOperationKey: operationKey },
      reservedVm: {
        organizationId: auth.organization.id,
        actorUserId: auth.user.id,
        idempotencyKey: operationKey,
        requestHash: 'reserved-reconcile-rate-card-drift-request',
        tier: 'shared-0.5',
        termsVersion: RESERVED_VM_TERMS_VERSION,
        monthlyPriceCents: 2_000,
        rateCardVersion: 1,
      },
    });
    const activeCardLookup = vi.spyOn(store, 'getActiveRateCard').mockResolvedValue({
      version: 2,
      data: {
        version: 2,
        effectiveAt: '2026-08-28T00:00:00.000Z',
        currency: 'usd',
        compute: {
          cpuSecondUnits: 1,
          gbSecondUnits: 1,
          unitCents: 1,
          requestCents: 1,
          baseCentsPerMonth: 0,
          egressCentsPerGib: 1,
        },
        machineSizes: [
          {
            key: 'shared-0.5',
            label: 'Drifted',
            vcpu: 7.777,
            ramGb: 7,
            cpuMillicores: 7_777,
            ramMb: 7_168,
            computeUnitsPerSecond: 1,
          },
        ],
        planMaxMachineVcpu: { free: 1, core: 8, pro: 8 },
      },
    });
    const reconfigureBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith(`/server-deployments/${deployment.id}/status`)) {
        return new Response(JSON.stringify({ exists: true, readyReplicas: 1, replicas: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (href.endsWith(`/server-deployments/${deployment.id}/reconfigure`)) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        reconfigureBodies.push(body);
        return new Response(
          JSON.stringify({
            ready: true,
            readyReplicas: 1,
            appliedFencingToken: body.fencingToken,
            persistentVolumeClaimName: `reserved-data-${deployment.id}`,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().deployment.status).toBe('READY');
    expect(reconfigureBodies).toEqual([
      expect.objectContaining({
        cpuRequest: '500m',
        cpuLimit: '500m',
        memoryRequest: '2048Mi',
        memoryLimit: '2048Mi',
      }),
    ]);
    expect(activeCardLookup).not.toHaveBeenCalled();
    expect(store.releaseManifests[0]?.runtimeSpec).toEqual(release.pins.runtimeSpec);
    await app.close();
  });

  it('fails terminally with no manifest when the release fence is lost immediately before commit', async () => {
    const { app, store, auth, projectId, projectManifestDigest } = await setup();
    stubManagerStatus(1);
    const host = 'd-fence-lost.preview.e-code.ai';
    const release = deterministicImageMetadata({
      organizationId: auth.organization.id,
      projectId,
      projectManifestDigest,
      host,
    });
    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      machineSize: 'shared-0.5',
      metadata: release.metadata,
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
    const release = deterministicImageMetadata({
      organizationId: auth.organization.id,
      projectId,
      projectManifestDigest: builtManifestDigest,
      host: 'd-stale-manifest.preview.e-code.ai',
    });
    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      machineSize: 'shared-0.5',
      metadata: release.metadata,
    });
    const nextManifest = { ...createDefaultProjectManifest(projectId), manifestVersion: 2 };
    await store.createProjectManifestRevision({
      projectId,
      expectedOrganizationId: auth.organization.id,
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
    const release = deterministicImageMetadata({
      organizationId: auth.organization.id,
      projectId,
      projectManifestDigest,
      host: 'd-unverified.preview.e-code.ai',
      serverDeploy: {
        ...(evidence ? { promotion: { ...evidence, targetTenant: auth.organization.id } } : { promotion: undefined }),
      },
    });
    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      machineSize: 'shared-0.5',
      metadata: release.metadata,
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
    const release = deterministicImageMetadata({
      organizationId: auth.organization.id,
      projectId,
      projectManifestDigest,
      host: 'd-concurrent.preview.e-code.ai',
    });
    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      machineSize: 'shared-0.5',
      metadata: release.metadata,
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
