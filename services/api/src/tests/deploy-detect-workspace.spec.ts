import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

const manifests = vi.hoisted(() => ({ reads: [] as string[] }));
vi.mock('../deploy-workspace-agent.js', () => ({
  createWorkspaceBuildAgent: ({ agentWsBaseUrl }: { agentWsBaseUrl: string }) => ({
    readFile: async (path: string) => {
      manifests.reads.push(`${agentWsBaseUrl}/${path}`);
      if (path !== 'package.json') throw new Error('File absent in isolated fixture');
      return {
        content: JSON.stringify(
          agentWsBaseUrl.includes('workspace-secondary')
            ? { dependencies: { next: '15.0.0' }, scripts: { start: 'next start' } }
            : { dependencies: { vite: '6.0.0' }, scripts: { build: 'vite build' } },
        ),
      };
    },
    listFiles: async () => ({ files: [{ path: 'package.json' }] }),
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  manifests.reads.length = 0;
});

async function setup() {
  vi.stubEnv('WORKSPACE_AGENT_URL_TEMPLATE', 'http://{workspaceId}.isolated.test');
  vi.stubGlobal('WebSocket', class IsolatedSocket {});
  const transport = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/agent-token')) return Response.json({ token: 'isolated-fixture-token' });
    if (url.endsWith('.isolated.test/health')) return Response.json({ ok: true });
    throw new Error(`Unexpected external request: ${url}`);
  });
  vi.stubGlobal('fetch', transport);
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: { send: async () => undefined } });
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'detect-workspace@example.test',
      password: 'isolated-password-123',
      name: 'Isolated',
      organizationName: 'Isolated org',
    },
  });
  expect(register.statusCode).toBe(201);
  const auth = register.json();
  const headers = { authorization: `Bearer ${auth.token}` };
  const created = await app.inject({
    method: 'POST',
    url: `/orgs/${auth.organization.id}/projects`,
    headers,
    payload: { name: 'Isolated detect project' },
  });
  expect(created.statusCode).toBe(201);
  const projectId = created.json().project.id;
  const primary = await store.createWorkspace({
    id: 'workspace-primary',
    projectId,
    name: 'Primary',
    runtimeMode: 'remote',
  });
  await store.createWorkspace({ id: 'workspace-secondary', projectId, name: 'Secondary', runtimeMode: 'remote' });
  await store.createWorkspace({
    id: 'workspace-foreign',
    projectId: 'another-project',
    name: 'Foreign',
    runtimeMode: 'remote',
  });
  transport.mockClear();
  return { app, projectId, primary, headers, transport };
}

describe('deployment detection uses the authorized selected workspace', () => {
  it('detects distinct targets for two workspaces and preserves the default without a query', async () => {
    const { app, projectId, primary, headers } = await setup();
    try {
      const selected = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/detect?workspaceId=workspace-secondary`,
        headers,
      });
      expect(selected.statusCode).toBe(200);
      expect(selected.json()).toMatchObject({ mode: 'server', framework: 'nextjs' });
      expect(manifests.reads.every((path) => path.includes('workspace-secondary'))).toBe(true);
      manifests.reads.length = 0;
      const defaultResult = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/detect`,
        headers,
      });
      expect(defaultResult.statusCode).toBe(200);
      expect(defaultResult.json()).toMatchObject({ mode: 'static' });
      expect(manifests.reads.every((path) => path.includes(primary.id))).toBe(true);
      expect(manifests.reads.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('rejects a workspace from another project before any token or file read', async () => {
    const { app, projectId, headers, transport } = await setup();
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/detect?workspaceId=workspace-foreign`,
        headers,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
      expect(transport).not.toHaveBeenCalled();
      expect(manifests.reads).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
