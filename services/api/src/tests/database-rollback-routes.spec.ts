import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const ORIGINAL_FLAG = process.env.DB_ROLLBACK_ENABLED;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;
  } else {
    process.env.DB_ROLLBACK_ENABLED = ORIGINAL_FLAG;
  }
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'dbowner@example.com',
    name: 'DB Owner',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'DB Org', slug: 'db-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'db-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'DB Project', slug: 'db-project' });

  return { app, store, org, project };
}

const auth = { authorization: 'Bearer db-token' };

describe('database point-in-time rollback routes (Phase-1 scaffold)', () => {
  it('404s the panel when DB_ROLLBACK_ENABLED is off (dormant)', async () => {
    delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;
    const { app, project } = await setup();

    const res = await app.inject({ method: 'GET', url: `/projects/${project.id}/database`, headers: auth });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('FEATURE_NOT_ENABLED');
  });

  it('returns the plan entitlement and a null instance when none exists', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';
    const { app, project } = await setup();

    const res = await app.inject({ method: 'GET', url: `/projects/${project.id}/database`, headers: auth });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // A fresh org resolves to the free/starter plan → no rollback entitlement.
    expect(body.entitlement).toEqual({ allowed: false, retentionDays: 0 });
    expect(body.instance).toBeNull();
    expect(body.snapshots).toEqual([]);
    expect(body.restores).toEqual([]);
  });

  it('surfaces an existing instance with its recovery points', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';
    const { app, store, org, project } = await setup();

    store.databaseInstances.set('db1', {
      id: 'db1',
      projectId: project.id,
      organizationId: org.id,
      status: 'ACTIVE',
      engine: 'postgres',
      sizeBytes: 1024,
      retentionDays: 7,
      pitrEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    store.databaseSnapshots.set('snap1', {
      id: 'snap1',
      databaseInstanceId: 'db1',
      kind: 'auto',
      sizeBytes: 512,
      createdAt: new Date().toISOString(),
    });

    const res = await app.inject({ method: 'GET', url: `/projects/${project.id}/database`, headers: auth });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.instance.id).toBe('db1');
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0].id).toBe('snap1');
  });

  it('rejects a restore on a plan without rollback entitlement (403)', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';
    const { app, store, org, project } = await setup();

    store.databaseInstances.set('db1', {
      id: 'db1',
      projectId: project.id,
      organizationId: org.id,
      status: 'ACTIVE',
      engine: 'postgres',
      sizeBytes: 1024,
      retentionDays: 0,
      pitrEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restores`,
      headers: auth,
      payload: { targetTimestamp: new Date(Date.now() - 60_000).toISOString() },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PLAN_NOT_ELIGIBLE');
  });

  it('409s a restore when the project has no database', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';
    const { app, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restores`,
      headers: auth,
      payload: { targetTimestamp: new Date(Date.now() - 60_000).toISOString() },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('NO_DATABASE');
  });

  it('404s provision + snapshot while the feature flag is off', async () => {
    delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;
    const { app, project } = await setup();

    const prov = await app.inject({ method: 'POST', url: `/projects/${project.id}/database/provision`, headers: auth });
    expect(prov.statusCode).toBe(404);
    const snap = await app.inject({ method: 'POST', url: `/projects/${project.id}/database/snapshots`, headers: auth });
    expect(snap.statusCode).toBe(404);
  });

  it('provisions a (dormant) instance row, then takes a manual snapshot', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';
    const { app, store, project } = await setup();

    const prov = await app.inject({ method: 'POST', url: `/projects/${project.id}/database/provision`, headers: auth });
    expect(prov.statusCode).toBe(202);
    expect(prov.json().created).toBe(true);
    // No provisioner port/bucket configured → no real Postgres, just the row.
    const instance = await store.getDatabaseInstanceByProject(project.id);
    expect(instance?.status).toBe('PROVISIONING');

    const snap = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/snapshots`,
      headers: auth,
      payload: { label: 'before migration' },
    });
    expect(snap.statusCode).toBe(202);
    expect(snap.json().snapshot.kind).toBe('manual');
    expect(await store.listDatabaseSnapshots(instance!.id)).toHaveLength(1);
  });
});
