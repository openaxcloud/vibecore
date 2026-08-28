import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';
import { NoopObjectStorage, type ObjectStorage } from '../object-storage.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function activeEmptyObjectStorage(): ObjectStorage {
  const storage = new NoopObjectStorage();
  return new Proxy(storage, {
    get(target, property, receiver) {
      return property === 'active' ? true : Reflect.get(target, property, receiver);
    },
  });
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

type App = Awaited<ReturnType<typeof buildTestApiApp>>;

async function register(app: App, email: string, organizationName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Slug Tester', organizationName },
  });
  expect(response.statusCode).toBe(201);

  return response.json() as { token: string; user: { id: string }; organization: { id: string } };
}

async function createProject(app: App, orgId: string, token: string, name: string, slug?: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/orgs/${orgId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name, ...(slug ? { slug } : {}) },
  });
  expect(response.statusCode).toBe(201);

  return (response.json() as { project: { id: string; slug: string } }).project;
}

async function resolve(app: App, token: string, accountSlug: string, projectSlug: string) {
  return app.inject({
    method: 'GET',
    url: `/projects/resolve?accountSlug=${encodeURIComponent(accountSlug)}&projectSlug=${encodeURIComponent(projectSlug)}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function patchSettings(app: App, projectId: string, token: string, body: Record<string, unknown>) {
  return app.inject({
    method: 'PATCH',
    url: `/projects/${projectId}/settings`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
}

describe('F13 project slug rename + 30-day redirect + guarded delete', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'slug-rename-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'slug-rename-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildTestApiApp({
      store,
      objectStorage: activeEmptyObjectStorage(),
      projectWorkspaceDeletion: async (_action, projectId, organizationId, lease) => ({
        schemaVersion: 'workspace-project-erasure-v3',
        projectId,
        organizationId,
        databaseInventoryRetained: true,
        runtimeEffectsDrained: true,
        kubernetes: {
          deploymentsAbsent: true,
          replicaSetsAbsent: true,
          podsAbsent: true,
          servicesAbsent: true,
          endpointsAbsent: true,
          endpointSlicesAbsent: true,
          ingressesAbsent: true,
          ownedRuntimeSecretsAbsent: true,
          persistentVolumeClaimsAbsent: true,
        },
        volumes: {
          schemaVersion: 'project-volume-erasure-receipt-v1',
          operationId: lease.operationId,
          projectId,
          organizationId,
          inventoryHash: 'a'.repeat(64),
          verificationHash: 'b'.repeat(64),
          finalScanHash: 'c'.repeat(64),
          quiescenceHash: 'd'.repeat(64),
          entryCount: 0,
          erasedEntryCount: 0,
          alreadyAbsentEntryCount: 0,
          persistentVolumeClaimsAbsent: true,
          persistentVolumesAbsent: true,
          providerVolumesAbsent: true,
        },
      }),
    });
    const owner = await register(app, 'owner@example.com', 'Slug Org');
    const project = await createProject(app, owner.organization.id, owner.token, 'Alpha', 'alpha-one');

    // Learn the org slug from a resolve of the current (canonical) URL.
    const current = await resolve(app, owner.token, 'anything', project.slug);
    // `accountSlug` is validated against the project's org, so use the org slug the
    // store derived. Read it directly for determinism.
    const organization = await store.getOrganization(owner.organization.id);
    const accountSlug = organization!.slug;
    void current;

    return { store, app, owner, project, accountSlug };
  }

  it('renames the slug and resolves the old slug to the renamed project (redirect) while not expired', async () => {
    const { app, owner, project, accountSlug, store } = await setup();

    const renamed = await patchSettings(app, project.id, owner.token, { slug: 'alpha-two' });
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { project: { slug: string } }).project.slug).toBe('alpha-two');

    // A redirect row was persisted from the old slug.
    expect(store.projectSlugRedirects).toHaveLength(1);
    expect(store.projectSlugRedirects[0]).toMatchObject({ projectId: project.id, oldSlug: 'alpha-one' });

    // New slug resolves canonically (no redirect flag).
    const fresh = await resolve(app, owner.token, accountSlug, 'alpha-two');
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json()).toMatchObject({
      project: { slug: 'alpha-two' },
      canonicalPath: `/@${accountSlug}/alpha-two`,
      redirectedFromOldSlug: false,
    });

    // Old slug still resolves — to the renamed project, flagged for a 301.
    const viaOld = await resolve(app, owner.token, accountSlug, 'alpha-one');
    expect(viaOld.statusCode).toBe(200);
    expect(viaOld.json()).toMatchObject({
      project: { id: project.id, slug: 'alpha-two' },
      canonicalPath: `/@${accountSlug}/alpha-two`,
      redirectedFromOldSlug: true,
    });
  });

  it('stops resolving the old slug once the redirect has expired', async () => {
    const { app, owner, project, accountSlug, store } = await setup();

    const renamed = await patchSettings(app, project.id, owner.token, { slug: 'alpha-two' });
    expect(renamed.statusCode).toBe(200);

    // Expire the redirect (30-day window elapsed).
    store.projectSlugRedirects[0].expiresAt = new Date(Date.now() - 1000);

    const viaOld = await resolve(app, owner.token, accountSlug, 'alpha-one');
    expect(viaOld.statusCode).toBe(404);

    // The renamed slug still resolves.
    const fresh = await resolve(app, owner.token, accountSlug, 'alpha-two');
    expect(fresh.statusCode).toBe(200);
    void project;
  });

  it('rejects a rename to a slug already taken by another project in the org (409)', async () => {
    const { app, owner, project } = await setup();

    await createProject(app, owner.organization.id, owner.token, 'Beta', 'beta-one');

    const clash = await patchSettings(app, project.id, owner.token, { slug: 'beta-one' });
    expect(clash.statusCode).toBe(409);
    expect(clash.json()).toMatchObject({ code: 'PROJECT_SLUG_TAKEN' });
  });

  it('rejects a slug that normalizes to empty (400)', async () => {
    const { app, owner, project } = await setup();

    const bad = await patchSettings(app, project.id, owner.token, { slug: '!!' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ code: 'PROJECT_SLUG_INVALID' });
  });

  it('treats a same-slug rename as a no-op (no redirect minted)', async () => {
    const { app, owner, project, store } = await setup();

    const same = await patchSettings(app, project.id, owner.token, { slug: 'alpha-one' });
    expect(same.statusCode).toBe(200);
    expect(store.projectSlugRedirects).toHaveLength(0);
  });

  it('permanently deletes only when the name confirmation matches', async () => {
    const { app, owner, project } = await setup();

    const missingIdempotencyKey = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/permanent`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { confirmName: 'Alpha' },
    });
    expect(missingIdempotencyKey.statusCode).toBe(400);
    expect(missingIdempotencyKey.json()).toMatchObject({
      code: 'PROJECT_PERMANENT_DELETE_IDEMPOTENCY_KEY_REQUIRED',
    });

    const wrong = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/permanent`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `permanent-delete-${project.id}`,
      },
      payload: { confirmName: 'Not The Name' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({ code: 'PROJECT_NAME_MISMATCH' });

    // Project still exists.
    expect(
      await app
        .inject({
          method: 'GET',
          url: `/projects/${project.id}`,
          headers: { authorization: `Bearer ${owner.token}` },
        })
        .then((r) => r.statusCode),
    ).toBe(200);

    const right = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/permanent`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `permanent-delete-${project.id}`,
      },
      payload: { confirmName: 'Alpha' },
    });
    expect(right.statusCode).toBe(200);

    const gone = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(gone.statusCode).toBe(404);
  });
});
