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
  async discard(_input: { projectId: string; workspaceId?: string; filePaths?: string[] }) {
    return { discarded: true, filePaths: [] as string[] };
  }

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
    payload: { email, password: 'password123', name: 'ApiKey Tester', organizationName: orgName },
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
    payload: { name: 'ApiKey Project' },
  });
  expect(createProject.statusCode).toBe(201);
  const projectId = (createProject.json() as { project: { id: string } }).project.id;

  return { token, organizationId: organization.id, projectId, userId: user.id };
}

describe('Integrations api-key configure route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'api-key-route-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'api-key-route-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('persists a UserConnection + ProjectConnectionLink when Vercel accepts the token', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'vercel-config@example.com', 'VercelConfigOrg');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.toString()).toBe('https://api.vercel.com/v2/user');

      return new Response(JSON.stringify({ user: { id: 'vrc-user-99', username: 'octo-vercel' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/vercel/configure',
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: { apiKey: 'vrc-pat-good', projectId: tenant.projectId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { userConnectionId: string; provider: string; accountLabel: string };
    expect(body.provider).toBe('vercel');
    expect(body.accountLabel).toBe('octo-vercel');

    const stored = await store.getUserConnectionById(body.userConnectionId);
    expect(stored).toBeTruthy();
    expect(stored!.userId).toBe(tenant.userId);
    expect(stored!.externalAccountId).toBe('vrc-user-99');

    const links = await store.listProjectConnectionLinks(tenant.projectId);
    expect(links.find((row) => row.userConnectionId === body.userConnectionId)).toBeTruthy();
    await app.close();
  });

  it('returns 400 API_KEY_INVALID when Supabase rejects the token', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'supabase-bad@example.com', 'SupBadOrg');

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('nope', { status: 401 }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/supabase/configure',
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: { apiKey: 'sb-bad' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'API_KEY_INVALID' });
    await app.close();
  });

  it('returns 403 API_KEY_INSUFFICIENT_SCOPE when Supabase returns 403', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'supabase-scope@example.com', 'SupScopeOrg');

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('forbidden', { status: 403 }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/supabase/configure',
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: { apiKey: 'sb-scope' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'API_KEY_INSUFFICIENT_SCOPE' });
    await app.close();
  });

  it('persists a Netlify UserConnection account-scoped (no projectId in body)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'netlify-acct@example.com', 'NetlifyAcctOrg');

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ id: 'nf-user-77', full_name: 'Net Octo' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/netlify/configure',
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: { apiKey: 'nf-pat-good' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { userConnectionId: string; accountLabel: string };
    expect(body.accountLabel).toBe('Net Octo');

    const links = await store.listProjectConnectionLinks(tenant.projectId);
    expect(links.find((row) => row.userConnectionId === body.userConnectionId)).toBeUndefined();
    await app.close();
  });

  it('returns CONNECTOR_AUTH_TYPE_MISMATCH when called with an OAuth-only provider (github)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'github-bad@example.com', 'GhBadOrg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/github/configure',
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: { apiKey: 'gh-pat' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_AUTH_TYPE_MISMATCH' });
    await app.close();
  });

  it('returns CONNECTOR_UNKNOWN_PROVIDER for an unsupported provider slug', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'unknown-config@example.com', 'UnkConfOrg');

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/notion/configure',
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: { apiKey: 'n-pat' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_UNKNOWN_PROVIDER' });
    await app.close();
  });

  it('returns AUTH_REQUIRED when no bearer token is set', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/vercel/configure',
      payload: { apiKey: 'vrc-x' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
    await app.close();
  });
});
