import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createHmac, createSign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createTotpCode } from '@vibecore/auth';
import { decryptJson } from '@vibecore/security';
import JSZip from 'jszip';
import WebSocket from 'ws';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import type { GitProvider, ProjectFile, ProjectStorage, StoredArchive } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

class TestGitProvider implements GitProvider {
  readonly branches = new Map<string, string[]>();
  readonly commits = new Map<string, Array<{ sha: string; message: string }>>();

  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    const branch = input.branch ?? 'main';

    return {
      defaultBranch: branch,
      remoteUrl: input.repositoryUrl,
      files: [
        { path: 'README.md', content: `# Imported from ${input.repositoryUrl}\n`, updatedAt: new Date().toISOString() },
        {
          path: 'package.json',
          content: '{\n  "scripts": {\n    "dev": "vite"\n  }\n}\n',
          updatedAt: new Date().toISOString(),
        },
      ],
    };
  }

  async status(projectId: string) {
    return { branch: this.branches.get(projectId)?.[0] ?? 'main', changedFiles: [], ahead: 0, behind: 0 };
  }

  async commit(input: { projectId: string; message: string }) {
    const sha = `test-${Date.now().toString(36)}`;
    const commits = this.commits.get(input.projectId) ?? [];
    commits.push({ sha, message: input.message });
    this.commits.set(input.projectId, commits);

    return { sha, message: input.message };
  }

  async push(input: { projectId: string; branch: string }) {
    const branches = this.branches.get(input.projectId) ?? ['main'];

    if (!branches.includes(input.branch)) {
      branches.push(input.branch);
    }

    this.branches.set(input.projectId, branches);

    return { pushed: true, branch: input.branch };
  }

  async pull(input: { branch: string }) {
    return { pulled: true, branch: input.branch, changedFiles: [] };
  }

  async listBranches(projectId: string) {
    return this.branches.get(projectId) ?? ['main'];
  }

  async createPullRequest() {
    return { url: `https://github.example/pull/${Date.now()}`, number: 1 };
  }
}

class MemoryProjectStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  readonly objects = new Map<string, Buffer>();

  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    const projectFiles = this.files.get(projectId) ?? new Map<string, string>();

    for (const file of files) {
      projectFiles.set(file.path, file.content);
    }

    this.files.set(projectId, projectFiles);

    return this.listFiles(projectId);
  }

  async listFiles(projectId: string) {
    const projectFiles = this.files.get(projectId) ?? new Map<string, string>();
    const updatedAt = new Date().toISOString();

    return [...projectFiles.entries()].map(([path, content]) => ({ path, content, updatedAt }));
  }

  async exportZip(projectId: string) {
    const zip = new JSZip();

    for (const file of await this.listFiles(projectId)) {
      zip.file(file.path, file.content);
    }

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    const storageKey = `exports/${projectId}/${Date.now()}.zip`;
    this.objects.set(storageKey, content);

    return {
      storageKey,
      byteLength: content.byteLength,
      base64: content.toString('base64'),
      createdAt: new Date().toISOString(),
    };
  }

  async importZip(projectId: string, base64: string, options: { replaceExisting?: boolean } = {}) {
    const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
    const files: Array<{ path: string; content: string }> = [];

    for (const [path, entry] of Object.entries(zip.files)) {
      if (!entry.dir) {
        files.push({ path, content: await entry.async('string') });
      }
    }

    if (options.replaceExisting) {
      this.files.delete(projectId);
    }

    return this.writeFiles(projectId, files);
  }

  async createSnapshot(input: { projectId: string; files: ProjectFile[] }): Promise<StoredArchive> {
    const zip = new JSZip();

    for (const file of input.files) {
      zip.file(file.path, file.content);
    }

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    const storageKey = `snapshots/${input.projectId}/${Date.now()}.zip`;
    this.objects.set(storageKey, content);

    return { storageKey, byteLength: content.byteLength, createdAt: new Date().toISOString() };
  }

  async getSnapshotFiles(storageKey: string) {
    const content = this.objects.get(storageKey);

    if (!content) {
      return [];
    }

    const zip = await JSZip.loadAsync(content);
    const files: ProjectFile[] = [];

    for (const [path, entry] of Object.entries(zip.files)) {
      if (!entry.dir) {
        files.push({ path, content: await entry.async('string'), updatedAt: new Date().toISOString() });
      }
    }

    return files;
  }

  async restoreSnapshot(input: { projectId: string; files: ProjectFile[] }) {
    this.files.delete(input.projectId);

    return this.writeFiles(input.projectId, input.files);
  }
}

async function startRuntimeServices(options: { logs?: string[]; commandStdout?: string; commandStderr?: string } = {}) {
  const files = new Map<string, string>([['README.md', '# Runtime project\n']]);
  const calls: string[] = [];
  const agent = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://agent.local');
    calls.push(`${request.method} ${url.pathname}`);
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {};
      response.setHeader('content-type', 'application/json');

      if (request.method === 'GET' && url.pathname === '/files/tree') {
        response.end(JSON.stringify([...files.keys()].map((path) => ({ path, type: 'file' }))));
      } else if (request.method === 'GET' && url.pathname === '/files/read') {
        response.end(JSON.stringify({ content: files.get(url.searchParams.get('path') ?? '') ?? '' }));
      } else if (request.method === 'POST' && (url.pathname === '/files/write' || url.pathname === '/files/create')) {
        files.set(payload.path, payload.content ?? '');
        response.end(JSON.stringify({ ok: true }));
      } else if (request.method === 'POST' && url.pathname === '/files/delete') {
        files.delete(payload.path);
        response.end(JSON.stringify({ ok: true }));
      } else if (request.method === 'POST' && url.pathname === '/files/rename') {
        files.set(payload.to, files.get(payload.from) ?? '');
        files.delete(payload.from);
        response.end(JSON.stringify({ ok: true }));
      } else if (request.method === 'POST' && url.pathname === '/commands/run') {
        response.end(
          JSON.stringify({
            code: 0,
            stdout: options.commandStdout ?? `ran ${payload.command}`,
            stderr: options.commandStderr ?? '',
          }),
        );
      } else if (request.method === 'GET' && url.pathname === '/ports') {
        response.end(JSON.stringify({ ports: [{ port: 5173, processId: 'dev' }] }));
      } else if (request.method === 'POST' && url.pathname === '/snapshots/create') {
        response.end(
          JSON.stringify({
            id: 'runtime-snapshot',
            createdAt: new Date().toISOString(),
            files: [...files.keys()].map((path) => ({ path, size: files.get(path)?.length ?? 0 })),
          }),
        );
      } else if (request.method === 'POST' && url.pathname === '/snapshots/restore') {
        response.end(JSON.stringify({ restored: true }));
      } else if (request.method === 'POST' && url.pathname === '/patch/apply') {
        files.set('PATCH_APPLIED.txt', payload.patch ?? '');
        response.end(JSON.stringify({ ok: true }));
      } else {
        response.writeHead(404).end(JSON.stringify({ error: 'not found' }));
      }
    });
  });

  await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));
  const agentAddress = agent.address();

  if (!agentAddress || typeof agentAddress === 'string') {
    throw new Error('Agent server failed to start');
  }

  const manager = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://manager.local');
    response.setHeader('content-type', 'application/json');

    if (url.pathname.endsWith('/agent-token')) {
      response.end(JSON.stringify({ token: 'runtime-token' }));
    } else if (url.pathname.endsWith('/logs')) {
      response.end(JSON.stringify({ logs: options.logs ?? ['workspace ready'] }));
    } else {
      response.end(JSON.stringify({ status: 'RUNNING' }));
    }
  });

  await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));
  const managerAddress = manager.address();

  if (!managerAddress || typeof managerAddress === 'string') {
    throw new Error('Manager server failed to start');
  }

  const previousManager = process.env.WORKSPACE_MANAGER_URL;
  const previousAgent = process.env.WORKSPACE_AGENT_URL_TEMPLATE;
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${managerAddress.port}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${agentAddress.port}`;

  return {
    files,
    calls,
    async close() {
      process.env.WORKSPACE_MANAGER_URL = previousManager;
      process.env.WORKSPACE_AGENT_URL_TEMPLATE = previousAgent;
      await Promise.all(
        [agent, manager].map((server: Server) => new Promise<void>((resolve) => server.close(() => resolve()))),
      );
    },
  };
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ gitProvider: new TestGitProvider(), emailProvider: new TestEmailProvider(), ...options });
}

async function register(
  app: Awaited<ReturnType<typeof buildTestApiApp>>,
  input: { email: string; password?: string; name?: string; organizationName?: string },
) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      password: 'password123',
      name: 'Test User',
      ...input,
    },
  });

  expect(response.statusCode).toBe(201);

  return response.json() as {
    token: string;
    verificationToken: string;
    user: { id: string; email: string };
    organization: { id: string; name: string };
  };
}

async function reauth(app: Awaited<ReturnType<typeof buildTestApiApp>>, token: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers: { authorization: `Bearer ${token}` },
    payload: { password: 'password123' },
  });

  expect(response.statusCode).toBe(200);
}

function stripeSignature(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('SaaS API', () => {
  it('authenticates users and returns the current session', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore(), allowedOrigins: ['http://localhost:5173'] });
    const auth = await register(app, { email: 'auth@example.com' });

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${auth.token}` } });

    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('auth@example.com');

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().token).toMatch(/^session_/);
    expect(refresh.json().token).not.toBe(auth.token);

    const oldSession = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(oldSession.statusCode).toBe(401);

    const refreshedSession = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${refresh.json().token}` },
    });
    expect(refreshedSession.statusCode).toBe(200);
    await app.close();
  });

  it('enforces strict CORS and CSRF for cookie-authenticated mutations', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore(), allowedOrigins: ['http://localhost:5173'] });
    const registered = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'csrf@example.com',
        password: 'password123',
        name: 'CSRF User',
      },
    });
    expect(registered.statusCode).toBe(201);
    const cookie = registered.headers['set-cookie'];
    expect(cookie).toBeDefined();

    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie },
    });
    expect(blocked.statusCode).toBe(403);

    const allowed = await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : cookie,
        'x-csrf-token': 'csrf-local',
      },
    });
    expect(allowed.statusCode).toBe(200);

    const cors = await app.inject({
      method: 'OPTIONS',
      url: '/auth/me',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
      },
    });
    expect(cors.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('exposes request ids, correlation ids, synthetic health, and Prometheus metrics', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'observability@example.com', organizationName: 'Observability Org' });
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${auth.token}`,
        'x-correlation-id': 'corr-test-1',
      },
    });

    expect(me.statusCode).toBe(200);
    expect(me.headers['x-request-id']).toBeDefined();
    expect(me.headers['x-correlation-id']).toBe('corr-test-1');

    const synthetic = await app.inject({ method: 'GET', url: '/synthetic/health' });
    expect(synthetic.statusCode).toBe(200);
    expect(synthetic.json()).toMatchObject({ status: 'ok', checks: { api: 'ok', telemetry: 'ok', metrics: 'ok' } });

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.body).toContain('api_request_duration_seconds');
    expect(metrics.body).toContain('api_requests_total');
    expect(metrics.body).toContain('stripe_webhook_failures_total');
    await app.close();
  });

  it('persists account profile updates through the API', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'profile@example.com' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Updated User', email: 'updated-profile@example.com', timezone: 'UTC' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ name: 'Updated User', email: 'updated-profile@example.com' });
    await app.close();
  });

  it('accepts public contact sales requests through the email provider', async () => {
    const emailProvider = new TestEmailProvider();
    const app = await buildTestApiApp({ store: new TestApiStore(), emailProvider });

    const response = await app.inject({
      method: 'POST',
      url: '/contact-sales',
      payload: {
        email: 'buyer@example.com',
        company: 'Buyer Corp',
        teamSize: '500',
        requirements: 'SSO and private runtime',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(emailProvider.messages).toHaveLength(1);
    expect(emailProvider.messages[0].text).toContain('Buyer Corp');
    await app.close();
  });

  it('enforces organization isolation on project resources', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const alpha = await register(app, { email: 'alpha@example.com', organizationName: 'Alpha' });
    const beta = await register(app, { email: 'beta@example.com', organizationName: 'Beta' });

    const createProject = await app.inject({
      method: 'POST',
      url: `/orgs/${alpha.organization.id}/projects`,
      headers: { authorization: `Bearer ${alpha.token}` },
      payload: { name: 'Alpha Project' },
    });
    expect(createProject.statusCode).toBe(201);

    const projectId = createProject.json().project.id;
    const blocked = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}`,
      headers: { authorization: `Bearer ${beta.token}` },
    });

    expect(blocked.statusCode).toBe(404);
    await app.close();
  });

  it('enforces backend RBAC for member management', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'owner@example.com', organizationName: 'Owner Org' });
    const member = await register(app, { email: 'member@example.com', organizationName: 'Member Org' });
    await store.addMember({ organizationId: owner.organization.id, userId: member.user.id, roleKey: 'viewer' });

    const canListMembersForTeamPage = await app.inject({
      method: 'GET',
      url: `/orgs/${owner.organization.id}/memberships`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(canListMembersForTeamPage.statusCode).toBe(200);

    const canListRolesForTeamPage = await app.inject({
      method: 'GET',
      url: `/orgs/${owner.organization.id}/roles`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(canListRolesForTeamPage.statusCode).toBe(200);

    const canCreateSupportTicket = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/support/tickets`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { subject: 'Viewer support request' },
    });
    expect(canCreateSupportTicket.statusCode).toBe(201);

    const canListSupportTickets = await app.inject({
      method: 'GET',
      url: `/support/${owner.organization.id}/tickets`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(canListSupportTickets.statusCode).toBe(200);

    const denied = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/memberships`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { userId: member.user.id, roleKey: 'admin' },
    });

    expect(denied.statusCode).toBe(403);
    await app.close();
  });

  it('records audit logs for critical actions', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'audit@example.com', organizationName: 'Audit Org' });

    await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Audited Project' },
    });

    const auditLogs = await app.inject({
      method: 'GET',
      url: `/orgs/${auth.organization.id}/audit-logs`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(auditLogs.statusCode).toBe(200);
    expect(auditLogs.json().auditLogs.some((event: { action: string }) => event.action === 'project.create')).toBe(
      true,
    );
    await app.close();
  });

  it('verifies email and supports password reset with session revocation', async () => {
    const store = new TestApiStore();
    const emailProvider = new TestEmailProvider();
    const app = await buildTestApiApp({ store, emailProvider });
    const auth = await register(app, { email: 'verify@example.com' });
    expect(emailProvider.messages.some((message) => message.subject === 'Verify your email')).toBe(true);

    const verify = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: auth.verificationToken },
    });
    expect(verify.statusCode).toBe(200);
    expect((await store.findUserByEmail('verify@example.com'))?.emailVerifiedAt).toBeTruthy();

    const resetRequest = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { email: 'verify@example.com' },
    });
    expect(emailProvider.messages.some((message) => message.subject === 'Reset your password')).toBe(true);
    const resetToken = resetRequest.json().resetToken as string;
    const reset = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      payload: { token: resetToken, password: 'newpassword123' },
    });
    expect(reset.statusCode).toBe(200);

    const oldSession = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(oldSession.statusCode).toBe(401);
    await app.close();
  });

  it('applies org session duration policy at login', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'duration@example.com', organizationName: 'Duration Org' });
    await reauth(app, auth.token);

    await app.inject({
      method: 'PATCH',
      url: `/orgs/${auth.organization.id}/enterprise-settings`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { sessionDurationMinutes: 5 },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-org-id': auth.organization.id },
      payload: { email: 'duration@example.com', password: 'password123' },
    });
    expect(login.statusCode).toBe(200);
    const session = await store.findSessionByToken(login.json().token);
    expect(new Date(session!.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000 + 5000);
    await app.close();
  });

  it('creates, resends, accepts and expires organization invitations', async () => {
    const store = new TestApiStore();
    const emailProvider = new TestEmailProvider();
    const app = await buildTestApiApp({ store, emailProvider });
    const owner = await register(app, { email: 'invite-owner@example.com', organizationName: 'Invite Org' });
    const invitee = await register(app, { email: 'invitee@example.com', organizationName: 'Invitee Org' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'invitee@example.com', roleKey: 'member' },
    });
    expect(created.statusCode).toBe(201);
    expect(emailProvider.messages.some((message) => message.subject === 'You have been invited')).toBe(true);

    const inviteId = created.json().invitation.id as string;
    const resent = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations/${inviteId}/resend`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(resent.statusCode).toBe(200);

    const accepted = await app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${invitee.token}` },
      payload: { token: resent.json().token },
    });
    expect(accepted.statusCode).toBe(200);
    expect(await store.getMembership(invitee.user.id, owner.organization.id)).toBeTruthy();

    const secondInvite = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'late@example.com' },
    });
    const expired = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations/${secondInvite.json().invitation.id}/expire`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(expired.statusCode).toBe(200);
    await app.close();
  });

  it('enforces team member quota across invitation acceptance', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, {
      email: 'quota-invite-owner@example.com',
      organizationName: 'Quota Invite Org',
    });
    const invitee = await register(app, { email: 'quota-invitee@example.com', organizationName: 'Quota Invitee Org' });

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: invitee.user.email, roleKey: 'member' },
    });
    expect(created.statusCode).toBe(201);

    const accepted = await app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${invitee.token}` },
      payload: { token: created.json().token },
    });
    expect(accepted.statusCode).toBe(429);
    expect(await store.getMembership(invitee.user.id, owner.organization.id)).toBeUndefined();
    await app.close();
  });

  it('applies custom organization roles to backend RBAC and member lifecycle actions', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'team-owner@example.com', organizationName: 'Team Org' });
    const teammate = await register(app, { email: 'team-member@example.com', organizationName: 'Team Member Org' });
    const memberManager = await register(app, {
      email: 'team-manager@example.com',
      organizationName: 'Team Manager Org',
    });
    const secondOwner = await register(app, {
      email: 'team-owner-2@example.com',
      organizationName: 'Team Owner 2 Org',
    });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });

    const role = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/roles`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { key: 'project-auditor', name: 'Project Auditor', permissions: ['org:read', 'projects:read'] },
    });
    expect(role.statusCode).toBe(201);

    const managerRole = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/roles`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { key: 'member-manager', name: 'Member Manager', permissions: ['members:manage'] },
    });
    expect(managerRole.statusCode).toBe(201);

    const member = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/memberships`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { userId: teammate.user.id, roleKey: 'project-auditor' },
    });
    expect(member.statusCode).toBe(201);

    const manager = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/memberships`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { userId: memberManager.user.id, roleKey: 'member-manager' },
    });
    expect(manager.statusCode).toBe(201);

    const managerCanListAssignableRoles = await app.inject({
      method: 'GET',
      url: `/orgs/${owner.organization.id}/roles`,
      headers: { authorization: `Bearer ${memberManager.token}` },
    });
    expect(managerCanListAssignableRoles.statusCode).toBe(200);

    const canReadOrg = await app.inject({
      method: 'GET',
      url: `/orgs/${owner.organization.id}`,
      headers: { authorization: `Bearer ${teammate.token}` },
    });
    expect(canReadOrg.statusCode).toBe(200);

    const cannotCreateProject = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${teammate.token}` },
      payload: { name: 'Blocked Project' },
    });
    expect(cannotCreateProject.statusCode).toBe(403);

    await store.addMember({ organizationId: owner.organization.id, userId: secondOwner.user.id, roleKey: 'owner' });
    const demote = await app.inject({
      method: 'PATCH',
      url: `/orgs/${owner.organization.id}/memberships/${secondOwner.user.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { roleKey: 'admin' },
    });
    expect(demote.statusCode).toBe(200);
    expect((await store.getMembership(secondOwner.user.id, owner.organization.id))?.roleKey).toBe('admin');

    const removed = await app.inject({
      method: 'DELETE',
      url: `/orgs/${owner.organization.id}/memberships/${teammate.user.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(removed.statusCode).toBe(200);
    expect(await store.getMembership(teammate.user.id, owner.organization.id)).toBeUndefined();

    const lastOwner = await app.inject({
      method: 'DELETE',
      url: `/orgs/${owner.organization.id}/memberships/${owner.user.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(lastOwner.statusCode).toBe(409);
    await app.close();
  });

  it('completes OAuth, OIDC and SAML login callbacks with account linking', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const oauth = await app.inject({
      method: 'POST',
      url: '/auth/oauth/github/callback',
      payload: { email: 'oauth@example.com', externalId: 'gh_1', accessToken: 'access-token', name: 'OAuth User' },
    });
    expect(oauth.statusCode).toBe(200);
    expect(await store.findUserByEmail('oauth@example.com')).toBeTruthy();

    const oidc = await app.inject({
      method: 'POST',
      url: '/auth/oidc/callback',
      payload: { email: 'oidc@example.com', externalId: 'entra_1', accessToken: 'oidc-token', name: 'OIDC User' },
    });
    expect(oidc.statusCode).toBe(200);

    const owner = await register(app, { email: 'saml-owner@example.com', organizationName: 'SAML Org' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const certificate = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    await reauth(app, owner.token);
    const samlConfig = await app.inject({
      method: 'PUT',
      url: `/orgs/${owner.organization.id}/sso/saml`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { entityId: 'urn:test:idp', ssoUrl: 'https://idp.example.com/sso', x509Certificate: certificate },
    });
    expect(samlConfig.statusCode).toBe(200);
    const assertionXml =
      '<Assertion><Subject><NameID>saml-user@example.com</NameID></Subject><AttributeStatement><Attribute Name="externalId"><AttributeValue>saml_1</AttributeValue></Attribute><Attribute Name="name"><AttributeValue>SAML User</AttributeValue></Attribute></AttributeStatement></Assertion>';
    const signature = createSign('RSA-SHA256').update(assertionXml).end().sign(privateKey, 'base64');
    const assertion = Buffer.from(
      `<Response>${assertionXml}<Signature><SignatureValue>${signature}</SignatureValue></Signature></Response>`,
      'utf8',
    ).toString('base64url');
    const saml = await app.inject({
      method: 'POST',
      url: `/auth/saml/${owner.organization.id}/acs`,
      payload: { SAMLResponse: assertion },
    });
    expect(saml.statusCode).toBe(200);
    expect(await store.findUserByEmail('saml-user@example.com')).toBeTruthy();
    await app.close();
  });

  it('bootstraps and manages platform administrators with MFA and re-authentication', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'platform@example.com';
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const platform = await register(app, { email: 'platform@example.com', organizationName: 'Platform Org' });
    const target = await register(app, { email: 'target-admin@example.com', organizationName: 'Target Org' });

    const blocked = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${target.user.id}/platform-admin`,
      headers: { authorization: `Bearer ${platform.token}` },
      payload: { platformAdmin: true },
    });
    expect(blocked.statusCode).toBe(403);

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${platform.token}` },
    });
    const code = createTotpCode(setup.json().secret);
    await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${platform.token}` },
      payload: { code },
    });
    await reauth(app, platform.token);
    const promoted = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${target.user.id}/platform-admin`,
      headers: { authorization: `Bearer ${platform.token}` },
      payload: { platformAdmin: true },
    });
    expect(promoted.statusCode).toBe(200);
    expect((await store.findUserByEmail('target-admin@example.com'))?.platformAdmin).toBe(true);
    expect((await store.listAdminAuditLogs()).some((event) => event.action === 'admin.platform_admin.grant')).toBe(
      true,
    );
    delete process.env.PLATFORM_ADMIN_EMAILS;
    await app.close();
  });

  it('enforces platform admin RBAC and records admin audit logs', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const normal = await register(app, { email: 'not-admin@example.com', organizationName: 'Normal Org' });

    const denied = await app.inject({
      method: 'GET',
      url: '/admin/overview',
      headers: { authorization: `Bearer ${normal.token}` },
    });
    expect(denied.statusCode).toBe(403);

    process.env.PLATFORM_ADMIN_EMAILS = 'console-admin@example.com';
    const admin = await register(app, { email: 'console-admin@example.com', organizationName: 'Admin Org' });
    const setup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { code: createTotpCode(setup.json().secret) },
    });
    await reauth(app, admin.token);

    const response = await app.inject({
      method: 'POST',
      url: `/admin/users/${normal.user.id}/force-logout`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(response.statusCode).toBe(200);
    expect((await store.listAdminAuditLogs()).some((event) => event.action === 'admin.user.force_logout')).toBe(true);
    delete process.env.PLATFORM_ADMIN_EMAILS;
    await app.close();
  });

  it('lists real billing subscriptions and supports audited admin plan overrides', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'billing-admin@example.com';
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const admin = await register(app, { email: 'billing-admin@example.com', organizationName: 'Billing Admin Org' });
    const customer = await register(app, {
      email: 'billing-customer@example.com',
      organizationName: 'Billing Customer Org',
    });
    const setup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { code: createTotpCode(setup.json().secret) },
    });
    await reauth(app, admin.token);
    await store.upsertSubscription({
      organizationId: customer.organization.id,
      planKey: 'pro',
      externalId: 'sub_admin_list',
      status: 'ACTIVE',
    });

    const listing = await app.inject({
      method: 'GET',
      url: '/admin/billing',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(listing.statusCode).toBe(200);
    expect(listing.json().subscriptions.some((subscription: any) => subscription.externalId === 'sub_admin_list')).toBe(
      true,
    );

    const override = await app.inject({
      method: 'POST',
      url: '/admin/plan-overrides',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { organizationId: customer.organization.id, planKey: 'team', reason: 'contract upgrade' },
    });
    expect(override.statusCode).toBe(200);
    expect((await store.getSubscription(customer.organization.id))?.planKey).toBe('team');
    expect((await store.listAdminAuditLogs()).some((event) => event.action === 'admin.plan.override')).toBe(true);
    delete process.env.PLATFORM_ADMIN_EMAILS;
    await app.close();
  });

  it('requires re-authentication and records admin audit logs for manual abuse events', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'abuse-admin@example.com';
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const admin = await register(app, { email: 'abuse-admin@example.com', organizationName: 'Abuse Admin Org' });
    const customer = await register(app, {
      email: 'abuse-customer@example.com',
      organizationName: 'Abuse Customer Org',
    });
    const setup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { code: createTotpCode(setup.json().secret) },
    });

    const staleSession = await app.inject({
      method: 'POST',
      url: '/admin/abuse-events',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        organizationId: customer.organization.id,
        userId: customer.user.id,
        type: 'manual_review',
        severity: 'high',
      },
    });
    expect(staleSession.statusCode).toBe(403);
    expect(staleSession.json().code).toBe('ADMIN_REAUTH_REQUIRED');

    await reauth(app, admin.token);
    const created = await app.inject({
      method: 'POST',
      url: '/admin/abuse-events',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        organizationId: customer.organization.id,
        userId: customer.user.id,
        type: 'manual_review',
        severity: 'high',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().abuseEvent.organizationId).toBe(customer.organization.id);
    expect((await store.listAdminAuditLogs()).some((event) => event.action === 'admin.abuse_event.create')).toBe(true);

    delete process.env.PLATFORM_ADMIN_EMAILS;
    await app.close();
  });

  it('requires re-authentication for dangerous admin actions', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'danger-admin@example.com';
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const admin = await register(app, { email: 'danger-admin@example.com', organizationName: 'Danger Org' });
    const setup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { code: createTotpCode(setup.json().secret) },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/admin/orgs/${admin.organization.id}/suspend`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('ADMIN_REAUTH_REQUIRED');
    delete process.env.PLATFORM_ADMIN_EMAILS;
    await app.close();
  });

  it('suspend org blocks workspace start and admin stop workspace action persists state', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'ops-admin@example.com';
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const admin = await register(app, { email: 'ops-admin@example.com', organizationName: 'Ops Org' });
    const setup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { code: createTotpCode(setup.json().secret) },
    });
    await reauth(app, admin.token);
    const projectResponse = await app.inject({
      method: 'POST',
      url: `/orgs/${admin.organization.id}/projects`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { name: 'Admin Runtime Project' },
    });
    const project = projectResponse.json().project;
    const workspaceResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/workspaces`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { name: 'Main workspace' },
    });
    const workspace = workspaceResponse.json().workspace;

    const stopped = await app.inject({
      method: 'POST',
      url: `/admin/workspaces/${workspace.id}/stop`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json().workspace.status).toBe('STOPPED');

    const suspended = await app.inject({
      method: 'POST',
      url: `/admin/orgs/${admin.organization.id}/suspend`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(suspended.statusCode).toBe(200);
    const blocked = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/workspaces`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { name: 'Blocked workspace' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('ORG_SUSPENDED');
    expect((await store.listAdminAuditLogs()).some((event) => event.action === 'admin.workspace.stop')).toBe(true);
    delete process.env.PLATFORM_ADMIN_EMAILS;
    await app.close();
  });

  it('returns backend project file metadata for workspace file metadata routes', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'workspace-files@example.com', organizationName: 'Workspace Files Org' });
    const projectResponse = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Workspace Files Project' },
    });
    const project = projectResponse.json().project;
    const workspaceResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/workspaces`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Main workspace' },
    });
    const workspace = workspaceResponse.json().workspace;

    const metadata = await app.inject({
      method: 'GET',
      url: `/workspaces/${workspace.id}/files/metadata`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    const legacyMetadata = await app.inject({
      method: 'GET',
      url: `/files/${workspace.id}/metadata`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(metadata.statusCode).toBe(200);
    expect(metadata.json().projectId).toBe(project.id);
    expect(metadata.json().files.length).toBeGreaterThan(0);
    expect(metadata.json().files.some((file: { path: string }) => file.path === 'package.json')).toBe(true);
    expect(legacyMetadata.statusCode).toBe(200);
    expect(legacyMetadata.json().files.map((file: { path: string }) => file.path)).toContain('package.json');

    await app.close();
  });

  it('enables MFA with TOTP and rotates recovery codes', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'mfa@example.com' });

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(setup.statusCode).toBe(200);
    const code = createTotpCode(setup.json().secret);
    const verify = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);
    expect((await store.findUserByEmail('mfa@example.com'))?.mfaEnabled).toBe(true);

    const recovery = await app.inject({
      method: 'POST',
      url: '/auth/recovery-codes',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(recovery.statusCode).toBe(200);
    expect(recovery.json().codes).toHaveLength(10);
    await app.close();
  });

  it('requires MFA at login once TOTP is enabled', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'mfa-login@example.com' });

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(setup.statusCode).toBe(200);
    const code = createTotpCode(setup.json().secret);
    const verify = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);
    const recovery = await app.inject({
      method: 'POST',
      url: '/auth/recovery-codes',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    const recoveryCode = recovery.json().codes[0];

    const missingMfa = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'mfa-login@example.com', password: 'password123' },
    });
    expect(missingMfa.statusCode).toBe(401);
    expect(missingMfa.json().code).toBe('AUTH_MFA_REQUIRED');

    const invalidMfa = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'mfa-login@example.com', password: 'password123', mfaCode: '000000' },
    });
    expect(invalidMfa.statusCode).toBe(401);
    expect(invalidMfa.json().code).toBe('AUTH_INVALID_MFA_CODE');

    const totpLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'mfa-login@example.com', password: 'password123', mfaCode: code },
    });
    expect(totpLogin.statusCode).toBe(200);
    expect(totpLogin.json().token).toMatch(/^session_/);

    const formattedTotpLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'mfa-login@example.com',
        password: 'password123',
        mfaCode: `${code.slice(0, 3)}-${code.slice(3)}`,
      },
    });
    expect(formattedTotpLogin.statusCode).toBe(200);

    const recoveryLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'mfa-login@example.com', password: 'password123', mfaCode: recoveryCode },
    });
    expect(recoveryLogin.statusCode).toBe(200);

    const reusedRecovery = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'mfa-login@example.com', password: 'password123', mfaCode: recoveryCode },
    });
    expect(reusedRecovery.statusCode).toBe(401);
    expect(reusedRecovery.json().code).toBe('AUTH_INVALID_MFA_CODE');

    await store.updateUser({
      userId: auth.user.id,
      mfaSecretEncrypted: 'not-a-valid-encrypted-secret',
    });
    const corruptedSecretLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'mfa-login@example.com', password: 'password123', mfaCode: '000000' },
    });
    expect(corruptedSecretLogin.statusCode).toBe(401);
    expect(corruptedSecretLogin.json().code).toBe('AUTH_INVALID_MFA_CODE');

    await app.close();
  });

  it('lists sessions and revokes all other devices', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'sessions@example.com' });
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'sessions@example.com', password: 'password123' },
    });
    expect(secondLogin.statusCode).toBe(200);

    const sessions = await app.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(sessions.json().sessions.length).toBe(2);

    const revoke = await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(revoke.statusCode).toBe(200);
    const blocked = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${secondLogin.json().token}` },
    });
    expect(blocked.statusCode).toBe(401);
    await app.close();
  });

  it('logs out the current session', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'logout@example.com' });

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json().revoked).toBe(true);

    const blocked = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(blocked.statusCode).toBe(401);
    expect((await store.listAuditLogs()).some((event) => event.action === 'auth.session.logout')).toBe(true);
    await app.close();
  });

  it('validates and stores encrypted SSO configs after admin re-authentication', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'sso@example.com', organizationName: 'SSO Org' });

    const denied = await app.inject({
      method: 'PUT',
      url: `/orgs/${auth.organization.id}/sso/oidc`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { issuer: 'https://login.example.com', clientId: 'client', clientSecret: 'secret' },
    });
    expect(denied.statusCode).toBe(403);

    await reauth(app, auth.token);
    const saved = await app.inject({
      method: 'PUT',
      url: `/orgs/${auth.organization.id}/sso/oidc`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { issuer: 'https://login.example.com', clientId: 'client', clientSecret: 'secret' },
    });
    expect(saved.statusCode).toBe(200);
    const stored = await store.getSsoConfig(auth.organization.id, 'oidc');
    expect(stored?.encryptedConfig).not.toContain('secret');
    expect(decryptJson<{ clientSecret: string }>(stored!.encryptedConfig).clientSecret).toBe('secret');
    await app.close();
  });

  it('provisions SCIM users with hashed tokens', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'scim-admin@example.com', organizationName: 'SCIM Org' });
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'team', status: 'ACTIVE' });
    await reauth(app, auth.token);

    const tokenResponse = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/scim/tokens`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Okta production' },
    });
    expect(tokenResponse.statusCode).toBe(201);
    const token = tokenResponse.json().token as string;
    expect([...store.scimTokens.values()][0].tokenHash).not.toBe(token);

    const provision = await app.inject({
      method: 'POST',
      url: `/scim/v2/${auth.organization.id}/Users`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        userName: 'provisioned@example.com',
        name: { givenName: 'Provisioned', familyName: 'User' },
        active: true,
      },
    });
    expect(provision.statusCode).toBe(201);
    expect(await store.findUserByEmail('provisioned@example.com')).toBeTruthy();
    await app.close();
  });

  it('exports audit logs as CSV and JSON', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'export@example.com', organizationName: 'Export Org' });

    const json = await app.inject({
      method: 'GET',
      url: `/orgs/${auth.organization.id}/audit-logs/export`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(json.statusCode).toBe(200);
    expect(Array.isArray(json.json().auditLogs)).toBe(true);

    const csv = await app.inject({
      method: 'GET',
      url: `/orgs/${auth.organization.id}/audit-logs/export?format=csv`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain('createdAt,organizationId,actorUserId,action');
    await app.close();
  });

  it('rejects invalid Stripe webhook signatures and processes duplicate events idempotently', async () => {
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const previousProPrice = process.env.STRIPE_PRO_PRICE_ID;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro_test';
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'billing-webhook@example.com', organizationName: 'Billing Webhook Org' });
    const payload = JSON.stringify({
      id: 'evt_subscription_updated',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test',
          customer: 'cus_test',
          status: 'active',
          current_period_start: 1_777_000_000,
          current_period_end: 1_779_000_000,
          items: { data: [{ price: { id: 'price_pro_test' } }] },
          metadata: { organizationId: auth.organization.id },
        },
      },
    });

    try {
      const invalid = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: { 'stripe-signature': 't=123,v1=bad', 'content-type': 'application/json' },
        payload: Buffer.from(payload),
      });
      expect(invalid.statusCode).toBe(400);

      const valid = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: {
          'stripe-signature': stripeSignature(payload, 'whsec_test_secret'),
          'content-type': 'application/json',
        },
        payload: Buffer.from(payload),
      });
      expect(valid.statusCode).toBe(200);
      expect((await store.getSubscription(auth.organization.id))?.planKey).toBe('pro');

      const duplicate = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: {
          'stripe-signature': stripeSignature(payload, 'whsec_test_secret'),
          'content-type': 'application/json',
        },
        payload: Buffer.from(payload),
      });
      expect(duplicate.json().duplicate).toBe(true);
      expect(store.stripeEvents.size).toBe(1);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
      process.env.STRIPE_PRO_PRICE_ID = previousProPrice;
      await app.close();
    }
  });

  it('blocks quota exceeded actions and allows audited quota overrides', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'quota@example.com', organizationName: 'Quota Org' });

    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'free', status: 'ACTIVE' });

    const projectNames = ['One', 'Two', 'Three'];
    for (const name of projectNames) {
      const response = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/projects`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { name },
      });
      expect(response.statusCode).toBe(201);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Four' },
    });
    expect(blocked.statusCode).toBe(429);

    const usageBeforeOverride = await app.inject({
      method: 'GET',
      url: `/orgs/${auth.organization.id}/usage`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(usageBeforeOverride.statusCode).toBe(200);
    expect(usageBeforeOverride.json().quotaUsage['projects.count']).toBe(3);
    expect(usageBeforeOverride.json().quotaUsage['workspaces.active']).toBe(0);

    await reauth(app, auth.token);
    const override = await app.inject({
      method: 'POST',
      url: `/admin/orgs/${auth.organization.id}/quota-overrides`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { key: 'projects.count', limit: 4, reason: 'contract expansion' },
    });
    expect(override.statusCode).toBe(201);

    const allowed = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Four' },
    });
    expect(allowed.statusCode).toBe(201);
    const usageAfterOverride = await app.inject({
      method: 'GET',
      url: `/orgs/${auth.organization.id}/usage`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(usageAfterOverride.json().quotaUsage['projects.count']).toBe(4);
    expect(store.auditLogs.some((event) => event.action === 'quota.override.create')).toBe(true);
    await app.close();
  });

  it('plan upgrade updates backend quotas used by protected actions', async () => {
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const previousProPrice = process.env.STRIPE_PRO_PRICE_ID;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_upgrade_secret';
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro_upgrade';
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'upgrade@example.com', organizationName: 'Upgrade Org' });
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'free', status: 'ACTIVE' });

    try {
      const payload = JSON.stringify({
        id: 'evt_upgrade',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_upgrade',
            customer: 'cus_upgrade',
            status: 'active',
            items: { data: [{ price: { id: 'price_pro_upgrade' } }] },
            metadata: { organizationId: auth.organization.id },
          },
        },
      });
      const webhook = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: {
          'stripe-signature': stripeSignature(payload, 'whsec_upgrade_secret'),
          'content-type': 'application/json',
        },
        payload: Buffer.from(payload),
      });
      expect(webhook.statusCode).toBe(200);

      const billing = await app.inject({
        method: 'GET',
        url: `/orgs/${auth.organization.id}/billing`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(billing.json().subscription.planKey).toBe('pro');
      expect(billing.json().limits['projects.count']).toBeGreaterThan(3);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
      process.env.STRIPE_PRO_PRICE_ID = previousProPrice;
      await app.close();
    }
  });

  it('creates Stripe checkout through a configured billing endpoint', async () => {
    const previousSecretKey = process.env.STRIPE_SECRET_KEY;
    const previousApiBase = process.env.STRIPE_API_BASE_URL;
    const previousProPrice = process.env.STRIPE_PRO_PRICE_ID;
    process.env.STRIPE_SECRET_KEY = 'sk_test_checkout';
    process.env.STRIPE_PRO_PRICE_ID = 'price_checkout_pro';

    const requests: Array<{ url?: string; body: Record<string, string> }> = [];
    const stripeServer = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => {
        raw += chunk.toString();
      });
      request.on('end', () => {
        const body = Object.fromEntries(new URLSearchParams(raw).entries());
        requests.push({ url: request.url, body });
        response.setHeader('content-type', 'application/json');
        if (request.url === '/v1/customers') {
          response.end(JSON.stringify({ id: 'cus_checkout' }));
          return;
        }
        if (request.url === '/v1/checkout/sessions') {
          response.end(JSON.stringify({ id: 'cs_checkout', url: 'https://checkout.stripe.local/session' }));
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ error: { message: 'not found' } }));
      });
    });

    await new Promise<void>((resolve) => stripeServer.listen(0, '127.0.0.1', () => resolve()));
    const address = stripeServer.address();
    if (typeof address !== 'object' || !address) {
      throw new Error('Local billing endpoint did not start');
    }
    process.env.STRIPE_API_BASE_URL = `http://127.0.0.1:${address.port}`;

    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'checkout@example.com', organizationName: 'Checkout Org' });

    try {
      const response = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/billing/checkout`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          planKey: 'pro',
          successUrl: 'https://app.example.com/billing/success',
          cancelUrl: 'https://app.example.com/billing/cancel',
          trialDays: 14,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().checkoutUrl).toBe('https://checkout.stripe.local/session');
      expect((await store.getBillingCustomer(auth.organization.id))?.externalId).toBe('cus_checkout');
      expect(requests.map((entry) => entry.url)).toEqual(['/v1/customers', '/v1/checkout/sessions']);
      expect(requests[1].body.customer).toBe('cus_checkout');
      expect(requests[1].body['line_items[0][price]']).toBe('price_checkout_pro');
      expect(requests[1].body['metadata[organizationId]']).toBe(auth.organization.id);
      expect(requests[1].body['metadata[planKey]']).toBe('pro');
      expect(requests[1].body['metadata[priceId]']).toBe('price_checkout_pro');
      expect(requests[1].body['subscription_data[metadata][organizationId]']).toBe(auth.organization.id);
      expect(requests[1].body['subscription_data[metadata][planKey]']).toBe('pro');
      expect(store.auditLogs.some((event) => event.action === 'billing.checkout.create')).toBe(true);
    } finally {
      process.env.STRIPE_SECRET_KEY = previousSecretKey;
      process.env.STRIPE_API_BASE_URL = previousApiBase;
      process.env.STRIPE_PRO_PRICE_ID = previousProPrice;
      await app.close();
      await new Promise<void>((resolve, reject) => stripeServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('creates Stripe customer portal sessions for existing billing customers', async () => {
    const previousSecretKey = process.env.STRIPE_SECRET_KEY;
    const previousApiBase = process.env.STRIPE_API_BASE_URL;
    process.env.STRIPE_SECRET_KEY = 'sk_test_portal';

    const requests: Array<{ url?: string; body: Record<string, string> }> = [];
    const stripeServer = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => {
        raw += chunk.toString();
      });
      request.on('end', () => {
        const body = Object.fromEntries(new URLSearchParams(raw).entries());
        requests.push({ url: request.url, body });
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ id: 'bps_portal', url: 'https://billing.stripe.local/session' }));
      });
    });

    await new Promise<void>((resolve) => stripeServer.listen(0, '127.0.0.1', () => resolve()));
    const address = stripeServer.address();
    if (typeof address !== 'object' || !address) {
      throw new Error('Local billing endpoint did not start');
    }
    process.env.STRIPE_API_BASE_URL = `http://127.0.0.1:${address.port}`;

    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'portal@example.com', organizationName: 'Portal Org' });
    await store.upsertBillingCustomer({
      organizationId: auth.organization.id,
      provider: 'stripe',
      externalId: 'cus_portal',
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/billing/portal`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { returnUrl: 'https://app.example.com/billing' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().portalUrl).toBe('https://billing.stripe.local/session');
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe('/v1/billing_portal/sessions');
      expect(requests[0].body.customer).toBe('cus_portal');
      expect(requests[0].body.return_url).toBe('https://app.example.com/billing');
      expect(store.auditLogs.some((event) => event.action === 'billing.portal.create')).toBe(true);
    } finally {
      process.env.STRIPE_SECRET_KEY = previousSecretKey;
      process.env.STRIPE_API_BASE_URL = previousApiBase;
      await app.close();
      await new Promise<void>((resolve, reject) => stripeServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('maps checkout completed webhooks from checkout metadata when subscription items are absent', async () => {
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const previousTeamPrice = process.env.STRIPE_TEAM_PRICE_ID;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_checkout_completed';
    process.env.STRIPE_TEAM_PRICE_ID = 'price_team_checkout';
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, {
      email: 'checkout-webhook@example.com',
      organizationName: 'Checkout Webhook Org',
    });
    const payload = JSON.stringify({
      id: 'evt_checkout_completed',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_completed',
          subscription: 'sub_from_checkout',
          customer: 'cus_checkout_webhook',
          status: 'complete',
          metadata: {
            organizationId: auth.organization.id,
            planKey: 'team',
            priceId: 'price_team_checkout',
          },
        },
      },
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: {
          'stripe-signature': stripeSignature(payload, 'whsec_checkout_completed'),
          'content-type': 'application/json',
        },
        payload: Buffer.from(payload),
      });
      expect(response.statusCode).toBe(200);
      expect((await store.getSubscription(auth.organization.id))?.planKey).toBe('team');
      expect((await store.getSubscription(auth.organization.id))?.externalId).toBe('sub_from_checkout');
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
      process.env.STRIPE_TEAM_PRICE_ID = previousTeamPrice;
      await app.close();
    }
  });

  it('records cancellation behavior from Stripe subscription deletion', async () => {
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_cancel_secret';
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'cancel@example.com', organizationName: 'Cancel Org' });
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const payload = JSON.stringify({
      id: 'evt_cancel',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_cancel',
          customer: 'cus_cancel',
          status: 'canceled',
          metadata: { organizationId: auth.organization.id },
        },
      },
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: {
          'stripe-signature': stripeSignature(payload, 'whsec_cancel_secret'),
          'content-type': 'application/json',
        },
        payload: Buffer.from(payload),
      });
      expect(response.statusCode).toBe(200);
      expect((await store.getSubscription(auth.organization.id))?.status).toBe('CANCELED');
      const billing = await app.inject({
        method: 'GET',
        url: `/orgs/${auth.organization.id}/billing`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(billing.statusCode).toBe(200);
      expect(billing.json().plan.key).toBe('free');
      expect(billing.json().limits['projects.count']).toBe(3);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
      await app.close();
    }
  });

  it('supports persistent project CRUD, settings, collaborators and soft delete restore', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'projects@example.com', organizationName: 'Projects Org' });

    const create = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/from-template`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Template App', templateName: 'react-basic-starter' },
    });
    expect(create.statusCode).toBe(201);
    const projectId = create.json().project.id as string;

    const dashboard = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/dashboard`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().files.length).toBeGreaterThan(0);

    const homepagePreview = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/homepage-preview.svg`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(homepagePreview.statusCode).toBe(200);
    expect(homepagePreview.headers['content-type']).toContain('image/svg+xml');
    expect(homepagePreview.body).toContain('Template App');
    expect(homepagePreview.body).toContain('Generated from the current homepage files');

    const saveIdeState = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        state: {
          chat: {
            id: `project:${projectId}`,
            messages: [{ id: 'msg_1', role: 'user', content: 'Continue from yesterday' }],
          },
          ui: { selectedFile: '/workspace/src/App.tsx', currentView: 'preview', rightPanel: 'webview' },
        },
      },
    });
    expect(saveIdeState.statusCode).toBe(200);
    expect(saveIdeState.json().ideState.version).toBe(1);

    const loadIdeState = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(loadIdeState.statusCode).toBe(200);
    expect(loadIdeState.json().ideState.state.chat.messages[0].content).toBe('Continue from yesterday');

    const activityAfterChatSave = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/activity`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(activityAfterChatSave.statusCode).toBe(200);
    const ideSaveEventsBeforeUiOnly = activityAfterChatSave
      .json()
      .activity.filter((event: { action: string }) => event.action === 'project.ide_state.save').length;
    expect(ideSaveEventsBeforeUiOnly).toBe(1);

    const saveUiOnlyIdeState = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        state: {
          ui: { activeWorkspacePanel: 'preview', agentWidth: 700 },
        },
      },
    });
    expect(saveUiOnlyIdeState.statusCode).toBe(200);
    expect(saveUiOnlyIdeState.json().ideState.state.chat.messages[0].content).toBe('Continue from yesterday');
    expect(saveUiOnlyIdeState.json().ideState.state.ui.agentWidth).toBe(700);

    const activityAfterUiOnlySave = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/activity`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(activityAfterUiOnlySave.statusCode).toBe(200);
    expect(
      activityAfterUiOnlySave
        .json()
        .activity.filter((event: { action: string }) => event.action === 'project.ide_state.save').length,
    ).toBe(ideSaveEventsBeforeUiOnly);

    const filteredActivity = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/activity?action=project.ide_state.save&search=version&limit=5&order=desc`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(filteredActivity.statusCode).toBe(200);
    expect(filteredActivity.json().activity).toHaveLength(1);
    expect(filteredActivity.json().activity[0].action).toBe('project.ide_state.save');
    expect(filteredActivity.json().filters.applied.limit).toBe(5);

    const clearIdeStateChat = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        state: {
          chat: { messages: [], clearMessages: true },
        },
      },
    });
    expect(clearIdeStateChat.statusCode).toBe(200);
    expect(clearIdeStateChat.json().ideState.state.chat.messages).toEqual([]);
    expect(clearIdeStateChat.json().ideState.state.chat.clearMessages).toBeUndefined();
    expect(clearIdeStateChat.json().ideState.state.ui.agentWidth).toBe(700);

    const settings = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { description: 'Persistent SaaS project' },
    });
    expect(settings.statusCode).toBe(200);
    expect(settings.json().project.description).toBe('Persistent SaaS project');

    const collaborator = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaborators`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { userId: auth.user.id, roleKey: 'admin' },
    });
    expect(collaborator.statusCode).toBe(201);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/projects/${projectId}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(deleted.statusCode).toBe(200);
    expect(
      (await store.listProjects(auth.organization.id)).find((project) => project.id === projectId),
    ).toBeUndefined();

    const restored = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/restore`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(restored.statusCode).toBe(200);
    expect((await store.listProjects(auth.organization.id)).find((project) => project.id === projectId)).toBeTruthy();
    await app.close();
  });

  it('supports realtime collaboration presence, edits, comments, terminal permissions and cleanup', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'collab-owner@example.com', organizationName: 'Collab Org' });
    const member = await register(app, { email: 'collab-member@example.com' });
    const viewer = await register(app, { email: 'collab-viewer@example.com' });
    const outsider = await register(app, { email: 'collab-outsider@example.com' });
    await store.addMember({ organizationId: owner.organization.id, userId: member.user.id, roleKey: 'member' });
    await store.addMember({ organizationId: owner.organization.id, userId: viewer.user.id, roleKey: 'viewer' });

    const create = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects/from-template`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Realtime App', templateName: 'react-basic-starter' },
    });
    expect(create.statusCode).toBe(201);
    const projectId = create.json().project.id as string;

    const outsiderCollaborator = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaborators`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { userId: outsider.user.id, roleKey: 'viewer' },
    });
    expect(outsiderCollaborator.statusCode).toBe(403);

    for (const collaborator of [
      { userId: member.user.id, roleKey: 'member' },
      { userId: viewer.user.id, roleKey: 'viewer' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/collaborators`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: collaborator,
      });
      expect(response.statusCode).toBe(201);
    }

    for (const input of [
      { token: owner.token, sessionId: 'owner-session', filePath: 'src/App.tsx', cursor: { line: 1, column: 1 } },
      {
        token: member.token,
        sessionId: 'member-session',
        filePath: 'src/App.tsx',
        cursor: { line: 2, column: 5 },
        selection: { anchor: 1, head: 2 },
      },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/collaboration/presence`,
        headers: { authorization: `Bearer ${input.token}` },
        payload: input,
      });
      expect(response.statusCode).toBe(200);
    }

    const ownerEdit = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaboration/edit`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { filePath: 'src/App.tsx', baseVersion: 0, content: 'export default function App() { return null; }' },
    });
    expect(ownerEdit.statusCode).toBe(200);
    expect(ownerEdit.json().document.version).toBe(1);

    const memberEdit = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaboration/edit`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { filePath: 'src/App.tsx', baseVersion: 1, content: 'export default function App() { return "ok"; }' },
    });
    expect(memberEdit.statusCode).toBe(200);
    expect(memberEdit.json().document.version).toBe(2);

    const conflict = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaboration/edit`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { filePath: 'src/App.tsx', baseVersion: 1, content: 'stale' },
    });
    expect(conflict.statusCode).toBe(409);

    const viewerEdit = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaboration/edit`,
      headers: { authorization: `Bearer ${viewer.token}` },
      payload: { filePath: 'src/App.tsx', baseVersion: 2, content: 'blocked' },
    });
    expect(viewerEdit.statusCode).toBe(403);

    const comment = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaboration/comments`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { filePath: 'src/App.tsx', line: 1, body: 'Pairing note' },
    });
    expect(comment.statusCode).toBe(201);

    const terminalPermission = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaboration/terminal-permissions`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { userId: viewer.user.id, sessionId: 'viewer-session', allowed: true },
    });
    expect(terminalPermission.statusCode).toBe(200);
    expect(terminalPermission.json().terminalPermissions[viewer.user.id].allowed).toBe(true);

    const shareLink = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaboration/share-links`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { roleKey: 'viewer', expiresInMinutes: 30 },
    });
    expect(shareLink.statusCode).toBe(201);
    expect(shareLink.json().token).toMatch(/^share_/);
    expect(shareLink.json().shareLink.tokenHash).toBeUndefined();

    const cleanup = await app.inject({
      method: 'DELETE',
      url: `/projects/${projectId}/collaboration/presence/member-session`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(cleanup.statusCode).toBe(200);
    expect(cleanup.json().removed).toBe(true);

    const collaboration = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/collaboration`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(collaboration.statusCode).toBe(200);
    expect(collaboration.json().presence).toHaveLength(1);
    expect(collaboration.json().comments).toHaveLength(1);
    expect(collaboration.json().documents['src/App.tsx'].version).toBe(2);

    await app.close();
  });

  it('issues collaboration WebSocket tickets and streams ready state over a dedicated socket', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'collab-ws-owner@example.com', organizationName: 'Collab WS Org' });
    const create = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Collaboration Socket Project' },
    });
    expect(create.statusCode).toBe(201);
    const projectId = create.json().project.id as string;

    const ticket = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/collaboration/ws-ticket?sessionId=browser-session`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(ticket.statusCode).toBe(200);
    expect(ticket.json().websocketPath).toBe(`/projects/${projectId}/collaboration/ws`);
    expect(ticket.json().ticket).toEqual(expect.any(String));

    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const socket = new WebSocket(
      `${address.replace(/^http/, 'ws')}/projects/${projectId}/collaboration/ws?ticket=${encodeURIComponent(
        ticket.json().ticket,
      )}&sessionId=browser-session`,
    );

    try {
      const ready = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Collaboration WebSocket did not become ready')), 2000);
        socket.addEventListener('message', (event) => {
          const payload = JSON.parse(String(event.data));

          if (payload.type === 'collaboration.ready') {
            clearTimeout(timeout);
            resolve(payload);
          }
        });
        socket.addEventListener('error', () => {
          clearTimeout(timeout);
          reject(new Error('Collaboration WebSocket failed'));
        });
      });

      expect(ready.projectId).toBe(projectId);
      expect(ready.presence.some((presence: { sessionId: string }) => presence.sessionId === 'browser-session')).toBe(
        true,
      );
    } finally {
      socket.close();
      await app.close();
    }
  });

  it('imports and exports project zip archives', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'zip@example.com', organizationName: 'Zip Org' });
    const zip = new JSZip();
    zip.file('README.md', '# Zip import\n');
    zip.file('src/index.ts', 'export const value = 1;\n');
    const zipBase64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');

    const imported = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/import/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Zip Project', zipBase64 },
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json().files.map((file: { path: string }) => file.path)).toContain('src/index.ts');

    const exported = await app.inject({
      method: 'GET',
      url: `/projects/${imported.json().project.id}/export/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().archive.base64).toEqual(expect.any(String));

    const replacementZip = new JSZip();
    replacementZip.file('README.md', '# Replaced project\n');
    const replacementZipBase64 = (await replacementZip.generateAsync({ type: 'nodebuffer' })).toString('base64');
    const replaced = await app.inject({
      method: 'POST',
      url: `/projects/${imported.json().project.id}/files/import/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { zipBase64: replacementZipBase64, replaceExisting: true },
    });

    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().files.map((file: { path: string }) => file.path)).toEqual(['README.md']);

    await app.close();
  });

  it('creates and restores snapshots without exposing runtime secrets', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'snapshots@example.com', organizationName: 'Snapshot Org' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/from-ai`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { prompt: 'Build a dashboard', name: 'AI Dashboard' },
    });
    const projectId = project.json().project.id as string;
    const createdFiles = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(createdFiles.statusCode).toBe(200);
    expect(createdFiles.json().files.map((file: { path: string }) => file.path)).toEqual(['README.md']);

    const secret = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/secrets`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { key: 'API_KEY', value: 'super-secret-value' },
    });
    expect(secret.statusCode).toBe(200);

    const snapshot = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/snapshots`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { label: 'Manual checkpoint', kind: 'manual' },
    });
    expect(snapshot.statusCode).toBe(201);
    expect(JSON.stringify(snapshot.json().snapshot)).not.toContain('super-secret-value');

    const restore = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/snapshots/${snapshot.json().snapshot.id}/restore`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().files.length).toBeGreaterThan(0);
    await app.close();
  });

  it('does not scaffold simulated app files before the IDE agent generates real output', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'ai-builder@example.com', organizationName: 'AI Builder Org' });
    const prompt = 'build a saas platform a clone of bolt';
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/from-ai`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { prompt, name: 'Bolt Enterprise Studio', artifactType: 'Web', framework: 'React + Vite + TypeScript' },
    });
    expect(project.statusCode).toBe(201);

    const exported = await app.inject({
      method: 'GET',
      url: `/projects/${project.json().project.id}/export/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(exported.statusCode).toBe(200);

    const zip = await JSZip.loadAsync(Buffer.from(exported.json().archive.base64, 'base64'));
    const paths = Object.keys(zip.files).filter((path) => !zip.files[path]?.dir);
    const readme = await zip.file('README.md')!.async('string');

    expect(paths).toEqual(['README.md']);
    expect(readme).toContain('Application files are intentionally left for the IDE agent');
    expect(readme).toContain(prompt);
    expect(zip.file('package.json')).toBeNull();
    expect(zip.file('src/App.tsx')).toBeNull();

    await app.close();
  });

  it('recovers generated project files from persisted IDE chat state when storage is empty', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const app = await buildTestApiApp({ store, projectStorage });
    const auth = await register(app, { email: 'ide-recovery@example.com', organizationName: 'IDE Recovery Org' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Recovered Preview App' },
    });
    expect(project.statusCode).toBe(201);
    const projectId = project.json().project.id;
    projectStorage.files.delete(projectId);

    const saveIdeState = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        state: {
          chat: {
            messages: [
              {
                id: 'assistant-generated-files',
                role: 'assistant',
                content: `<boltArtifact id="preview-app" title="Preview App">
<boltAction type="file" filePath="package.json">
{"scripts":{"dev":"vite"},"dependencies":{"@vitejs/plugin-react":"^4.2.1","vite":"^5.1.4","typescript":"^5.4.2","react":"^18.3.1","react-dom":"^18.3.1"}}
</boltAction>
<boltAction type="file" filePath="index.html">
<div id="root"></div><script type="module" src="/src/main.tsx"></script>
</boltAction>
<boltAction type="file" filePath="src/main.tsx">
import React from 'react';
import ReactDOM from 'react-dom/client';
ReactDOM.createRoot(document.getElementById('root')!).render(<main>Recovered preview</main>);
</boltAction>
</boltArtifact>`,
              },
            ],
          },
        },
      },
    });
    expect(saveIdeState.statusCode).toBe(200);
    expect(await projectStorage.listFiles(projectId)).toEqual([]);

    const exported = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/export/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(exported.statusCode).toBe(200);

    const zip = await JSZip.loadAsync(Buffer.from(exported.json().archive.base64, 'base64'));
    await expect(zip.file('src/main.tsx')!.async('string')).resolves.toContain('Recovered preview');
    expect((await projectStorage.listFiles(projectId)).map((file) => file.path)).toEqual(
      expect.arrayContaining(['package.json', 'index.html', 'src/main.tsx']),
    );

    await app.close();
  });

  it('indexes package manifests generated in IDE state even when project storage already has files', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const app = await buildTestApiApp({ store, projectStorage });
    const auth = await register(app, {
      email: 'package-index@example.com',
      organizationName: 'Package Index Org',
    });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Package Index App' },
    });
    const projectId = project.json().project.id;
    await projectStorage.writeFiles(projectId, [{ path: 'README.md', content: '# Existing project\n' }]);

    const saveIdeState = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        state: {
          chat: {
            messages: [
              {
                id: 'assistant-package-manifest',
                role: 'assistant',
                content: `<boltArtifact id="package-app" title="Package App">
<boltAction type="file" filePath="package.json">
{"name":"package-index-app","packageManager":"pnpm@9.14.4","dependencies":{"vite":"^5.4.21"},"devDependencies":{"typescript":"^5.7.2"}}
</boltAction>
</boltArtifact>`,
              },
            ],
          },
        },
      },
    });
    expect(saveIdeState.statusCode).toBe(200);

    const packages = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/packages`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(packages.statusCode).toBe(200);
    expect(packages.json().packageManager).toBe('pnpm');
    expect(packages.json().manifests).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'package.json', name: 'package-index-app' })]),
    );
    expect(packages.json().dependencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'vite', version: '^5.4.21' })]),
    );
    expect(packages.json().files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining(['README.md', 'package.json']),
    );

    await app.close();
  });

  it('deploys projects through static, Vercel and Cloud Run providers with redacted logs', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'deployments@example.com', organizationName: 'Deployments Org' });
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/from-template`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Deployable App', templateName: 'react-basic-starter' },
    });
    const projectId = project.json().project.id as string;

    const staticDeploy = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        provider: 'static',
        environment: 'preview',
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
        envVars: { SECRET_TOKEN: 'super-secret-token', PUBLIC_URL: 'https://example.test' },
      },
    });
    expect(staticDeploy.statusCode).toBe(201);
    expect(staticDeploy.json().deployment.status).toBe('READY');
    expect(staticDeploy.json().deployment.url).toContain('static.vibecore.local');

    const vercel = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        provider: 'vercel',
        environment: 'production',
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
      },
    });
    expect(vercel.statusCode).toBe(201);
    expect(vercel.json().deployment.productionUrl).toContain('vercel.vibecore.local');

    const cloudRun = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        provider: 'google-cloud-run',
        environment: 'staging',
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
        injectSecrets: ['DATABASE_URL'],
      },
    });
    expect(cloudRun.statusCode).toBe(201);
    expect(JSON.stringify(cloudRun.json().deployment.logs)).toContain('pushed image');

    const logs = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${staticDeploy.json().deployment.id}/logs`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(logs.statusCode).toBe(200);
    expect(JSON.stringify(logs.json())).not.toContain('super-secret-token');
    expect(JSON.stringify(logs.json())).toContain('[REDACTED]');
    await app.close();
  });

  it('rolls back, redeploys and cancels deployment records', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'deploy-ops@example.com', organizationName: 'Deploy Ops Org' });
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/from-template`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Deploy Ops App', templateName: 'react-basic-starter' },
    });
    const projectId = project.json().project.id as string;
    const deploy = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { provider: 'static', environment: 'preview', buildCommand: 'npm run build', outputDirectory: 'dist' },
    });
    const deploymentId = deploy.json().deployment.id as string;

    const redeploy = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deploymentId}/redeploy`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(redeploy.statusCode).toBe(201);
    expect(redeploy.json().deployment.metadata.redeployedFromId).toBe(deploymentId);

    const rollback = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deploymentId}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(rollback.statusCode).toBe(201);
    expect(rollback.json().deployment.rolledBackFromId).toBe(deploymentId);

    const cancel = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${redeploy.json().deployment.id}/cancel`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().deployment.status).toBe('CANCELED');
    await app.close();
  });

  it('tests GitHub import and git operations', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'git@example.com', organizationName: 'Git Org' });

    const imported = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/import/github`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { repositoryUrl: 'https://github.com/acme/app', branch: 'main' },
    });
    expect(imported.statusCode).toBe(201);
    const projectId = imported.json().project.id as string;

    const status = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/status`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(status.statusCode).toBe(200);
    const commit = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/git/commit`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { message: 'Initial import' },
    });
    expect(commit.statusCode).toBe(200);
    const push = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/git/push`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { branch: 'main' },
    });
    expect(push.json().pushed).toBe(true);
    const pullRequest = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/git/pull-requests`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { title: 'Ship project', sourceBranch: 'main', targetBranch: 'main' },
    });
    expect(pullRequest.statusCode).toBe(201);
    await app.close();
  });

  it('enforces RBAC project access for persistent project operations', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'project-owner@example.com', organizationName: 'Project Owner Org' });
    const outsider = await register(app, {
      email: 'project-outsider@example.com',
      organizationName: 'Project Outsider Org',
    });
    const create = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Private Project' },
    });
    const projectId = create.json().project.id as string;

    const denied = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/dashboard`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(denied.statusCode).toBe(404);
    await app.close();
  });

  it('executes AI file tools through the workspace runtime only', async () => {
    const runtime = await startRuntimeServices();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'ai-tools@example.com', organizationName: 'AI Tools Org' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'AI Tool Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const write = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/write_file`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
      });

      expect(write.statusCode).toBe(201);
      expect(runtime.files.get('src/App.tsx')).toContain('App');
      expect(runtime.calls).toContain('POST /files/write');
      expect(store.auditLogs.some((event) => event.action === 'ai.tool.write_file')).toBe(true);
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('blocks AI path traversal and dangerous commands before runtime execution', async () => {
    const runtime = await startRuntimeServices();
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'ai-security@example.com', organizationName: 'AI Security Org' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'AI Security Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const traversal = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/read_file`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { path: '../secrets.env' },
      });
      expect(traversal.statusCode).toBe(400);

      const command = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/run_command`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { command: 'rm', args: ['-rf', '/'] },
      });
      expect(command.statusCode).toBe(409);
      expect(runtime.calls).not.toContain('POST /commands/run');
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('enforces configured AI shell command allow-lists before runtime execution', async () => {
    const previousAllowList = process.env.VIBECORE_AGENT_SHELL_ALLOWLIST;
    process.env.VIBECORE_AGENT_SHELL_ALLOWLIST = 'node,pnpm';

    const runtime = await startRuntimeServices();
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'ai-guardrails@example.com', organizationName: 'AI Guardrails Org' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'AI Guardrails Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const allowed = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/run_command`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { command: 'node', args: ['--version'] },
      });
      expect(allowed.statusCode).toBe(201);

      const blocked = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/run_command`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { command: 'python3', args: ['--version'] },
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().code).toBe('AI_COMMAND_NOT_ALLOWLISTED');
      expect(runtime.calls.filter((call) => call === 'POST /commands/run')).toHaveLength(1);
    } finally {
      if (previousAllowList === undefined) {
        delete process.env.VIBECORE_AGENT_SHELL_ALLOWLIST;
      } else {
        process.env.VIBECORE_AGENT_SHELL_ALLOWLIST = previousAllowList;
      }

      await runtime.close();
      await app.close();
    }
  });

  it('redacts canary secrets from AI runtime tool responses and persisted tool output', async () => {
    const canary = 'canary_runtimeAiToolLeakProbe_1234567890';
    const store = new TestApiStore();
    const runtime = await startRuntimeServices({
      logs: [`workspace ready`, `terminal leaked ${canary}`, `provider token sk_live_${'A'.repeat(20)}`],
      commandStdout: `stdout leaked ${canary} and ghp_${'B'.repeat(20)}`,
      commandStderr: `stderr leaked ya29.${'C'.repeat(20)}`,
    });
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'ai-canary@example.com', organizationName: 'AI Canary Org' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'AI Canary Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const logs = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/get_terminal_output`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {},
      });
      expect(logs.statusCode).toBe(201);

      const command = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/run_command`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { command: 'node', args: ['--version'] },
      });
      expect(command.statusCode).toBe(201);

      const serializedResponses = `${JSON.stringify(logs.json())}\n${JSON.stringify(command.json())}`;
      expect(serializedResponses).not.toContain(canary);
      expect(serializedResponses).not.toContain('sk_live_');
      expect(serializedResponses).not.toContain('ghp_');
      expect(serializedResponses).not.toContain('ya29.');
      expect(serializedResponses).toContain('[REDACTED]');

      const serializedStoredOutput = JSON.stringify([...store.aiToolCalls.values()].map((call) => call.output));
      expect(serializedStoredOutput).not.toContain(canary);
      expect(serializedStoredOutput).not.toContain('sk_live_');
      expect(serializedStoredOutput).not.toContain('ghp_');
      expect(serializedStoredOutput).not.toContain('ya29.');
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('blocks abusive runtime commands, logs AbuseEvent, and stops the workspace before agent execution', async () => {
    const store = new TestApiStore();
    const runtime = await startRuntimeServices();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'runtime-abuse@example.com', organizationName: 'Runtime Abuse Org' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Abuse Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const response = await app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${projectId}/commands`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { command: 'nmap', args: ['127.0.0.1'] },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ABUSE_PORT_SCANNING');
      expect(runtime.calls).not.toContain('POST /commands/run');
      const abuseEvents = await store.listAbuseEvents();
      expect(abuseEvents).toHaveLength(1);
      expect(abuseEvents[0]).toMatchObject({
        organizationId: auth.organization.id,
        severity: 'high',
        type: 'port_scanning',
      });
      expect(store.auditLogs.some((event) => event.action === 'abuse.signal.detected')).toBe(true);
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('returns per-port preview URLs for remote runtime ports', async () => {
    const runtime = await startRuntimeServices();
    const previousPreviewTemplate = process.env.PREVIEW_URL_TEMPLATE;
    process.env.PREVIEW_URL_TEMPLATE = 'https://{workspaceId}-{port}.preview.example.com';
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'runtime-preview@example.com', organizationName: 'Runtime Preview Org' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Preview Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${projectId}/ports`,
        headers: { authorization: `Bearer ${auth.token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({
          port: 5173,
          type: 'open',
          ready: true,
          url: `https://${projectId}-5173.preview.example.com`,
        }),
      ]);
    } finally {
      process.env.PREVIEW_URL_TEMPLATE = previousPreviewTemplate;
      await runtime.close();
      await app.close();
    }
  });

  it('starts isolated runtime workspaces per user for the same shared project', async () => {
    const runtime = await startRuntimeServices();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'runtime-owner@example.com', organizationName: 'Runtime Owner Org' });
    const editor = await register(app, { email: 'runtime-editor@example.com' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });
    await store.addMember({ organizationId: owner.organization.id, userId: editor.user.id, roleKey: 'editor' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Shared Runtime Project' },
    });
    const projectId = project.json().project.id as string;
    await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaborators`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { userId: editor.user.id, roleKey: 'editor' },
    });

    try {
      const ownerStart = await app.inject({
        method: 'POST',
        url: '/api/runtime/workspaces',
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { workspaceId: projectId, metadata: { projectId } },
      });
      const editorStart = await app.inject({
        method: 'POST',
        url: '/api/runtime/workspaces',
        headers: { authorization: `Bearer ${editor.token}` },
        payload: { workspaceId: projectId, metadata: { projectId } },
      });

      expect(ownerStart.statusCode).toBe(200);
      expect(editorStart.statusCode).toBe(200);
      expect(ownerStart.json().id).not.toBe(projectId);
      expect(editorStart.json().id).not.toBe(projectId);
      expect(ownerStart.json().id).not.toBe(editorStart.json().id);
      expect((await store.getWorkspace(ownerStart.json().id))?.projectId).toBe(projectId);
      expect((await store.getWorkspace(editorStart.json().id))?.projectId).toBe(projectId);
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('returns a controlled 502 when the workspace manager is unavailable', async () => {
    const previousManager = process.env.WORKSPACE_MANAGER_URL;
    process.env.WORKSPACE_MANAGER_URL = 'http://127.0.0.1:9';
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, {
      email: 'runtime-manager-down@example.com',
      organizationName: 'Runtime Manager Down Org',
    });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Manager Down Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/runtime/workspaces',
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { workspaceId: projectId, metadata: { projectId } },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json().error).toBe('Workspace manager is unavailable');
      expect(response.json().code).toBe('WORKSPACE_MANAGER_UNAVAILABLE');
    } finally {
      process.env.WORKSPACE_MANAGER_URL = previousManager;
      await app.close();
    }
  });

  it('creates a before-AI snapshot before destructive tools', async () => {
    const runtime = await startRuntimeServices();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'ai-snapshot@example.com', organizationName: 'AI Snapshot Org' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'AI Snapshot Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const deletion = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/delete_file`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { path: 'README.md' },
      });

      expect(deletion.statusCode).toBe(201);
      expect(deletion.json().snapshotId).toBeTruthy();
      expect([...store.snapshots.values()].some((snapshot) => snapshot.kind === 'before-ai-change')).toBe(true);
    } finally {
      await runtime.close();
      await app.close();
    }
  });
});
