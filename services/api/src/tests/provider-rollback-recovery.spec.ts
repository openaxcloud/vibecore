import { PLAN_ENTITLEMENTS_VERSION } from '@vibecore/billing';
import { createTotpCode } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { requireProviderRollbackSupersededEvidence } from '../provider-rollback-recovery.js';
import type { RollbackOperationRecord } from '../store.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class ReleaseLossAfterProviderAcceptanceStore extends TestApiStore {
  loseNextReleaseAssertion = false;

  override async assertProjectReleaseBarrier(
    input: Parameters<TestApiStore['assertProjectReleaseBarrier']>[0],
  ): Promise<void> {
    if (this.loseNextReleaseAssertion) {
      this.loseNextReleaseAssertion = false;
      throw Object.assign(new Error('Project release barrier was lost after provider acceptance.'), {
        code: 'PROJECT_RELEASE_BARRIER_LOST',
        statusCode: 409,
      });
    }
    await super.assertProjectReleaseBarrier(input);
  }
}

class BeginProviderRollbackLatchStore extends TestApiStore {
  private signalBegin!: () => void;
  private releaseBegin!: () => void;
  readonly beginEntered = new Promise<void>((resolve) => {
    this.signalBegin = resolve;
  });
  private readonly beginReleased = new Promise<void>((resolve) => {
    this.releaseBegin = resolve;
  });

  continueBegin(): void {
    this.releaseBegin();
  }

  override async beginProviderRollbackEffect(
    input: Parameters<TestApiStore['beginProviderRollbackEffect']>[0],
  ): ReturnType<TestApiStore['beginProviderRollbackEffect']> {
    this.signalBegin();
    await this.beginReleased;
    return super.beginProviderRollbackEffect(input);
  }
}

const planEntitlements = {
  version: PLAN_ENTITLEMENTS_VERSION,
  plan: 'pro' as const,
  badgeRequired: false,
  publishRegion: 'platform-default',
  publishRegions: 'all' as const,
};

function vercelRecoveryOperation(startedAt: Date, evidence: Array<Record<string, unknown>>): RollbackOperationRecord {
  return {
    id: 'rollback_vercel_pending',
    projectId: 'project_1',
    actorUserId: 'user_1',
    idempotencyKey: 'vercel-pending',
    requestFingerprint: 'fingerprint',
    environment: 'production',
    operationKind: 'PROVIDER',
    status: 'IN_PROGRESS',
    phase: 'EFFECT_STARTED',
    leaseOwner: 'owner',
    leaseExpiresAt: new Date(startedAt.getTime() + 10 * 60_000).toISOString(),
    fencingToken: 1,
    effectFencingToken: 1,
    deploymentId: 'rollback_deployment',
    sourceDeploymentId: 'source_deployment',
    projectManifestDigest: `sha256:${'a'.repeat(64)}`,
    provider: 'vercel',
    providerDeploymentId: 'dpl_target',
    providerTarget: '{"provider":"vercel","projectId":"prj_exact","teamId":null}',
    providerEffectState: 'MANUAL_RECOVERY',
    providerRecoveryEvidence: evidence,
    providerEffectStartedAt: startedAt.toISOString(),
    createdAt: startedAt.toISOString(),
    updatedAt: String(evidence.at(-1)!.observedAt),
  };
}

describe('provider rollback durable recovery', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'provider-rollback-state-secret';
    process.env.ENCRYPTION_SECRET = 'provider-rollback-encryption-secret';
    process.env.ROLLBACK_LEASE_DURATION_MS = '30000';
    process.env.ROLLBACK_LEASE_RENEW_INTERVAL_MS = '10000';
    process.env.ROLLBACK_IDEMPOTENCY_WAIT_MS = '50';
    process.env.ADMIN_MFA_REQUIRED = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function setup(store: TestApiStore, provider: 'vercel' | 'netlify' | 'cloudflare-pages') {
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${provider}-rollback@example.test`,
        password: 'password123',
        name: 'Provider Rollback',
        organizationName: 'Provider Rollback Org',
      },
    });
    expect(register.statusCode).toBe(201);
    const auth = register.json() as { token: string; user: { id: string }; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const projectResponse = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: `${provider} rollback project` },
    });
    expect(projectResponse.statusCode).toBe(201);
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;
    const manifest = await store.getLatestProjectManifest(projectId);
    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');
    const providerBuildId =
      provider === 'vercel' ? 'dpl_target' : provider === 'netlify' ? 'deploy_target' : 'cf_target';
    const target = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider,
      environment: 'production',
      status: 'READY',
      url: `https://${provider}-target.example.test`,
      productionUrl: `https://${provider}-target.example.test`,
      metadata: {
        planEntitlements,
        projectManifestDigest: manifest.digest,
        providerBuildId,
      },
    });
    return { app, auth, projectId, target, providerBuildId };
  }

  it('requires Idempotency-Key before creating provider authority or calling the provider', async () => {
    const store = new TestApiStore();
    const { app, auth, projectId, target } = await setup(store, 'netlify');
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${target.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(providerFetch).not.toHaveBeenCalled();
    expect(store.rollbackOperations.size).toBe(0);
    expect(await store.listDeployments(projectId)).toHaveLength(1);
    await app.close();
  });

  it('refuses Netlify before provider inspection, mutation, or durable authority because exact recovery is unavailable', async () => {
    const store = new TestApiStore();
    const { app, auth, projectId, target } = await setup(store, 'netlify');
    process.env.NETLIFY_AUTH_TOKEN = 'netlify-token';
    process.env.NETLIFY_SITE_ID = 'site_exact';
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${target.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'netlify-fail-closed' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: 'PROVIDER_ROLLBACK_LIVE_STATE_UNPROVABLE',
      retryable: false,
    });
    expect(providerFetch).not.toHaveBeenCalled();
    expect(store.rollbackOperations.size).toBe(0);
    expect(await store.listDeployments(projectId)).toHaveLength(1);
    await app.close();
  });

  it('atomically refuses cancellation after the rollback deployment is bound but before provider dispatch', async () => {
    const store = new BeginProviderRollbackLatchStore();
    const { app, auth, projectId, target } = await setup(store, 'cloudflare-pages');
    process.env.CLOUDFLARE_API_TOKEN = 'cloudflare-token';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account_cancel_race';
    process.env.CLOUDFLARE_PAGES_PROJECT = 'project_cancel_race';
    let postCount = 0;
    const providerFetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/pages/projects/project_cancel_race/deployments/cf_target') && init?.method !== 'POST') {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id: 'cf_target',
              environment: 'production',
              project_id: 'cf_project_cancel_race',
              project_name: 'project_cancel_race',
              is_skipped: false,
              latest_stage: { status: 'success' },
            },
          }),
          { status: 200 },
        );
      }
      if (
        url.endsWith('/pages/projects/project_cancel_race/deployments/cf_target/rollback') &&
        init?.method === 'POST'
      ) {
        postCount += 1;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.endsWith('/pages/projects/project_cancel_race')) {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id: 'cf_project_cancel_race',
              name: 'project_cancel_race',
              canonical_deployment: {
                id: 'cf_target',
                environment: 'production',
                project_id: 'cf_project_cancel_race',
                project_name: 'project_cancel_race',
              },
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    vi.stubGlobal('fetch', providerFetch);

    const rollbackPromise = app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${target.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'cloudflare-cancel-race' },
    });
    await store.beginEntered;
    const operation = await store.getRollbackOperation(projectId, 'cloudflare-cancel-race');
    expect(operation).toMatchObject({ phase: 'DEPLOYMENT_CREATED', status: 'IN_PROGRESS' });

    const cancel = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${operation!.deploymentId}/cancel`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(cancel.statusCode).toBe(409);
    expect(cancel.json()).toMatchObject({ code: 'DEPLOYMENT_ROLLBACK_IN_PROGRESS' });
    expect(await store.getDeployment(projectId, operation!.deploymentId!)).toMatchObject({ status: 'QUEUED' });

    store.continueBegin();
    const rollback = await rollbackPromise;
    expect(rollback.statusCode, rollback.body).toBe(201);
    expect(postCount).toBe(1);
    expect(await store.getDeployment(projectId, operation!.deploymentId!)).toMatchObject({ status: 'READY' });
    await app.close();
  });

  it('never repeats an accepted Vercel POST and commits once under a new release fence', async () => {
    const store = new ReleaseLossAfterProviderAcceptanceStore();
    const { app, auth, projectId, target } = await setup(store, 'vercel');
    process.env.VERCEL_API_TOKEN = 'vercel-token';
    let postCount = 0;
    const providerFetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.vercel.com/v13/deployments/dpl_target') {
        return new Response(
          JSON.stringify({
            id: 'dpl_target',
            projectId: 'prj_exact',
            target: 'production',
            readyState: 'READY',
            readySubstate: 'PROMOTED',
          }),
          { status: 200 },
        );
      }
      if (url === 'https://api.vercel.com/v1/projects/prj_exact/rollback/dpl_target' && init?.method === 'POST') {
        postCount += 1;
        store.loseNextReleaseAssertion = true;
        throw new TypeError('response lost after provider accepted rollback');
      }
      if (url === 'https://api.vercel.com/v9/projects/prj_exact') {
        return new Response(JSON.stringify({ id: 'prj_exact', lastAliasRequest: null, skewProtectionMaxAge: 0 }), {
          status: 200,
        });
      }
      if (url === 'https://api.vercel.com/v1/projects/prj_exact/rolling-release?state=ACTIVE') {
        return new Response(JSON.stringify({ rollingRelease: null }), { status: 200 });
      }
      if (url.startsWith('https://api.vercel.com/v9/projects/prj_exact/domains?')) {
        return new Response(
          JSON.stringify({
            domains: [{ name: 'app.example.test' }],
            pagination: { count: 1, next: null, prev: null },
          }),
          { status: 200 },
        );
      }
      if (url.startsWith('https://api.vercel.com/v4/aliases/app.example.test?')) {
        return new Response(
          JSON.stringify({ deploymentId: 'dpl_target', alias: 'app.example.test', projectId: 'prj_exact' }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    vi.stubGlobal('fetch', providerFetch);
    const request = {
      method: 'POST' as const,
      url: `/projects/${projectId}/deployments/${target.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'vercel-response-lost' },
    };

    const lostFence = await app.inject(request);
    expect(lostFence.statusCode).toBe(503);
    expect(lostFence.json()).toMatchObject({ code: 'PROVIDER_ROLLBACK_MANUAL_RECOVERY' });
    const firstOperation = await store.getRollbackOperation(projectId, 'vercel-response-lost');
    expect(firstOperation).toMatchObject({
      phase: 'EFFECT_STARTED',
      providerEffectState: 'OBSERVED_TARGET',
      fencingToken: 1,
      providerResponseEvidence: { outcome: 'response-lost' },
    });

    const recovered = await app.inject(request);
    expect(recovered.statusCode).toBe(201);
    expect(recovered.json()).toMatchObject({ deployment: { status: 'READY', rolledBackFromId: target.id } });
    expect(postCount).toBe(1);
    const operation = await store.getRollbackOperation(projectId, 'vercel-response-lost');
    expect(operation).toMatchObject({
      status: 'COMPLETED',
      phase: 'RELEASE_COMMITTED',
      providerEffectState: 'COMMITTED',
      fencingToken: 2,
      responseStatus: 201,
    });
    expect(
      (await store.listDeployments(projectId)).filter(
        (deployment) =>
          (deployment.metadata as Record<string, unknown> | undefined)?.rollbackOperationId === operation?.id,
      ),
    ).toEqual([expect.objectContaining({ status: 'READY', rolledBackFromId: target.id })]);
    await app.close();
  });

  it('never terminalizes Vercel OTHER evidence while the exact target job remains pending', () => {
    const startedAt = new Date('2026-08-31T08:00:00.000Z');
    const evidence = [0, 4 * 60_000].map((offset) => ({
      provider: 'vercel',
      authority: 'project.production_aliases.deploymentId+rolling_release+skew_disabled',
      providerTarget: '{"provider":"vercel","projectId":"prj_exact","teamId":null}',
      targetDeploymentId: 'dpl_target',
      liveDeploymentIds: ['dpl_other'],
      responseStatus: 200,
      state: 'OTHER',
      observedAt: new Date(startedAt.getTime() + offset).toISOString(),
      recoveryMode: 'OPERATOR',
      operatorUserId: 'operator_1',
      vercelAliasRequestPresent: true,
      vercelAliasRequestType: 'rollback',
      vercelAliasRequestTargetDeploymentId: 'dpl_target',
      vercelAliasRequestRequestedAt: startedAt.getTime(),
      vercelAliasRequestJobStatus: 'in-progress',
    }));
    const operation = vercelRecoveryOperation(startedAt, evidence);

    expect(() =>
      requireProviderRollbackSupersededEvidence(operation, 'operator_1', new Date(startedAt.getTime() + 4 * 60_000)),
    ).toThrowError(expect.objectContaining({ code: 'PROVIDER_ROLLBACK_RECOVERY_WINDOW_ACTIVE' }));
  });

  it('does not attribute a stale failed Vercel target request to the current ambiguous effect', () => {
    const startedAt = new Date('2026-08-31T08:00:00.000Z');
    const evidence = [0, 61_000].map((offset) => ({
      provider: 'vercel',
      authority: 'project.production_aliases.deploymentId+rolling_release+skew_disabled',
      providerTarget: '{"provider":"vercel","projectId":"prj_exact","teamId":null}',
      targetDeploymentId: 'dpl_target',
      liveDeploymentIds: ['dpl_other'],
      responseStatus: 200,
      state: 'OTHER',
      observedAt: new Date(startedAt.getTime() + offset).toISOString(),
      recoveryMode: 'OPERATOR',
      operatorUserId: 'operator_1',
      vercelAliasRequestPresent: true,
      vercelAliasRequestType: 'rollback',
      vercelAliasRequestTargetDeploymentId: 'dpl_target',
      vercelAliasRequestRequestedAt: startedAt.getTime() - 24 * 60 * 60_000,
      vercelAliasRequestJobStatus: 'failed',
    }));

    expect(() =>
      requireProviderRollbackSupersededEvidence(
        vercelRecoveryOperation(startedAt, evidence),
        'operator_1',
        new Date(startedAt.getTime() + 61_000),
      ),
    ).toThrowError(expect.objectContaining({ code: 'PROVIDER_ROLLBACK_RECOVERY_WINDOW_ACTIVE' }));
  });

  it('does not repeat a Cloudflare POST after a 500 when live authority proves another deployment', async () => {
    const store = new TestApiStore();
    const { app, auth, projectId, target } = await setup(store, 'cloudflare-pages');
    process.env.CLOUDFLARE_API_TOKEN = 'cloudflare-token';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account_exact';
    process.env.CLOUDFLARE_PAGES_PROJECT = 'project_exact';
    let postCount = 0;
    let liveDeploymentId = 'cf_other';
    const providerFetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/pages/projects/project_exact/deployments/cf_target') && init?.method !== 'POST') {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id: 'cf_target',
              environment: 'production',
              project_id: 'cf_project_exact',
              project_name: 'project_exact',
              is_skipped: false,
              latest_stage: { status: 'success' },
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/pages/projects/project_exact/deployments/cf_target/rollback') && init?.method === 'POST') {
        postCount += 1;
        return new Response(JSON.stringify({ error: 'upstream outcome unavailable' }), { status: 500 });
      }
      if (url.endsWith('/pages/projects/project_exact')) {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id: 'cf_project_exact',
              name: 'project_exact',
              canonical_deployment: {
                id: liveDeploymentId,
                environment: 'production',
                project_id: 'cf_project_exact',
                project_name: 'project_exact',
              },
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    vi.stubGlobal('fetch', providerFetch);
    const request = {
      method: 'POST' as const,
      url: `/projects/${projectId}/deployments/${target.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'cloudflare-other-live' },
    };

    const first = await app.inject(request);
    const inProgress = await store.getRollbackOperation(projectId, 'cloudflare-other-live');
    const cancelAfterDispatch = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${inProgress!.deploymentId}/cancel`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(cancelAfterDispatch.statusCode).toBe(409);
    expect(cancelAfterDispatch.json()).toMatchObject({ code: 'DEPLOYMENT_ROLLBACK_IN_PROGRESS' });
    const retry = await app.inject(request);
    expect(first.statusCode).toBe(503);
    expect(retry.statusCode).toBe(503);
    expect(postCount).toBe(1);
    expect(await store.getRollbackOperation(projectId, 'cloudflare-other-live')).toMatchObject({
      phase: 'EFFECT_STARTED',
      providerEffectState: 'MANUAL_RECOVERY',
      fencingToken: 2,
      providerResponseStatus: 500,
      providerResponseEvidence: { provider: 'cloudflare-pages', status: 500 },
    });
    expect(
      (await store.listDeployments(projectId)).filter(
        (deployment) =>
          (deployment.metadata as Record<string, unknown> | undefined)?.providerRollbackTarget === 'cf_target',
      ),
    ).toEqual([expect.objectContaining({ status: 'QUEUED' })]);

    // A long append-only history must never create a permanent recovery wedge.
    // This exceeds the former 128 KiB aggregate limit using only bounded,
    // structurally valid provider observations, then proves live TARGET.
    const manual = await store.getRollbackOperation(projectId, 'cloudflare-other-live');
    const longHistory = Array.from({ length: 600 }, (_, index) => ({
      provider: 'cloudflare-pages',
      authority: 'project.canonical_deployment.id',
      providerTarget: manual!.providerTarget,
      targetDeploymentId: 'cf_target',
      liveDeploymentIds: [`cf_other_${index.toString().padStart(4, '0')}`],
      responseStatus: 200,
      state: 'OTHER',
      observedAt: new Date(Date.now() + index).toISOString(),
    }));
    expect(Buffer.byteLength(JSON.stringify(longHistory), 'utf8')).toBeGreaterThan(128 * 1024);
    store.rollbackOperations.set(`${projectId}:cloudflare-other-live`, {
      ...manual!,
      providerRecoveryEvidence: longHistory,
    });
    const boundedRetry = await app.inject(request);
    expect(boundedRetry.statusCode).toBe(503);
    expect(
      (await store.getRollbackOperation(projectId, 'cloudflare-other-live'))!.providerRecoveryEvidence,
    ).toHaveLength(longHistory.length);
    expect(postCount).toBe(1);
    liveDeploymentId = 'cf_target';
    const recovered = await app.inject(request);
    expect(recovered.statusCode, recovered.body).toBe(201);
    expect(postCount).toBe(1);
    expect(await store.getRollbackOperation(projectId, 'cloudflare-other-live')).toMatchObject({
      status: 'COMPLETED',
      phase: 'RELEASE_COMMITTED',
      providerEffectState: 'COMMITTED',
    });
    await app.close();
  });

  it('requires admin MFA and reauth, refuses ambiguous proof, then audits safe supersession without another POST', async () => {
    const store = new TestApiStore();
    const { app, auth, projectId, target } = await setup(store, 'cloudflare-pages');
    process.env.CLOUDFLARE_API_TOKEN = 'cloudflare-token';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account_operator';
    process.env.CLOUDFLARE_PAGES_PROJECT = 'project_operator';
    process.env.PLATFORM_ADMIN_EMAILS = 'provider-rollback-admin@example.test';
    let postCount = 0;
    let liveMode: 'OTHER' | 'AMBIGUOUS' = 'OTHER';
    let liveDeploymentId = 'cf_newer';
    const providerFetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/pages/projects/project_operator/deployments/cf_target') && init?.method !== 'POST') {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id: 'cf_target',
              environment: 'production',
              project_id: 'cf_project_operator',
              project_name: 'project_operator',
              is_skipped: false,
              latest_stage: { status: 'success' },
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/pages/projects/project_operator/deployments/cf_target/rollback') && init?.method === 'POST') {
        postCount += 1;
        throw new TypeError('response lost after rollback acceptance');
      }
      if (url.endsWith('/pages/projects/project_operator')) {
        return new Response(
          JSON.stringify({
            success: true,
            result:
              liveMode === 'OTHER'
                ? {
                    id: 'cf_project_operator',
                    name: 'project_operator',
                    canonical_deployment: {
                      id: liveDeploymentId,
                      environment: 'production',
                      project_id: 'cf_project_operator',
                      project_name: 'project_operator',
                    },
                  }
                : {
                    id: 'cf_project_operator',
                    name: 'project_operator',
                    canonical_deployment: null,
                  },
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    vi.stubGlobal('fetch', providerFetch);

    const rollbackRequest = {
      method: 'POST' as const,
      url: `/projects/${projectId}/deployments/${target.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'cloudflare-operator-resolution' },
    };
    const lostResponse = await app.inject(rollbackRequest);
    expect(lostResponse.statusCode).toBe(503);
    expect(postCount).toBe(1);
    const operation = await store.getRollbackOperation(projectId, 'cloudflare-operator-resolution');
    expect(operation).toMatchObject({ phase: 'EFFECT_STARTED', providerEffectState: 'MANUAL_RECOVERY' });

    const adminRegistration = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'provider-rollback-admin@example.test',
        password: 'password123',
        name: 'Provider Rollback Admin',
        organizationName: 'Provider Rollback Admin Org',
      },
    });
    expect(adminRegistration.statusCode).toBe(201);
    const admin = adminRegistration.json() as { token: string; verificationToken: string; user: { id: string } };
    const verifyAdminEmail = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: admin.verificationToken },
    });
    expect(verifyAdminEmail.statusCode).toBe(200);
    const recoveryUrl = `/admin/provider-rollbacks/${encodeURIComponent(operation!.id)}/recovery`;

    const nonAdmin = await app.inject({
      method: 'POST',
      url: recoveryUrl,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {},
    });
    expect(nonAdmin.statusCode).toBe(403);

    // Provider-effect recovery remains MFA-gated even when the compatibility
    // flag disables the general admin MFA middleware.
    const reauthBeforeMfa = await app.inject({
      method: 'POST',
      url: '/auth/reauth',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { password: 'password123' },
    });
    expect(reauthBeforeMfa.statusCode).toBe(200);
    process.env.ADMIN_MFA_REQUIRED = 'false';
    const missingMfa = await app.inject({
      method: 'POST',
      url: recoveryUrl,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { mfaCode: '000000' },
    });
    expect(missingMfa.statusCode).toBe(403);
    expect(missingMfa.json()).toMatchObject({ code: 'ADMIN_MFA_REQUIRED' });
    process.env.ADMIN_MFA_REQUIRED = 'true';
    const mfaSetup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(mfaSetup.statusCode).toBe(200);
    const mfaSecret = mfaSetup.json().secret as string;
    const mfaVerify = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { code: createTotpCode(mfaSecret) },
    });
    expect(mfaVerify.statusCode).toBe(200);
    const reauth = await app.inject({
      method: 'POST',
      url: '/auth/reauth',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { password: 'password123' },
    });
    expect(reauth.statusCode).toBe(200);

    const rollbackBeforeTamper = await store.getDeployment(projectId, operation!.deploymentId!);
    const rollbackMetadata = rollbackBeforeTamper!.metadata as Record<string, unknown>;
    store.deployments.set(operation!.deploymentId!, {
      ...rollbackBeforeTamper!,
      metadata: { ...rollbackMetadata, projectManifestDigest: `sha256:${'f'.repeat(64)}` },
    });
    liveMode = 'OTHER';
    liveDeploymentId = 'cf_target';
    const forgedDeploymentPin = await app.inject({
      method: 'POST',
      url: recoveryUrl,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { mfaCode: createTotpCode(mfaSecret) },
    });
    expect(forgedDeploymentPin.statusCode).toBe(409);
    expect(forgedDeploymentPin.json()).toMatchObject({ code: 'ROLLBACK_DEPLOYMENT_CONFLICT' });
    store.deployments.set(operation!.deploymentId!, rollbackBeforeTamper!);
    liveDeploymentId = 'cf_newer';

    const completedBeforeEffectId = 'rollback_completed_before_provider_effect';
    store.rollbackOperations.set(`${projectId}:completed-before-provider-effect`, {
      ...operation!,
      id: completedBeforeEffectId,
      idempotencyKey: 'completed-before-provider-effect',
      status: 'COMPLETED',
      phase: 'TARGET_BOUND',
      providerEffectState: 'PENDING',
      effectFencingToken: undefined,
      providerResponseStatus: undefined,
      providerResponseEvidence: undefined,
      providerRecoveryEvidence: undefined,
      providerEffectStartedAt: undefined,
      providerEffectResolvedAt: undefined,
      responseStatus: 409,
      responseContentLanguage: 'en',
      responseBody: { code: 'ROLLBACK_CANCELED_BEFORE_EFFECT' },
      completedAt: new Date().toISOString(),
    });
    const completedBeforeEffect = await app.inject({
      method: 'POST',
      url: `/admin/provider-rollbacks/${completedBeforeEffectId}/recovery`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { mfaCode: createTotpCode(mfaSecret) },
    });
    expect(completedBeforeEffect.statusCode).toBe(409);
    expect(completedBeforeEffect.json()).toMatchObject({
      code: 'PROVIDER_ROLLBACK_RECOVERY_AUTHORITY_INVALID',
    });

    liveMode = 'AMBIGUOUS';
    const ambiguous = await app.inject({
      method: 'POST',
      url: recoveryUrl,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { mfaCode: createTotpCode(mfaSecret) },
    });
    expect(ambiguous.statusCode, ambiguous.body).toBe(503);
    expect(ambiguous.json()).toMatchObject({ code: 'PROVIDER_ROLLBACK_MANUAL_RECOVERY' });
    expect(store.auditLogs.filter((event) => event.action === 'deployment.rollback.recovery')).toHaveLength(0);
    expect(postCount).toBe(1);

    const firstObservationAt = Date.now();
    store.databaseClockNowMs = firstObservationAt;
    liveMode = 'OTHER';
    const observationWindow = await app.inject({
      method: 'POST',
      url: recoveryUrl,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { mfaCode: createTotpCode(mfaSecret) },
    });
    expect(observationWindow.statusCode).toBe(409);
    expect(observationWindow.json()).toMatchObject({
      code: 'PROVIDER_ROLLBACK_RECOVERY_WINDOW_ACTIVE',
      retryable: true,
    });
    expect(postCount).toBe(1);

    // Exact provider activity resets the proof window even though both live
    // deployments are non-targets.
    store.databaseClockNowMs = firstObservationAt + 61_000;
    liveDeploymentId = 'cf_newer_v2';
    const providerActivity = await app.inject({
      method: 'POST',
      url: recoveryUrl,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { mfaCode: createTotpCode(mfaSecret) },
    });
    expect(providerActivity.statusCode).toBe(409);
    expect(providerActivity.json()).toMatchObject({ code: 'PROVIDER_ROLLBACK_RECOVERY_WINDOW_ACTIVE' });

    store.databaseClockNowMs = firstObservationAt + 122_000;
    const resolved = await app.inject({
      method: 'POST',
      url: recoveryUrl,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { mfaCode: createTotpCode(mfaSecret) },
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json().recovery).toMatchObject({
      operationId: operation!.id,
      resolution: 'SUPERSEDED',
    });
    expect(postCount).toBe(1);

    const completed = await store.getRollbackOperation(projectId, 'cloudflare-operator-resolution');
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      phase: 'PROVIDER_SUPERSEDED',
      providerEffectState: 'SUPERSEDED',
      responseStatus: 409,
    });
    expect(await store.getDeployment(projectId, operation!.deploymentId!)).toMatchObject({ status: 'FAILED' });
    const auditLogId = resolved.json().recovery.auditLogId as string;
    expect(store.auditLogs.find((event) => event.id === auditLogId)).toMatchObject({
      organizationId: auth.organization.id,
      actorUserId: admin.user.id,
      action: 'deployment.rollback.recovery',
      resourceType: 'rollbackOperation',
      resourceId: operation!.id,
      metadata: { resolution: 'SUPERSEDED', providerQueryCount: 2 },
    });

    const replay = await app.inject(rollbackRequest);
    expect(replay.statusCode).toBe(409);
    expect(replay.json()).toMatchObject({ code: 'PROVIDER_ROLLBACK_SUPERSEDED' });
    expect(postCount).toBe(1);
    await app.close();
  });
});
