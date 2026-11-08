import { afterEach, describe, expect, it, vi } from 'vitest';

// API tests intentionally exercise the service entrypoint, not the frontend alias.
// eslint-disable-next-line no-restricted-imports
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

const apps: Awaited<ReturnType<typeof buildApiApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: { send: async () => undefined } });
  apps.push(app);

  const registration = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'ide-migration@example.com',
      password: 'password123',
      name: 'Migration',
      organizationName: 'Migration',
    },
  });
  expect(registration.statusCode).toBe(201);

  const auth = registration.json();
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await app.inject({
    method: 'POST',
    url: `/orgs/${auth.organization.id}/projects`,
    headers,
    payload: { name: 'Migration' },
  });
  expect(creation.statusCode).toBe(201);

  const projectId = creation.json().project.id as string;

  const saveProject = (state: Record<string, unknown>) =>
    app.inject({ method: 'PUT', url: `/projects/${projectId}/ide-state`, headers, payload: { state } });

  const get = (id: string) => app.inject({ method: 'GET', url: `/workspaces/${id}/ide-state`, headers });

  return { app, store, headers, projectId, saveProject, get };
}
describe('project UI migration to the first development workspace', () => {
  it('restores latest project UI after creation, without chat, and preserves ETags', async () => {
    const f = await setup();
    await f.saveProject({ ui: { agentWidth: 340 }, chat: { messages: [{ id: 'project-chat' }] } });

    const created = await f.app.inject({
      method: 'POST',
      url: `/projects/${f.projectId}/workspaces`,
      headers: f.headers,
      payload: { name: 'Primary', runtimeMode: 'remote-kubernetes' },
    });
    expect(created.statusCode).toBe(201);

    const id = created.json().workspace.id;
    const ui = { agentWidth: 520, selectedFile: 'src/App.tsx', paneTree: { id: 'snapshots' } };
    await f.saveProject({ ui });

    const response = await f.get(id);
    expect(response.statusCode).toBe(200);
    expect(response.json().ideState).toMatchObject({ workspaceId: id, state: { ui }, version: 1 });
    expect(response.json().ideState.state).not.toHaveProperty('chat');
    expect(response.headers.etag).toBe('"1"');
    expect((await f.store.getProjectIdeState(f.projectId))?.state).toHaveProperty('chat');

    const saved = await f.app.inject({
      method: 'PUT',
      url: `/workspaces/${id}/ide-state`,
      headers: { ...f.headers, 'if-match': '"1"' },
      payload: { state: { ui: { agentWidth: 600 } } },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.headers.etag).toBe('"2"');

    const stale = await f.app.inject({
      method: 'PUT',
      url: `/workspaces/${id}/ide-state`,
      headers: { ...f.headers, 'if-match': '"1"' },
      payload: { state: { ui: { agentWidth: 700 } } },
    });
    expect(stale.statusCode).toBe(412);
  });
  it('excludes production and secondary workspaces and preserves existing empty state', async () => {
    const f = await setup();

    const prod = await f.store.createWorkspace({
      projectId: f.projectId,
      name: 'Production',
      runtimeMode: 'remote-kubernetes',
      environment: 'production',
    });
    const primary = await f.store.createWorkspace({
      projectId: f.projectId,
      name: 'Primary',
      runtimeMode: 'remote-kubernetes',
    });
    const secondary = await f.store.createWorkspace({
      projectId: f.projectId,
      name: 'Secondary',
      runtimeMode: 'remote-kubernetes',
    });
    await f.saveProject({ ui: { agentWidth: 520 } });
    expect((await f.get(prod.id)).json().ideState).toBeNull();
    expect((await f.get(secondary.id)).json().ideState).toBeNull();
    await f.store.upsertWorkspaceIdeState({ workspaceId: primary.id, state: {} });
    expect((await f.get(primary.id)).json().ideState.state).toEqual({});

    const denied = await f.app.inject({ method: 'GET', url: `/workspaces/${primary.id}/ide-state` });
    expect(denied.statusCode).toBe(401);
  });
  it('keeps a concurrent workspace writer, its version and empty state', async () => {
    const f = await setup();

    const workspace = await f.store.createWorkspace({
      projectId: f.projectId,
      name: 'Primary',
      runtimeMode: 'remote-kubernetes',
    });
    await f.saveProject({ ui: { agentWidth: 520 } });

    const insert = f.store.createWorkspaceIdeStateIfAbsent.bind(f.store);
    vi.spyOn(f.store, 'createWorkspaceIdeStateIfAbsent').mockImplementationOnce(async (input) => {
      await f.store.upsertWorkspaceIdeState({ workspaceId: workspace.id, state: { ui: { agentWidth: 700 } } });
      await f.store.upsertWorkspaceIdeState({ workspaceId: workspace.id, state: {} });

      return insert(input);
    });

    const response = await f.get(workspace.id);
    expect(response.json().ideState.state).toEqual({});
    expect(response.headers.etag).toBe('"2"');
  });

  it('initializes once across simultaneous reads and merges a first PUT with legacy UI', async () => {
    const f = await setup();

    const workspace = await f.store.createWorkspace({
      projectId: f.projectId,
      name: 'Primary',
      runtimeMode: 'remote-kubernetes',
    });
    await f.saveProject({ ui: { agentWidth: 520, selectedFile: 'src/App.tsx' } });

    const put = await f.app.inject({
      method: 'PUT',
      url: `/workspaces/${workspace.id}/ide-state`,
      headers: f.headers,
      payload: { state: { ui: { agentWidth: 600 } } },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().ideState.state.ui).toEqual({ agentWidth: 600, selectedFile: 'src/App.tsx' });
    await f.saveProject({ ui: { agentWidth: 900 } });

    const responses = await Promise.all([f.get(workspace.id), f.get(workspace.id)]);

    for (const response of responses) {
      expect(response.headers.etag).toBe('"2"');
      expect(response.json().ideState.state.ui.agentWidth).toBe(600);
    }
  });

  it('creates one migration version for racing first readers', async () => {
    const f = await setup();

    const workspace = await f.store.createWorkspace({
      projectId: f.projectId,
      name: 'Primary',
      runtimeMode: 'remote-kubernetes',
    });
    await f.saveProject({ ui: { agentWidth: 520 } });

    const responses = await Promise.all([f.get(workspace.id), f.get(workspace.id)]);
    expect(responses.map((response) => response.headers.etag)).toEqual(['"1"', '"1"']);
  });
  it('allows only one concurrent conditional writer after migration', async () => {
    const f = await setup();

    const workspace = await f.store.createWorkspace({
      projectId: f.projectId,
      name: 'Primary',
      runtimeMode: 'remote-kubernetes',
    });
    await f.saveProject({ ui: { agentWidth: 520 } });
    await f.get(workspace.id);

    const responses = await Promise.all(
      [600, 700].map((agentWidth) =>
        f.app.inject({
          method: 'PUT',
          url: `/workspaces/${workspace.id}/ide-state`,
          headers: { ...f.headers, 'if-match': '"1"' },
          payload: { state: { ui: { agentWidth } } },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 412]);
    expect((await f.get(workspace.id)).headers.etag).toBe('"2"');
  });
});
