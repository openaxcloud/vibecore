import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const ENV_KEYS = [
  'DB_ROLLBACK_ENABLED',
  'DB_BACKUP_BUCKET',
  'WORKSPACE_MANAGER_URL',
  'WORKSPACE_MANAGER_SHARED_SECRET',
  'DB_PROVISION_TIMEOUT_MS',
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.DB_ROLLBACK_ENABLED = 'true';
  process.env.DB_BACKUP_BUCKET = 'database-backups-test';
  process.env.WORKSPACE_MANAGER_URL = 'http://manager.test';
  process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'manager-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();

  for (const key of ENV_KEYS) {
    const value = originalEnv[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

async function setup(suffix: string) {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const owner = await store.createUser({
    email: `db-owner-${suffix}@example.com`,
    name: 'DB Owner',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: `DB Org ${suffix}`, slug: `db-org-${suffix}`, ownerUserId: owner.id });
  const token = `db-token-${suffix}`;
  await store.createSession({ userId: owner.id, token, expiresAt: new Date(Date.now() + 3_600_000) });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });
  const project = await store.createProject({
    organizationId: org.id,
    name: `DB Project ${suffix}`,
    slug: `db-project-${suffix}`,
  });

  return { app, store, org, project, auth: { authorization: `Bearer ${token}` } };
}

function managerResponse(status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(status === 200 ? '{}' : 'unavailable', { status })),
  );
}

describe('managed database provisioning routes', () => {
  it('persists a deadline only after a real provider accepts the request', async () => {
    managerResponse(200);
    const { app, store, project, auth } = await setup('accepted');

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/provision`,
      headers: auth,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ created: true, retried: false, tier: 'isolated' });
    const instance = await store.getDatabaseInstanceByProject(project.id);
    expect(instance).toMatchObject({ status: 'PROVISIONING' });
    expect(instance?.lastErrorCode).toBeUndefined();
    expect(Date.parse(instance!.provisioningDeadlineAt!)).toBeGreaterThan(Date.now());
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(2); // Cluster + ScheduledBackup
    expect(calls.every((call) => call[1]?.method === 'POST')).toBe(true);
    expect(calls.every((call) => new Headers(call[1]?.headers).get('authorization') === 'Bearer manager-secret')).toBe(
      true,
    );
    await app.close();
  });

  it('stores kickoff failure as FAILED and atomically reclaims that row for retry', async () => {
    managerResponse(503);
    const { app, store, project, auth } = await setup('retry');

    const failed = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/provision`,
      headers: auth,
    });

    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toMatchObject({
      code: 'DATABASE_PROVISION_UNAVAILABLE',
      reason: 'DATABASE_PROVISION_KICKOFF_FAILED',
      instance: { status: 'FAILED', lastErrorCode: 'DATABASE_PROVISION_KICKOFF_FAILED' },
    });
    const failedInstance = await store.getDatabaseInstanceByProject(project.id);
    expect(failedInstance?.status).toBe('FAILED');

    managerResponse(200);
    const retried = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/provision`,
      headers: auth,
    });

    expect(retried.statusCode).toBe(202);
    expect(retried.json()).toMatchObject({ created: false, retried: true });
    expect((await store.getDatabaseInstanceByProject(project.id))?.status).toBe('PROVISIONING');
    expect(store.databaseInstances.size).toBe(1);
    await app.close();
  });

  it('reconcile-on-read expires a stalled request and returns a structured FAILED card', async () => {
    managerResponse(404); // no healthy Cluster yet
    const { app, store, org, project, auth } = await setup('timeout');
    store.databaseInstances.set('db-timeout', {
      id: 'db-timeout',
      projectId: project.id,
      organizationId: org.id,
      environment: 'development',
      status: 'PROVISIONING',
      engine: 'postgres',
      sizeBytes: 0,
      retentionDays: 28,
      pitrEnabled: true,
      provisioningDeadlineAt: new Date(Date.now() - 1_000).toISOString(),
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/databases`,
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().environments).toEqual([
      expect.objectContaining({
        key: 'DATABASE_URL',
        environment: 'development',
        managed: true,
        status: 'FAILED',
        lastErrorCode: 'DATABASE_PROVISION_TIMED_OUT',
      }),
    ]);
    expect((await store.getDatabaseInstanceByProject(project.id))?.status).toBe('FAILED');
    await app.close();
  });

  it('does not reveal or mutate another tenant when provisioning is requested cross-project', async () => {
    managerResponse(200);
    const owner = await setup('tenant-owner');
    const outsider = await owner.store.createUser({
      email: 'db-tenant-outsider@example.com',
      name: 'Outsider',
      passwordHash: hashPassword('password123'),
    });
    await owner.store.createOrganization({ name: 'Outsider Org', slug: 'db-outsider-org', ownerUserId: outsider.id });
    await owner.store.createSession({
      userId: outsider.id,
      token: 'db-outsider-token',
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const response = await owner.app.inject({
      method: 'POST',
      url: `/projects/${owner.project.id}/database/provision`,
      headers: { authorization: 'Bearer db-outsider-token' },
    });

    expect(response.statusCode).toBe(404);
    expect(await owner.store.getDatabaseInstanceByProject(owner.project.id)).toBeUndefined();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    await owner.app.close();
  });
});
