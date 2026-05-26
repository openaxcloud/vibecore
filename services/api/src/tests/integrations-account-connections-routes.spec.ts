import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';
import type { GitProvider } from '../project-storage.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class QuietGitProvider implements GitProvider {
  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    return { defaultBranch: input.branch ?? 'main', remoteUrl: input.repositoryUrl, files: [] };
  }
  async status() {
    return { branch: 'main', changedFiles: [], ahead: 0, behind: 0 };
  }
  async commit(input: { message: string }) {
    return { sha: 'q', message: input.message };
  }
  async push(input: { branch: string }) {
    return { pushed: true, branch: input.branch };
  }
  async pull(input: { branch: string }) {
    return { pulled: true, branch: input.branch, changedFiles: [] };
  }
  async listBranches() {
    return ['main'];
  }
  async checkoutBranch(input: { branch: string }) {
    return { branch: input.branch };
  }
  async stashPush() {
    return { stashed: true, output: '' };
  }
  async stashList() {
    return [];
  }
  async stashApply() {
    return { applied: true, output: '' };
  }
  async cherryPick() {
    return { picked: true, output: '' };
  }
  async resolveConflict(input: { filePath: string; strategy: 'ours' | 'theirs' }) {
    return { resolved: true, filePath: input.filePath, strategy: input.strategy };
  }
  async logGraph() {
    return [];
  }
  async diff() {
    return '';
  }
  async blame() {
    return [];
  }
  async branchCreate(input: { branch: string }) {
    return { branch: input.branch };
  }
  async branchDelete(input: { branch: string }) {
    return { branch: input.branch, deleted: true };
  }
  async tagList() {
    return [];
  }
  async tagCreate(input: { tag: string }) {
    return { tag: input.tag };
  }
  async fetch() {
    return { fetched: true };
  }
  async reset() {
    return { reset: true };
  }
  async revert() {
    return { reverted: true };
  }
  async rebase() {
    return { rebased: true };
  }
  async merge() {
    return { merged: true };
  }
  async createPullRequest(input: { title: string }) {
    return { number: 1, url: 'https://example.com/pr/1', title: input.title };
  }
  async listPullRequests() {
    return [];
  }
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({
    gitProvider: new QuietGitProvider(),
    emailProvider: new QuietEmailProvider(),
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
    payload: { email, password: 'password123', name: 'Account Tester', organizationName: orgName },
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
    payload: { name: 'Account Project' },
  });
  expect(createProject.statusCode).toBe(201);
  const projectId = (createProject.json() as { project: { id: string } }).project.id;

  return { token, organizationId: organization.id, projectId, userId: user.id };
}

async function connectGithub(
  app: Awaited<ReturnType<typeof buildTestApiApp>>,
  tenant: Awaited<ReturnType<typeof registerUserAndProject>>,
  githubLogin: string,
  githubId: number,
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));

    if (url.toString().endsWith('/access_token')) {
      return new Response(JSON.stringify({ access_token: 'acc-tok', scope: 'repo' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ id: githubId, login: githubLogin }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const connect = await app.inject({
    method: 'POST',
    url: '/api/integrations/oauth/github/connect',
    headers: { authorization: `Bearer ${tenant.token}` },
    payload: { projectId: tenant.projectId },
  });
  const state = new URL((connect.json() as { authorizationUrl: string }).authorizationUrl).searchParams.get('state')!;

  const callback = await app.inject({
    method: 'POST',
    url: '/api/integrations/oauth/github/callback',
    headers: { authorization: `Bearer ${tenant.token}` },
    payload: { code: 'code-x', state },
  });
  expect(callback.statusCode).toBe(200);

  return (callback.json() as { userConnectionId: string }).userConnectionId;
}

describe('Account connections routes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.INTEGRATION_GITHUB_CLIENT_ID = 'acc-client-id';
    process.env.INTEGRATION_GITHUB_CLIENT_SECRET = 'acc-client-secret';
    process.env.OAUTH_STATE_SECRET = 'acc-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'acc-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('GET /api/account/connections lists only the current user connections', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const alpha = await registerUserAndProject(app, 'list-alpha@example.com', 'AccListAlpha');
    const beta = await registerUserAndProject(app, 'list-beta@example.com', 'AccListBeta');

    await connectGithub(app, alpha, 'alpha-octo', 1);
    await connectGithub(app, beta, 'beta-octo', 2);

    const response = await app.inject({
      method: 'GET',
      url: '/api/account/connections',
      headers: { authorization: `Bearer ${alpha.token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { connections: Array<{ externalAccountLabel: string }> };
    expect(body.connections.map((row) => row.externalAccountLabel)).toEqual(['alpha-octo']);
    await app.close();
  });

  it('GET /api/account/connections filters by provider', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'filter@example.com', 'FilterOrg');
    await connectGithub(app, tenant, 'filter-octo', 99);

    const response = await app.inject({
      method: 'GET',
      url: '/api/account/connections?provider=github',
      headers: { authorization: `Bearer ${tenant.token}` },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { connections: unknown[] }).connections).toHaveLength(1);

    const empty = await app.inject({
      method: 'GET',
      url: '/api/account/connections?provider=slack',
      headers: { authorization: `Bearer ${tenant.token}` },
    });
    expect(empty.statusCode).toBe(200);
    expect((empty.json() as { connections: unknown[] }).connections).toHaveLength(0);
    await app.close();
  });

  it('POST /api/account/connections/:id/revoke flips status to revoked', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'revoke@example.com', 'RevokeOrg');
    const userConnectionId = await connectGithub(app, tenant, 'revoke-octo', 77);

    const response = await app.inject({
      method: 'POST',
      url: `/api/account/connections/${userConnectionId}/revoke`,
      headers: { authorization: `Bearer ${tenant.token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; revokedAt: string };
    expect(body.status).toBe('revoked');
    expect(body.revokedAt).toBeTruthy();

    const verify = await store.getUserConnectionById(userConnectionId);
    expect(verify?.status).toBe('revoked');
    await app.close();
  });

  it('revoke is idempotent — calling twice does not fail', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tenant = await registerUserAndProject(app, 'idempotent@example.com', 'IdempotentOrg');
    const userConnectionId = await connectGithub(app, tenant, 'idem-octo', 88);

    await app.inject({
      method: 'POST',
      url: `/api/account/connections/${userConnectionId}/revoke`,
      headers: { authorization: `Bearer ${tenant.token}` },
    });

    const second = await app.inject({
      method: 'POST',
      url: `/api/account/connections/${userConnectionId}/revoke`,
      headers: { authorization: `Bearer ${tenant.token}` },
    });

    expect(second.statusCode).toBe(200);
    expect((second.json() as { status: string }).status).toBe('revoked');
    await app.close();
  });

  it('revoke rejects when the connection belongs to another user', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const alpha = await registerUserAndProject(app, 'cross-alpha@example.com', 'CrossAlpha');
    const beta = await registerUserAndProject(app, 'cross-beta@example.com', 'CrossBeta');

    const userConnectionId = await connectGithub(app, alpha, 'cross-octo', 55);

    const response = await app.inject({
      method: 'POST',
      url: `/api/account/connections/${userConnectionId}/revoke`,
      headers: { authorization: `Bearer ${beta.token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'CONNECTION_NOT_FOUND' });

    const stillActive = await store.getUserConnectionById(userConnectionId);
    expect(stillActive?.status).toBe('active');
    await app.close();
  });

  it('list returns 401 without a session', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const response = await app.inject({
      method: 'GET',
      url: '/api/account/connections',
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
