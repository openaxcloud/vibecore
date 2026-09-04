import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { LocalProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const originalManagerUrl = process.env.WORKSPACE_MANAGER_URL;
const originalAgentTemplate = process.env.WORKSPACE_AGENT_URL_TEMPLATE;
const originalLocalFallback = process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK;
const originalLocalFallbackRoot = process.env.WORKSPACE_LOCAL_RUNTIME_ROOT;
const originalProjectStorageRoot = process.env.PROJECT_STORAGE_DIR;

afterEach(() => {
  if (originalManagerUrl === undefined) delete process.env.WORKSPACE_MANAGER_URL;
  else process.env.WORKSPACE_MANAGER_URL = originalManagerUrl;

  if (originalAgentTemplate === undefined) delete process.env.WORKSPACE_AGENT_URL_TEMPLATE;
  else process.env.WORKSPACE_AGENT_URL_TEMPLATE = originalAgentTemplate;

  if (originalLocalFallback === undefined) delete process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK;
  else process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK = originalLocalFallback;

  if (originalLocalFallbackRoot === undefined) delete process.env.WORKSPACE_LOCAL_RUNTIME_ROOT;
  else process.env.WORKSPACE_LOCAL_RUNTIME_ROOT = originalLocalFallbackRoot;

  if (originalProjectStorageRoot === undefined) delete process.env.PROJECT_STORAGE_DIR;
  else process.env.PROJECT_STORAGE_DIR = originalProjectStorageRoot;
});

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('Test server failed to listen');

  return address.port;
}

async function startRuntime() {
  const files = new Map<string, string>();
  const writes: Array<{ path: string; content: string }> = [];
  const agent = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://agent.test');
    let raw = '';
    request.on('data', (chunk) => (raw += chunk.toString()));
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');

      if (request.method === 'GET' && url.pathname === '/files/read') {
        const path = url.searchParams.get('path') ?? '';

        if (!files.has(path)) {
          response.writeHead(404).end(JSON.stringify({ error: 'File not found', code: 'ENOENT' }));
          return;
        }

        response.end(JSON.stringify({ content: files.get(path), encoding: 'utf8' }));
        return;
      }

      if (request.method === 'POST' && (url.pathname === '/files/write' || url.pathname === '/files/create')) {
        const body = JSON.parse(raw || '{}') as { path: string; content?: string };
        const content = body.content ?? '';
        files.set(body.path, content);
        writes.push({ path: body.path, content });
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method === 'DELETE' && url.pathname === '/files') {
        files.delete(url.searchParams.get('path') ?? '');
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/files/move') {
        const body = JSON.parse(raw || '{}') as { path: string; newPath: string };
        const content = files.get(body.path);

        if (content === undefined) {
          response.writeHead(404).end(JSON.stringify({ error: 'File not found', code: 'ENOENT' }));
          return;
        }

        files.set(body.newPath, content);
        files.delete(body.path);
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/files/delete') {
        const body = JSON.parse(raw || '{}') as { path: string };
        files.delete(body.path);
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/files/rename') {
        const body = JSON.parse(raw || '{}') as { from: string; to: string };
        const content = files.get(body.from);

        if (content === undefined) {
          response.writeHead(404).end(JSON.stringify({ error: 'File not found', code: 'ENOENT' }));
          return;
        }

        files.set(body.to, content);
        files.delete(body.from);
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      response.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
    });
  });
  const agentPort = await listen(agent);
  const manager = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://manager.test');
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(url.pathname.endsWith('/agent-token') ? { token: 'agent-token' } : { status: 'RUNNING' }),
    );
  });
  const managerPort = await listen(manager);
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${managerPort}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${agentPort}`;

  return {
    files,
    writes,
    async close() {
      await Promise.all(
        [agent, manager].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
      );
    },
  };
}

async function setup() {
  const runtime = await startRuntime();
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const owner = await store.createUser({
    email: 'history-owner@example.com',
    name: 'History Owner',
    passwordHash: hashPassword('password123'),
  });
  const organization = await store.createOrganization({
    name: 'History Org',
    slug: 'history-org',
    ownerUserId: owner.id,
  });
  await store.createSession({
    userId: owner.id,
    token: 'history-token',
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  const project = await store.createProject({ organizationId: organization.id, name: 'History', slug: 'history' });
  const workspace = await store.createWorkspace({
    projectId: project.id,
    name: 'History workspace',
    runtimeMode: 'remote-kubernetes',
  });

  return { app, store, runtime, owner, organization, project, workspace };
}

const auth = { authorization: 'Bearer history-token' };

async function countPath(store: TestApiStore, projectId: string, workspaceKey: string, path: string) {
  const latest = await store.getLatestFileVersion(projectId, workspaceKey, path);

  return latest ? store.countFileVersions(projectId, workspaceKey, latest.lineageId) : 0;
}

describe('File History routes', () => {
  it('captures, reads, and restores through the documented local runtime fallback without a manager', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibecore-file-history-local-'));
    process.env.WORKSPACE_MANAGER_URL = 'http://127.0.0.1:1';
    process.env.WORKSPACE_LOCAL_RUNTIME_FALLBACK = 'true';
    process.env.WORKSPACE_LOCAL_RUNTIME_ROOT = join(root, 'runtime');
    process.env.PROJECT_STORAGE_DIR = join(root, 'storage');

    const projectStorage = new LocalProjectStorage();
    const store = new TestApiStore();
    const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });
    const owner = await store.createUser({
      email: 'history-local-owner@example.com',
      name: 'History Local Owner',
      passwordHash: hashPassword('password123'),
    });
    const organization = await store.createOrganization({
      name: 'History Local Org',
      slug: 'history-local-org',
      ownerUserId: owner.id,
    });
    await store.createSession({
      userId: owner.id,
      token: 'history-local-token',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'History Local',
      slug: 'history-local',
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      name: 'History local workspace',
      runtimeMode: 'remote-kubernetes',
    });
    const localAuth = { authorization: 'Bearer history-local-token' };
    const path = 'index.html';
    await projectStorage.writeFiles(project.id, [{ path, content: 'baseline\n' }]);

    try {
      for (const [content, operationId] of [
        ['first\n', 'local-first'],
        ['latest\n', 'local-latest'],
      ] as const) {
        const written = await app.inject({
          method: 'PUT',
          url: `/api/runtime/workspaces/${workspace.id}/files/write`,
          headers: { ...localAuth, 'x-file-history-operation-id': operationId },
          payload: { path, content, encoding: 'utf8' },
        });
        expect(written.statusCode).toBe(204);
      }

      const listed = await app.inject({
        method: 'GET',
        url: `/projects/${project.id}/file-history?workspaceId=${workspace.id}&path=index.html&limit=100`,
        headers: localAuth,
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().total).toBe(3);
      const baselineVersionId = listed.json().versions[2].id as string;

      const latestRead = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${workspace.id}/files/read?path=index.html`,
        headers: localAuth,
      });
      expect(latestRead.statusCode).toBe(200);
      expect(latestRead.json()).toMatchObject({ path, content: 'latest\n', encoding: 'utf8' });

      const restored = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/file-history/${baselineVersionId}/restore`,
        headers: localAuth,
        payload: {
          workspaceId: workspace.id,
          expectedLatestVersionId: listed.json().latestVersionId,
          operationId: 'local-restore',
        },
      });
      expect(restored.statusCode).toBe(201);
      expect(restored.json()).toMatchObject({ restored: true, version: { operation: 'restore' } });

      const restoredRead = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${workspace.id}/files/read?path=index.html`,
        headers: localAuth,
      });
      expect(restoredRead.statusCode).toBe(200);
      expect(restoredRead.json()).toMatchObject({ path, content: 'baseline\n', encoding: 'utf8' });
      expect(await countPath(store, project.id, workspace.id, path)).toBe(4);
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps metadata scoped, deduplicates real writes, and restores by appending a version', async () => {
    const fixture = await setup();
    const base = `/projects/${fixture.project.id}/file-history`;
    const uniqueBodyMarker = 'OLD-CONTENT-MUST-NOT-ENTER-AUDIT';

    try {
      const runtimeWrite = (content: string, operationId: string) =>
        fixture.app.inject({
          method: 'PUT',
          url: `/api/runtime/workspaces/${fixture.workspace.id}/files/write`,
          headers: {
            ...auth,
            'x-file-history-operation-id': operationId,
            'x-file-history-source': 'editor',
          },
          payload: { path: 'src/App.tsx', content },
        });

      const first = await runtimeWrite(uniqueBodyMarker, 'capture-old');
      expect(first.statusCode).toBe(204);
      const firstList = await fixture.app.inject({
        method: 'GET',
        url: `${base}?workspaceId=${fixture.workspace.id}&path=src%2FApp.tsx&limit=100`,
        headers: auth,
      });
      const oldVersionId = firstList.json().versions[0].id as string;
      expect(firstList.json().versions[0]).toMatchObject({
        workspaceId: fixture.workspace.id,
        path: 'src/App.tsx',
        operation: 'write',
        sizeBytes: Buffer.byteLength(uniqueBodyMarker),
      });

      const replay = await runtimeWrite(uniqueBodyMarker, 'capture-old');
      expect(replay.statusCode).toBe(204);
      expect(await countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/App.tsx')).toBe(1);

      const second = await runtimeWrite('new content', 'capture-new');
      expect(second.statusCode).toBe(204);

      const list = await fixture.app.inject({
        method: 'GET',
        url: `${base}?workspaceId=${fixture.workspace.id}&path=src%2FApp.tsx&limit=100`,
        headers: auth,
      });
      expect(list.statusCode).toBe(200);
      const latestVersionId = list.json().latestVersionId as string;
      expect(list.json()).toMatchObject({ total: 2, latestVersionId });
      expect(list.json().versions).toHaveLength(2);
      expect(list.json().versions.every((version: Record<string, unknown>) => !('content' in version))).toBe(true);

      const detail = await fixture.app.inject({
        method: 'GET',
        url: `${base}/${oldVersionId}?workspaceId=${fixture.workspace.id}`,
        headers: auth,
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ version: { id: oldVersionId }, content: uniqueBodyMarker });

      const restored = await fixture.app.inject({
        method: 'POST',
        url: `${base}/${oldVersionId}/restore`,
        headers: auth,
        payload: {
          workspaceId: fixture.workspace.id,
          expectedLatestVersionId: latestVersionId,
          operationId: 'restore-old',
        },
      });
      expect(restored.statusCode).toBe(201);
      const restoreVersionId = restored.json().version.id as string;
      expect(restored.json()).toMatchObject({
        restored: true,
        version: { operation: 'restore', restoredFromVersionId: oldVersionId },
      });
      expect(fixture.runtime.files.get('src/App.tsx')).toBe(uniqueBodyMarker);
      expect(await countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/App.tsx')).toBe(3);
      const writesBeforeRestoreReplay = fixture.runtime.writes.filter((write) => write.path === 'src/App.tsx').length;
      expect(writesBeforeRestoreReplay).toBe(3);

      const restoreReplay = await fixture.app.inject({
        method: 'POST',
        url: `${base}/${oldVersionId}/restore`,
        headers: auth,
        payload: {
          workspaceId: fixture.workspace.id,
          expectedLatestVersionId: latestVersionId,
          operationId: 'restore-old',
        },
      });
      expect(restoreReplay.statusCode).toBe(200);
      expect(restoreReplay.json().version.id).toBe(restoreVersionId);
      expect(fixture.runtime.writes.filter((write) => write.path === 'src/App.tsx')).toHaveLength(
        writesBeforeRestoreReplay,
      );
      expect(await countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/App.tsx')).toBe(3);

      const conflict = await fixture.app.inject({
        method: 'POST',
        url: `${base}/${oldVersionId}/restore`,
        headers: auth,
        payload: {
          workspaceId: fixture.workspace.id,
          expectedLatestVersionId: latestVersionId,
          operationId: 'restore-stale',
        },
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ code: 'FILE_HISTORY_CONFLICT', latestVersionId: restoreVersionId });
      expect(await countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/App.tsx')).toBe(3);

      const oldDetailAgain = await fixture.app.inject({
        method: 'GET',
        url: `${base}/${oldVersionId}?workspaceId=${fixture.workspace.id}`,
        headers: auth,
      });
      expect(oldDetailAgain.json().content).toBe(uniqueBodyMarker);
      expect(JSON.stringify(fixture.store.auditLogs)).not.toContain(uniqueBodyMarker);
    } finally {
      await fixture.runtime.close();
      await fixture.app.close();
    }
  });

  it('rejects a workspace from another project even when the caller owns both projects', async () => {
    const fixture = await setup();

    try {
      const otherProject = await fixture.store.createProject({
        organizationId: fixture.organization.id,
        name: 'Other',
        slug: 'other-history',
      });
      const otherWorkspace = await fixture.store.createWorkspace({
        projectId: otherProject.id,
        name: 'Other workspace',
        runtimeMode: 'remote-kubernetes',
      });
      const response = await fixture.app.inject({
        method: 'GET',
        url: `/projects/${fixture.project.id}/file-history?workspaceId=${otherWorkspace.id}&path=src%2FApp.tsx`,
        headers: auth,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('FILE_HISTORY_WORKSPACE_NOT_FOUND');
    } finally {
      await fixture.runtime.close();
      await fixture.app.close();
    }
  });

  it('does not expose a client-supplied capture endpoint that could forge immutable history', async () => {
    const fixture = await setup();

    try {
      const response = await fixture.app.inject({
        method: 'POST',
        url: `/projects/${fixture.project.id}/file-history`,
        headers: auth,
        payload: {
          workspaceId: fixture.workspace.id,
          path: 'src/App.tsx',
          content: 'forged body',
          source: 'system',
          operationId: 'forged-event',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(await countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/App.tsx')).toBe(0);
    } finally {
      await fixture.runtime.close();
      await fixture.app.close();
    }
  });

  it('captures runtime autosave baseline/new content and replays a stable operation id once', async () => {
    const fixture = await setup();
    fixture.runtime.files.set('src/runtime.ts', 'before');

    try {
      const request = {
        method: 'PUT' as const,
        url: `/api/runtime/workspaces/${fixture.workspace.id}/files/write`,
        headers: {
          ...auth,
          'x-file-history-operation-id': 'runtime-save-once',
          'x-file-history-source': 'editor',
        },
        payload: { path: 'src/runtime.ts', content: 'after' },
      };
      const first = await fixture.app.inject(request);
      const replay = await fixture.app.inject(request);

      expect(first.statusCode).toBe(204);
      expect(replay.statusCode).toBe(204);
      expect(fixture.runtime.files.get('src/runtime.ts')).toBe('after');
      expect(await countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/runtime.ts')).toBe(2);
      expect(fixture.runtime.writes.filter((write) => write.path === 'src/runtime.ts')).toHaveLength(1);
    } finally {
      await fixture.runtime.close();
      await fixture.app.close();
    }
  });

  it('preserves the immutable lineage through runtime move, delete, and restore', async () => {
    const fixture = await setup();
    const headers = {
      ...auth,
      'x-file-history-source': 'editor',
    };

    try {
      const created = await fixture.app.inject({
        method: 'PUT',
        url: `/api/runtime/workspaces/${fixture.workspace.id}/files/write`,
        headers: { ...headers, 'x-file-history-operation-id': 'lineage-create' },
        payload: { path: 'src/before.ts', content: 'lineage body\n' },
      });
      expect(created.statusCode).toBe(204);

      const moved = await fixture.app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${fixture.workspace.id}/files/move`,
        headers: { ...headers, 'x-file-history-operation-id': 'lineage-move' },
        payload: { path: 'src/before.ts', newPath: 'src/after.ts' },
      });
      expect(moved.statusCode).toBe(204);
      expect(fixture.runtime.files.get('src/after.ts')).toBe('lineage body\n');

      const afterMove = await fixture.app.inject({
        method: 'GET',
        url: `/projects/${fixture.project.id}/file-history?workspaceId=${fixture.workspace.id}&path=src%2Fafter.ts`,
        headers: auth,
      });
      expect(afterMove.json().versions).toHaveLength(2);
      expect(afterMove.json().versions[0]).toMatchObject({
        operation: 'rename',
        path: 'src/after.ts',
        renamedFromPath: 'src/before.ts',
      });
      const oldestVersionId = afterMove.json().versions[1].id as string;

      const deleted = await fixture.app.inject({
        method: 'DELETE',
        url: `/api/runtime/workspaces/${fixture.workspace.id}/files?path=src%2Fafter.ts`,
        headers: { ...headers, 'x-file-history-operation-id': 'lineage-delete' },
      });
      expect(deleted.statusCode).toBe(204);
      expect(fixture.runtime.files.has('src/after.ts')).toBe(false);

      const afterDelete = await fixture.app.inject({
        method: 'GET',
        url: `/projects/${fixture.project.id}/file-history?workspaceId=${fixture.workspace.id}&path=src%2Fafter.ts`,
        headers: auth,
      });
      expect(afterDelete.json().total).toBe(3);
      expect(afterDelete.json().versions[0]).toMatchObject({ operation: 'delete', tombstone: true });

      const restored = await fixture.app.inject({
        method: 'POST',
        url: `/projects/${fixture.project.id}/file-history/${oldestVersionId}/restore`,
        headers: auth,
        payload: {
          workspaceId: fixture.workspace.id,
          expectedLatestVersionId: afterDelete.json().latestVersionId,
          operationId: 'lineage-restore',
        },
      });
      expect(restored.statusCode).toBe(201);
      expect(fixture.runtime.files.get('src/after.ts')).toBe('lineage body\n');
      expect(await countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/after.ts')).toBe(4);
    } finally {
      await fixture.runtime.close();
      await fixture.app.close();
    }
  });
});
