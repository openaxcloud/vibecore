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
      environment: 'development' as const,
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
      environment: 'development' as const,
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

  it('fails closed without a real provisioner and leaves no PROVISIONING row', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, project } = await setup();

    const prov = await app.inject({ method: 'POST', url: `/projects/${project.id}/database/provision`, headers: auth });
    expect(prov.statusCode).toBe(503);
    expect(prov.json()).toMatchObject({
      code: 'DATABASE_PROVISION_UNAVAILABLE',
      reason: 'DATABASE_PROVISIONER_UNAVAILABLE',
    });

    // A feature flag without its backend is not a provisioning request.
    const instance = await store.getDatabaseInstanceByProject(project.id);
    expect(instance).toBeUndefined();

    const snap = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/snapshots`,
      headers: auth,
      payload: { label: 'before migration' },
    });
    expect(snap.statusCode).toBe(409);
    expect(snap.json().code).toBe('NO_DATABASE');
  });
});

const DAY = 24 * 60 * 60 * 1000;

/** Give an org the Pro-equivalent plan (team → pro credit key → 28-day window). */
async function entitle(store: TestApiStore, organizationId: string) {
  await store.upsertSubscription({ organizationId, planKey: 'team', status: 'ACTIVE' });
}

function seedInstance(store: TestApiStore, project: { id: string; organizationId: string }) {
  store.databaseInstances.set('db1', {
    id: 'db1',
    projectId: project.id,
    organizationId: project.organizationId,
    environment: 'development' as const,
    status: 'ACTIVE',
    engine: 'postgres',
    sizeBytes: 4096,
    retentionDays: 28,
    pitrEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

describe('GET /projects/:projectId/database/recovery-points', () => {
  it('404s while the feature flag is off (dormant)', async () => {
    delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;

    const { app, project } = await setup();

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/database/recovery-points`,
      headers: auth,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('FEATURE_NOT_ENABLED');
  });

  it('returns a null window + empty points when no instance exists', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, project } = await setup();

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/database/recovery-points`,
      headers: auth,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().window).toBeNull();
    expect(res.json().recoveryPoints).toEqual([]);
  });

  it('exposes the continuous window and filters points older than the retention floor', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, org, project } = await setup();
    await entitle(store, org.id);
    seedInstance(store, project);

    // One in-window snapshot (5 days ago) and one beyond the 28-day floor (40 days ago).
    store.databaseSnapshots.set('recent', {
      id: 'recent',
      databaseInstanceId: 'db1',
      kind: 'manual',
      label: 'pre-migration',
      lsn: '0/16B3748',
      sizeBytes: 2048,
      createdAt: new Date(Date.now() - 5 * DAY).toISOString(),
    });
    store.databaseSnapshots.set('stale', {
      id: 'stale',
      databaseInstanceId: 'db1',
      kind: 'auto',
      sizeBytes: 1024,
      createdAt: new Date(Date.now() - 40 * DAY).toISOString(),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/database/recovery-points`,
      headers: auth,
    });

    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.entitlement).toEqual({ allowed: true, retentionDays: 28 });
    expect(body.window.retentionDays).toBe(28);
    expect(body.window.earliestMs).toBeLessThan(body.window.latestMs);

    // Only the in-window snapshot survives the retention-floor filter.
    expect(body.recoveryPoints.map((p: { id: string }) => p.id)).toEqual(['recent']);
    expect(body.recoveryPoints[0].lsn).toBe('0/16B3748');
  });

  it('returns a null window for a plan without rollback entitlement', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, project } = await setup();

    // Free/starter org (no subscription) → not entitled.
    seedInstance(store, project);

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/database/recovery-points`,
      headers: auth,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().entitlement).toEqual({ allowed: false, retentionDays: 0 });
    expect(res.json().window).toBeNull();
  });
});

describe('POST /projects/:projectId/database/restore', () => {
  it('404s while the feature flag is off (dormant)', async () => {
    delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;

    const { app, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restore`,
      headers: auth,
      payload: { targetTimestamp: new Date(Date.now() - DAY).toISOString() },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('FEATURE_NOT_ENABLED');
  });

  it('409s when the project has no database', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, org, project } = await setup();
    await entitle(store, org.id);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restore`,
      headers: auth,
      payload: { targetTimestamp: new Date(Date.now() - DAY).toISOString() },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('NO_DATABASE');
  });

  it('403s a restore on a plan without rollback entitlement', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, project } = await setup();
    seedInstance(store, project); // free org — not entitled

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restore`,
      headers: auth,
      payload: { targetTimestamp: new Date(Date.now() - DAY).toISOString() },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PLAN_NOT_ELIGIBLE');
  });

  it('422s a target older than the retention window', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, org, project } = await setup();
    await entitle(store, org.id);
    seedInstance(store, project);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restore`,
      headers: auth,
      payload: { targetTimestamp: new Date(Date.now() - 40 * DAY).toISOString() },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('TARGET_TOO_OLD');
  });

  it('422s a future target', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, org, project } = await setup();
    await entitle(store, org.id);
    seedInstance(store, project);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restore`,
      headers: auth,
      payload: { targetTimestamp: new Date(Date.now() + DAY).toISOString() },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('TARGET_IN_FUTURE');
  });

  it('404s an unknown snapshot id', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, org, project } = await setup();
    await entitle(store, org.id);
    seedInstance(store, project);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restore`,
      headers: auth,
      payload: { snapshotId: 'does-not-exist' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('SNAPSHOT_NOT_FOUND');
  });

  it('records a PENDING restore for a valid in-window target (202)', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, org, project } = await setup();
    await entitle(store, org.id);
    seedInstance(store, project);

    const target = new Date(Date.now() - 3 * DAY).toISOString();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restore`,
      headers: auth,
      payload: { targetTimestamp: target },
    });

    expect(res.statusCode).toBe(202);

    const body = res.json();
    expect(body.restore.status).toBe('PENDING');
    expect(body.restore.targetTimestamp).toBe(target);

    // Persisted + scoped to this project's own instance (tenant isolation).
    expect(await store.listDatabaseRestores('db1')).toHaveLength(1);
  });

  it('restores to a snapshot by id (targets its creation time)', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, org, project } = await setup();
    await entitle(store, org.id);
    seedInstance(store, project);
    store.databaseSnapshots.set('snapA', {
      id: 'snapA',
      databaseInstanceId: 'db1',
      kind: 'manual',
      sizeBytes: 512,
      createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restore`,
      headers: auth,
      payload: { snapshotId: 'snapA' },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json().restore.snapshotId).toBe('snapA');
  });

  it('422s when neither snapshotId nor targetTimestamp is provided', async () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';

    const { app, store, org, project } = await setup();
    await entitle(store, org.id);
    seedInstance(store, project);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/database/restore`,
      headers: auth,
      payload: {},
    });

    // Zod refine rejects → validation error (400/422 depending on the parse helper).
    expect([400, 422]).toContain(res.statusCode);
  });
});
