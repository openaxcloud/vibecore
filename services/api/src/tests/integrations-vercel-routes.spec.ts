import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';
import type { GitProvider } from '../project-storage.js';

class HollowEmailProvider implements EmailProvider {
  async send() {}
}

class HollowGitProvider implements GitProvider {
  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    return { defaultBranch: input.branch ?? 'main', remoteUrl: input.repositoryUrl, files: [] };
  }
  async status() { return { branch: 'main', changedFiles: [], ahead: 0, behind: 0 }; }
  async commit(input: { message: string }) { return { sha: `t-${Date.now().toString(36)}`, message: input.message }; }
  async push(input: { branch: string }) { return { pushed: true, branch: input.branch }; }
  async pull(input: { branch: string }) { return { pulled: true, branch: input.branch, changedFiles: [] }; }
  async listBranches() { return ['main']; }
  async checkoutBranch(input: { branch: string }) { return { branch: input.branch }; }
  async stashPush() { return { stashed: true, output: 'noop' }; }
  async stashList() { return []; }
  async stashApply() { return { applied: true, output: 'noop' }; }
  async cherryPick() { return { picked: true, output: 'noop' }; }
  async resolveConflict(input: { filePath: string; strategy: 'ours' | 'theirs' }) {
    return { resolved: true, filePath: input.filePath, strategy: input.strategy };
  }
  async logGraph() { return []; }
  async diff() { return ''; }
  async blame() { return []; }
  async branchCreate(input: { branch: string }) { return { branch: input.branch }; }
  async branchDelete(input: { branch: string }) { return { branch: input.branch, deleted: true }; }
  async tagList() { return []; }
  async tagCreate(input: { tag: string }) { return { tag: input.tag }; }
  async fetch() { return { fetched: true }; }
  async reset() { return { reset: true }; }
  async revert() { return { reverted: true }; }
  async rebase() { return { rebased: true }; }
  async merge() { return { merged: true }; }
  async createPullRequest(input: { title: string }) {
    return { number: 1, url: 'https://example.com/pr/1', title: input.title };
  }
  async listPullRequests() { return []; }
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({
    gitProvider: new HollowGitProvider(),
    emailProvider: new HollowEmailProvider(),
    ...options,
  });
}

async function registerUserAndProject(
  app: Awaited<ReturnType<typeof buildTestApiApp>>,
  email: string,
  orgName: string,
) {
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Vercel Tester', organizationName: orgName },
  });
  expect(register.statusCode).toBe(201);
  const { token, organization, user } = register.json() as {
    token: string;
    organization: { id: string };
    user: { id: string };
  };

  const createProject = await app.inject({
    method: 'POST',
    url: `/orgs/${organization.id}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Vercel Project' },
  });
  expect(createProject.statusCode).toBe(201);
  const projectId = (createProject.json() as { project: { id: string } }).project.id;

  return { token, organizationId: organization.id, projectId, userId: user.id };
}

async function configureVercel(
  app: Awaited<ReturnType<typeof buildTestApiApp>>,
  tenant: Awaited<ReturnType<typeof registerUserAndProject>>,
  testUserPayload: object,
) {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify(testUserPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

  const response = await app.inject({
    method: 'POST',
    url: '/api/integrations/api-key/vercel/configure',
    headers: { authorization: `Bearer ${tenant.token}` },
    payload: { apiKey: 'vrc-stored-token' },
  });
  expect(response.statusCode).toBe(200);

  spy.mockRestore();

  return (response.json() as { userConnectionId: string }).userConnectionId;
}

describe('UserConnection-backed Vercel routes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'vercel-route-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'vercel-route-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('GET /api/vercel-user returns the upstream profile through the stored UserConnection', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'vrc-user@example.com', 'VrcUserOrg');
    await configureVercel(app, tenant, { user: { id: 'usr-1', username: 'octo-vrc' } });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.toString()).toBe('https://api.vercel.com/v2/user');
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer vrc-stored-token');

      return new Response(
        JSON.stringify({ user: { id: 'usr-1', username: 'octo-vrc', email: 'octo@vercel.com', avatar: 'a.png' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/vercel-user',
      headers: { authorization: `Bearer ${tenant.token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'usr-1',
      username: 'octo-vrc',
      email: 'octo@vercel.com',
      name: null,
      avatar: 'a.png',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('GET /api/vercel-user returns CONNECTOR_NOT_LINKED when the user has no Vercel connection', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'vrc-none@example.com', 'VrcNoneOrg');

    const response = await app.inject({
      method: 'GET',
      url: '/api/vercel-user',
      headers: { authorization: `Bearer ${tenant.token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_NOT_LINKED' });
    await app.close();
  });

  it('GET /api/vercel-user marks the connection needs_reconnect on a 401 from Vercel', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'vrc-reconnect@example.com', 'VrcReconOrg');
    const userConnectionId = await configureVercel(app, tenant, { user: { id: 'usr-2', username: 'reconnect-vrc' } });

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('unauthorized', { status: 401 }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/vercel-user',
      headers: { authorization: `Bearer ${tenant.token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_NEEDS_RECONNECT', upstreamStatus: 401 });

    const stored = await store.getUserConnectionById(userConnectionId);
    expect(stored?.status).toBe('needs_reconnect');
    await app.close();
  });

  it('POST /api/vercel-proxy forwards GET to api.vercel.com with the stored Bearer token', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'vrc-proxy@example.com', 'VrcProxyOrg');
    await configureVercel(app, tenant, { user: { id: 'usr-3', username: 'proxy-vrc' } });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.toString()).toBe('https://api.vercel.com/v13/projects?limit=10');
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer vrc-stored-token');

      return new Response(JSON.stringify({ projects: [{ id: 'p_1', name: 'demo' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/vercel-proxy',
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: { method: 'GET', path: '/v13/projects', query: { limit: '10' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ projects: [{ id: 'p_1', name: 'demo' }] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('POST /api/vercel-proxy rejects malformed paths with PROXY_BAD_REQUEST', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'vrc-bad@example.com', 'VrcBadOrg');
    await configureVercel(app, tenant, { user: { id: 'usr-4', username: 'bad-vrc' } });

    const response = await app.inject({
      method: 'POST',
      url: '/api/vercel-proxy',
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: { method: 'GET', path: 'v13/projects' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'PROXY_BAD_REQUEST' });
    await app.close();
  });

  it('POST /api/vercel-proxy forwards a JSON body on POST and returns the upstream JSON', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'vrc-post@example.com', 'VrcPostOrg');
    await configureVercel(app, tenant, { user: { id: 'usr-5', username: 'post-vrc' } });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json');
      expect(init?.body).toBe(JSON.stringify({ name: 'demo', target: 'production' }));

      return new Response(JSON.stringify({ id: 'dep_1', state: 'BUILDING' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/vercel-proxy',
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: {
        method: 'POST',
        path: '/v1/deployments',
        body: { name: 'demo', target: 'production' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 'dep_1', state: 'BUILDING' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
