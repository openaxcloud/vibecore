import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { reapStaleDeployments, resolveDeployBuildTimeoutMs, DEFAULT_DEPLOY_BUILD_TIMEOUT_MS } from '../deploy-reaper.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

describe('resolveDeployBuildTimeoutMs', () => {
  it('defaults to 10 minutes and honours a positive override', () => {
    expect(resolveDeployBuildTimeoutMs({})).toBe(DEFAULT_DEPLOY_BUILD_TIMEOUT_MS);
    expect(resolveDeployBuildTimeoutMs({ DEPLOY_BUILD_TIMEOUT_MS: '60000' })).toBe(60000);
    // Non-positive / garbage falls back to the default.
    expect(resolveDeployBuildTimeoutMs({ DEPLOY_BUILD_TIMEOUT_MS: '0' })).toBe(DEFAULT_DEPLOY_BUILD_TIMEOUT_MS);
    expect(resolveDeployBuildTimeoutMs({ DEPLOY_BUILD_TIMEOUT_MS: 'nope' })).toBe(DEFAULT_DEPLOY_BUILD_TIMEOUT_MS);
  });
});

describe('reapStaleDeployments', () => {
  it('fails stale QUEUED/BUILDING deployments and leaves a fresh one alone', async () => {
    const store = new TestApiStore();
    const timeoutMs = 10 * 60 * 1000;
    const staleIso = new Date(Date.now() - timeoutMs - 60_000).toISOString();

    const staleQueued = await store.createDeployment({ projectId: 'p1', provider: 'static', status: 'QUEUED' });
    const staleBuilding = await store.createDeployment({ projectId: 'p1', provider: 'static', status: 'BUILDING' });
    const fresh = await store.createDeployment({ projectId: 'p1', provider: 'static', status: 'BUILDING' });
    const alreadyReady = await store.createDeployment({ projectId: 'p1', provider: 'static', status: 'READY' });

    // Backdate the two stale rows past the timeout; leave `fresh` and the READY row current.
    store.deployments.get(staleQueued.id)!.updatedAt = staleIso;
    store.deployments.get(staleBuilding.id)!.updatedAt = staleIso;
    store.deployments.get(alreadyReady.id)!.updatedAt = staleIso;

    const result = await reapStaleDeployments(store, { timeoutMs });

    // Only the two non-terminal stale rows are reaped; the READY row (also stale)
    // is not eligible — listStaleDeployments only returns QUEUED/BUILDING.
    expect(result.scanned).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.deploymentIds.sort()).toEqual([staleBuilding.id, staleQueued.id].sort());

    expect((await store.getDeployment('p1', staleQueued.id))?.status).toBe('FAILED');
    expect((await store.getDeployment('p1', staleBuilding.id))?.status).toBe('FAILED');
    // Fresh in-flight build is untouched.
    expect((await store.getDeployment('p1', fresh.id))?.status).toBe('BUILDING');
    // Terminal row untouched.
    expect((await store.getDeployment('p1', alreadyReady.id))?.status).toBe('READY');

    const failedRow = await store.getDeployment('p1', staleQueued.id);
    expect(JSON.stringify(failedRow?.logs)).toContain('Build interrupted — please retry');
  });

  it('is a no-op when nothing is stale', async () => {
    const store = new TestApiStore();
    await store.createDeployment({ projectId: 'p1', provider: 'static', status: 'BUILDING' });

    const result = await reapStaleDeployments(store, { timeoutMs: 10 * 60 * 1000 });

    expect(result).toEqual({ scanned: 0, failed: 0, deploymentIds: [] });
  });
});

describe('internal deploy build + reap endpoints', () => {
  const previousStaticRoot = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const previousSecret = process.env.INTERNAL_API_SHARED_SECRET;
  let tempStaticRoot: string;

  beforeEach(async () => {
    tempStaticRoot = await mkdtemp(join(tmpdir(), 'vc-deploy-durability-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = tempStaticRoot;
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret-test';
  });

  afterEach(async () => {
    if (previousStaticRoot === undefined) {
      delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    } else {
      process.env.STATIC_DEPLOY_STORAGE_DIR = previousStaticRoot;
    }

    if (previousSecret === undefined) {
      delete process.env.INTERNAL_API_SHARED_SECRET;
    } else {
      process.env.INTERNAL_API_SHARED_SECRET = previousSecret;
    }

    await rm(tempStaticRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  async function setup(options: ApiAppOptions) {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store, ...options });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'durability@example.com',
        password: 'password123',
        name: 'Durability',
        organizationName: 'Durability Org',
      },
    });
    expect(register.statusCode).toBe(201);
    const auth = register.json() as { token: string; organization: { id: string }; user: { id: string } };

    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Durable Deploy Project' },
    });
    expect(project.statusCode).toBe(201);
    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, store, auth, projectId };
  }

  it('drives a QUEUED deployment to READY with logs flushed', async () => {
    const { app, store, auth, projectId } = await setup({
      staticBuildRunner: async (input) => {
        const root = await mkdtemp(join(tmpdir(), `vc-build-${input.projectId}-`));
        const outputDir = join(root, 'dist');
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, 'index.html'), '<!doctype html><h1>Deployed</h1>', 'utf8');

        return {
          ok: true,
          outputDir,
          logs: [{ timestamp: new Date().toISOString(), level: 'info', message: 'Static deploy: fake build OK' }],
        };
      },
    });

    // The api persisted this as QUEUED (durable); the worker would carry these
    // same inputs on the job payload. Simulate the worker's internal call.
    const queued = await store.createDeployment({
      projectId,
      provider: 'static',
      status: 'QUEUED',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
    });

    const built = await app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer internal-secret-test' },
      payload: {
        projectId,
        deploymentId: queued.id,
        userId: auth.user.id,
        buildInput: { provider: 'static', buildCommand: 'npm run build', outputDirectory: 'dist' },
      },
    });

    expect(built.statusCode).toBe(200);
    expect(built.json().deployment.status).toBe('READY');
    expect(built.json().deployment.url).toContain(`/static-deployments/${queued.id}/`);

    const persisted = await store.getDeployment(projectId, queued.id);
    expect(persisted?.status).toBe('READY');
    expect(JSON.stringify(persisted?.logs)).toContain('fake build OK');

    await app.close();
  });

  it('drives a QUEUED deployment to FAILED when the build fails', async () => {
    const { app, store, auth, projectId } = await setup({
      staticBuildRunner: async () => ({
        ok: false,
        error: 'BUILD_FAILED',
        logs: [{ timestamp: new Date().toISOString(), level: 'error', message: 'Static deploy: build failed (exit 1).' }],
      }),
    });

    const queued = await store.createDeployment({
      projectId,
      provider: 'static',
      status: 'QUEUED',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
    });

    const built = await app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer internal-secret-test' },
      payload: {
        projectId,
        deploymentId: queued.id,
        userId: auth.user.id,
        buildInput: { provider: 'static', buildCommand: 'npm run build', outputDirectory: 'dist' },
      },
    });

    expect(built.statusCode).toBe(200);
    expect(built.json().deployment.status).toBe('FAILED');

    const persisted = await store.getDeployment(projectId, queued.id);
    expect(persisted?.status).toBe('FAILED');
    expect(JSON.stringify(persisted?.logs)).toContain('build failed');

    await app.close();
  });

  it('is idempotent: a terminal deployment is a no-op (no rebuild on retry)', async () => {
    let runnerCalls = 0;
    const { app, store, projectId } = await setup({
      staticBuildRunner: async () => {
        runnerCalls += 1;
        return { ok: true, outputDir: undefined, logs: [] };
      },
    });

    const done = await store.createDeployment({ projectId, provider: 'static', status: 'READY' });

    const built = await app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer internal-secret-test' },
      payload: {
        projectId,
        deploymentId: done.id,
        buildInput: { provider: 'static' },
      },
    });

    expect(built.statusCode).toBe(200);
    expect(built.json().deployment.status).toBe('READY');
    expect(runnerCalls).toBe(0);

    await app.close();
  });

  it('rejects the internal endpoints without the shared secret', async () => {
    const { app, projectId } = await setup({ staticBuildRunner: async () => ({ ok: true, logs: [] }) });

    const noAuth = await app.inject({
      method: 'POST',
      url: '/internal/deployments/reap',
      payload: {},
    });
    expect(noAuth.statusCode).toBe(401);

    const badBuild = await app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      payload: { projectId, deploymentId: 'x', buildInput: { provider: 'static' } },
    });
    expect(badBuild.statusCode).toBe(401);

    await app.close();
  });

  it('reaps a stale build via the internal reap endpoint', async () => {
    process.env.DEPLOY_BUILD_TIMEOUT_MS = '60000';
    const { app, store, projectId } = await setup({ staticBuildRunner: async () => ({ ok: true, logs: [] }) });

    const stale = await store.createDeployment({ projectId, provider: 'static', status: 'BUILDING' });
    store.deployments.get(stale.id)!.updatedAt = new Date(Date.now() - 120_000).toISOString();

    const reaped = await app.inject({
      method: 'POST',
      url: '/internal/deployments/reap',
      headers: { authorization: 'Bearer internal-secret-test' },
      payload: {},
    });

    expect(reaped.statusCode).toBe(200);
    expect(reaped.json().failed).toBe(1);
    expect((await store.getDeployment(projectId, stale.id))?.status).toBe('FAILED');

    delete process.env.DEPLOY_BUILD_TIMEOUT_MS;
    await app.close();
  });
});
