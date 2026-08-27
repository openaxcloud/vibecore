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
    await store.addProjectCollaborator({
      projectId,
      expectedOrganizationId: owner.organization.id,
      userId: viewer.user.id,
      roleKey: 'viewer',
    });

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
    await store.addProjectCollaborator({
      projectId,
      expectedOrganizationId: owner.organization.id,
      userId: editor.user.id,
      roleKey: 'editor',
    });

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

  it('authorizes a collaborator who is NOT an organization member (e.g. redeemed a share link)', async () => {
    const { store, app, owner, projectId } = await setup();
    // `outsider` belongs only to their own org, never to the project's org.
    const outsider = await register(app, 'outsider@example.com', 'Outsider Org');
    await store.addProjectCollaborator({
      projectId,
      expectedOrganizationId: owner.organization.id,
      userId: outsider.user.id,
      roleKey: 'editor',
    });

    const read = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(read.statusCode).toBe(200);

    const write = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: { name: 'Renamed by outside editor' },
    });
    expect(write.statusCode).toBe(200);

    await app.close();
  });

  it('keeps a collaborator-only viewer read-only', async () => {
    const { store, app, owner, projectId } = await setup();
    const outsider = await register(app, 'outside-viewer@example.com', 'Outside Viewer Org');
    await store.addProjectCollaborator({
      projectId,
      expectedOrganizationId: owner.organization.id,
      userId: outsider.user.id,
      roleKey: 'viewer',
    });

    const read = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(read.statusCode).toBe(200);

    const write = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: { name: 'Should be blocked' },
    });
    expect(write.statusCode).toBe(403);
    expect((write.json() as { code: string }).code).toBe('PROJECT_ROLE_READ_ONLY');

    await app.close();
  });

  it('adds a collaborator by email (resolved to a user server-side)', async () => {
    const { store, app, owner, projectId } = await setup();
    const teammate = await register(app, 'by-email@example.com', 'Teammate Org');
    // Collaborators must already be org members.
    await store.addMember({ organizationId: owner.organization.id, userId: teammate.user.id, roleKey: 'member' });

    const added = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaborators`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'by-email@example.com', roleKey: 'editor' },
    });
    expect(added.statusCode).toBe(201);

    const collaborators = await store.listProjectCollaborators(projectId);
    expect(collaborators.some((c) => c.userId === teammate.user.id && c.roleKey === 'editor')).toBe(true);

    // Unknown email → 404, not a crash.
    const missing = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaborators`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: 'nobody@example.com', roleKey: 'editor' },
    });
    expect(missing.statusCode).toBe(404);

    await app.close();
  });

  it('end-to-end: a non-member redeems a share link and gains project access', async () => {
    const { app, owner, projectId } = await setup();
    const outsider = await register(app, 'redeemer@example.com', 'Redeemer Org');

    // Owner mints a write-capable (member) share link.
    const created = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaboration/share-links`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { roleKey: 'member', expiresInMinutes: 60 },
    });
    expect(created.statusCode).toBe(201);
    const token = (created.json() as { token: string }).token;
    expect(token).toBeTruthy();

    // Before redeeming, the outsider cannot reach the project.
    const before = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(before.statusCode).toBe(404);

    // Redeem.
    const redeem = await app.inject({
      method: 'GET',
      url: `/collaboration/share-links/${encodeURIComponent(token)}`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(redeem.statusCode).toBe(200);
    expect((redeem.json() as { redeemed: boolean }).redeemed).toBe(true);

    // Now the outsider can read and write the project.
    const after = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(after.statusCode).toBe(200);

    const write = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: { name: 'Renamed after redeem' },
    });
    expect(write.statusCode).toBe(200);

    await app.close();
  });
});
