import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { canPollDeploymentStatus, pollProviderDeploymentStatus } from '../deployments.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

function mockFetch(handler: (url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Parameters<typeof fetch>[0]) => handler(String(input))),
  );
}

describe('pollProviderDeploymentStatus (vercel)', () => {
  const env = { VERCEL_API_TOKEN: 'tok' } as Record<string, string | undefined>;

  it('reports building / ready / failed from readyState', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ readyState: 'BUILDING' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    expect((await pollProviderDeploymentStatus('vercel', 'dpl_1', fetchImpl, env))?.state).toBe('building');

    const ready = (async () =>
      new Response(JSON.stringify({ readyState: 'READY', url: 'my-app.vercel.app' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const readyResult = await pollProviderDeploymentStatus('vercel', 'dpl_1', ready, env);
    expect(readyResult?.state).toBe('ready');
    expect(readyResult?.url).toBe('https://my-app.vercel.app');

    const errored = (async () =>
      new Response(JSON.stringify({ readyState: 'ERROR' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    expect((await pollProviderDeploymentStatus('vercel', 'dpl_1', errored, env))?.state).toBe('failed');
  });

  it('treats a non-OK status read as still building (never a false failure)', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    expect((await pollProviderDeploymentStatus('vercel', 'dpl_1', fetchImpl, env))?.state).toBe('building');
  });

  it('is only pollable when the provider read token is configured', () => {
    expect(canPollDeploymentStatus('vercel', 'dpl_1', { VERCEL_API_TOKEN: 'tok' })).toBe(true);
    expect(canPollDeploymentStatus('vercel', 'dpl_1', {})).toBe(false);
    expect(canPollDeploymentStatus('vercel', undefined, { VERCEL_API_TOKEN: 'tok' })).toBe(false);
    expect(canPollDeploymentStatus('static', 'x', { VERCEL_API_TOKEN: 'tok' })).toBe(false);
  });
});

describe('non-static deploy status (endpoint)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'deploy-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'deploy-encryption-secret-do-not-ship';
    process.env.VERCEL_DEPLOY_HOOK_URL = 'https://hooks.test/vercel';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'deploy@example.com', password: 'password123', name: 'Deploy', organizationName: 'Deploy Org' },
    });
    expect(register.statusCode).toBe(201);
    const auth = register.json() as { token: string; organization: { id: string } };

    // Free plan allows 0 deployments; upgrade so the deploy endpoint isn't quota-blocked.
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Deploy Project' },
    });
    expect(project.statusCode).toBe(201);
    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, auth, projectId };
  }

  async function createVercelDeploy(app: any, auth: any, projectId: string) {
    return app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        provider: 'vercel',
        environment: 'production',
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
        removeBrandingBadge: true,
      },
    });
  }

  it('marks READY immediately when the provider status cannot be polled (no token)', async () => {
    const { app, auth, projectId } = await setup();
    mockFetch(
      () =>
        new Response(JSON.stringify({ job: { id: 'dpl_1', url: 'my-app.vercel.app' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const deploy = await createVercelDeploy(app, auth, projectId);
    expect(deploy.statusCode).toBe(201);
    expect(deploy.json().deployment.status).toBe('READY');
    expect(deploy.json().deployment.productionUrl).toContain('vercel');
    await app.close();
  });

  it('stays BUILDING then reconciles to READY against the real provider status', async () => {
    process.env.VERCEL_API_TOKEN = 'vercel-read-token';
    const { app, auth, projectId } = await setup();

    let vercelState = 'BUILDING';
    mockFetch((url) => {
      if (url.startsWith('https://hooks.test/vercel')) {
        return new Response(JSON.stringify({ job: { id: 'dpl_42', url: 'my-app.vercel.app' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://api.vercel.com/')) {
        return new Response(JSON.stringify({ readyState: vercelState, url: 'my-app.vercel.app' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const deploy = await createVercelDeploy(app, auth, projectId);
    expect(deploy.statusCode).toBe(201);
    const deploymentId = deploy.json().deployment.id as string;
    expect(deploy.json().deployment.status).toBe('BUILDING');
    expect(deploy.json().deployment.productionUrl ?? null).toBeNull();

    // Still building → read keeps BUILDING.
    const pending = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deploymentId}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(pending.json().deployment.status).toBe('BUILDING');

    // Provider finishes → next read reconciles to READY with the real URL.
    vercelState = 'READY';
    const done = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deploymentId}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(done.json().deployment.status).toBe('READY');
    expect(done.json().deployment.productionUrl).toBe('https://my-app.vercel.app');
    await app.close();
  });

  it('reconciles to FAILED when the provider build errors', async () => {
    process.env.VERCEL_API_TOKEN = 'vercel-read-token';
    const { app, auth, projectId } = await setup();

    mockFetch((url) => {
      if (url.startsWith('https://hooks.test/vercel')) {
        return new Response(JSON.stringify({ job: { id: 'dpl_err' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ readyState: 'ERROR' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const deploy = await createVercelDeploy(app, auth, projectId);
    const deploymentId = deploy.json().deployment.id as string;
    expect(deploy.json().deployment.status).toBe('BUILDING');

    const done = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deploymentId}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(done.json().deployment.status).toBe('FAILED');
    await app.close();
  });
});
