import { generateKeyPairSync, createHash, createHmac, createSign } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTotpCode } from '@vibecore/auth';
import { decryptJson } from '@vibecore/security';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { runtimeWebSocketProtocols } from '../runtime-websocket-ticket.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import type { GitProvider, ProjectFile, ProjectStorage, StoredArchive } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

// Mirror runtimeWorkspaceId(projectId, userId) from the API: runtime endpoints
// resolve a bare project id to this deterministic per-user workspace id, so a
// test that drives an endpoint with a project id must expect the resolved id.
function deterministicRuntimeWorkspaceId(projectId: string, userId: string) {
  return `ws-${createHash('sha256').update(`${projectId}:${userId}`).digest('hex').slice(0, 16)}`;
}

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

  async checkoutBranch(input: { projectId: string; branch: string; create?: boolean }) {
    const branches = this.branches.get(input.projectId) ?? ['main'];

    if (input.create && !branches.includes(input.branch)) {
      branches.push(input.branch);
    }

    this.branches.set(input.projectId, [input.branch, ...branches.filter((branch) => branch !== input.branch)]);

    return { branch: input.branch };
  }

  async stashPush() {
    return { stashed: true, output: 'Saved working directory' };
  }

  async stashList() {
    return [];
  }

  async stashApply() {
    return { applied: true, output: 'Applied stash' };
  }

  async cherryPick() {
    return { picked: true, output: 'Cherry-picked commit' };
  }

  async discard(_input: { projectId: string; workspaceId?: string; filePaths?: string[] }) {
    return { discarded: true, filePaths: [] as string[] };
  }

  async resolveConflict(input: { filePath: string; strategy: 'ours' | 'theirs' }) {
    return { resolved: true, filePath: input.filePath, strategy: input.strategy };
  }

  async logGraph(projectId: string) {
    return (this.commits.get(projectId) ?? []).map((commit) => ({
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 8),
      parents: [],
      author: 'Test User',
      date: new Date().toISOString(),
      message: commit.message,
    }));
  }

  async diff() {
    return '';
  }

  async blame() {
    return [];
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

    return {
      storageKey,
      byteLength: content.byteLength,
      base64: content.toString('base64'),
      createdAt: new Date().toISOString(),
    };
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

async function startRuntimeServices(
  options: {
    logs?: string[];
    commandStdout?: string;
    commandStderr?: string;
    agentUnavailable?: boolean;
    managerWorkspaceEmpty?: boolean;
    managerStopNotFound?: boolean;
  } = {},
) {
  const files = new Map<string, string>([['README.md', '# Runtime project\n']]);
  const calls: string[] = [];
  // Captures the parsed body of every POST /commands/run so tests can assert
  // the exact argv the API dispatched to the workspace pod.
  const commandBodies: Array<{ command: string; args?: string[]; timeoutMs?: number }> = [];

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

      if (options.agentUnavailable) {
        response.writeHead(503).end(JSON.stringify({ error: 'workspace_agent_unavailable' }));
        return;
      }

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
        commandBodies.push({ command: payload.command, args: payload.args, timeoutMs: payload.timeoutMs });
        response.end(
          JSON.stringify({
            code: 0,
            stdout: options.commandStdout ?? `ran ${payload.command}`,
            stderr: options.commandStderr ?? '',
          }),
        );
      } else if (request.method === 'GET' && url.pathname === '/ports') {
        response.end(JSON.stringify({ ports: [{ port: 5173, processId: 'dev' }] }));
      } else if (request.method === 'GET' && url.pathname === '/preview/5173/') {
        response.setHeader('content-type', 'text/html');
        response.end('<main>runtime preview root</main>');
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

  /*
   * Mirror the real workspace-agent's persistent terminal socket: it frames its
   * own output as JSON `CommandEvent`s ({ type: 'stdout', ... }) — never raw
   * bytes. The API proxy must pass these through unwrapped, so this lets the
   * framing regression test assert frames arrive single-encoded, not double.
   */
  const agentSockets = new WebSocketServer({ server: agent });
  agentSockets.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '/', 'http://agent.local');
    calls.push(`WS ${url.pathname}`);

    if (url.pathname === '/terminal' || url.pathname === '/commands/stream') {
      socket.send(JSON.stringify({ type: 'stdout', data: 'hello from shell\r\n', timestamp: 'now' }));
      socket.on('message', (raw) => {
        const text = raw.toString();

        // Echo back stdin the way a shell would, still JSON-framed.
        try {
          const parsed = JSON.parse(text) as { type?: string; data?: string };

          if (parsed.type === 'stdin' && parsed.data) {
            socket.send(JSON.stringify({ type: 'stdout', data: parsed.data, timestamp: 'now' }));
          }
        } catch {
          // Ignore control frames (ping/resize) the test does not exercise.
        }
      });
    }
  });

  const managerCalls: Array<{ pathname: string; body: any }> = [];

  const manager = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://manager.local');
    response.setHeader('content-type', 'application/json');

    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      managerCalls.push({ pathname: url.pathname, body: body ? JSON.parse(body) : {} });

      if (url.pathname.endsWith('/agent-token')) {
        response.end(JSON.stringify({ token: 'runtime-token' }));
      } else if (url.pathname.endsWith('/logs')) {
        response.end(JSON.stringify({ logs: options.logs ?? ['workspace ready'] }));
      } else if (
        options.managerWorkspaceEmpty &&
        request.method === 'GET' &&
        /^\/workspaces\/[^/]+$/.test(url.pathname)
      ) {
        // Mirror the real manager returning `undefined` (empty 200) for a
        // workspace it has no record of — Fastify serialises that as no body.
        response.end();
      } else if (options.managerStopNotFound && url.pathname.endsWith('/stop')) {
        // Mirror the manager 404 for stopping a workspace it has no record of.
        response.writeHead(404).end(JSON.stringify({ error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' }));
      } else {
        response.end(JSON.stringify({ status: 'RUNNING' }));
      }
    });
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
    commandBodies,
    managerCalls,
    async close() {
      process.env.WORKSPACE_MANAGER_URL = previousManager;
      process.env.WORKSPACE_AGENT_URL_TEMPLATE = previousAgent;
      await new Promise<void>((resolve) => agentSockets.close(() => resolve()));
      await Promise.all(
        [agent, manager].map((server: Server) => new Promise<void>((resolve) => server.close(() => resolve()))),
      );
    },
  };
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ gitProvider: new TestGitProvider(), emailProvider: new TestEmailProvider(), ...options });
}

async function withProductionWorkspaceManager<T>(callback: () => Promise<T>): Promise<T> {
  const previousManager = process.env.WORKSPACE_MANAGER_URL;
  process.env.WORKSPACE_MANAGER_URL = 'https://workspace-manager.example.com';

  try {
    return await callback();
  } finally {
    if (previousManager === undefined) {
      delete process.env.WORKSPACE_MANAGER_URL;
    } else {
      process.env.WORKSPACE_MANAGER_URL = previousManager;
    }
  }
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

async function verifyEmail(app: Awaited<ReturnType<typeof buildTestApiApp>>, verificationToken: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/verify-email',
    payload: { token: verificationToken },
  });

  expect(response.statusCode).toBe(200);
}

function stripeSignature(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

function svixSignature(input: { id: string; timestampSeconds: number; body: string; secretWhsec: string }) {
  const secretBase64 = input.secretWhsec.startsWith('whsec_')
    ? input.secretWhsec.slice('whsec_'.length)
    : input.secretWhsec;

  const key = Buffer.from(secretBase64, 'base64');
  const signed = `${input.id}.${input.timestampSeconds}.${input.body}`;

  return `v1,${createHmac('sha256', key).update(signed).digest('base64')}`;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
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

  it('refuses to boot in production when the CORS allowlist is missing or dev-default', async () => {
    await withProductionWorkspaceManager(async () => {
      await expect(
        buildTestApiApp({
          store: new TestApiStore(),
          isProduction: true,
          allowedOrigins: ['http://localhost:5173'],
        }),
      ).rejects.toThrow(/API_CORS_ORIGINS/);

      await expect(
        buildTestApiApp({
          store: new TestApiStore(),
          isProduction: true,
          allowedOrigins: [],
        }),
      ).rejects.toThrow(/API_CORS_ORIGINS/);

      await expect(
        buildTestApiApp({
          store: new TestApiStore(),
          isProduction: true,
          allowedOrigins: ['http://app.example.com'],
        }),
      ).rejects.toThrow(/API_CORS_ORIGINS/);
    });
  });

  it('refuses to boot in production when the workspace manager URL is missing or local', async () => {
    const previousManager = process.env.WORKSPACE_MANAGER_URL;

    try {
      delete process.env.WORKSPACE_MANAGER_URL;
      await expect(
        buildTestApiApp({
          store: new TestApiStore(),
          isProduction: true,
          allowedOrigins: ['https://app.example.com'],
        }),
      ).rejects.toThrow(/WORKSPACE_MANAGER_URL is required/);

      process.env.WORKSPACE_MANAGER_URL = 'http://127.0.0.1:3010';
      await expect(
        buildTestApiApp({
          store: new TestApiStore(),
          isProduction: true,
          allowedOrigins: ['https://app.example.com'],
        }),
      ).rejects.toThrow(/WORKSPACE_MANAGER_URL must use HTTPS or an internal Kubernetes service DNS URL/);

      process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.vibecore.svc:3010';

      const app = await buildTestApiApp({
        store: new TestApiStore(),
        isProduction: true,
        allowedOrigins: ['https://app.example.com'],
      });
      await app.close();
    } finally {
      if (previousManager === undefined) {
        delete process.env.WORKSPACE_MANAGER_URL;
      } else {
        process.env.WORKSPACE_MANAGER_URL = previousManager;
      }
    }
  });

  it('boots in production when the CORS allowlist is explicit HTTPS origins', async () => {
    const app = await withProductionWorkspaceManager(() =>
      buildTestApiApp({
        store: new TestApiStore(),
        isProduction: true,
        allowedOrigins: ['https://app.example.com', 'https://admin.example.com'],
      }),
    );

    const cors = await app.inject({
      method: 'OPTIONS',
      url: '/auth/me',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(cors.headers['access-control-allow-origin']).toBe('https://app.example.com');
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

  it('accepts general contact messages (topic instead of company) through the same intake', async () => {
    const emailProvider = new TestEmailProvider();
    const app = await buildTestApiApp({ store: new TestApiStore(), emailProvider });

    const response = await app.inject({
      method: 'POST',
      url: '/contact-sales',
      payload: {
        email: 'visitor@example.com',
        name: 'Ada Lovelace',
        topic: 'Support',
        requirements: 'My workspace will not start.',
        pagePath: '/contact',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().reference).toBeTruthy();
    expect(emailProvider.messages).toHaveLength(1);
    expect(emailProvider.messages[0].subject).toContain('E-Code contact request - Support');
    expect(emailProvider.messages[0].text).toContain('Topic: Support');

    // The general form never asks for a team size, so the line is omitted.
    expect(emailProvider.messages[0].text).not.toContain('Team size:');
    await app.close();
  });

  it('rejects a contact intake payload carrying neither company nor topic', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });

    const response = await app.inject({
      method: 'POST',
      url: '/contact-sales',
      payload: { email: 'visitor@example.com', requirements: 'hello' },
    });

    expect(response.statusCode).toBe(400);
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

    // Missing category defaults to 'other'; an explicit one round-trips.
    expect(canCreateSupportTicket.json().ticket.category).toBe('other');

    const categorizedTicket = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/support/tickets`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { subject: 'Billing question', category: 'billing' },
    });
    expect(categorizedTicket.statusCode).toBe(201);
    expect(categorizedTicket.json().ticket.category).toBe('billing');

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

  it('blocks an admin from escalating a role above their own (owner promotion)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'esc-owner@example.com', organizationName: 'Escalation Org' });
    const admin = await register(app, { email: 'esc-admin@example.com', organizationName: 'Admin Org' });
    await store.addMember({ organizationId: owner.organization.id, userId: admin.user.id, roleKey: 'admin' });

    // Admin (members:manage but NOT billing:manage/admin:write) must not be able
    // to promote anyone — including themselves — to owner.
    const selfPromote = await app.inject({
      method: 'PATCH',
      url: `/orgs/${owner.organization.id}/memberships/${admin.user.id}`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { roleKey: 'owner' },
    });
    expect(selfPromote.statusCode).toBe(403);
    expect(selfPromote.json().code).toBe('RBAC_PRIVILEGE_ESCALATION');

    const invitePromote = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { email: 'esc-new-owner@example.com', roleKey: 'owner' },
    });
    expect(invitePromote.statusCode).toBe(403);
    expect(invitePromote.json().code).toBe('RBAC_PRIVILEGE_ESCALATION');

    // Same admin may still assign a role at or below their own level.
    const allowedMember = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/memberships`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { userId: admin.user.id, roleKey: 'member' },
    });
    expect(allowedMember.statusCode).toBe(201);

    // The owner is unaffected and can still assign the owner role.
    const ownerAssigns = await app.inject({
      method: 'PATCH',
      url: `/orgs/${owner.organization.id}/memberships/${admin.user.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { roleKey: 'owner' },
    });
    expect(ownerAssigns.statusCode).toBe(200);
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
    // Accepting an invite now requires a verified email (binding to a proven owner).
    await store.updateUser({ userId: invitee.user.id, emailVerifiedAt: new Date().toISOString() });
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

  it('never leaks an invitation tokenHash from any of the 5 invitation endpoints', async () => {
    /*
     * Security regression (coverage audit): GET /orgs/:orgId/invitations used to
     * return the raw invite rows — including `tokenHash` — while the other four
     * invitation endpoints strip it. The invite token must never leave the server
     * in any form. This asserts ALL FIVE endpoints (list / create / resend /
     * expire / accept) so the leak cannot reappear on any of them. It FAILS
     * against the pre-fix code because the list response carries tokenHash.
     */
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'leak-owner@example.com', organizationName: 'Leak Org' });
    const invitee = await register(app, { email: 'leak-invitee@example.com', organizationName: 'Invitee Org' });
    await store.updateUser({ userId: invitee.user.id, emailVerifiedAt: new Date().toISOString() });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });

    // A response never carries the invite secret — neither the hash nor a clear token.
    const assertNoTokenLeak = (label: string, response: { payload: string }) => {
      expect(`${label}: ${response.payload}`).not.toContain('tokenHash');
    };

    // (2) create — stores a tokenHash server-side.
    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'leak-invitee@example.com', roleKey: 'member' },
    });
    expect(created.statusCode).toBe(201);
    assertNoTokenLeak('create', created);
    const inviteId = created.json().invitation.id as string;

    // The stored invite really has a tokenHash — proving the list has something to leak.
    const storedInvite = [...store.organizationInvites.values()].find((entry) => entry.id === inviteId);
    expect(storedInvite?.tokenHash).toBeTruthy();

    // (1) list — the endpoint that leaked. Assert the raw body AND every parsed row.
    const listed = await app.inject({
      method: 'GET',
      url: `/orgs/${owner.organization.id}/invitations`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(listed.statusCode).toBe(200);
    assertNoTokenLeak('list', listed);
    for (const invitation of listed.json().invitations as Array<Record<string, unknown>>) {
      expect(invitation.tokenHash).toBeUndefined();
      expect(invitation).not.toHaveProperty('tokenHash');
      // Belt and braces: the stored hash value must not appear under any key either.
      expect(Object.values(invitation)).not.toContain(storedInvite?.tokenHash);
    }

    // (3) resend
    const resent = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations/${inviteId}/resend`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(resent.statusCode).toBe(200);
    assertNoTokenLeak('resend', resent);

    // (5) accept
    const accepted = await app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${invitee.token}` },
      payload: { token: resent.json().token },
    });
    expect(accepted.statusCode).toBe(200);
    assertNoTokenLeak('accept', accepted);

    // (4) expire — on a second, still-pending invite.
    const second = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'leak-late@example.com' },
    });
    expect(second.statusCode).toBe(201);
    const expired = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations/${second.json().invitation.id}/expire`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(expired.statusCode).toBe(200);
    assertNoTokenLeak('expire', expired);

    await app.close();
  });

  it('throttles invitation resends to once per minute per invite', async () => {
    const store = new TestApiStore();
    const emailProvider = new TestEmailProvider();
    const app = await buildTestApiApp({ store, emailProvider });
    const owner = await register(app, { email: 'throttle-owner@example.com', organizationName: 'Throttle Org' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });

    const createInvite = async (email: string) => {
      const created = await app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/invitations`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { email, roleKey: 'member' },
      });
      expect(created.statusCode).toBe(201);

      return created.json().invitation.id as string;
    };
    const resend = (inviteId: string) =>
      app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/invitations/${inviteId}/resend`,
        headers: { authorization: `Bearer ${owner.token}` },
      });

    const firstInviteId = await createInvite('throttled@example.com');

    const firstResend = await resend(firstInviteId);
    expect(firstResend.statusCode).toBe(200);

    // Second resend of the SAME invite within the cooldown window → 429.
    const secondResend = await resend(firstInviteId);
    expect(secondResend.statusCode).toBe(429);
    expect(secondResend.json().code).toBe('INVITE_RESEND_THROTTLED');
    expect(Number(secondResend.headers['retry-after'])).toBeGreaterThanOrEqual(1);

    // The cooldown is per invite: a different invite resends fine immediately.
    const otherInviteId = await createInvite('not-throttled@example.com');
    const otherResend = await resend(otherInviteId);
    expect(otherResend.statusCode).toBe(200);

    await app.close();
  });

  it('binds invitation acceptance to the invited email (rejects a different user)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'bind-owner@example.com', organizationName: 'Bind Org' });
    const attacker = await register(app, { email: 'bind-attacker@example.com', organizationName: 'Attacker Org' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/invitations`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'bind-invitee@example.com', roleKey: 'admin' },
    });
    expect(created.statusCode).toBe(201);

    // A user whose email differs from the invite recipient must not be able to
    // redeem a leaked token (which would also grant the invite's role).
    const stolen = await app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: { token: created.json().token },
    });
    expect(stolen.statusCode).toBe(403);
    expect(stolen.json().code).toBe('INVITE_EMAIL_MISMATCH');
    expect(await store.getMembership(attacker.user.id, owner.organization.id)).toBeUndefined();
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
    // Invite acceptance now requires a verified email.
    await store.updateUser({ userId: invitee.user.id, emailVerifiedAt: new Date().toISOString() });

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

  it('transfers organization ownership atomically and guards the transfer endpoint', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'transfer-owner@example.com', organizationName: 'Transfer Org' });
    const adminUser = await register(app, {
      email: 'transfer-admin@example.com',
      organizationName: 'Transfer Admin Org',
    });
    const outsider = await register(app, {
      email: 'transfer-outsider@example.com',
      organizationName: 'Transfer Outsider Org',
    });
    await store.addMember({ organizationId: owner.organization.id, userId: adminUser.user.id, roleKey: 'admin' });

    // An admin (members:manage, but not owner) must not be able to grab ownership.
    const adminAttempt = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/memberships/${adminUser.user.id}/transfer-ownership`,
      headers: { authorization: `Bearer ${adminUser.token}` },
    });
    expect(adminAttempt.statusCode).toBe(403);

    // Transferring to yourself is a no-op error.
    const selfAttempt = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/memberships/${owner.user.id}/transfer-ownership`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(selfAttempt.statusCode).toBe(400);

    // Target must already be a member of the org.
    const nonMemberAttempt = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/memberships/${outsider.user.id}/transfer-ownership`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(nonMemberAttempt.statusCode).toBe(404);

    // Real transfer: target promoted to owner, caller demoted to admin, atomically.
    const transfer = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/memberships/${adminUser.user.id}/transfer-ownership`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(transfer.statusCode).toBe(200);
    expect(transfer.json().membership.roleKey).toBe('owner');
    expect(transfer.json().previousOwner.roleKey).toBe('admin');
    expect((await store.getMembership(adminUser.user.id, owner.organization.id))?.roleKey).toBe('owner');
    expect((await store.getMembership(owner.user.id, owner.organization.id))?.roleKey).toBe('admin');

    // The demoted previous owner can no longer demote the new owner.
    const demoteNewOwner = await app.inject({
      method: 'PATCH',
      url: `/orgs/${owner.organization.id}/memberships/${adminUser.user.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { roleKey: 'member' },
    });
    expect(demoteNewOwner.statusCode).toBe(403);

    await app.close();
  });

  it('blocks an org admin from minting a custom role with permissions they do not hold', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'esc-owner@example.com', organizationName: 'Escalation Org' });
    const adminUser = await register(app, { email: 'esc-admin@example.com', organizationName: 'Escalation Admin Org' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });
    await store.addMember({ organizationId: owner.organization.id, userId: adminUser.user.id, roleKey: 'admin' });

    // admin holds roles:manage but NOT billing:manage — attempting to grant it
    // into a custom role is a privilege-escalation attempt and must be rejected.
    const escalated = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/roles`,
      headers: { authorization: `Bearer ${adminUser.token}` },
      payload: { key: 'super-admin', name: 'Super Admin', permissions: ['roles:manage', 'billing:manage'] },
    });
    expect(escalated.statusCode).toBe(403);
    expect(escalated.json().code).toBe('RBAC_PRIVILEGE_ESCALATION');

    // A role containing only permissions the admin actually holds is allowed.
    const allowed = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/roles`,
      headers: { authorization: `Bearer ${adminUser.token}` },
      payload: { key: 'project-lead', name: 'Project Lead', permissions: ['projects:read', 'projects:write'] },
    });
    expect(allowed.statusCode).toBe(201);

    // The owner (who holds everything) can still create the elevated role.
    const ownerCreates = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/roles`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { key: 'billing-admin', name: 'Billing Admin', permissions: ['billing:manage'] },
    });
    expect(ownerCreates.statusCode).toBe(201);
    await app.close();
  });

  it('uses well-known authorization URL defaults for Google when only the client id is set', async () => {
    /*
     * Reproduces the prod gap: operators provisioned GOOGLE_CLIENT_ID
     * but not GOOGLE_OAUTH_AUTHORIZATION_URL, so /auth/oauth/google/start
     * returned `ready:true` with `authorizationUrl:null` and the web
     * route bounced to /login?error=not_configured. The well-known
     * provider map should fill in the canonical Google endpoints so
     * `client_id` alone is enough to make the start endpoint usable.
     */
    const original = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      authorizationUrl: process.env.GOOGLE_OAUTH_AUTHORIZATION_URL,
      legacyAuthorizationUrl: process.env.GOOGLE_AUTHORIZATION_URL,
      githubClientId: process.env.GITHUB_CLIENT_ID,
      githubAuthorizationUrl: process.env.GITHUB_OAUTH_AUTHORIZATION_URL,
    };

    delete process.env.GOOGLE_OAUTH_AUTHORIZATION_URL;
    delete process.env.GOOGLE_AUTHORIZATION_URL;
    delete process.env.GITHUB_OAUTH_AUTHORIZATION_URL;
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GITHUB_CLIENT_ID = 'test-github-client-id';

    try {
      const app = await buildTestApiApp({ store: new TestApiStore() });

      const google = await app.inject({ method: 'GET', url: '/auth/oauth/google/start' });
      expect(google.statusCode).toBe(200);

      const googlePayload = google.json() as { ready: boolean; authorizationUrl: string | null };
      expect(googlePayload.ready).toBe(true);
      expect(googlePayload.authorizationUrl).toBeTruthy();

      const googleUrl = new URL(googlePayload.authorizationUrl!);
      expect(googleUrl.origin).toBe('https://accounts.google.com');
      expect(googleUrl.pathname).toBe('/o/oauth2/v2/auth');
      expect(googleUrl.searchParams.get('client_id')).toBe('test-google-client-id');
      expect(googleUrl.searchParams.get('scope')).toBe('openid email profile');
      expect(googleUrl.searchParams.get('response_type')).toBe('code');
      expect(googleUrl.searchParams.get('state')).toBeTruthy();

      const github = await app.inject({ method: 'GET', url: '/auth/oauth/github/start' });
      const githubPayload = github.json() as { ready: boolean; authorizationUrl: string | null };
      expect(githubPayload.ready).toBe(true);

      const githubUrl = new URL(githubPayload.authorizationUrl!);
      expect(githubUrl.origin).toBe('https://github.com');
      expect(githubUrl.pathname).toBe('/login/oauth/authorize');
      expect(githubUrl.searchParams.get('client_id')).toBe('test-github-client-id');
      expect(githubUrl.searchParams.get('scope')).toBe('read:user user:email');

      await app.close();
    } finally {
      restoreEnv('GOOGLE_CLIENT_ID', original.clientId);
      restoreEnv('GOOGLE_OAUTH_AUTHORIZATION_URL', original.authorizationUrl);
      restoreEnv('GOOGLE_AUTHORIZATION_URL', original.legacyAuthorizationUrl);
      restoreEnv('GITHUB_CLIENT_ID', original.githubClientId);
      restoreEnv('GITHUB_OAUTH_AUTHORIZATION_URL', original.githubAuthorizationUrl);
    }
  });

  describe('GitHub OAuth code exchange', () => {
    const originalEnv = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      redirectUri: process.env.GITHUB_REDIRECT_URI,
      userAgent: process.env.GITHUB_USER_AGENT,
      emailsUrl: process.env.GITHUB_USERINFO_EMAILS_URL,
    };

    afterEach(() => {
      restoreEnv('GITHUB_CLIENT_ID', originalEnv.clientId);
      restoreEnv('GITHUB_CLIENT_SECRET', originalEnv.clientSecret);
      restoreEnv('GITHUB_REDIRECT_URI', originalEnv.redirectUri);
      restoreEnv('GITHUB_USER_AGENT', originalEnv.userAgent);
      restoreEnv('GITHUB_USERINFO_EMAILS_URL', originalEnv.emailsUrl);
      vi.restoreAllMocks();
    });

    // The OAuth code flow now requires a valid (HMAC-signed) state for login-CSRF
    // protection, mirroring the real client which always carries the state issued by
    // /auth/oauth/github/start. Pull a genuine state from the start endpoint.
    const githubState = async (app: Awaited<ReturnType<typeof buildTestApiApp>>) => {
      const start = await app.inject({ method: 'GET', url: '/auth/oauth/github/start' });
      return new URL((start.json() as { authorizationUrl: string }).authorizationUrl).searchParams.get(
        'state',
      ) as string;
    };

    it('falls back to /user/emails when GitHub returns a null email for a private profile', async () => {
      process.env.GITHUB_CLIENT_ID = 'gh-code-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'gh-code-client-secret';
      process.env.GITHUB_REDIRECT_URI = 'https://app.e-code.ai/auth/oauth/github/callback';
      process.env.GITHUB_USER_AGENT = 'vibecore-test-agent';

      const store = new TestApiStore();
      const app = await buildTestApiApp({ store });

      const requests: Array<{ url: string; init?: RequestInit }> = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
        requests.push({ url, init });

        if (url === 'https://github.com/login/oauth/access_token') {
          return new Response(
            JSON.stringify({ access_token: 'gh-access-token', token_type: 'bearer', scope: 'read:user,user:email' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url === 'https://api.github.com/user') {
          return new Response(
            JSON.stringify({ id: 4242, login: 'octocat-private', name: 'Octo Private', email: null }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url === 'https://api.github.com/user/emails') {
          return new Response(
            JSON.stringify([
              { email: 'noreply@users.github.com', primary: false, verified: true },
              { email: 'octo@example.com', primary: true, verified: true },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        throw new Error(`Unexpected fetch in GitHub OAuth test: ${url}`);
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/oauth/github/callback',
        payload: { code: 'gh-auth-code', state: await githubState(app) },
      });

      expect(response.statusCode).toBe(200);

      const result = response.json() as { token: string; user: { email: string } };
      expect(result.user.email).toBe('octo@example.com');

      const stored = await store.findUserByEmail('octo@example.com');
      expect(stored).toBeTruthy();

      const tokenRequest = requests.find((entry) => entry.url === 'https://github.com/login/oauth/access_token');
      expect(tokenRequest).toBeTruthy();

      const tokenBody = String(tokenRequest!.init?.body ?? '');
      expect(tokenBody).toContain('code=gh-auth-code');
      expect(tokenBody).toContain('client_id=gh-code-client-id');
      expect(tokenBody).toContain('client_secret=gh-code-client-secret');
      expect(tokenBody).toContain('redirect_uri=https%3A%2F%2Fapp.e-code.ai%2Fauth%2Foauth%2Fgithub%2Fcallback');

      const userRequest = requests.find((entry) => entry.url === 'https://api.github.com/user');
      expect(userRequest).toBeTruthy();

      const userHeaders = new Headers((userRequest!.init?.headers ?? {}) as Record<string, string>);
      expect(userHeaders.get('authorization')).toBe('Bearer gh-access-token');
      expect(userHeaders.get('user-agent')).toBe('vibecore-test-agent');
      expect(userHeaders.get('accept')).toBe('application/vnd.github+json');

      const emailsRequest = requests.find((entry) => entry.url === 'https://api.github.com/user/emails');
      expect(emailsRequest).toBeTruthy();

      const emailHeaders = new Headers((emailsRequest!.init?.headers ?? {}) as Record<string, string>);
      expect(emailHeaders.get('authorization')).toBe('Bearer gh-access-token');

      await app.close();
    });

    it('uses the email returned by /user without an extra /user/emails request', async () => {
      process.env.GITHUB_CLIENT_ID = 'gh-public-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'gh-public-client-secret';

      const store = new TestApiStore();
      const app = await buildTestApiApp({ store });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);

        if (url === 'https://github.com/login/oauth/access_token') {
          return new Response(JSON.stringify({ access_token: 'gh-public-token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url === 'https://api.github.com/user') {
          return new Response(
            JSON.stringify({ id: 7, login: 'octocat-public', name: 'Octo Public', email: 'public@example.com' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/oauth/github/callback',
        payload: { code: 'gh-public-code', state: await githubState(app) },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { user: { email: string } }).user.email).toBe('public@example.com');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      await app.close();
    });

    it('returns OAUTH_PROFILE_INCOMPLETE when GitHub has no usable email and /user/emails fails', async () => {
      process.env.GITHUB_CLIENT_ID = 'gh-noemail-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'gh-noemail-client-secret';

      const store = new TestApiStore();
      const app = await buildTestApiApp({ store });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);

        if (url === 'https://github.com/login/oauth/access_token') {
          return new Response(JSON.stringify({ access_token: 'gh-noemail-token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url === 'https://api.github.com/user') {
          return new Response(JSON.stringify({ id: 13, login: 'no-email', email: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url === 'https://api.github.com/user/emails') {
          return new Response('forbidden', { status: 403 });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/oauth/github/callback',
        payload: { code: 'gh-noemail-code', state: await githubState(app) },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'OAUTH_PROFILE_INCOMPLETE' });
      await app.close();
    });

    it('rejects an OAuth code flow that omits the state parameter (login-CSRF protection)', async () => {
      process.env.GITHUB_CLIENT_ID = 'gh-code-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'gh-code-client-secret';
      process.env.GITHUB_REDIRECT_URI = 'https://app.e-code.ai/auth/oauth/github/callback';

      const store = new TestApiStore();
      const app = await buildTestApiApp({ store });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/oauth/github/callback',
        payload: { code: 'gh-auth-code' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'OAUTH_STATE_INVALID' });
      await app.close();
    });
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

    const oauthToken = oauth.json().token as string;

    const connections = await app.inject({
      method: 'GET',
      url: '/auth/connections',
      headers: { authorization: `Bearer ${oauthToken}` },
    });
    expect(connections.statusCode).toBe(200);

    const connectionList = connections.json().connections as Array<{ provider: string; externalId: string }>;
    expect(connectionList).toHaveLength(1);
    expect(connectionList[0]).toMatchObject({ provider: 'github', externalId: 'gh_1' });

    const oidc = await app.inject({
      method: 'POST',
      url: '/auth/oidc/callback',
      payload: { email: 'oidc@example.com', externalId: 'entra_1', accessToken: 'oidc-token', name: 'OIDC User' },
    });
    expect(oidc.statusCode).toBe(200);

    const owner = await register(app, { email: 'saml-owner@example.com', organizationName: 'SAML Org' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });
    // SAML now binds the asserted email to a domain the org has verified ownership of.
    await store.createDomainVerification({
      organizationId: owner.organization.id,
      domain: 'example.com',
      verificationToken: 'domain-tok',
    });
    await store.verifyDomain({ organizationId: owner.organization.id, domain: 'example.com' });

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

  it('rejects a SAML XML Signature Wrapping attack (injected assertion is not honored)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'xsw-owner@example.com', organizationName: 'XSW Org' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });

    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const certificate = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    await reauth(app, owner.token);
    await app.inject({
      method: 'PUT',
      url: `/orgs/${owner.organization.id}/sso/saml`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { entityId: 'urn:test:idp', ssoUrl: 'https://idp.example.com/sso', x509Certificate: certificate },
    });

    // A legitimately-signed assertion for a low-privilege user…
    const realAssertionXml =
      '<Assertion><Subject><NameID>xsw-real@example.com</NameID></Subject><AttributeStatement><Attribute Name="externalId"><AttributeValue>xsw_real</AttributeValue></Attribute></AttributeStatement></Assertion>';
    const signature = createSign('RSA-SHA256').update(realAssertionXml).end().sign(privateKey, 'base64');

    // …wrapped around an attacker-injected (unsigned) assertion claiming the victim.
    const injectedAssertionXml =
      '<Assertion><Subject><NameID>xsw-victim@example.com</NameID></Subject><AttributeStatement><Attribute Name="externalId"><AttributeValue>xsw_victim</AttributeValue></Attribute></AttributeStatement></Assertion>';
    const wrapped = Buffer.from(
      `<Response>${injectedAssertionXml}${realAssertionXml}<Signature><SignatureValue>${signature}</SignatureValue></Signature></Response>`,
      'utf8',
    ).toString('base64url');

    const attack = await app.inject({
      method: 'POST',
      url: `/auth/saml/${owner.organization.id}/acs`,
      payload: { SAMLResponse: wrapped },
    });

    // The injected NameID must never authenticate, and no victim account is created.
    expect(attack.statusCode).toBe(401);
    expect(await store.findUserByEmail('xsw-victim@example.com')).toBeFalsy();
    await app.close();
  });

  it('rejects a replayed SAML assertion (one-time use)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, { email: 'replay-owner@example.com', organizationName: 'Replay Org' });
    await store.upsertSubscription({ organizationId: owner.organization.id, planKey: 'team', status: 'ACTIVE' });
    const orgId = owner.organization.id;
    // SAML now binds the asserted email to a verified org domain.
    await store.createDomainVerification({
      organizationId: orgId,
      domain: 'example.com',
      verificationToken: 'domain-tok',
    });
    await store.verifyDomain({ organizationId: orgId, domain: 'example.com' });

    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const certificate = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    await reauth(app, owner.token);
    await app.inject({
      method: 'PUT',
      url: `/orgs/${orgId}/sso/saml`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { entityId: 'urn:test:idp', ssoUrl: 'https://idp.example.com/sso', x509Certificate: certificate },
    });

    const notOnOrAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const assertionXml =
      `<Assertion ID="_replay-assert-1"><Subject><NameID>replay-user@example.com</NameID></Subject>` +
      `<Conditions NotOnOrAfter="${notOnOrAfter}"><AudienceRestriction><Audience>vibecore:${orgId}</Audience></AudienceRestriction></Conditions>` +
      `<AttributeStatement><Attribute Name="externalId"><AttributeValue>replay_1</AttributeValue></Attribute></AttributeStatement></Assertion>`;
    const signature = createSign('RSA-SHA256').update(assertionXml).end().sign(privateKey, 'base64');
    const samlResponse = Buffer.from(
      `<Response>${assertionXml}<Signature><SignatureValue>${signature}</SignatureValue></Signature></Response>`,
      'utf8',
    ).toString('base64url');

    const first = await app.inject({
      method: 'POST',
      url: `/auth/saml/${orgId}/acs`,
      payload: { SAMLResponse: samlResponse },
    });
    expect(first.statusCode).toBe(200);

    // Same assertion replayed within its validity window must be rejected.
    const replay = await app.inject({
      method: 'POST',
      url: `/auth/saml/${orgId}/acs`,
      payload: { SAMLResponse: samlResponse },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe('SAML_ASSERTION_REPLAYED');
    await app.close();
  });

  it('bootstraps and manages platform administrators with MFA and re-authentication', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'platform@example.com';

    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const platform = await register(app, { email: 'platform@example.com', organizationName: 'Platform Org' });
    // Platform-admin bootstrap is now applied only after email ownership is proven.
    await verifyEmail(app, platform.verificationToken);
    const target = await register(app, { email: 'target-admin@example.com', organizationName: 'Target Org' });

    const blocked = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${target.user.id}/platform-admin`,
      headers: { authorization: `Bearer ${platform.token}` },
      payload: { platformAdmin: true },
    });
    expect(blocked.statusCode).toBe(403);

    // MFA enrollment now requires a recent re-auth.
    await reauth(app, platform.token);
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
    await verifyEmail(app, admin.verificationToken);

    await reauth(app, admin.token);
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
    await verifyEmail(app, admin.verificationToken);

    const customer = await register(app, {
      email: 'billing-customer@example.com',
      organizationName: 'Billing Customer Org',
    });
    await reauth(app, admin.token);
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

  it('redacts scoped audit-log PII (no longer a no-op) and reports a real count', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'redact-admin@example.com';

    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const admin = await register(app, { email: 'redact-admin@example.com', organizationName: 'Redact Admin Org' });
    await verifyEmail(app, admin.verificationToken);

    const customer = await register(app, {
      email: 'redact-customer@example.com',
      organizationName: 'Redact Customer Org',
    });

    // Seed two audit rows carrying PII (ipAddress) for the customer org.
    await store.recordAudit({
      organizationId: customer.organization.id,
      actorUserId: customer.user.id,
      action: 'project.create',
      resourceType: 'project',
      ipAddress: '203.0.113.7',
    });
    await store.recordAudit({
      organizationId: customer.organization.id,
      actorUserId: customer.user.id,
      action: 'project.delete',
      resourceType: 'project',
      ipAddress: '203.0.113.8',
    });

    await reauth(app, admin.token);
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

    // A selector is mandatory — an unscoped request is rejected.
    const unscoped = await app.inject({
      method: 'POST',
      url: '/admin/logs/redact',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {},
    });
    expect(unscoped.statusCode).toBe(400);

    const redact = await app.inject({
      method: 'POST',
      url: '/admin/logs/redact',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { organizationId: customer.organization.id },
    });
    expect(redact.statusCode).toBe(200);
    // At least the two PII rows we seeded (registration may add its own audit rows).
    expect(redact.json().redacted).toBeGreaterThanOrEqual(2);

    const rows = await store.listAuditLogs(customer.organization.id);
    expect(rows.every((row) => row.ipAddress == null)).toBe(true);

    // Idempotent: a second pass redacts nothing.
    const again = await app.inject({
      method: 'POST',
      url: '/admin/logs/redact',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { organizationId: customer.organization.id },
    });
    expect(again.json().redacted).toBe(0);

    delete process.env.PLATFORM_ADMIN_EMAILS;
    await app.close();
  });

  it('requires re-authentication and records admin audit logs for manual abuse events', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'abuse-admin@example.com';

    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const admin = await register(app, { email: 'abuse-admin@example.com', organizationName: 'Abuse Admin Org' });
    await verifyEmail(app, admin.verificationToken);

    const customer = await register(app, {
      email: 'abuse-customer@example.com',
      organizationName: 'Abuse Customer Org',
    });

    /*
     * Enable MFA directly so this test's session stays NON-reauthed — exercising
     * the reauth gate below. (The /auth/mfa/setup endpoint now itself requires a
     * recent reauth, which would otherwise mark the session reauthenticated.)
     */
    await store.updateUser({ userId: admin.user.id, mfaEnabled: true, mfaSecretEncrypted: 'test-secret' });

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

    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const admin = await register(app, { email: 'danger-admin@example.com', organizationName: 'Danger Org' });
    await verifyEmail(app, admin.verificationToken);

    // Enable MFA directly so the session stays non-reauthed (setup now needs reauth).
    await store.updateUser({ userId: admin.user.id, mfaEnabled: true, mfaSecretEncrypted: 'test-secret' });

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
    await verifyEmail(app, admin.verificationToken);

    await reauth(app, admin.token);
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

    // MFA enrollment + recovery-code rotation now require a recent re-auth.
    await reauth(app, auth.token);
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

    const statusBefore = await app.inject({
      method: 'GET',
      url: '/auth/recovery-codes/status',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(statusBefore.statusCode).toBe(200);
    expect(statusBefore.json()).toMatchObject({ remaining: 0, total: 10 });

    const recovery = await app.inject({
      method: 'POST',
      url: '/auth/recovery-codes',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(recovery.statusCode).toBe(200);
    expect(recovery.json().codes).toHaveLength(10);
    // The status endpoint reflects the freshly-minted set and never leaks the codes themselves.
    const statusAfter = await app.inject({
      method: 'GET',
      url: '/auth/recovery-codes/status',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(statusAfter.statusCode).toBe(200);
    expect(statusAfter.json()).toEqual({ remaining: 10, total: 10 });
    expect(JSON.stringify(statusAfter.json())).not.toContain(recovery.json().codes[0]);
    await app.close();
  });

  it('requires MFA at login once TOTP is enabled', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'mfa-login@example.com' });

    // MFA enrollment + recovery-code rotation now require a recent re-auth.
    await reauth(app, auth.token);
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
    // SCIM now binds the provisioned email to a domain the org has verified (like SAML).
    await store.createDomainVerification({
      organizationId: auth.organization.id,
      domain: 'example.com',
      verificationToken: 'domain-tok',
    });
    await store.verifyDomain({ organizationId: auth.organization.id, domain: 'example.com' });
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

    // A userName on a domain the org has NOT verified must be rejected (no
    // grafting arbitrary accounts into the org via SCIM).
    const rejected = await app.inject({
      method: 'POST',
      url: `/scim/v2/${auth.organization.id}/Users`,
      headers: { authorization: `Bearer ${token}` },
      payload: { userName: 'outsider@unverified.com', active: true },
    });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().code).toBe('SCIM_EMAIL_DOMAIN_NOT_VERIFIED');
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

  it('verifies Resend webhooks, persists delivery events idempotently, and rejects bad signatures', async () => {
    const previousSecret = process.env.RESEND_WEBHOOK_SECRET;

    /*
     * Random 24-byte secret encoded as base64 — matches the shape of a real
     * Resend signing secret without leaking one from the dashboard.
     */
    const secretBytes = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef');
    const whsec = `whsec_${secretBytes.toString('base64')}`;
    process.env.RESEND_WEBHOOK_SECRET = whsec;

    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    try {
      const bouncedBody = JSON.stringify({
        type: 'email.bounced',
        created_at: '2026-05-20T12:00:00.000Z',
        data: {
          email_id: 'em_test_bounce',
          from: 'no-reply@e-code.ai',
          to: ['Bouncy@example.com'],
          subject: 'Verify your email',
          bounce: { subType: 'permanent', message: 'mailbox full' },
        },
      });

      const ts = Math.floor(Date.now() / 1000);
      const svixId = 'msg_resend_bounce_1';

      const missingHeaders = await app.inject({
        method: 'POST',
        url: '/webhooks/resend',
        headers: { 'content-type': 'application/json' },
        payload: Buffer.from(bouncedBody),
      });
      expect(missingHeaders.statusCode).toBe(401);
      expect(missingHeaders.json().code).toBe('WEBHOOK_SIGNATURE_MISSING');

      const badSignature = await app.inject({
        method: 'POST',
        url: '/webhooks/resend',
        headers: {
          'content-type': 'application/json',
          'svix-id': svixId,
          'svix-timestamp': String(ts),
          'svix-signature': 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        },
        payload: Buffer.from(bouncedBody),
      });
      expect(badSignature.statusCode).toBe(401);
      expect(badSignature.json().code).toBe('WEBHOOK_SIGNATURE_INVALID');

      const staleTimestamp = await app.inject({
        method: 'POST',
        url: '/webhooks/resend',
        headers: {
          'content-type': 'application/json',
          'svix-id': svixId,
          'svix-timestamp': String(ts - 60 * 60),
          'svix-signature': svixSignature({
            id: svixId,
            timestampSeconds: ts - 60 * 60,
            body: bouncedBody,
            secretWhsec: whsec,
          }),
        },
        payload: Buffer.from(bouncedBody),
      });
      expect(staleTimestamp.statusCode).toBe(401);
      expect(staleTimestamp.json().code).toBe('WEBHOOK_TIMESTAMP_SKEW');

      const valid = await app.inject({
        method: 'POST',
        url: '/webhooks/resend',
        headers: {
          'content-type': 'application/json',
          'svix-id': svixId,
          'svix-timestamp': String(ts),
          'svix-signature': svixSignature({
            id: svixId,
            timestampSeconds: ts,
            body: bouncedBody,
            secretWhsec: whsec,
          }),
        },
        payload: Buffer.from(bouncedBody),
      });
      expect(valid.statusCode).toBe(200);
      expect(valid.json()).toMatchObject({
        received: true,
        provider: 'resend',
        eventType: 'email.bounced',
        duplicate: false,
      });

      expect(store.emailDeliveryEvents).toHaveLength(1);

      const persisted = store.emailDeliveryEvents[0]!;
      expect(persisted.email).toBe('bouncy@example.com');
      expect(persisted.emailMessageId).toBe('em_test_bounce');
      expect(persisted.subject).toBe('Verify your email');
      expect(persisted.fromAddress).toBe('no-reply@e-code.ai');
      expect(persisted.type).toBe('email.bounced');
      expect(persisted.providerEventId).toBe(svixId);

      const replay = await app.inject({
        method: 'POST',
        url: '/webhooks/resend',
        headers: {
          'content-type': 'application/json',
          'svix-id': svixId,
          'svix-timestamp': String(ts),
          'svix-signature': svixSignature({
            id: svixId,
            timestampSeconds: ts,
            body: bouncedBody,
            secretWhsec: whsec,
          }),
        },
        payload: Buffer.from(bouncedBody),
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().duplicate).toBe(true);
      expect(store.emailDeliveryEvents).toHaveLength(1);

      const deliveredBody = JSON.stringify({
        type: 'email.delivered',
        created_at: '2026-05-20T12:01:00.000Z',
        data: {
          email_id: 'em_test_delivered',
          from: 'no-reply@e-code.ai',
          to: ['Reach@example.com'],
          subject: 'Welcome to e-code',
        },
      });

      const deliveredId = 'msg_resend_delivered_1';

      const delivered = await app.inject({
        method: 'POST',
        url: '/webhooks/resend',
        headers: {
          'content-type': 'application/json',
          'svix-id': deliveredId,
          'svix-timestamp': String(ts),
          'svix-signature': svixSignature({
            id: deliveredId,
            timestampSeconds: ts,
            body: deliveredBody,
            secretWhsec: whsec,
          }),
        },
        payload: Buffer.from(deliveredBody),
      });
      expect(delivered.statusCode).toBe(200);
      expect(delivered.json().eventType).toBe('email.delivered');
      expect(store.emailDeliveryEvents).toHaveLength(2);

      const queried = await store.listEmailDeliveryEvents({ email: 'reach@example.com' });
      expect(queried).toHaveLength(1);
      expect(queried[0]!.type).toBe('email.delivered');

      expect(store.auditLogs.some((log) => log.action === 'email.delivery_event.received')).toBe(true);
    } finally {
      restoreEnv('RESEND_WEBHOOK_SECRET', previousSecret);
      await app.close();
    }
  });

  it('returns 503 from /webhooks/resend when RESEND_WEBHOOK_SECRET is unset', async () => {
    const previousSecret = process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.RESEND_WEBHOOK_SECRET;

    const app = await buildTestApiApp({ store: new TestApiStore() });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/resend',
        headers: { 'content-type': 'application/json' },
        payload: Buffer.from('{}'),
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('WEBHOOK_NOT_CONFIGURED');
    } finally {
      restoreEnv('RESEND_WEBHOOK_SECRET', previousSecret);
      await app.close();
    }
  });

  it('blocks quota exceeded actions and allows audited quota overrides', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'quota@example.com', organizationName: 'Quota Org' });

    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'free', status: 'ACTIVE' });

    /*
     * Le plan gratuit n'a PLUS de plafond de projets inventé (l'ancien « 3 »
     * était sans source). Ce test porte sur le MÉCANISME de quota et sur les
     * overrides : on pose donc explicitement un plafond administratif de 3, puis
     * on vérifie qu'il bloque et qu'un override ultérieur le relève.
     */
    await store.createQuotaOverride({
      organizationId: auth.organization.id,
      key: 'projects.count',
      limit: 3,
      reason: 'plafond administratif pour ce test',
      createdByUserId: auth.user.id,
    });

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

    // An org owner must NOT be able to self-grant quota: creating an override is
    // a billing-bypass and is now a platform-admin-only action.
    const selfGrant = await app.inject({
      method: 'POST',
      url: `/admin/orgs/${auth.organization.id}/quota-overrides`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { key: 'projects.count', limit: 4, reason: 'contract expansion' },
    });
    expect(selfGrant.statusCode).toBe(403);

    // A legitimately-granted override (seeded as a platform admin would) raises
    // the effective limit so the previously-blocked action now succeeds.
    await store.createQuotaOverride({
      organizationId: auth.organization.id,
      key: 'projects.count',
      limit: 4,
      reason: 'contract expansion',
      createdByUserId: auth.user.id,
    });

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

  it('short-circuits FREE and ENTERPRISE checkout without hitting Stripe', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'no-checkout@example.com', organizationName: 'No Checkout Org' });

    try {
      const free = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/billing/checkout`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          planKey: 'free',
          successUrl: 'https://app.example.com/billing/success',
          cancelUrl: 'https://app.example.com/billing/cancel',
        },
      });
      expect(free.statusCode).toBe(400);
      expect(free.json().code).toBe('STRIPE_FREE_NO_CHECKOUT');

      const enterprise = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/billing/checkout`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          planKey: 'enterprise',
          successUrl: 'https://app.example.com/billing/success',
          cancelUrl: 'https://app.example.com/billing/cancel',
        },
      });
      expect(enterprise.statusCode).toBe(400);
      expect(enterprise.json().code).toBe('STRIPE_ENTERPRISE_CONTACT_SALES');
    } finally {
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

  it('lists Stripe invoices for the billing customer', async () => {
    const previousSecretKey = process.env.STRIPE_SECRET_KEY;
    const previousApiBase = process.env.STRIPE_API_BASE_URL;
    process.env.STRIPE_SECRET_KEY = 'sk_test_invoices';

    const requests: Array<{ url?: string }> = [];

    const stripeServer = createServer((request, response) => {
      requests.push({ url: request.url });
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: [
            {
              id: 'in_paid',
              number: 'VC-0001',
              status: 'paid',
              amount_due: 2000,
              amount_paid: 2000,
              currency: 'usd',
              created: 1_700_000_000,
              hosted_invoice_url: 'https://invoice.stripe.local/in_paid',
              invoice_pdf: 'https://invoice.stripe.local/in_paid.pdf',
            },
          ],
        }),
      );
    });

    await new Promise<void>((resolve) => stripeServer.listen(0, '127.0.0.1', () => resolve()));

    const address = stripeServer.address();

    if (typeof address !== 'object' || !address) {
      throw new Error('Local billing endpoint did not start');
    }

    process.env.STRIPE_API_BASE_URL = `http://127.0.0.1:${address.port}`;

    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'invoices@example.com', organizationName: 'Invoices Org' });
    await store.upsertBillingCustomer({
      organizationId: auth.organization.id,
      provider: 'stripe',
      externalId: 'cus_invoices',
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: `/orgs/${auth.organization.id}/billing/invoices`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.stripeConfigured).toBe(true);
      expect(body.invoices).toHaveLength(1);
      expect(body.invoices[0]).toMatchObject({
        id: 'in_paid',
        number: 'VC-0001',
        status: 'paid',
        amountDueCents: 2000,
        amountPaidCents: 2000,
        currency: 'usd',
        hostedInvoiceUrl: 'https://invoice.stripe.local/in_paid',
        invoicePdf: 'https://invoice.stripe.local/in_paid.pdf',
      });
      expect(body.invoices[0].createdAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
      expect(requests[0].url).toContain('/v1/invoices?');
      expect(requests[0].url).toContain('customer=cus_invoices');
    } finally {
      process.env.STRIPE_SECRET_KEY = previousSecretKey;
      process.env.STRIPE_API_BASE_URL = previousApiBase;
      await app.close();
      await new Promise<void>((resolve, reject) => stripeServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('returns an empty invoice list when no billing customer exists', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'no-invoices@example.com', organizationName: 'No Invoices Org' });

    try {
      const response = await app.inject({
        method: 'GET',
        url: `/orgs/${auth.organization.id}/billing/invoices`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().invoices).toEqual([]);
    } finally {
      await app.close();
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
      /*
       * Plus de plafond de projets inventé sur le plan gratuit : la valeur
       * annoncée doit être « pas de plafond d'offre », pas « 3 ».
       */
      expect(billing.json().limits['projects.count']).toBeGreaterThan(1000);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
      await app.close();
    }
  });

  it('scaffolds distinct, template-specific files for each curated template id (from-template)', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const app = await buildTestApiApp({ store, projectStorage });
    const auth = await register(app, { email: 'tpl-distinct@example.com', organizationName: 'Tpl Distinct Org' });
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'team', status: 'ACTIVE' });

    const createFromTemplate = async (templateName: string, name: string) => {
      const response = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/projects/from-template`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { name, templateName },
      });
      expect(response.statusCode).toBe(201);

      return response.json().project.id as string;
    };

    const signature = (projectId: string) =>
      [...(projectStorage.files.get(projectId) ?? new Map()).entries()]
        .map(([path, content]) => `${path}:${content.length}`)
        .sort()
        .join('|');

    const crmId = await createFromTemplate('react-saas', 'CRM App');
    const apiId = await createFromTemplate('fastify-api', 'API Monitor App');
    const dashId = await createFromTemplate('next-dashboard', 'Ops Dashboard App');

    const crmFiles = projectStorage.files.get(crmId)!;

    /*
     * The chosen template scaffolds its OWN application — not the identical
     * generic Vite shell every template produced before this fix.
     */
    expect(crmFiles.get('src/App.tsx')).toContain('data-gallery-app-id="react-saas"');
    expect(crmFiles.get('src/App.tsx')).not.toContain('Created from the Bolt template');
    expect(crmFiles.get('src/App.tsx')).not.toContain('Créé à partir du modèle Bolt');

    // Three different templates produce three genuinely different file sets.
    const signatures = new Set([signature(crmId), signature(apiId), signature(dashId)]);
    expect(signatures.size).toBe(3);

    /*
     * A templateName with no catalog entry still scaffolds a runnable project
     * (generic Vite fallback) rather than an empty one.
     */
    const fallbackId = await createFromTemplate('react-basic-starter', 'Fallback App');
    expect(projectStorage.files.get(fallbackId)?.size ?? 0).toBeGreaterThan(0);
    expect(projectStorage.files.get(fallbackId)?.get('package.json')).toBeDefined();
  });

  it('supports persistent project CRUD, settings, collaborators and soft delete restore', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const app = await buildTestApiApp({ store, projectStorage });
    const auth = await register(app, { email: 'projects@example.com', organizationName: 'Projects Org' });

    const create = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/from-template`,
      headers: { authorization: `Bearer ${auth.token}`, 'accept-language': 'fr-FR,fr;q=0.9' },
      payload: { name: 'Template App', templateName: 'react-basic-starter' },
    });
    expect(create.statusCode).toBe(201);

    const projectId = create.json().project.id as string;
    expect(create.json().project.slug).toBe('template-app');

    const canonicalResolve = await app.inject({
      method: 'GET',
      url: `/projects/resolve?accountSlug=${encodeURIComponent('@Projects Org')}&projectSlug=${encodeURIComponent(
        'Template App',
      )}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(canonicalResolve.statusCode).toBe(200);
    expect(canonicalResolve.json().project.id).toBe(projectId);
    expect(canonicalResolve.json().organization.slug).toBe('projects-org');
    expect(canonicalResolve.json().canonicalPath).toBe('/@projects-org/template-app');

    const dashboard = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/dashboard`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().files.length).toBeGreaterThan(0);
    expect(projectStorage.files.get(projectId)?.get('index.html')).toContain('<html lang="fr">');
    expect(projectStorage.files.get(projectId)?.get('src/App.tsx')).toContain('Créé à partir du modèle Bolt');

    const homepagePreview = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/homepage-preview.svg`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(homepagePreview.statusCode).toBe(200);
    expect(homepagePreview.headers['content-type']).toContain('image/svg+xml');
    expect(homepagePreview.body).toContain('Template App');
    expect(homepagePreview.body).toContain('Generated from the current homepage files');

    const frenchHomepagePreview = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/homepage-preview.svg`,
      headers: { authorization: `Bearer ${auth.token}`, 'accept-language': 'fr-FR,fr;q=0.9' },
    });
    expect(frenchHomepagePreview.statusCode).toBe(200);
    expect(frenchHomepagePreview.headers['content-language']).toBe('fr');
    expect(frenchHomepagePreview.headers.vary).toContain('Cookie');
    expect(frenchHomepagePreview.body).toContain('Dernier aperçu');
    expect(frenchHomepagePreview.body).toContain('Généré à partir des fichiers actuels');
    expect(frenchHomepagePreview.body).not.toContain('Generated from the current homepage files');

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
    expect(saveIdeState.json().ideState.version).toBe(2);

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

  it('protects concurrent ide-state writes with If-Match / 412 (Phase 0 #4)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'idestate-etag@example.com', organizationName: 'IDE State Etag Org' });

    const create = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/from-template`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Etag Concurrency App', templateName: 'react-basic-starter' },
    });
    expect(create.statusCode).toBe(201);

    const projectId = create.json().project.id as string;

    // Project scaffolds seed an internal file manifest at version 1; the first UI save bumps it.
    const seededState = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(seededState.statusCode).toBe(200);
    expect(seededState.json().ideState.version).toBe(1);
    expect(seededState.headers.etag).toBe('"1"');

    const firstSave = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { state: { ui: { agentWidth: 480 } } },
    });
    expect(firstSave.statusCode).toBe(200);
    expect(firstSave.json().ideState.version).toBe(2);
    expect(firstSave.headers.etag).toBe('"2"');

    // GET also surfaces the etag so the client can seed its If-Match state.
    const initialFetch = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(initialFetch.statusCode).toBe(200);
    expect(initialFetch.headers.etag).toBe('"2"');

    // PUT with matching If-Match -> success, version bumps to 3, new etag.
    const matchingSave = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}`, 'if-match': '"2"' },
      payload: { state: { ui: { agentWidth: 520 } } },
    });
    expect(matchingSave.statusCode).toBe(200);
    expect(matchingSave.json().ideState.version).toBe(3);
    expect(matchingSave.headers.etag).toBe('"3"');

    // Stale If-Match → 412 with the current state in the body so the client can re-merge.
    const staleSave = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}`, 'if-match': '"2"' },
      payload: { state: { ui: { agentWidth: 999 } } },
    });
    expect(staleSave.statusCode).toBe(412);
    expect(staleSave.headers.etag).toBe('"3"');

    const staleBody = staleSave.json();
    expect(staleBody.code).toBe('IDE_STATE_PRECONDITION_FAILED');
    expect(staleBody.ideState.version).toBe(3);
    expect(staleBody.ideState.state.ui.agentWidth).toBe(520);

    // The rejected write must not bump the version or land its payload.
    const afterStale = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(afterStale.json().ideState.version).toBe(3);
    expect(afterStale.json().ideState.state.ui.agentWidth).toBe(520);

    // Backward compatibility: requests without an If-Match header still work.
    const headerlessSave = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { state: { ui: { agentWidth: 540 } } },
    });
    expect(headerlessSave.statusCode).toBe(200);
    expect(headerlessSave.json().ideState.version).toBe(4);
    expect(headerlessSave.headers.etag).toBe('"4"');

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

    const shareToken = shareLink.json().token as string;
    const redeemer = await register(app, { email: 'collab-redeemer@example.com' });

    const redeem = await app.inject({
      method: 'GET',
      url: `/collaboration/share-links/${shareToken}`,
      headers: { authorization: `Bearer ${redeemer.token}` },
    });
    expect(redeem.statusCode).toBe(200);
    expect(redeem.json().valid).toBe(true);
    expect(redeem.json().redeemed).toBe(true);
    expect(redeem.json().share.roleKey).toBe('viewer');
    expect(redeem.json().share.projectId).toBe(projectId);

    // Redeeming again is idempotent — the role is not granted twice.
    const redeemAgain = await app.inject({
      method: 'GET',
      url: `/collaboration/share-links/${shareToken}`,
      headers: { authorization: `Bearer ${redeemer.token}` },
    });
    expect(redeemAgain.statusCode).toBe(200);
    expect(redeemAgain.json().redeemed).toBe(false);

    // The redeemer is now a collaborator on the shared project.
    const collaboratorsAfterRedeem = await store.listProjectCollaborators(projectId);
    expect(collaboratorsAfterRedeem.some((collaborator) => collaborator.userId === redeemer.user.id)).toBe(true);

    // An unknown token is rejected rather than silently accepted.
    const invalidRedeem = await app.inject({
      method: 'GET',
      url: `/collaboration/share-links/share_not-a-real-token`,
      headers: { authorization: `Bearer ${redeemer.token}` },
    });
    expect(invalidRedeem.statusCode).toBe(404);

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

  it('mints and reads server-stored, HMAC-signed chat shares (audit M5/M7)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const author = await register(app, { email: 'share-author@example.com', organizationName: 'Share Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${author.organization.id}/projects`,
      headers: { authorization: `Bearer ${author.token}` },
      payload: { name: 'Shared Chat Project' },
    });
    expect(project.statusCode).toBe(201);

    const projectId = project.json().project.id as string;

    const create = await app.inject({
      method: 'POST',
      url: '/chat-shares',
      headers: { authorization: `Bearer ${author.token}` },
      payload: {
        conversationId: 'conv-1',
        projectId,
        title: 'My run',
        visibleMessageIds: ['m1', 'm2'],
        inlineMessages: [
          { id: 'm1', role: 'user', content: 'hello' },
          { id: 'm2', role: 'assistant', content: 'hi there' },
        ],
        allowFork: true,
      },
    });
    expect(create.statusCode).toBe(201);

    const token = create.json().token as string;
    // Signed token = <raw>.<hmac>, and it is short — the conversation lives
    // server-side, not in the URL.
    expect(token).toContain('.');
    expect(token.length).toBeLessThan(200);

    // Public read (no auth) resolves the stored snapshot.
    const read = await app.inject({ method: 'GET', url: `/chat-shares/${token}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().share.title).toBe('My run');
    expect(read.json().share.allowFork).toBe(true);
    expect(read.json().share.payload.inlineMessages).toHaveLength(2);

    // A tampered signature is rejected.
    const tampered = `${token.slice(0, -3)}zzz`;
    const tamperedRead = await app.inject({ method: 'GET', url: `/chat-shares/${tampered}` });
    expect(tamperedRead.statusCode).toBe(404);

    // A forged token with a bogus signature is rejected.
    const forged = await app.inject({ method: 'GET', url: '/chat-shares/cshare_fake.deadbeef' });
    expect(forged.statusCode).toBe(404);

    // Creating a share requires authentication.
    const unauth = await app.inject({
      method: 'POST',
      url: '/chat-shares',
      payload: { conversationId: 'c', projectId: 'p' },
    });
    expect(unauth.statusCode).toBe(401);

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

  it('prefers replacement ZIP storage over recovered IDE state files', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const app = await buildTestApiApp({ store, projectStorage });
    const auth = await register(app, { email: 'zip-replace@example.com', organizationName: 'Zip Replace Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Replace Existing Project' },
    });
    expect(project.statusCode).toBe(201);

    const projectId = project.json().project.id as string;
    await store.upsertProjectIdeState({
      projectId,
      updatedByUserId: auth.user.id,
      state: {
        chat: {
          messages: [
            {
              content: `<boltArtifact id="old-app" title="Old App">
<boltAction type="file" filePath="package.json">
{"scripts":{"dev":"vite"}}
</boltAction>
<boltAction type="file" filePath="src/App.tsx">
export function App() { return 'Old app'; }
</boltAction>
</boltArtifact>`,
            },
          ],
        },
      },
    });

    const replacementZip = new JSZip();
    replacementZip.file('index.html', '<!doctype html><main data-replaced="true">Replacement app</main>');

    const replacementZipBase64 = (await replacementZip.generateAsync({ type: 'nodebuffer' })).toString('base64');

    const replaced = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/files/import/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { zipBase64: replacementZipBase64, replaceExisting: true },
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().files.map((file: { path: string }) => file.path)).toEqual(['index.html']);

    projectStorage.files.delete(projectId);

    const listed = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().files.map((file: { path: string }) => file.path)).toEqual(['index.html']);

    const exported = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/export/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(exported.statusCode).toBe(200);

    const archive = await JSZip.loadAsync(Buffer.from(exported.json().archive.base64, 'base64'));
    expect(Object.keys(archive.files)).toEqual(['index.html']);
    expect(await archive.file('index.html')!.async('string')).toContain('Replacement app');

    await app.close();
  });

  it('recovers new project scaffold files from persisted storage state when pod-local storage is empty', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const app = await buildTestApiApp({ store, projectStorage });

    const auth = await register(app, {
      email: 'scaffold-recovery@example.com',
      organizationName: 'Scaffold Recovery Org',
    });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Scaffold Recovery Project' },
    });
    expect(project.statusCode).toBe(201);

    const projectId = project.json().project.id as string;
    projectStorage.files.delete(projectId);

    const listed = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining(['package.json', 'src/App.tsx', 'README.md']),
    );

    const exported = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/export/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(exported.statusCode).toBe(200);

    const archive = await JSZip.loadAsync(Buffer.from(exported.json().archive.base64, 'base64'));
    expect(Object.keys(archive.files)).toEqual(expect.arrayContaining(['package.json', 'src/App.tsx', 'README.md']));

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

  it('restores snapshots from durable archive storage when pod-local objects are missing', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const app = await buildTestApiApp({ store, projectStorage });

    const auth = await register(app, {
      email: 'snapshot-durable-archive@example.com',
      organizationName: 'Snapshot Durable Archive Org',
    });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Durable Snapshot Project' },
    });
    expect(project.statusCode).toBe(201);

    const projectId = project.json().project.id as string;
    const seedZip = new JSZip();
    seedZip.file('README.md', '# Durable snapshot\nversion one\n');

    const imported = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/files/import/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { zipBase64: await seedZip.generateAsync({ type: 'base64' }), replaceExisting: true },
    });
    expect(imported.statusCode).toBe(200);

    const snapshot = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/snapshots`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { label: 'Durable checkpoint', kind: 'manual' },
    });
    expect(snapshot.statusCode).toBe(201);

    const storageKey = snapshot.json().snapshot.storageKey as string;
    expect(storageKey).toMatch(/^snapshots\//);
    expect(store.projectStorageObjects.get(storageKey)?.contentBase64).toBeTruthy();

    const changedZip = new JSZip();
    changedZip.file('README.md', '# Durable snapshot\nversion two\n');

    const changed = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/files/import/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { zipBase64: await changedZip.generateAsync({ type: 'base64' }), replaceExisting: true },
    });
    expect(changed.statusCode).toBe(200);

    projectStorage.objects.delete(storageKey);

    const restore = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/snapshots/${snapshot.json().snapshot.id}/restore`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(restore.statusCode).toBe(200);

    const exported = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/export/zip`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(exported.statusCode).toBe(200);

    const archive = await JSZip.loadAsync(Buffer.from(exported.json().archive.base64, 'base64'));
    expect(await archive.file('README.md')!.async('string')).toContain('version one');

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.body).toContain('project_snapshot_restore_fallbacks_total{backend="database"} 1');

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
    expect(zip.file('package.json')).toBeNull();
    expect(zip.file('src/App.tsx')).toBeNull();

    /*
     * BUG-QA-PROMPT-IN-README. This assertion used to be
     * `expect(readme).toContain(prompt)` — it locked IN the leak. The README is
     * a delivered project file (exported, committed, deployed, visible to every
     * collaborator), so the user's prompt must never reach it: prompts routinely
     * carry API keys and database URLs.
     */
    expect(readme).not.toContain(prompt);

    /*
     * …and the prompt must still be available to the IDE, which is what makes
     * the prompt->app flow work. It now travels through platform state, which is
     * never exported.
     */
    const ideState = await app.inject({
      method: 'GET',
      url: `/projects/${project.json().project.id}/ide-state`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(ideState.statusCode).toBe(200);
    expect(ideState.json().ideState.state.chat.pendingPrompt.prompt).toBe(prompt);

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
    const tempStaticRoot = await mkdtemp(join(tmpdir(), 'vibecore-static-deploy-'));
    const previous = process.env.STATIC_DEPLOY_STORAGE_DIR;
    process.env.STATIC_DEPLOY_STORAGE_DIR = tempStaticRoot;

    let fakeOutputDir: string | undefined;

    const app = await buildTestApiApp({
      store,
      staticBuildRunner: async (input) => {
        const root = await mkdtemp(join(tmpdir(), `vibecore-static-build-${input.projectId}-`));
        fakeOutputDir = join(root, 'dist');
        await mkdir(fakeOutputDir, { recursive: true });
        await writeFile(
          join(fakeOutputDir, 'index.html'),
          '<!doctype html><html><head><title>Deployed</title><link rel="stylesheet" href="/assets/main.css"></head><body><h1>Hello Vibecore</h1><script src="/assets/main.js"></script></body></html>',
          'utf8',
        );
        await mkdir(join(fakeOutputDir, 'assets'), { recursive: true });
        await writeFile(join(fakeOutputDir, 'assets', 'main.js'), 'console.log("vibecore");', 'utf8');
        await writeFile(join(fakeOutputDir, 'assets', 'main.css'), 'body { color: tomato; }', 'utf8');

        // Attacker-controlled build output: plant a symlink that escapes the
        // output dir to a host secret. fs.cp copies symlinks verbatim, so the
        // snapshot will contain it; the public serve route must NOT follow it.
        await writeFile(join(root, 'host-secret.txt'), 'TOP-SECRET-SYMLINK-LEAK', 'utf8');
        await symlink(join(root, 'host-secret.txt'), join(fakeOutputDir, 'leak.txt'));

        return {
          ok: true,
          outputDir: fakeOutputDir,
          logs: [{ timestamp: new Date().toISOString(), level: 'info', message: 'Static deploy: fake build OK' }],
        };
      },
    });

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
    expect(staticDeploy.json().deployment.url).toContain('/static-deployments/');
    expect(staticDeploy.json().deployment.url).toMatch(/\/$/);

    const deploymentId = staticDeploy.json().deployment.id as string;

    const indexResponse = await app.inject({
      method: 'GET',
      url: `/static-deployments/${deploymentId}/`,
    });
    expect(indexResponse.statusCode).toBe(200);
    expect(indexResponse.headers['content-type']).toContain('text/html');
    expect(indexResponse.body).toContain('Hello Vibecore');
    expect(indexResponse.body).toContain(`/static-deployments/${deploymentId}/assets/main.css`);
    expect(indexResponse.body).toContain(`/static-deployments/${deploymentId}/assets/main.js`);

    /*
     * Isolation stays intact: the document is a UNIQUE opaque origin (sandbox
     * without allow-same-origin) so a deployed page can't wield the visitor's
     * ambient API cookie.
     */
    expect(indexResponse.headers['content-security-policy']).toBe(
      'sandbox allow-scripts allow-forms allow-popups allow-modals',
    );

    /*
     * ...but that opaque origin must still be able to load its OWN Vite bundle
     * (`<script type="module" crossorigin>`), which is now a cross-origin fetch.
     * CORP must be `cross-origin` and `ACAO: *` must be present or the module is
     * blocked and the app renders blank. Regression guard for the white-page bug.
     */
    expect(indexResponse.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(indexResponse.headers['access-control-allow-origin']).toBe('*');

    const cssResponse = await app.inject({
      method: 'GET',
      url: `/static-deployments/${deploymentId}/assets/main.css`,
    });
    expect(cssResponse.statusCode).toBe(200);
    expect(cssResponse.headers['content-type']).toContain('text/css');
    expect(cssResponse.body).toContain('tomato');
    // Subresources (JS/CSS) the opaque-origin document pulls must be loadable cross-origin too.
    expect(cssResponse.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(cssResponse.headers['access-control-allow-origin']).toBe('*');

    const spaResponse = await app.inject({
      method: 'GET',
      url: `/static-deployments/${deploymentId}/nested/route/that/does/not/exist`,
    });
    expect(spaResponse.statusCode).toBe(200);
    expect(spaResponse.headers['content-type']).toContain('text/html');

    const traversal = await app.inject({
      method: 'GET',
      url: `/static-deployments/${deploymentId}/..%2F..%2F..%2Fetc%2Fpasswd`,
    });
    expect([403, 404]).toContain(traversal.statusCode);

    const missing = await app.inject({
      method: 'GET',
      url: `/static-deployments/${deploymentId}-does-not-exist/`,
    });
    expect(missing.statusCode).toBe(404);

    // The planted symlink lexically lives inside the snapshot, so the path guard
    // passes — but realpath escapes the snapshot root, so the route must refuse
    // to serve it and must never leak the host secret it points at.
    const symlinkEscape = await app.inject({
      method: 'GET',
      url: `/static-deployments/${deploymentId}/leak.txt`,
    });
    expect([403, 404]).toContain(symlinkEscape.statusCode);
    expect(symlinkEscape.body).not.toContain('TOP-SECRET-SYMLINK-LEAK');

    const previousDeployHooks = {
      vercel: process.env.VERCEL_DEPLOY_HOOK_URL,
      cloudRun: process.env.CLOUD_RUN_BUILD_TRIGGER_URL,
      gcpToken: process.env.GCP_OAUTH_TOKEN,
    };

    try {
      process.env.VERCEL_DEPLOY_HOOK_URL = 'https://deploy-hooks.test/vercel';
      process.env.CLOUD_RUN_BUILD_TRIGGER_URL = 'https://deploy-hooks.test/cloud-run';
      process.env.GCP_OAUTH_TOKEN = 'ya29.test-token';

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: Parameters<typeof fetch>[0]) => {
          const url = String(input);

          if (url === 'https://deploy-hooks.test/vercel') {
            return new Response(
              JSON.stringify({
                job: {
                  id: 'job_vercel_1',
                  url: 'https://deployable-app.vercel.vibecore.local',
                },
              }),
              { status: 201, headers: { 'content-type': 'application/json' } },
            );
          }

          if (url === 'https://deploy-hooks.test/cloud-run') {
            return new Response(
              JSON.stringify({
                metadata: {
                  build: {
                    id: 'build_cloud_run_1',
                    results: { images: [{ name: 'gcr.io/vibecore/deployable-app' }] },
                  },
                },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }

          throw new Error(`Unexpected deploy hook request: ${url}`);
        }),
      );

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
    } finally {
      restoreEnv('VERCEL_DEPLOY_HOOK_URL', previousDeployHooks.vercel);
      restoreEnv('CLOUD_RUN_BUILD_TRIGGER_URL', previousDeployHooks.cloudRun);
      restoreEnv('GCP_OAUTH_TOKEN', previousDeployHooks.gcpToken);
      vi.unstubAllGlobals();
    }

    const logs = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${staticDeploy.json().deployment.id}/logs`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(logs.statusCode).toBe(200);
    expect(JSON.stringify(logs.json())).not.toContain('super-secret-token');
    expect(JSON.stringify(logs.json())).toContain('[REDACTED]');

    if (previous === undefined) {
      delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    } else {
      process.env.STATIC_DEPLOY_STORAGE_DIR = previous;
    }

    await app.close();
    await rm(tempStaticRoot, { recursive: true, force: true });

    if (fakeOutputDir) {
      await rm(join(fakeOutputDir, '..'), { recursive: true, force: true });
    }
  });

  it('marks static deployments as FAILED with no URL when the build fails', async () => {
    const store = new TestApiStore();
    const tempStaticRoot = await mkdtemp(join(tmpdir(), 'vibecore-static-deploy-fail-'));
    const previous = process.env.STATIC_DEPLOY_STORAGE_DIR;
    process.env.STATIC_DEPLOY_STORAGE_DIR = tempStaticRoot;

    const app = await buildTestApiApp({
      store,
      staticBuildRunner: async () => ({
        ok: false,
        error: 'BUILD_FAILED',
        logs: [{ timestamp: new Date().toISOString(), level: 'error', message: '[build] vite: missing dependency' }],
      }),
    });

    const auth = await register(app, { email: 'failed-deploy@example.com', organizationName: 'Failed Deploy Org' });
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/from-template`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Broken App', templateName: 'react-basic-starter' },
    });

    const projectId = project.json().project.id as string;

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { provider: 'static', environment: 'preview', buildCommand: 'npm run build', outputDirectory: 'dist' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().deployment.status).toBe('FAILED');
    expect(response.json().deployment.url ?? null).toBeNull();
    expect(JSON.stringify(response.json().deployment.logs)).toContain('vite: missing dependency');

    if (previous === undefined) {
      delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    } else {
      process.env.STATIC_DEPLOY_STORAGE_DIR = previous;
    }

    await app.close();
    await rm(tempStaticRoot, { recursive: true, force: true });
  });

  it('returns 400 for invalid deployment ids and 404 for unknown deployments on the static serve route', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const invalid = await app.inject({ method: 'GET', url: '/static-deployments/not%20valid!/' });
    expect(invalid.statusCode).toBe(400);

    const missing = await app.inject({ method: 'GET', url: '/static-deployments/abcdef1234/' });
    expect(missing.statusCode).toBe(404);

    await app.close();
  });

  it('persists domain DNS routing options and TLS readiness state', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'domains@example.com', organizationName: 'Domains Org' });

    const invalid = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/domains`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { domain: 'https://bad-domain.example/path' },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/domains`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { domain: 'App.Example.com', redirectWww: false, wildcardEnabled: true },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().domain).toEqual(
      expect.objectContaining({
        domain: 'app.example.com',
        redirectWww: false,
        wildcardEnabled: true,
        sslStatus: 'pending_dns',
      }),
    );

    const configured = await app.inject({
      method: 'PATCH',
      url: `/orgs/${auth.organization.id}/domains/app.example.com`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { redirectWww: true, wildcardEnabled: false },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json().domain).toEqual(
      expect.objectContaining({ redirectWww: true, wildcardEnabled: false, sslStatus: 'pending_dns' }),
    );

    const verified = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/domains/app.example.com/verify`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().domain).toEqual(expect.objectContaining({ sslStatus: 'dns_verified' }));

    const list = await app.inject({
      method: 'GET',
      url: `/orgs/${auth.organization.id}/domains`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().domains).toHaveLength(1);
    expect(list.json().domains[0]).toEqual(expect.objectContaining({ domain: 'app.example.com' }));

    await app.close();
  });

  it('rolls back, redeploys and cancels deployment records', async () => {
    const store = new TestApiStore();

    const app = await buildTestApiApp({
      store,
      staticBuildRunner: async (input) => {
        const root = await mkdtemp(join(tmpdir(), `vibecore-static-build-${input.projectId}-`));
        const outputDir = join(root, 'dist');

        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, 'index.html'), '<!doctype html><h1>Deploy ops</h1>', 'utf8');

        return {
          ok: true,
          outputDir,
          logs: [{ timestamp: new Date().toISOString(), level: 'info', message: 'Static deploy: test build OK' }],
        };
      },
    });

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

    // A terminal (READY) deployment can no longer be canceled.
    const cancelReady = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${redeploy.json().deployment.id}/cancel`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(cancelReady.statusCode).toBe(409);
    expect(cancelReady.json().code).toBe('DEPLOYMENT_NOT_CANCELABLE');

    // An in-progress (QUEUED) deployment cancels successfully.
    const queued = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });
    const cancel = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${queued.id}/cancel`,
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

    const branch = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/git/branches/checkout`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { branch: 'feature/git-panel', create: true, startPoint: 'main' },
    });
    expect(branch.statusCode).toBe(200);
    expect(branch.json().branch).toBe('feature/git-panel');

    const branches = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/branches`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(branches.json().branches).toContain('feature/git-panel');

    const graph = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/graph`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(graph.statusCode).toBe(200);
    expect(graph.json().commits[0].message).toBe('Initial import');

    const stash = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/git/stash`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { message: 'WIP from test' },
    });
    expect(stash.statusCode).toBe(200);

    const cherryPick = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/git/cherry-pick`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { sha: 'abcd1234' },
    });
    expect(cherryPick.statusCode).toBe(200);

    const resolveConflict = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/git/conflicts/resolve`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { filePath: 'README.md', strategy: 'ours' },
    });
    expect(resolveConflict.statusCode).toBe(200);

    const blame = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/blame?filePath=README.md`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(blame.statusCode).toBe(200);

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

  it('discovers database connections without exposing secret values', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'database@example.com', organizationName: 'Database Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Database Project' },
    });

    const projectId = project.json().project.id as string;

    const secret = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/secrets`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { key: 'PRODUCTION_DATABASE_URL', value: 'postgres://user:super-secret@localhost:5432/app' },
    });
    expect(secret.statusCode).toBe(200);

    const databases = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/databases`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(databases.statusCode).toBe(200);
    expect(databases.json().connections[0]).toMatchObject({
      key: 'PRODUCTION_DATABASE_URL',
      kind: 'postgres',
      source: 'secret',
      environment: 'production',
    });
    expect(JSON.stringify(databases.json())).not.toContain('super-secret');

    /*
     * NOTE: the SQL pane is deliberately a full read/write runner (Replit parity)
     * — SELECT + INSERT/UPDATE/DELETE + DDL (CREATE/ALTER/DROP) all execute against
     * the project's OWN database (see runDatabaseQuery). It no longer rejects DDL
     * with a 400, so there is no "unsafe query blocked" assertion here; exercising a
     * real query requires a live database and is covered by integration tests.
     */
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

    const deniedCanonicalResolve = await app.inject({
      method: 'GET',
      url: '/projects/resolve?accountSlug=project-owner-org&projectSlug=private-project',
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(deniedCanonicalResolve.statusCode).toBe(404);
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

  it('lists only the current user project AI conversations with a bounded limit', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'ai-history@example.com', organizationName: 'AI History Org' });
    const otherUser = await register(app, {
      email: 'ai-history-other@example.com',
      organizationName: 'AI History Other Org',
    });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'AI History Project' },
    });

    const projectId = project.json().project.id as string;
    const first = await store.createAiConversation({ projectId, userId: auth.user.id, title: 'First chat' });
    const second = await store.createAiConversation({ projectId, userId: auth.user.id, title: 'Second chat' });
    const leaked = await store.createAiConversation({ projectId, userId: otherUser.user.id, title: 'Other user chat' });

    try {
      const limited = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/ai/conversations?limit=1`,
        headers: { authorization: `Bearer ${auth.token}` },
      });

      expect(limited.statusCode).toBe(200);
      expect(limited.json().conversations).toHaveLength(1);
      expect([first.id, second.id]).toContain(limited.json().conversations[0].id);
      expect(limited.json().conversations[0].id).not.toBe(leaked.id);

      const all = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/ai/conversations?limit=10`,
        headers: { authorization: `Bearer ${auth.token}` },
      });

      expect(all.statusCode).toBe(200);
      expect(all.json().conversations.map((conversation: { id: string }) => conversation.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
      expect(all.json().conversations.map((conversation: { id: string }) => conversation.id)).not.toContain(leaked.id);
    } finally {
      await app.close();
    }
  });

  it('attaches AI tool calls to an active project AI conversation transcript', async () => {
    const runtime = await startRuntimeServices();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, {
      email: 'ai-tool-transcript@example.com',
      organizationName: 'AI Tool Transcript Org',
    });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'AI Tool Transcript Project' },
    });

    const projectId = project.json().project.id as string;

    try {
      const conversation = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/conversations`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { title: 'Active mobile agent session' },
      });
      expect(conversation.statusCode).toBe(201);

      const conversationId = conversation.json().conversation.id as string;
      const tool = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/write_file`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          conversationId,
          path: 'src/AgentTrace.ts',
          content: 'export const traced = true;',
        },
      });

      expect(tool.statusCode).toBe(201);
      expect(tool.json().toolMessage.conversationId).toBe(conversationId);
      expect(tool.json().toolCall.name).toBe('write_file');
      expect(runtime.files.get('src/AgentTrace.ts')).toContain('traced');

      const transcript = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/ai/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${auth.token}` },
      });

      expect(transcript.statusCode).toBe(200);
      expect(transcript.json().messages).toMatchObject([
        {
          role: 'tool',
          content: 'write_file',
          toolCalls: [
            {
              name: 'write_file',
              input: { conversationId, path: 'src/AgentTrace.ts', content: 'export const traced = true;' },
              output: { path: 'src/AgentTrace.ts', written: true },
            },
          ],
        },
      ]);
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('passes terminal output through the proxy as single, unwrapped CommandEvent frames', async () => {
    // Regression: the workspace-agent frames terminal output as JSON CommandEvents,
    // but the proxy still wrapped it again, double-encoding every frame so the IDE
    // rendered the inner JSON as literal text ("commands don't execute"). The proxy
    // must pass the agent's frames through verbatim, exactly like /commands/stream.
    const runtime = await startRuntimeServices();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'terminal-frame@example.com', organizationName: 'Terminal Frame Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Terminal Frame Project' },
    });
    const projectId = project.json().project.id as string;

    const ticketResponse = await app.inject({
      method: 'POST',
      url: `/api/runtime/workspaces/${projectId}/socket-ticket`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { endpoint: 'terminal' },
    });
    expect(ticketResponse.statusCode).toBe(200);
    const ticket = ticketResponse.json().ticket as string;

    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const socket = new WebSocket(
      `${address.replace(/^http/, 'ws')}/api/runtime/workspaces/${projectId}/terminal?sessionId=test-shell`,
      runtimeWebSocketProtocols(ticket),
    );

    try {
      const firstFrame = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('terminal frame not received')), 4000);
        socket.addEventListener('message', (event) => {
          clearTimeout(timeout);
          resolve(String(event.data));
        });
        socket.addEventListener('error', () => {
          clearTimeout(timeout);
          reject(new Error('terminal socket failed'));
        });
      });

      const parsed = JSON.parse(firstFrame) as { type?: string; data?: unknown };

      // Single-encoded: type is stdout and data is the literal shell text, NOT a
      // nested JSON string (which is what double-wrapping would produce).
      expect(parsed.type).toBe('stdout');
      expect(parsed.data).toBe('hello from shell\r\n');
      expect(typeof parsed.data === 'string' && parsed.data.trimStart().startsWith('{')).toBe(false);
    } finally {
      socket.close();
      await app.close();
      await runtime.close();
    }
  });

  it('resolves a bare project id to the deterministic ws- workspace for every runtime endpoint', async () => {
    // Regression: directories-create and ports/watch were 502ing with
    // `ENOTFOUND workspace-<projectId>.workspaces.svc` because callers that only
    // know the project id (the per-project runtime adapter before startWorkspace
    // resolves, the SSR file-write proxy, the ide-panel `?? projectId` fallback)
    // sent the bare projectId, which the API used verbatim as the agent hostname.
    // Workspace pods are named `workspace-ws-<hash>`, so the request must target
    // the deterministic per-user runtime workspace id, never the project id.
    const runtime = await startRuntimeServices();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'ws-resolve@example.com', organizationName: 'WS Resolve Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'WS Resolve Project' },
    });
    const projectId = project.json().project.id as string;

    // Mirror runtimeWorkspaceId(projectId, userId) from the API.
    const expectedWorkspaceId = deterministicRuntimeWorkspaceId(projectId, auth.user.id);

    try {
      const created = await app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${projectId}/directories`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { path: 'src/components' },
      });

      expect(created.statusCode).toBe(204);
      // The agent must have been reached via the resolved ws- id, not the
      // project id — every agent-token lookup keys on the targeted workspace.
      const tokenLookups = runtime.managerCalls
        .map((call) => call.pathname)
        .filter((pathname) => pathname.endsWith('/agent-token'));
      expect(tokenLookups.length).toBeGreaterThan(0);
      expect(tokenLookups.every((pathname) => pathname === `/workspaces/${expectedWorkspaceId}/agent-token`)).toBe(
        true,
      );
      expect(tokenLookups).not.toContain(`/workspaces/${projectId}/agent-token`);
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('reports a not-yet-started workspace as stopped instead of crashing on an empty manager body', async () => {
    const runtime = await startRuntimeServices({ managerWorkspaceEmpty: true });
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'runtime-status@example.com', organizationName: 'Runtime Status Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Status Project' },
    });

    const projectId = project.json().project.id as string;

    try {
      const status = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${projectId}/status`,
        headers: { authorization: `Bearer ${auth.token}` },
      });

      expect(status.statusCode).toBe(200);
      expect(status.json().status).toBe('stopped');
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('stops a workspace the manager no longer knows and frees the active-workspace quota', async () => {
    const runtime = await startRuntimeServices({ managerStopNotFound: true });
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'runtime-stop@example.com', organizationName: 'Runtime Stop Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Stop Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const start = await app.inject({
        method: 'POST',
        url: '/api/runtime/workspaces',
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { projectId },
      });
      expect(start.statusCode).toBe(200);
      const workspaceId = start.json().id as string;

      // Stop must not 502 just because the manager has no record of the
      // workspace — it has to mark our record stopped so the quota is released.
      const stop = await app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${workspaceId}/stop`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(stop.statusCode).toBe(204);

      const record = await store.getWorkspace(workspaceId);
      expect(record?.status).toBe('STOPPED');
      expect(await store.countActiveWorkspaces(auth.organization.id)).toBe(0);
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('lets a free-tier user reopen an existing workspace without re-charging the quota', async () => {
    const runtime = await startRuntimeServices();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'runtime-reopen@example.com', organizationName: 'Runtime Reopen Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Reopen Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const first = await app.inject({
        method: 'POST',
        url: '/api/runtime/workspaces',
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { projectId },
      });
      expect(first.statusCode).toBe(200);

      // Free plan allows a single active workspace. Reopening the SAME workspace
      // reuses its deterministic id and must not be billed against the quota a
      // second time (previously: used=1, limit=1 → used+1 > limit → 429).
      const second = await app.inject({
        method: 'POST',
        url: '/api/runtime/workspaces',
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { projectId },
      });
      expect(second.statusCode).toBe(200);
      expect(first.json().id).toBe(second.json().id);
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

  it('executes a package install by dispatching the detected package-manager command to the project workspace', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const runtime = await startRuntimeServices({ commandStdout: 'added 1 package in 2s\n' });
    const app = await buildTestApiApp({ store, projectStorage });
    const auth = await register(app, { email: 'pkg-install@example.com', organizationName: 'Package Install Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Package Install Project' },
    });

    const projectId = project.json().project.id as string;
    const expectedWorkspaceId = deterministicRuntimeWorkspaceId(projectId, auth.user.id);

    /*
     * A pnpm lockfile in the running pod must make the builder pick `pnpm add`.
     * The install endpoint reads the live runtime tree (like the GET packages
     * route), so seed the lockfile into the workspace-agent file map.
     */
    runtime.files.set('package.json', '{\n  "name": "app",\n  "dependencies": {}\n}\n');
    runtime.files.set('pnpm-lock.yaml', 'lockfileVersion: 6.0\n');

    try {
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/packages/install`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { packages: ['left-pad', '@scope/util@^1.2.0'], dev: true },
      });

      expect(response.statusCode).toBe(201);

      const payload = response.json();

      // Reused the real runtime shell-exec (/commands/run) in this project's pod.
      expect(runtime.calls).toContain('POST /commands/run');
      expect(payload.workspaceId).toBe(expectedWorkspaceId);
      expect(payload.projectId).toBe(projectId);
      expect(payload.packageManager).toBe('pnpm');
      expect(payload.success).toBe(true);
      expect(payload.exitCode).toBe(0);
      expect(payload.output).toContain('added 1 package');

      // The command builder picked pnpm and produced a well-formed argv.
      expect(runtime.commandBodies).toHaveLength(1);
      expect(runtime.commandBodies[0]).toMatchObject({
        command: 'pnpm',
        args: ['add', '-D', 'left-pad', '@scope/util@^1.2.0'],
      });
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('installs into the workspace the caller names, not the deterministic per-user pod', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const runtime = await startRuntimeServices({ commandStdout: 'added 1 package in 1s\n' });
    const app = await buildTestApiApp({ store, projectStorage });
    const auth = await register(app, { email: 'pkg-ws@example.com', organizationName: 'Package Workspace Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Package Workspace Project' },
    });

    const projectId = project.json().project.id as string;

    /*
     * An explicitly created workspace gets a cuid, NOT the deterministic
     * `ws-<hash>` id. The Packages panel resolves and displays this record (and
     * offers a workspace selector), so the install has to land in this pod.
     * Before the fix the route ignored the panel's workspace and derived the
     * per-user id from the projectId, hitting a pod that does not exist — every
     * install 502'd while the panel still reported success.
     */
    const workspace = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/workspaces`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Panel workspace' },
    });

    const workspaceId = workspace.json().workspace.id as string;
    expect(workspaceId).not.toBe(deterministicRuntimeWorkspaceId(projectId, auth.user.id));

    await projectStorage.writeFiles(projectId, [{ path: 'package.json', content: '{\n  "name": "app"\n}\n' }]);

    try {
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/packages/install`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { packages: ['lodash'], workspaceId },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().workspaceId).toBe(workspaceId);
      expect(runtime.commandBodies).toHaveLength(1);
      expect(runtime.commandBodies[0]).toMatchObject({ command: 'npm', args: ['install', 'lodash'] });
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('refuses a workspace id that belongs to a different project', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const runtime = await startRuntimeServices();
    const app = await buildTestApiApp({ store, projectStorage });
    const auth = await register(app, { email: 'pkg-x@example.com', organizationName: 'Package Cross Org' });

    const makeProject = async (name: string) => {
      const created = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/projects`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { name },
      });

      return created.json().project.id as string;
    };

    const targetProjectId = await makeProject('Target');
    const otherProjectId = await makeProject('Other');

    const otherWorkspace = await app.inject({
      method: 'POST',
      url: `/projects/${otherProjectId}/workspaces`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Other workspace' },
    });

    try {
      /*
       * Both projects belong to the caller, so permission checks alone would let
       * this through — the pairing itself has to be rejected or an install could
       * be aimed at another project's pod.
       */
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${targetProjectId}/packages/install`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { packages: ['lodash'], workspaceId: otherWorkspace.json().workspace.id },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('WORKSPACE_PROJECT_MISMATCH');
      expect(runtime.calls).not.toContain('POST /commands/run');
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('defaults to npm install and rejects package specs with shell metacharacters', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const runtime = await startRuntimeServices();
    const app = await buildTestApiApp({ store, projectStorage });
    const auth = await register(app, { email: 'pkg-npm@example.com', organizationName: 'Package Npm Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Package Npm Project' },
    });

    const projectId = project.json().project.id as string;

    // No lockfile → detection falls back to npm.
    await projectStorage.writeFiles(projectId, [{ path: 'package.json', content: '{\n  "name": "app"\n}\n' }]);

    try {
      // Injection attempt must be rejected before any runtime dispatch.
      const rejected = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/packages/install`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { packages: ['react; rm -rf /'] },
      });

      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().code).toBe('INVALID_PACKAGE_SPEC');
      expect(runtime.calls).not.toContain('POST /commands/run');

      // A clean single package resolves to `npm install <pkg>`.
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/packages/install`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { packages: ['react'] },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().packageManager).toBe('npm');
      expect(runtime.commandBodies).toHaveLength(1);
      expect(runtime.commandBodies[0]).toMatchObject({
        command: 'npm',
        args: ['install', 'react'],
      });
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
          url: `https://${deterministicRuntimeWorkspaceId(projectId, auth.user.id)}-5173.preview.example.com/`,
        }),
      ]);
    } finally {
      process.env.PREVIEW_URL_TEMPLATE = previousPreviewTemplate;
      await runtime.close();
      await app.close();
    }
  });

  it('proxies root preview requests without requiring a trailing wildcard path', async () => {
    const runtime = await startRuntimeServices();
    const app = await buildTestApiApp({ store: new TestApiStore() });

    const auth = await register(app, {
      email: 'runtime-preview-proxy@example.com',
      organizationName: 'Runtime Preview Proxy Org',
    });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Preview Proxy Project' },
    });

    const projectId = project.json().project.id as string;

    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${projectId}/preview/5173/proxy`,
        headers: { authorization: `Bearer ${auth.token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('runtime preview root');
      expect(runtime.calls).toContain('GET /preview/5173/');
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('returns classified runtime log snapshots for IDE log streams', async () => {
    const runtime = await startRuntimeServices({
      logs: ['vite ready in 120ms', 'GET /api/health 200', 'runtime port 5173 opened', 'Error: build failed'],
    });

    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, { email: 'runtime-logs@example.com', organizationName: 'Runtime Logs Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Logs Project' },
    });

    const projectId = project.json().project.id as string;

    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${projectId}/logs/snapshot`,
        headers: { authorization: `Bearer ${auth.token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        workspaceId: deterministicRuntimeWorkspaceId(projectId, auth.user.id),
        logs: expect.arrayContaining([
          expect.objectContaining({ message: 'vite ready in 120ms', source: 'workflow', level: 'info' }),
          expect.objectContaining({ message: 'GET /api/health 200', source: 'console', level: 'info' }),
          expect.objectContaining({ message: 'runtime port 5173 opened', source: 'system', level: 'info' }),
          expect.objectContaining({ message: 'Error: build failed', source: 'workflow', level: 'error' }),
        ]),
      });
    } finally {
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

  it('forwards decrypted project secret values to the workspace manager on start', async () => {
    const runtime = await startRuntimeServices();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const owner = await register(app, {
      email: 'runtime-secrets@example.com',
      organizationName: 'Runtime Secrets Org',
    });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Runtime Secrets Project' },
    });

    const projectId = project.json().project.id as string;

    const secretUpsert = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/secrets`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { key: 'NPM_TOKEN', value: 'tok_super_secret' },
    });
    expect(secretUpsert.statusCode).toBe(200);

    try {
      const start = await app.inject({
        method: 'POST',
        url: '/api/runtime/workspaces',
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { workspaceId: projectId, metadata: { projectId } },
      });
      expect(start.statusCode).toBe(200);

      const startCall = runtime.managerCalls.find((call) => call.pathname === '/workspaces/start');
      expect(startCall).toBeDefined();

      /*
       * The NAMES travel in allowedSecretKeys and the decrypted VALUES in allowedSecrets;
       * without the latter the K8s Secret is empty and the pod fails with CreateContainerConfigError.
       */
      expect(startCall?.body.allowedSecretKeys).toContain('NPM_TOKEN');
      expect(startCall?.body.allowedSecrets).toMatchObject({ NPM_TOKEN: 'tok_super_secret' });
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

  it('runs runtime commands through a local workspace fallback when the manager is unavailable', async () => {
    const previousManager = process.env.WORKSPACE_MANAGER_URL;
    const previousFallback = process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK;
    const previousFallbackRoot = process.env.WORKSPACE_LOCAL_RUNTIME_ROOT;
    const localRuntimeRoot = await mkdtemp(join(tmpdir(), 'vibecore-local-runtime-'));
    process.env.WORKSPACE_MANAGER_URL = 'http://127.0.0.1:9';
    process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK = 'true';
    process.env.WORKSPACE_LOCAL_RUNTIME_ROOT = localRuntimeRoot;

    const projectStorage = new MemoryProjectStorage();
    const app = await buildTestApiApp({ store: new TestApiStore(), projectStorage });

    const auth = await register(app, {
      email: 'runtime-local-fallback@example.com',
      organizationName: 'Runtime Local Fallback Org',
    });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Local Fallback Project' },
    });

    const projectId = project.json().project.id as string;
    await projectStorage.writeFiles(projectId, [
      { path: 'package.json', content: '{\n  "name": "debugger-fallback"\n}\n' },
    ]);

    try {
      const response = await app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${projectId}/commands`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { command: 'sh', args: ['-lc', 'cat package.json | head -1'], timeoutMs: 5000 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ exitCode: 0, localRuntime: true });
      expect(response.json().output).toContain('{');

      const status = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${projectId}/status`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({
        id: deterministicRuntimeWorkspaceId(projectId, auth.user.id),
        status: 'running',
        runtimeMode: 'local-dev',
        metadata: { localRuntime: true },
      });
    } finally {
      if (previousManager === undefined) {
        delete process.env.WORKSPACE_MANAGER_URL;
      } else {
        process.env.WORKSPACE_MANAGER_URL = previousManager;
      }

      if (previousFallback === undefined) {
        delete process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK;
      } else {
        process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK = previousFallback;
      }

      if (previousFallbackRoot === undefined) {
        delete process.env.WORKSPACE_LOCAL_RUNTIME_ROOT;
      } else {
        process.env.WORKSPACE_LOCAL_RUNTIME_ROOT = previousFallbackRoot;
      }

      await app.close();
      await rm(localRuntimeRoot, { recursive: true, force: true });
    }
  });

  it('uses the local runtime fallback for commands and ports when the workspace agent is unavailable', async () => {
    const runtime = await startRuntimeServices({ agentUnavailable: true });
    const previousFallback = process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK;
    const previousFallbackRoot = process.env.WORKSPACE_LOCAL_RUNTIME_ROOT;
    const localRuntimeRoot = await mkdtemp(join(tmpdir(), 'vibecore-local-runtime-agent-fallback-'));
    process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK = 'true';
    process.env.WORKSPACE_LOCAL_RUNTIME_ROOT = localRuntimeRoot;

    const projectStorage = new MemoryProjectStorage();
    const app = await buildTestApiApp({ store: new TestApiStore(), projectStorage });

    const auth = await register(app, {
      email: 'runtime-agent-fallback@example.com',
      organizationName: 'Runtime Agent Fallback Org',
    });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime Agent Fallback Project' },
    });

    const projectId = project.json().project.id as string;
    await projectStorage.writeFiles(projectId, [
      { path: 'package.json', content: '{\n  "scripts": { "dev": "vite" }\n}\n' },
    ]);

    try {
      const command = await app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${projectId}/commands`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          command: 'sh',
          args: ['-lc', 'echo "Local: http://127.0.0.1:5173/"'],
          timeoutMs: 5000,
        },
      });

      expect(command.statusCode).toBe(200);
      expect(command.json()).toMatchObject({ exitCode: 0, localRuntime: true });
      expect(command.json().output).toContain('127.0.0.1:5173');

      const ports = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${projectId}/ports`,
        headers: { authorization: `Bearer ${auth.token}` },
      });

      expect(ports.statusCode).toBe(200);
      expect(ports.json()).toEqual([
        expect.objectContaining({
          port: 5173,
          type: 'open',
          ready: true,
          url: `/api/runtime/workspaces/${deterministicRuntimeWorkspaceId(projectId, auth.user.id)}/preview/5173/proxy/`,
        }),
      ]);
    } finally {
      if (previousFallback === undefined) {
        delete process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK;
      } else {
        process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK = previousFallback;
      }

      if (previousFallbackRoot === undefined) {
        delete process.env.WORKSPACE_LOCAL_RUNTIME_ROOT;
      } else {
        process.env.WORKSPACE_LOCAL_RUNTIME_ROOT = previousFallbackRoot;
      }

      await runtime.close();
      await app.close();
      await rm(localRuntimeRoot, { recursive: true, force: true });
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
      const conversation = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/conversations`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { title: 'Snapshot pairing' },
      });
      const conversationId = conversation.json().conversation.id as string;

      const deletion = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/tools/delete_file`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { path: 'README.md', conversationId },
      });

      expect(deletion.statusCode).toBe(201);
      expect(deletion.json().snapshotId).toBeTruthy();

      const beforeAiSnapshots = [...store.snapshots.values()].filter(
        (snapshot) => snapshot.kind === 'before-ai-change',
      );
      expect(beforeAiSnapshots.length).toBe(1);

      /*
       * The snapshot must carry the (conversationId, turnIndex) association the IDE
       * relies on to pair a chat checkpoint to the correct snapshot — without it,
       * "Rollback here" falls back to a position-based guess (the data-loss bug).
       */
      expect(beforeAiSnapshots[0].conversationId).toBe(conversationId);
      expect(beforeAiSnapshots[0].turnIndex).toBe(0);
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('stamps every snapshot of one agent turn with the SAME turnIndex (multi-tool-call turn)', async () => {
    const runtime = await startRuntimeServices();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'ai-turn@example.com', organizationName: 'AI Turn Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'AI Turn Project' },
    });
    const projectId = project.json().project.id as string;

    const conversation = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/conversations`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { title: 'Multi-tool turn' },
    });
    const conversationId = conversation.json().conversation.id as string;

    try {
      /*
       * Two mutating tool calls in the SAME turn (no assistant message persisted
       * between them) → two before-ai-change snapshots that must share turnIndex 0.
       * This is the exact scenario the ordinal-index bug mis-paired.
       */
      for (const path of ['a.txt', 'b.txt']) {
        const response = await app.inject({
          method: 'POST',
          url: `/projects/${projectId}/ai/tools/delete_file`,
          headers: { authorization: `Bearer ${auth.token}` },
          payload: { path, conversationId },
        });
        expect(response.statusCode).toBe(201);
      }

      const turnIndexes = [...store.snapshots.values()]
        .filter((snapshot) => snapshot.kind === 'before-ai-change')
        .map((snapshot) => snapshot.turnIndex);

      expect(turnIndexes.length).toBe(2);
      expect(turnIndexes).toEqual([0, 0]);
    } finally {
      await runtime.close();
      await app.close();
    }
  });

  it('records chat usage in the AI cost ledger and the usage counters', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'usage@example.com', organizationName: 'Usage Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Usage Project' },
    });

    const projectId = project.json().project.id as string;

    const record = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/record-usage`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        inputTokens: 10_000,
        outputTokens: 2_000,
        finishReason: 'stop',
        source: 'bolt-chat',
      },
    });

    expect(record.statusCode).toBe(200);

    const body = record.json();
    expect(body.recorded).toBe(true);
    expect(body.modelMatched).toBe(true);

    // 10000 input @ 300¢/M = 3¢, 2000 output @ 1500¢/M = 3¢ → 6¢
    expect(body.costCents).toBe(6);
    expect(body.finishReason).toBe('stop');

    const costs = await store.listAiCosts(auth.organization.id);
    expect(costs).toHaveLength(1);
    expect(costs[0].provider).toBe('anthropic');
    expect(costs[0].model).toBe('claude-sonnet-4-6');
    expect(costs[0].inputTokens).toBe(10_000);
    expect(costs[0].outputTokens).toBe(2_000);
    expect(costs[0].costCents).toBe(6);
    expect(costs[0].reason).toBe('chat.completion.bolt-chat');

    await app.close();
  });

  it('returns matched:false and 0¢ when the model is not in the pricing catalog', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'unknown-model@example.com', organizationName: 'Unknown Model Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Unknown Model Project' },
    });

    const projectId = project.json().project.id as string;

    const record = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/record-usage`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        provider: 'anthropic',
        model: 'claude-future-2030',
        inputTokens: 1000,
        outputTokens: 1000,
      },
    });

    expect(record.statusCode).toBe(200);

    const body = record.json();
    expect(body.recorded).toBe(true);
    expect(body.modelMatched).toBe(false);
    expect(body.costCents).toBe(0);

    /*
     * The cost row is still written (with cents=0) so we can spot
     * "we silently zero-billed N chats" in the ledger later.
     */
    const costs = await store.listAiCosts(auth.organization.id);
    expect(costs).toHaveLength(1);
    expect(costs[0].model).toBe('claude-future-2030');
    expect(costs[0].costCents).toBe(0);

    await app.close();
  });

  it('check-quota returns headroom when within the plan limits', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'check-ok@example.com', organizationName: 'Quota OK Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Quota OK Project' },
    });

    const projectId = project.json().project.id as string;

    const check = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/check-quota`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { estimatedInputTokens: 5_000, model: 'claude-sonnet-4-6' },
    });

    expect(check.statusCode).toBe(200);

    const body = check.json();
    expect(body.ok).toBe(true);
    expect(body.ai.inputTokens.limit).toBe(100_000);
    expect(body.ai.inputTokens.remaining).toBeGreaterThan(0);
    expect(body.ai.messages.limit).toBe(50);

    // free plan is managed-mode → BYOK disallowed
    expect(body.byok.allowed).toBe(false);
    expect(body.byok.plan).toBe('free');
    expect(body.byok.reason).toBe('managed-mode-plan');

    await app.close();
  });

  it('check-quota allows BYOK on team and enterprise plans', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'byok@example.com', organizationName: 'BYOK Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'BYOK Project' },
    });

    const projectId = project.json().project.id as string;

    await store.upsertSubscription({
      organizationId: auth.organization.id,
      planKey: 'team',
      status: 'ACTIVE',
    });

    const check = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/check-quota`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { estimatedInputTokens: 5_000 },
    });

    expect(check.statusCode).toBe(200);

    const body = check.json();
    expect(body.byok.allowed).toBe(true);
    expect(body.byok.plan).toBe('team');
    expect(body.byok.reason).toBe('plan-allows-byok');

    await app.close();
  });

  it('check-quota forces managed keys when ENTERPRISE_FORCE_MANAGED_KEYS=true overrides plan', async () => {
    process.env.ENTERPRISE_FORCE_MANAGED_KEYS = 'true';

    try {
      const store = new TestApiStore();
      const app = await buildTestApiApp({ store });
      const auth = await register(app, { email: 'forced-managed@example.com', organizationName: 'Forced Managed' });

      const project = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/projects`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { name: 'Forced Project' },
      });

      const projectId = project.json().project.id as string;

      await store.upsertSubscription({
        organizationId: auth.organization.id,
        planKey: 'enterprise',
        status: 'ACTIVE',
      });

      const check = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/ai/check-quota`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { estimatedInputTokens: 5_000 },
      });

      expect(check.statusCode).toBe(200);

      const body = check.json();

      // enterprise would normally allow BYOK, but the env override forces managed
      expect(body.byok.allowed).toBe(false);
      expect(body.byok.plan).toBe('enterprise');

      await app.close();
    } finally {
      delete (process.env as Record<string, string | undefined>).ENTERPRISE_FORCE_MANAGED_KEYS;
    }
  });

  it('check-quota rejects with 429 when the estimated tokens would exceed the plan', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'check-over@example.com', organizationName: 'Quota Over Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Quota Over Project' },
    });

    const projectId = project.json().project.id as string;

    // Free plan caps ai.inputTokens at 100_000. Asking for 200_000 must 429.
    const blocked = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/check-quota`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { estimatedInputTokens: 200_000, model: 'claude-sonnet-4-6' },
    });

    expect(blocked.statusCode).toBe(429);

    const error = blocked.json();
    expect(error.code).toMatch(/QUOTA/);

    await app.close();
  });

  it('cost-summary aggregates AiCostLedger rows by provider/model/day/project', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'cost-summary@example.com', organizationName: 'Cost Summary Org' });

    const projectA = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Project A' },
    });

    const projectAId = projectA.json().project.id as string;

    // Seed three usage rows: 2 anthropic Sonnet (one each on two days), 1 openai gpt
    await store.recordAiCost({
      organizationId: auth.organization.id,
      projectId: projectAId,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      costCents: 6,
      reason: 'chat.completion.remix-chat',
    });
    await store.recordAiCost({
      organizationId: auth.organization.id,
      projectId: projectAId,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      inputTokens: 2000,
      outputTokens: 1000,
      costCents: 12,
      reason: 'chat.completion.remix-chat',
    });
    await store.recordAiCost({
      organizationId: auth.organization.id,
      projectId: projectAId,
      provider: 'openai',
      model: 'gpt-4.1',
      inputTokens: 500,
      outputTokens: 250,
      costCents: 3,
      reason: 'chat.completion.remix-chat',
    });

    const summary = await app.inject({
      method: 'GET',
      url: `/orgs/${auth.organization.id}/ai/cost-summary`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(summary.statusCode).toBe(200);

    const body = summary.json();
    expect(body.organizationId).toBe(auth.organization.id);
    expect(body.totals.costCents).toBe(21);
    expect(body.totals.inputTokens).toBe(3500);
    expect(body.totals.outputTokens).toBe(1750);
    expect(body.totals.messages).toBe(3);
    expect(body.byProvider.anthropic.costCents).toBe(18);
    expect(body.byProvider.anthropic.messages).toBe(2);
    expect(body.byProvider.openai.costCents).toBe(3);
    expect(body.byModel['claude-sonnet-4-6'].costCents).toBe(18);
    expect(body.byModel['gpt-4.1'].costCents).toBe(3);
    expect(body.byProject[projectAId].messages).toBe(3);

    await app.close();
  });

  it('cost-summary filters by from/to window', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'cost-window@example.com', organizationName: 'Cost Window Org' });

    /*
     * Two rows; default TestApiStore uses now() so both fall in "now".
     * We test the filter by giving a future `from` that excludes both.
     */
    await store.recordAiCost({
      organizationId: auth.organization.id,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      inputTokens: 100,
      outputTokens: 50,
      costCents: 1,
      reason: 'test',
    });

    const future = new Date(Date.now() + 86_400_000).toISOString();

    const summary = await app.inject({
      method: 'GET',
      url: `/orgs/${auth.organization.id}/ai/cost-summary?from=${encodeURIComponent(future)}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(summary.statusCode).toBe(200);

    const body = summary.json();
    expect(body.totals.messages).toBe(0);
    expect(body.totals.costCents).toBe(0);
    expect(body.window.from).toBe(future);

    await app.close();
  });

  it('rejects unauthenticated record-usage requests with 401', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'auth-required@example.com', organizationName: 'Auth Org' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Auth Project' },
    });

    const projectId = project.json().project.id as string;

    const anonymous = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/record-usage`,
      payload: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        inputTokens: 100,
        outputTokens: 100,
      },
    });

    expect(anonymous.statusCode).toBe(401);

    const costs = await store.listAiCosts(auth.organization.id);
    expect(costs).toHaveLength(0);

    await app.close();
  });

  it('persists and lists AgentPatchProposal rows across the project lifecycle', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const owner = await register(app, {
      email: 'agent-patch@example.com',
      organizationName: 'Agent Patch Org',
    });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Agent Patch Project' },
    });
    expect(project.statusCode).toBe(201);

    const projectId = project.json().project.id as string;

    const proposalId = 'artifact-1:action-1';

    const upsert = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/agent-patch-proposals/${proposalId}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        artifactId: 'artifact-1',
        messageId: 'msg-1',
        actionId: 'action-1',
        filePath: '/home/project/src/App.tsx',
        relativePath: 'src/App.tsx',
        originalContent: 'before',
        proposedContent: 'after',
        hunks: [{ id: 'h-1' }],
        status: 'pending',
      },
    });
    expect(upsert.statusCode).toBe(200);
    expect(upsert.json().proposal.status).toBe('pending');
    expect(upsert.json().proposal.proposedContent).toBe('after');

    const list = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/agent-patch-proposals`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().proposals).toHaveLength(1);
    expect(list.json().proposals[0].id).toBe(proposalId);

    /*
     * Re-upserting with a different proposedContent + status must update
     * in place and keep the same id so the client's nanostore key stays
     * in sync with the server row.
     */
    const refresh = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/agent-patch-proposals/${proposalId}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        artifactId: 'artifact-1',
        messageId: 'msg-1',
        actionId: 'action-1',
        filePath: '/home/project/src/App.tsx',
        relativePath: 'src/App.tsx',
        originalContent: 'before',
        proposedContent: 'after-v2',
        hunks: [{ id: 'h-1' }, { id: 'h-2' }],
        status: 'failed',
        error: 'Parser error',
      },
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().proposal.status).toBe('failed');
    expect(refresh.json().proposal.proposedContent).toBe('after-v2');

    const removed = await app.inject({
      method: 'DELETE',
      url: `/projects/${projectId}/agent-patch-proposals/${proposalId}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().deleted).toBe(true);

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/agent-patch-proposals`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(afterDelete.json().proposals).toHaveLength(0);

    /*
     * Deleting a non-existent proposal returns 200 with deleted=false so
     * the client can stay idempotent (e.g., retrying after a network
     * flake) without surfacing a 404 to the user.
     */
    const ghostDelete = await app.inject({
      method: 'DELETE',
      url: `/projects/${projectId}/agent-patch-proposals/no-such-id`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(ghostDelete.statusCode).toBe(200);
    expect(ghostDelete.json().deleted).toBe(false);

    await app.close();
  });

  it('enforces organization isolation on AgentPatchProposal endpoints', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const owner = await register(app, {
      email: 'agent-patch-iso-owner@example.com',
      organizationName: 'Owner Org',
    });
    const stranger = await register(app, {
      email: 'agent-patch-iso-stranger@example.com',
      organizationName: 'Stranger Org',
    });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Isolated Project' },
    });

    const projectId = project.json().project.id as string;

    const denied = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/agent-patch-proposals/x:y`,
      headers: { authorization: `Bearer ${stranger.token}` },
      payload: {
        artifactId: 'x',
        messageId: 'm',
        actionId: 'y',
        filePath: '/home/project/x.ts',
        relativePath: 'x.ts',
        originalContent: '',
        proposedContent: '',
        hunks: [],
        status: 'pending',
      },
    });
    expect(denied.statusCode).toBe(404);

    const list = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/agent-patch-proposals`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(list.statusCode).toBe(404);

    await app.close();
  });

  it('persists User.language through PATCH /auth/me and surfaces it on GET', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'i18n-user@example.com', organizationName: 'i18n Org' });

    /*
     * Registration persists the first-request locale. With no language
     * header the documented fallback is English; a French Accept-Language
     * request is covered by the dedicated transactional-i18n route tests.
     */
    const before = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().user.language).toBe('en');

    const setFr = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { language: 'fr' },
    });
    expect(setFr.statusCode).toBe(200);
    expect(setFr.json().user.language).toBe('fr');

    const afterSet = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(afterSet.json().user.language).toBe('fr');

    /*
     * Explicit null clears the preference; the client goes back to
     * navigator.language on the next boot.
     */
    const clear = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { language: null },
    });
    expect(clear.statusCode).toBe(200);
    expect(clear.json().user.language).toBeFalsy();

    await app.close();
  });

  it('persists User.timezone through PATCH /auth/me and surfaces it on GET (audit #10)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'tz-user@example.com', organizationName: 'TZ Org' });

    const before = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().user.timezone).toBeFalsy();

    const setTz = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { timezone: 'Europe/Paris' },
    });
    expect(setTz.statusCode).toBe(200);
    expect(setTz.json().user.timezone).toBe('Europe/Paris');

    /*
     * Previously the field was accepted by the schema but dropped before the
     * DB write, so it never survived a round trip — this is the regression guard.
     */
    const afterSet = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(afterSet.json().user.timezone).toBe('Europe/Paris');

    await app.close();
  });

  it('persists and shallow-merges preferences through /user/preferences (audit #3)', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'prefs-user@example.com', organizationName: 'Prefs Org' });

    // Fresh users have an empty preferences blob, the negotiated default
    // language, and no timezone.
    const before = await app.inject({
      method: 'GET',
      url: '/user/preferences',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({ language: 'en', timezone: null, preferences: {} });

    const setAll = await app.inject({
      method: 'PATCH',
      url: '/user/preferences',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        language: 'fr',
        timezone: 'Europe/Paris',
        preferences: { notifications: false, eventLogs: true },
      },
    });
    expect(setAll.statusCode).toBe(200);
    expect(setAll.json()).toMatchObject({
      language: 'fr',
      timezone: 'Europe/Paris',
      preferences: { notifications: false, eventLogs: true },
    });

    /*
     * A partial save must shallow-merge, not replace: toggling notifications
     * back on leaves the unrelated eventLogs key intact.
     */
    const patchPartial = await app.inject({
      method: 'PATCH',
      url: '/user/preferences',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { preferences: { notifications: true } },
    });
    expect(patchPartial.statusCode).toBe(200);
    expect(patchPartial.json().preferences).toEqual({ notifications: true, eventLogs: true });

    // Persisted across a fresh read, and visible on GET /auth/me too.
    const reload = await app.inject({
      method: 'GET',
      url: '/user/preferences',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(reload.json()).toMatchObject({
      language: 'fr',
      timezone: 'Europe/Paris',
      preferences: { notifications: true, eventLogs: true },
    });

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(me.json().user.preferences).toEqual({ notifications: true, eventLogs: true });

    await app.close();
  });

  it('rejects unsupported language tags on PATCH /auth/me', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'i18n-bad@example.com', organizationName: 'i18n Bad Org' });

    const bad = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { language: 'klingon' },
    });

    expect(bad.statusCode).toBe(400);

    await app.close();
  });

  it('mirrors the persisted language into the vibecore-lang cookie and clears it on null', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const auth = await register(app, { email: 'i18n-cookie@example.com', organizationName: 'i18n Cookie Org' });

    const setFr = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { language: 'fr' },
    });
    expect(setFr.statusCode).toBe(200);

    const setCookies = setFr.headers['set-cookie'];
    const setCookieArray = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
    const langCookie = setCookieArray.find((header) => header.startsWith('vibecore-lang='));
    expect(langCookie).toBeDefined();
    expect(langCookie).toContain('vibecore-lang=fr');
    expect(langCookie).toContain('SameSite=Lax');
    expect(langCookie).toContain('Max-Age=31536000');
    expect(langCookie).not.toContain('HttpOnly');

    const clear = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { language: null },
    });
    expect(clear.statusCode).toBe(200);

    const clearCookies = clear.headers['set-cookie'];
    const clearCookieArray = Array.isArray(clearCookies) ? clearCookies : clearCookies ? [clearCookies] : [];
    const langClear = clearCookieArray.find((header) => header.startsWith('vibecore-lang='));
    expect(langClear).toBeDefined();

    /*
     * fastify-cookie's clearCookie sets the value to '' and pushes
     * Expires into the past so the browser drops it on the next round
     * trip. Either signal proves the clear path fired.
     */
    expect(langClear).toMatch(/vibecore-lang=;|Expires=Thu, 01 Jan 1970/i);

    await app.close();
  });

  it('does not touch the vibecore-lang cookie when the PATCH omits language', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const auth = await register(app, {
      email: 'i18n-cookie-skip@example.com',
      organizationName: 'i18n Cookie Skip Org',
    });

    const nameOnly = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Renamed' },
    });
    expect(nameOnly.statusCode).toBe(200);

    const setCookies = nameOnly.headers['set-cookie'];
    const setCookieArray = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
    expect(setCookieArray.find((header) => header.startsWith('vibecore-lang='))).toBeUndefined();

    await app.close();
  });
});
