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
    payload: { email, password: 'password123', name: 'Soft Delete Tester', organizationName },
  });
  expect(response.statusCode).toBe(201);

  return response.json() as { token: string; user: { id: string }; organization: { id: string } };
}

/**
 * Regression coverage for the soft-delete authorization gap: `getProject`
 * intentionally still resolves soft-deleted rows (so restore can find them),
 * so deletion must be enforced in `requireProject`. Without that, a "deleted"
 * project disappeared from the dashboard/slug routing but every direct
 * /projects/:projectId/* endpoint kept reading and mutating it.
 */
describe('soft-deleted project access enforcement', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'soft-delete-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'soft-delete-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, 'owner@example.com', 'Soft Delete Org');

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Soft Delete Project' },
    });
    expect(project.statusCode).toBe(201);
    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { store, app, owner, projectId };
  }

  it('returns 404 for reads and writes on a soft-deleted project, and serves it again after restore', async () => {
    const { app, owner, projectId } = await setup();
    const auth = { authorization: `Bearer ${owner.token}` };

    // Sanity: the project is reachable before deletion.
    const before = await app.inject({ method: 'GET', url: `/projects/${projectId}`, headers: auth });
    expect(before.statusCode).toBe(200);

    const deleted = await app.inject({ method: 'DELETE', url: `/projects/${projectId}`, headers: auth });
    expect(deleted.statusCode).toBe(200);

    // Reads now behave as if the project no longer exists.
    const readAfterDelete = await app.inject({ method: 'GET', url: `/projects/${projectId}`, headers: auth });
    expect(readAfterDelete.statusCode).toBe(404);
    expect((readAfterDelete.json() as { code: string }).code).toBe('PROJECT_NOT_FOUND');

    // Mutations are blocked too — a deleted project must not stay editable.
    const writeAfterDelete = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: auth,
      payload: { name: 'Renamed after delete' },
    });
    expect(writeAfterDelete.statusCode).toBe(404);
    expect((writeAfterDelete.json() as { code: string }).code).toBe('PROJECT_NOT_FOUND');

    // Restore opts into allowDeleted and brings the project back.
    const restore = await app.inject({ method: 'POST', url: `/projects/${projectId}/restore`, headers: auth });
    expect(restore.statusCode).toBe(200);

    const readAfterRestore = await app.inject({ method: 'GET', url: `/projects/${projectId}`, headers: auth });
    expect(readAfterRestore.statusCode).toBe(200);
  });
});
