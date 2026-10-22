import { createServer, type Server } from 'node:http';
import { RemoteKubernetesRuntimeAdapter } from '@vibecore/runtime-remote';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { buildApiApp } from './app.js';
import { LocalProjectStorage } from './project-storage.js';
import { TestApiStore } from './tests/test-api-store.js';

// An HTTP agent with exclusive-create behavior; all persistence uses the actual API.
async function demarrerRuntime() {
  const fichiers = new Map<string, string>();
  const appels: string[] = [];

  const agent = createServer((requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://agent.local');
    appels.push(`${requete.method} ${url.pathname}`);

    let brut = '';
    requete.on('data', (morceau) => {
      brut += morceau.toString();
    });
    requete.on('end', () => {
      const charge = brut ? (JSON.parse(brut) as Record<string, string>) : {};
      reponse.setHeader('content-type', 'application/json');

      if (requete.method === 'GET' && url.pathname === '/files/tree') {
        reponse.end(JSON.stringify([...fichiers.keys()].map((path) => ({ path, type: 'file' }))));
      } else if (requete.method === 'GET' && url.pathname === '/files/read') {
        reponse.end(JSON.stringify({ content: fichiers.get(url.searchParams.get('path') ?? '') ?? '' }));
      } else if (requete.method === 'POST' && (url.pathname === '/files/write' || url.pathname === '/files/create')) {
        if (url.pathname === '/files/create' && fichiers.has(charge.path!)) {
          reponse.statusCode = 409;
          reponse.end(JSON.stringify({ code: 'EEXIST', error: 'File already exists' }));

          return;
        }

        if (!charge.directory) {
          fichiers.set(charge.path!, charge.content ?? '');
        }

        reponse.end(JSON.stringify({ ok: true }));
      } else if (requete.method === 'POST' && url.pathname === '/files/delete') {
        for (const cle of [...fichiers.keys()]) {
          if (cle === charge.path || cle.startsWith(`${charge.path}/`)) {
            fichiers.delete(cle);
          }
        }

        reponse.end(JSON.stringify({ ok: true }));
      } else if (requete.method === 'POST' && url.pathname === '/files/rename') {
        fichiers.set(charge.to!, fichiers.get(charge.from!) ?? '');
        fichiers.delete(charge.from!);
        reponse.end(JSON.stringify({ ok: true }));
      } else {
        reponse.end(JSON.stringify({ ok: true }));
      }
    });
  });

  await new Promise<void>((resoudre) => agent.listen(0, '127.0.0.1', () => resoudre()));

  const gestionnaire = createServer((requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://manager.local');
    reponse.setHeader('content-type', 'application/json');
    reponse.end(
      JSON.stringify(url.pathname.endsWith('/agent-token') ? { token: 'runtime-token' } : { status: 'RUNNING' }),
    );
  });

  await new Promise<void>((resoudre) => gestionnaire.listen(0, '127.0.0.1', () => resoudre()));

  const portAgent = (agent.address() as { port: number }).port;
  const portGestionnaire = (gestionnaire.address() as { port: number }).port;
  const precedentGestionnaire = process.env.WORKSPACE_MANAGER_URL;
  const precedentAgent = process.env.WORKSPACE_AGENT_URL_TEMPLATE;
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${portGestionnaire}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${portAgent}`;

  return {
    fichiers,
    appels,
    async fermer() {
      if (precedentGestionnaire === undefined) {
        delete process.env.WORKSPACE_MANAGER_URL;
      } else {
        process.env.WORKSPACE_MANAGER_URL = precedentGestionnaire;
      }

      if (precedentAgent === undefined) {
        delete process.env.WORKSPACE_AGENT_URL_TEMPLATE;
      } else {
        process.env.WORKSPACE_AGENT_URL_TEMPLATE = precedentAgent;
      }

      await Promise.all(
        [agent, gestionnaire].map(
          (serveur: Server) => new Promise<void>((resoudre) => serveur.close(() => resoudre())),
        ),
      );
    },
  };
}

async function context() {
  const runtime = await demarrerRuntime();
  const store = new TestApiStore();
  const projectStorage = new LocalProjectStorage();
  const app = await buildApiApp({ store, projectStorage });

  const registration = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `durability-${crypto.randomUUID()}@example.com`,
      password: 'password123',
      name: 'Durability',
      organizationName: 'Durability Test',
    },
  });
  expect(registration.statusCode).toBe(201);

  const headers = { authorization: `Bearer ${registration.json().token}` };

  const project = await app.inject({
    method: 'POST',
    url: `/orgs/${registration.json().organization.id}/projects`,
    headers,
    payload: { name: 'Durability test' },
  });
  expect(project.statusCode).toBe(201);

  const projectId = project.json().project.id as string;

  const save = (method: 'PUT' | 'POST', path: string, content: string, extraHeaders = {}) =>
    app.inject({
      method,
      url: `/api/runtime/workspaces/${projectId}/files${method === 'PUT' ? '/write' : ''}`,
      headers: { ...headers, ...extraHeaders },
      payload: { path, content },
    });
  const exportFiles = async () => {
    const response = await app.inject({ method: 'GET', url: `/projects/${projectId}/export/zip`, headers });
    expect(response.statusCode).toBe(200);

    const zip = await JSZip.loadAsync(response.json().archive.base64, { base64: true });

    return Object.fromEntries(
      await Promise.all(
        Object.values(zip.files)
          .filter((file) => !file.dir)
          .map(async (file) => [file.name, await file.async('string')]),
      ),
    );
  };

  return {
    app,
    store,
    projectStorage,
    runtime,
    projectId,
    headers,
    save,
    exportFiles,
    close: async () => {
      vi.restoreAllMocks();
      await app.close();
      await runtime.fermer();
    },
  };
}

function expectPersistenceFailure(response: { statusCode: number; body: string; json(): any }, runtime: string) {
  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({
    code: 'PROJECT_FILE_PERSISTENCE_FAILED',
    retryable: false,
    persistence: { runtime, manifest: 'unconfirmed' },
  });
  expect(response.body).not.toContain('STORAGE_SECRET_CANARY');
}

describe('runtime save durability acknowledgements', () => {
  it.each(['PUT', 'POST'] as const)('%s fails before changing runtime when the manifest is absent', async (method) => {
    const c = await context();

    try {
      const original = await c.exportFiles();
      expect(Object.keys(original).length).toBeGreaterThan(0);
      c.store.projectIdeStates.delete(c.projectId);

      const before = c.runtime.appels.length;
      expectPersistenceFailure(await c.save(method, 'src/new.ts', 'new'), 'not_applied');
      expect(c.runtime.appels.slice(before)).not.toContain(`POST /files/${method === 'PUT' ? 'write' : 'create'}`);
      expect(c.runtime.fichiers.has('src/new.ts')).toBe(false);
      expect(c.store.projectIdeStates.has(c.projectId)).toBe(false);
      expect(await c.exportFiles()).toEqual(original);
    } finally {
      await c.close();
    }
  });

  it.each(['PUT', 'POST'] as const)(
    '%s reports failed durable storage and PUT retries preserve all export files',
    async (method) => {
      const c = await context();

      try {
        const original = await c.exportFiles();
        const content = 'export const saved = "exact \u00e9\nvalue";\n';

        const upsert = vi
          .spyOn(c.store, 'upsertProjectIdeState')
          .mockRejectedValueOnce(new Error('STORAGE_SECRET_CANARY'));

        const failed = await c.save(method, 'src/saved.ts', content);
        expectPersistenceFailure(failed, 'applied');
        expect(failed.json().retry).toBe('write');
        expect(upsert).toHaveBeenCalled();
        expect(c.runtime.fichiers.get('src/saved.ts')).toBe(content);
        expect(await c.exportFiles()).toEqual(original);

        if (method === 'POST') {
          const repeatedCreate = await c.save('POST', 'src/saved.ts', 'must not overwrite');
          expect(repeatedCreate.statusCode).toBe(409);
          expect(c.runtime.fichiers.get('src/saved.ts')).toBe(content);
        }

        const retry = await c.save('PUT', 'src/saved.ts', content);
        expect(retry.statusCode).toBe(204);
        expect(retry.headers['x-vc-file-persistence']).toBe('manifest');
        expect(await c.exportFiles()).toEqual({ ...original, 'src/saved.ts': content });
      } finally {
        await c.close();
      }
    },
  );

  it.each(['PUT', 'POST'] as const)(
    'the real remote adapter fails fast after partial %s and preserves a concurrent writer',
    async (method) => {
      const c = await context();

      try {
        const original = await c.exportFiles();
        const path = 'src/concurrent.ts';
        const peerContent = 'newer peer content';
        const intendedContent = 'original writer content';
        vi.spyOn(c.store, 'upsertProjectIdeState').mockRejectedValueOnce(new Error('STORAGE_SECRET_CANARY'));

        let requests = 0;

        const adapter = new RemoteKubernetesRuntimeAdapter({
          baseUrl: 'http://api.local/api/runtime',
          workspaceId: c.projectId,
          authToken: c.headers.authorization.slice('Bearer '.length),
          fetchImpl: async (input, init) => {
            requests += 1;

            const response = await c.app.inject({
              method: init?.method as 'PUT' | 'POST',
              url: new URL(String(input)).pathname,
              headers: Object.fromEntries(new Headers(init?.headers)),
              payload: init?.body as string,
            });

            if (requests === 1) {
              expect(response.json().persistence).toEqual({ runtime: 'applied', manifest: 'unconfirmed' });
              expect(c.runtime.fichiers.get(path)).toBe(intendedContent);

              // A peer commits before the first caller receives its partial-failure response.
              expect((await c.save('PUT', path, peerContent)).statusCode).toBe(204);
            }

            return new Response(response.statusCode === 204 ? null : response.body, { status: response.statusCode });
          },
        });

        await expect(
          method === 'PUT' ? adapter.writeFile(path, intendedContent) : adapter.createFile(path, intendedContent),
        ).rejects.toMatchObject({
          status: 409,
          code: 'PROJECT_FILE_PERSISTENCE_FAILED',
        });
        expect(requests).toBe(1);
        expect(c.runtime.fichiers.get(path)).toBe(peerContent);
        expect(await c.exportFiles()).toEqual({ ...original, [path]: peerContent });

        // After explicit conflict resolution, the failed call must not poison the content cache.
        await adapter.writeFile(path, intendedContent);
        expect(requests).toBe(2);
        expect(await c.exportFiles()).toEqual({ ...original, [path]: intendedContent });
      } finally {
        await c.close();
      }
    },
  );

  it.each(['stream', 'legacy-204'] as const)(
    'an identical save after %s reaches persistence and cannot hide a failure',
    async (initial) => {
      const c = await context();

      try {
        const original = await c.exportFiles();
        const path = 'config.jsonc';
        const content = '{"value":1}';

        let requests = 0;

        const adapter = new RemoteKubernetesRuntimeAdapter({
          baseUrl: 'http://api.local/api/runtime',
          workspaceId: c.projectId,
          authToken: c.headers.authorization.slice('Bearer '.length),
          fetchImpl: async (input, init) => {
            requests += 1;

            if (initial === 'legacy-204' && requests === 1) {
              // Model the old server: runtime applied, bare 204, no durable manifest update.
              c.runtime.fichiers.set(path, content);
              return new Response(null, { status: 204 });
            }

            const response = await c.app.inject({
              method: 'PUT',
              url: new URL(String(input)).pathname,
              headers: Object.fromEntries(new Headers(init?.headers)),
              payload: init?.body as string,
            });

            return new Response(response.statusCode === 204 ? null : response.body, { status: response.statusCode });
          },
        });
        await adapter.writeFile(path, content, { streaming: initial === 'stream' });
        expect(requests).toBe(1);
        expect(c.runtime.fichiers.get(path)).toBe(content);
        expect(await c.exportFiles()).toEqual(original);

        vi.spyOn(c.store, 'upsertProjectIdeState').mockRejectedValueOnce(new Error('STORAGE_SECRET_CANARY'));
        await expect(adapter.writeFile(path, content)).rejects.toMatchObject({
          code: 'PROJECT_FILE_PERSISTENCE_FAILED',
        });
        expect(requests).toBe(2);
        expect(await c.exportFiles()).toEqual(original);

        await adapter.writeFile(path, content);
        expect(requests).toBe(3);
        expect(await c.exportFiles()).toEqual({ ...original, [path]: content });
      } finally {
        await c.close();
      }
    },
  );

  it('rejects disappearance of the manifest after runtime write without manufacturing a partial manifest', async () => {
    const c = await context();

    try {
      const original = await c.exportFiles();
      const get = c.store.getProjectIdeState.bind(c.store);
      vi.spyOn(c.store, 'getProjectIdeState').mockImplementation(async (id) => {
        if (id === c.projectId && c.runtime.fichiers.has('src/disappearing.ts')) {
          c.store.projectIdeStates.delete(id);
        }

        return get(id);
      });
      expectPersistenceFailure(await c.save('PUT', 'src/disappearing.ts', 'runtime only'), 'applied');
      expect(c.runtime.fichiers.get('src/disappearing.ts')).toBe('runtime only');
      expect(c.store.projectIdeStates.has(c.projectId)).toBe(false);
      expect(await c.exportFiles()).toEqual(original);
    } finally {
      await c.close();
    }
  });

  it('does not acknowledge a storage adapter that returns success without retaining the entry', async () => {
    const c = await context();

    try {
      const original = await c.exportFiles();
      const originalRecord = (await c.store.getProjectIdeState(c.projectId))!;
      vi.spyOn(c.store, 'upsertProjectIdeState').mockResolvedValueOnce(originalRecord);
      expectPersistenceFailure(await c.save('PUT', 'src/unretained.ts', 'not retained'), 'applied');
      expect(await c.exportFiles()).toEqual(original);

      const retry = await c.save('PUT', 'src/unretained.ts', 'not retained');
      expect(retry.statusCode).toBe(204);
      expect(await c.exportFiles()).toEqual({ ...original, 'src/unretained.ts': 'not retained' });
    } finally {
      await c.close();
    }
  });

  it('remerges a concurrent unrelated manifest entry after an optimistic version conflict', async () => {
    const c = await context();

    try {
      const original = await c.exportFiles();
      const upsert = c.store.upsertProjectIdeState.bind(c.store);
      vi.spyOn(c.store, 'upsertProjectIdeState').mockImplementationOnce(async () => {
        const record = (await c.store.getProjectIdeState(c.projectId))!;
        const state = record.state as { files: { entries: Array<{ path: string; content: string }> } };
        await upsert({
          projectId: c.projectId,
          state: {
            ...state,
            files: {
              ...state.files,
              entries: [...state.files.entries, { path: 'src/peer.ts', content: 'peer change' }],
            },
          },
        });
        throw Object.assign(new Error('concurrent version'), { code: 'IDE_STATE_VERSION_CONFLICT' });
      });

      const saved = await c.save('PUT', 'src/saved.ts', 'my change');
      expect(saved.statusCode).toBe(204);
      expect(await c.exportFiles()).toEqual({ ...original, 'src/peer.ts': 'peer change', 'src/saved.ts': 'my change' });
    } finally {
      await c.close();
    }
  });

  it('retains the acknowledged manifest when export materialization is unavailable and recovers the ZIP', async () => {
    const c = await context();

    try {
      const original = await c.exportFiles();
      const saved = await c.save('PUT', 'src/storage.ts', 'durable manifest content');
      expect(saved.statusCode).toBe(204);
      expect(saved.headers['x-vc-file-persistence']).toBe('manifest');

      const restore = vi
        .spyOn(c.projectStorage, 'restoreSnapshot')
        .mockRejectedValueOnce(new Error('materialization temporarily unavailable'));
      const failedExport = await c.app.inject({
        method: 'GET',
        url: `/projects/${c.projectId}/export/zip`,
        headers: c.headers,
      });
      expect(failedExport.statusCode).toBe(500);
      expect(restore).toHaveBeenCalledTimes(1);

      const record = (await c.store.getProjectIdeState(c.projectId))!;
      expect((record.state as { files: { entries: unknown[] } }).files.entries).toContainEqual({
        path: 'src/storage.ts',
        content: 'durable manifest content',
        ecrit: true,
      });
      expect(await c.exportFiles()).toEqual({ ...original, 'src/storage.ts': 'durable manifest content' });
    } finally {
      await c.close();
    }
  });

  it('marks an unchanged seeded file as explicitly saved without removing any existing files', async () => {
    const c = await context();

    try {
      const original = await c.exportFiles();
      const record = (await c.store.getProjectIdeState(c.projectId))!;
      const state = record.state as { files: { entries: Array<{ path: string; content: string; ecrit?: true }> } };
      const entry = state.files.entries.find((file) => file.path === 'package.json')!;
      expect(entry).toBeDefined();
      delete entry.ecrit;

      const saved = await c.save('PUT', entry.path, entry.content);
      expect(saved.statusCode).toBe(204);
      expect(saved.headers['x-vc-file-persistence']).toBe('manifest');

      const persisted = (await c.store.getProjectIdeState(c.projectId))!.state as typeof state;
      expect(persisted.files.entries.find((file) => file.path === entry.path)?.ecrit).toBe(true);
      expect(await c.exportFiles()).toEqual(original);
    } finally {
      await c.close();
    }
  });

  it('labels streaming writes and directory creation as runtime-only', async () => {
    const c = await context();

    try {
      c.store.projectIdeStates.delete(c.projectId);

      const streaming = await c.save('PUT', 'src/stream.ts', 'fragment', { 'x-vc-write-origin': 'stream' });
      expect(streaming.statusCode).toBe(204);
      expect(streaming.headers['x-vc-file-persistence']).toBe('runtime-only');

      const directory = await c.app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${c.projectId}/files`,
        headers: c.headers,
        payload: { path: 'folder', directory: true },
      });
      expect(directory.statusCode).toBe(204);
      expect(directory.headers['x-vc-file-persistence']).toBe('runtime-only');
      expect(c.store.projectIdeStates.has(c.projectId)).toBe(false);
    } finally {
      await c.close();
    }
  });
});
