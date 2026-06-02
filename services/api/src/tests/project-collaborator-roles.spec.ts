import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

async function register(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string, organizationName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Role Tester', organizationName },
  });
  expect(response.statusCode).toBe(201);

  return response.json() as { token: string; user: { id: string }; organization: { id: string } };
}

describe('project collaborator role enforcement', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'role-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'role-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, 'owner@example.com', 'Role Org');

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Role Project' },
    });
    expect(project.statusCode).toBe(201);
    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { store, app, owner, projectId };
  }

  it('blocks a read-only (viewer) collaborator from writing, even with an org write role', async () => {
    const { store, app, owner, projectId } = await setup();
    const viewer = await register(app, 'viewer@example.com', 'Viewer Org');

    // Org role 'member' grants projects:write at the org level...
    await store.addMember({ organizationId: owner.organization.id, userId: viewer.user.id, roleKey: 'member' });
    // ...but the per-project collaborator role is read-only.
    await store.addProjectCollaborator({ projectId, userId: viewer.user.id, roleKey: 'viewer' });

    const write = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: { authorization: `Bearer ${viewer.token}` },
      payload: { name: 'Renamed by viewer' },
    });

    expect(write.statusCode).toBe(403);
    expect((write.json() as { code: string }).code).toBe('PROJECT_ROLE_READ_ONLY');

    // Reads are still allowed for a viewer.
    const read = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    expect(read.statusCode).toBe(200);

    await app.close();
  });

  it('allows an editor collaborator to write', async () => {
    const { store, app, owner, projectId } = await setup();
    const editor = await register(app, 'editor@example.com', 'Editor Org');

    await store.addMember({ organizationId: owner.organization.id, userId: editor.user.id, roleKey: 'member' });
    await store.addProjectCollaborator({ projectId, userId: editor.user.id, roleKey: 'editor' });

    const write = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: { authorization: `Bearer ${editor.token}` },
      payload: { name: 'Renamed by editor' },
    });

    expect(write.statusCode).toBe(200);
    await app.close();
  });

  it('allows the owner (not an explicit collaborator) to write', async () => {
    const { app, owner, projectId } = await setup();

    const write = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Renamed by owner' },
    });

    expect(write.statusCode).toBe(200);
    await app.close();
  });
});
