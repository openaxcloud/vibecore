import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const user = await store.createUser({
    email: 'env@example.com',
    name: 'Env User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Env Org', slug: 'env-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'env-token', expiresAt: new Date(Date.now() + 3_600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });

  return { app, store, project };
}

const auth = { authorization: 'Bearer env-token' };

describe('F11 — per-scope project env vars', () => {
  it('persists and returns the scope on upsert', async () => {
    const { app, project } = await setup();

    const put = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'API_URL', value: 'https://dev.example.com', scope: 'development' },
    });

    expect(put.statusCode).toBe(200);
    expect(put.json().envVar.scope).toBe('development');
    expect(put.json().envVar.value).toBe('https://dev.example.com');

    const list = await app.inject({ method: 'GET', url: `/projects/${project.id}/env-vars`, headers: auth });
    const rows = list.json().envVars as Array<{ key: string; scope: string; value: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'API_URL', scope: 'development', value: 'https://dev.example.com' });
  });

  it('defaults an omitted scope to production (back-compat with pre-scope clients)', async () => {
    const { app, project } = await setup();

    const put = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'LEGACY_KEY', value: 'v1' }, // no scope, as an old client would send
    });

    expect(put.statusCode).toBe(200);
    expect(put.json().envVar.scope).toBe('production');
  });

  it('reads pre-scope rows written directly to the store as production', async () => {
    const { app, store, project } = await setup();

    // Simulate a row created before scopes existed (store default fills it in).
    await store.upsertProjectEnvVar({
      projectId: project.id,
      expectedOrganizationId: project.organizationId,
      key: 'OLD_ROW',
      value: 'kept',
    });

    const list = await app.inject({ method: 'GET', url: `/projects/${project.id}/env-vars`, headers: auth });
    const rows = list.json().envVars as Array<{ key: string; scope: string; value: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'OLD_ROW', value: 'kept', scope: 'production' });
  });

  it('lets the same key hold a different value per scope (enables the diff view)', async () => {
    const { app, project } = await setup();

    for (const [scope, value] of [
      ['development', 'postgres://dev'],
      ['preview', 'postgres://preview'],
      ['production', 'postgres://prod'],
    ] as const) {
      const res = await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/env-vars`,
        headers: auth,
        payload: { key: 'DATABASE_URL', value, scope },
      });
      expect(res.statusCode).toBe(200);
    }

    const list = await app.inject({ method: 'GET', url: `/projects/${project.id}/env-vars`, headers: auth });
    const rows = (list.json().envVars as Array<{ key: string; scope: string; value: string }>).filter(
      (row) => row.key === 'DATABASE_URL',
    );

    // Cross-scope diff: three rows, one per scope, each with its own value.
    const byScope = Object.fromEntries(rows.map((row) => [row.scope, row.value]));
    expect(byScope).toEqual({
      development: 'postgres://dev',
      preview: 'postgres://preview',
      production: 'postgres://prod',
    });
  });

  it('upserting a scoped key updates only that scope', async () => {
    const { app, project } = await setup();

    await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'TOKEN', value: 'dev-1', scope: 'development' },
    });
    await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'TOKEN', value: 'prod-1', scope: 'production' },
    });
    // Update the development value again — production must be untouched.
    await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'TOKEN', value: 'dev-2', scope: 'development' },
    });

    const list = await app.inject({ method: 'GET', url: `/projects/${project.id}/env-vars`, headers: auth });
    const rows = list.json().envVars as Array<{ key: string; scope: string; value: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.scope === 'development')?.value).toBe('dev-2');
    expect(rows.find((r) => r.scope === 'production')?.value).toBe('prod-1');
  });

  it('deletes a single scope, leaving the other scopes intact', async () => {
    const { app, project } = await setup();

    for (const scope of ['development', 'production'] as const) {
      await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/env-vars`,
        headers: auth,
        payload: { key: 'SECRET_KEY', value: scope, scope },
      });
    }

    const del = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'SECRET_KEY', scope: 'development' },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().envVar.scope).toBe('development');

    const list = await app.inject({ method: 'GET', url: `/projects/${project.id}/env-vars`, headers: auth });
    const rows = list.json().envVars as Array<{ key: string; scope: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('production');
  });

  it('deleting without a scope targets the production row (back-compat)', async () => {
    const { app, project } = await setup();

    await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'DEFAULT_DELETE', value: 'dev', scope: 'development' },
    });
    await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'DEFAULT_DELETE', value: 'prod', scope: 'production' },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'DEFAULT_DELETE' }, // no scope → production
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().envVar.scope).toBe('production');

    const list = await app.inject({ method: 'GET', url: `/projects/${project.id}/env-vars`, headers: auth });
    const rows = list.json().envVars as Array<{ key: string; scope: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('development');
  });

  it('rejects an unknown scope value', async () => {
    const { app, project } = await setup();

    const put = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/env-vars`,
      headers: auth,
      payload: { key: 'BAD', value: 'x', scope: 'staging' },
    });

    expect(put.statusCode).toBeGreaterThanOrEqual(400);
    expect(put.statusCode).toBeLessThan(500);
  });
});
