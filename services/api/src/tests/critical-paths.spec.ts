import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import type { GitProvider } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

class TestGitProvider implements GitProvider {
  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    return {
      defaultBranch: input.branch ?? 'main',
      remoteUrl: input.repositoryUrl,
      files: [{ path: 'README.md', content: '# Imported\n', updatedAt: new Date().toISOString() }],
    };
  }

  async status() {
    return { branch: 'main', changedFiles: [], ahead: 0, behind: 0 };
  }

  async commit(input: { message: string }) {
    return { sha: 'critical-path-sha', message: input.message };
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

  async logGraph() {
    return [];
  }

  async diff() {
    return '';
  }

  async blame() {
    return [];
  }

  async createPullRequest() {
    return { url: 'https://github.example/pull/1', number: 1 };
  }
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ gitProvider: new TestGitProvider(), emailProvider: new TestEmailProvider(), ...options });
}

async function register(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email,
      password: 'password123',
      name: 'Critical Path User',
      organizationName: 'Critical Path Org',
    },
  });

  expect(response.statusCode).toBe(201);
  return response.json() as { token: string; organization: { id: string } };
}

async function startRuntimeServices() {
  const files = new Map<string, string>([['README.md', '# Runtime project\n']]);
  const calls: string[] = [];
  const writeBodies: Array<{ path: string; content: string; expectedContent?: string }> = [];
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
      } else if (request.method === 'POST' && url.pathname === '/files/write') {
        writeBodies.push(payload);

        if (payload.expectedContent !== undefined && files.get(payload.path) !== payload.expectedContent) {
          response.writeHead(409).end(JSON.stringify({ error: 'file changed', code: 'FILE_CONTENT_CHANGED' }));
          return;
        }

        files.set(payload.path, payload.content ?? '');
        response.end(JSON.stringify({ ok: true }));
      } else if (request.method === 'POST' && url.pathname === '/files/create') {
        files.set(payload.path, payload.content ?? '');
        response.end(JSON.stringify({ ok: true }));
      } else if (request.method === 'POST' && url.pathname === '/files/delete') {
        files.delete(payload.path);
        response.end(JSON.stringify({ ok: true }));
      } else if (request.method === 'POST' && url.pathname === '/files/rename') {
        files.set(payload.to, files.get(payload.from) ?? '');
        files.delete(payload.from);
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
    response.end(
      JSON.stringify(url.pathname.endsWith('/agent-token') ? { token: 'runtime-token' } : { status: 'RUNNING' }),
    );
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
    writeBodies,
    async close() {
      process.env.WORKSPACE_MANAGER_URL = previousManager;
      process.env.WORKSPACE_AGENT_URL_TEMPLATE = previousAgent;
      await Promise.all(
        [agent, manager].map((server: Server) => new Promise<void>((resolve) => server.close(() => resolve()))),
      );
    },
  };
}

describe('critical API paths', () => {
  it('creates an AI prompt project without pre-generating application files', async () => {
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, 'critical-prompt@example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects/from-ai`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { prompt: 'Build a realtime analytics dashboard', name: 'Prompt App' },
    });

    expect(response.statusCode).toBe(201);
    const projectId = response.json().project.id as string;
    const files = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(files.statusCode).toBe(200);
    const paths = files.json().files.map((file: { path: string }) => file.path);
    expect(paths).toEqual(['README.md']);
    expect(paths).not.toEqual(expect.arrayContaining(['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx']));
    await app.close();
  });

  it('performs runtime file CRUD through backend workspace APIs', async () => {
    const runtime = await startRuntimeServices();
    const app = await buildTestApiApp({ store: new TestApiStore() });
    const auth = await register(app, 'critical-files@example.com');
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Runtime CRUD Project' },
    });
    const projectId = project.json().project.id as string;

    try {
      const create = await app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${projectId}/files`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { path: 'src/created.ts', content: 'export const created = true;' },
      });
      expect(create.statusCode).toBe(204);

      const read = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${projectId}/files/read?path=src/created.ts`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(read.json()).toMatchObject({ content: 'export const created = true;' });

      const write = await app.inject({
        method: 'PUT',
        url: `/api/runtime/workspaces/${projectId}/files/write`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { path: 'src/created.ts', content: 'export const updated = true;' },
      });
      expect(write.statusCode).toBe(204);

      const conditionalWrite = await app.inject({
        method: 'PUT',
        url: `/api/runtime/workspaces/${projectId}/files/write`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          path: 'src/created.ts',
          content: 'export const conditionallyUpdated = true;',
          expectedContent: 'export const updated = true;',
        },
      });
      expect(conditionalWrite.statusCode).toBe(204);
      expect(runtime.writeBodies.at(-1)).toEqual({
        path: 'src/created.ts',
        content: 'export const conditionallyUpdated = true;',
        expectedContent: 'export const updated = true;',
      });

      runtime.files.set('src/created.ts', 'export const external = true;');
      const staleConditionalWrite = await app.inject({
        method: 'PUT',
        url: `/api/runtime/workspaces/${projectId}/files/write`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          path: 'src/created.ts',
          content: 'export const stale = true;',
          expectedContent: 'export const conditionallyUpdated = true;',
        },
      });
      expect(staleConditionalWrite.statusCode).toBe(409);
      expect(staleConditionalWrite.json()).toMatchObject({ code: 'FILE_CONTENT_CHANGED' });
      expect(runtime.files.get('src/created.ts')).toBe('export const external = true;');

      const move = await app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${projectId}/files/move`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { path: 'src/created.ts', newPath: 'src/renamed.ts' },
      });
      expect(move.statusCode).toBe(204);

      const deletion = await app.inject({
        method: 'DELETE',
        url: `/api/runtime/workspaces/${projectId}/files?path=src/renamed.ts`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(deletion.statusCode).toBe(204);
      expect(runtime.files.has('src/renamed.ts')).toBe(false);
      expect(runtime.calls).toEqual(
        expect.arrayContaining(['POST /files/create', 'POST /files/write', 'POST /files/rename', 'POST /files/delete']),
      );
    } finally {
      await runtime.close();
      await app.close();
    }
  });
});
