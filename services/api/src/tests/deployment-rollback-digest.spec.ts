import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';

/*
 * Audit v4 rollback vertical — the WIRING (not just the pure module).
 *
 * Proves that the real POST /projects/:id/deployments/:id/rollback endpoint, for
 * a provider='server' target, re-deploys the RETAINED image BY DIGEST via the
 * workspace manager (I-REL-1) — independent of whether the current revision
 * still exists — and REFUSES loudly (never a dead-URL row) when no digest was
 * retained or the declared secret policy can't be honoured.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const IMAGE_REF = 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/p-proj';
const DIGEST = 'sha256:' + 'b'.repeat(64);

describe('server rollback re-deploys the retained image by digest (wiring)', () => {
  const prevManagerUrl = process.env.WORKSPACE_MANAGER_URL;
  const prevFlag = process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';

    /*
     * D2: the digest path is the DEFAULT — these tests run with the env var
     * UNSET on purpose, proving a helm upgrade that drops the flag cannot
     * silently revive the URL-copy path. The explicit '0' kill switch has its
     * own test below.
     */
    delete process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
  });

  afterEach(() => {
    if (prevManagerUrl === undefined) {
      delete process.env.WORKSPACE_MANAGER_URL;
    } else {
      process.env.WORKSPACE_MANAGER_URL = prevManagerUrl;
    }

    if (prevFlag === undefined) {
      delete process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
    } else {
      process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST = prevFlag;
    }

    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  /** Capture every manager /server-deployments/start body; report the app ready. */
  function stubManagerStart(): { starts: Array<Record<string, unknown>> } {
    const starts: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: { body?: string }) => {
      const href = typeof url === 'string' ? url : String(url);

      if (href.includes('/server-deployments/start')) {
        const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        starts.push(body);

        return new Response(
          JSON.stringify({ ready: true, url: `https://${body.host as string}`, name: 'app', readyReplicas: 1 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    return { starts };
  }

  async function setup(options: ApiAppOptions = {}) {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store, ...options });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'rollback-digest@example.com',
        password: 'password123',
        name: 'Rollback Digest',
        organizationName: 'Rollback Digest Org',
      },
    });
    expect(register.statusCode).toBe(201);

    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Rollback Digest Project' },
    });

    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, store, auth, projectId };
  }

  /** A READY server release with a retained image digest (the v1 to roll back to). */
  async function createRetainedRelease(
    store: TestApiStore,
    projectId: string,
    over: { image?: unknown; secretPolicy?: string } = {},
  ) {
    const project = await store.getProject(projectId);
    const manifest = await store.getLatestProjectManifest(projectId);

    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');

    const promotion = {
      promotionId: 'promo-retained-release',
      sourceRepo: IMAGE_REF,
      sourceDigest: DIGEST,
      targetRepo: IMAGE_REF,
      targetTenant: project!.organizationId,
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

    return store.createDeployment({
      projectId,
      expectedOrganizationId: project!.organizationId,
      provider: 'server',
      environment: 'preview',
      status: 'READY',
      url: 'https://d-v1.preview.e-code.ai',
      metadata: {
        projectManifestDigest: manifest.digest,
        serverDeploy: {
          host: 'd-v1.preview.e-code.ai',
          ready: true,
          applied: true,
          image: 'image' in over ? over.image : { imageRef: IMAGE_REF, imageDigest: DIGEST },
          promotion,
          ...(over.secretPolicy ? { secretPolicy: over.secretPolicy } : {}),
        },
      },
    });
  }

  it('re-deploys the target by digest (revision-independent, I-REL-1)', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();
    const v1 = await createRetainedRelease(store, projectId);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(201);

    // The manager was actually asked to run the immutable pull-by-digest ref.
    const start = captured.starts.find((s) => String(s.image).includes('@sha256:'));
    expect(start).toBeDefined();
    expect(start!.image).toBe(`${IMAGE_REF}@${DIGEST}`);

    const row = res.json().deployment;
    expect(row.status).toBe('READY');
    expect((row.metadata.serverDeploy as Record<string, unknown>).rolledBackFromDigest).toBe(DIGEST);

    await app.close();
  });

  it('rolls back from the immutable manifest + audit proof after the prior Deployment was pruned', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();

    const commitRelease = async (imageDigest: string, promotionId: string) => {
      const project = await store.getProject(projectId);
      const release = await acquireTestProjectReleaseFence(store, {
        projectId,
        organizationId: project!.organizationId,
        operationId: `fixture:${promotionId}`,
      });

      const promotion = {
        promotionId,
        sourceRepo: IMAGE_REF,
        sourceDigest: imageDigest,
        targetRepo: IMAGE_REF,
        targetTenant: project!.organizationId,
        retentionTag: `active-promo-${'a'.repeat(32)}`,
        attachments: ['signature', 'sbom', 'provenance'].map((type, index) => ({
          type,
          digest: `sha256:${String(index + 1).repeat(64)}`,
          subjectDigest: imageDigest,
          relinked: true,
        })),
        binaryAuthorizationResult: 'PASSED',
        binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
        binaryAuthorizationPolicyEtag: 'policy-etag-0001',
        binaryAuthorizationEvaluatedImage: `${IMAGE_REF}@${imageDigest}`,
        binaryAuthorizationEvaluatedAt: '2026-08-26T00:00:00.500Z',
        state: 'PROMOTION_COMMITTED',
        preparedAt: '2026-08-26T00:00:00.000Z',
        committedAt: '2026-08-26T00:00:01.000Z',
      };
      const deployment = await store.createDeployment({
        projectId,
        expectedOrganizationId: project!.organizationId,
        provider: 'server',
        environment: 'preview',
        status: 'BUILDING',
        metadata: {
          projectManifestDigest: release.digest,
          serverDeploy: { image: { imageRef: IMAGE_REF, imageDigest }, promotion },
        },
      });
      await store.commitServerImageRelease({
        projectId,
        organizationId: project!.organizationId,
        deploymentId: deployment.id,
        environment: 'preview',
        artifactRef: IMAGE_REF,
        artifactDigest: imageDigest,
        url: `https://${deployment.id}.preview.e-code.ai`,
        previewUrl: `https://${deployment.id}.preview.e-code.ai`,
        metadata: deployment.metadata as Record<string, unknown>,
        logs: [],
        finishedAt: '2026-08-26T00:00:02.000Z',
        releaseFence: release.releaseFence,
      });
      await release.release();

      return deployment;
    };

    const previous = await commitRelease(DIGEST, 'promo-pruned-v1');
    await commitRelease(`sha256:${'c'.repeat(64)}`, 'promo-current-v2');
    store.deployments.delete(previous.id);

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'server-pruned-release' },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ restoredFromVersion: 1, verifiedArtifactDigest: DIGEST });
    expect(response.json().deployment.status).toBe('READY');
    expect(captured.starts.at(-1)?.image).toBe(`${IMAGE_REF}@${DIGEST}`);
    expect((await store.listReleaseManifests(projectId, 'preview'))[0]?.version).toBe(3);

    await app.close();
  });

  it('REFUSES (409) when the target retained no digest — never a dead-URL row', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();

    // v1 shipped BEFORE digests were retained: image present but no imageDigest.
    const v1 = await createRetainedRelease(store, projectId, { image: { imageRef: IMAGE_REF } });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ROLLBACK_NO_RETAINED_DIGEST');

    // It must NOT have re-deployed anything.
    expect(captured.starts.some((s) => String(s.image).includes('@sha256:'))).toBe(false);

    await app.close();
  });

  it('REFUSES (409) a PINNED secret policy with no retained snapshot — never fakes it', async () => {
    const { app, store, auth, projectId } = await setup();
    stubManagerStart();

    const v1 = await createRetainedRelease(store, projectId, { secretPolicy: 'PINNED' });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ROLLBACK_SECRET_POLICY_UNSATISFIABLE');

    await app.close();
  });

  it("REFUSES (409) when explicitly disabled ('0') — the kill switch fails CLOSED, never URL-copy", async () => {
    process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST = '0';

    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();
    const v1 = await createRetainedRelease(store, projectId);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('SERVER_ROLLBACK_DIGEST_DISABLED');

    // Nothing re-deployed AND no rollback row created (refused before the row).
    expect(captured.starts.length).toBe(0);

    const list = await store.listDeployments(projectId);
    expect(list.filter((d) => d.rolledBackFromId === v1.id).length).toBe(0);

    await app.close();
  });

  it('annotates un-rollback-able server releases with rollbackUnavailableReason (list + detail)', async () => {
    const { app, store, auth, projectId } = await setup();
    stubManagerStart();

    const withDigest = await createRetainedRelease(store, projectId);
    const withoutDigest = await createRetainedRelease(store, projectId, { image: { imageRef: IMAGE_REF } });

    const list = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(list.statusCode).toBe(200);

    const rows = (list.json() as { deployments: Array<Record<string, unknown>> }).deployments;
    const good = rows.find((d) => d.id === withDigest.id);
    const bad = rows.find((d) => d.id === withoutDigest.id);
    expect(good?.rollbackUnavailableReason).toBeUndefined();
    expect(bad?.rollbackUnavailableReason).toBe('NO_RETAINED_DIGEST');

    const detail = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${withoutDigest.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { deployment: Record<string, unknown> }).deployment.rollbackUnavailableReason).toBe(
      'NO_RETAINED_DIGEST',
    );

    await app.close();
  });

  it('leaves external-provider rollback untouched (no digest re-deploy path)', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();

    const v1 = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://static-v1.example.com',
      metadata: {},
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(201);

    // No server-deploy manager start for a static rollback.
    expect(captured.starts.length).toBe(0);

    await app.close();
  });
});
