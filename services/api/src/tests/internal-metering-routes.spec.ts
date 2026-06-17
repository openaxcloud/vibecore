import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const SECRET = 'internal-secret';
const internalAuth = { authorization: `Bearer ${SECRET}` };

const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
const prevCredits = process.env.BILLING_CREDITS_ENABLED;

afterEach(() => {
  if (prevSecret === undefined) {
    delete process.env.INTERNAL_API_SHARED_SECRET;
  } else {
    process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
  }
  if (prevCredits === undefined) {
    delete process.env.BILLING_CREDITS_ENABLED;
  } else {
    process.env.BILLING_CREDITS_ENABLED = prevCredits;
  }
});

async function setup() {
  process.env.INTERNAL_API_SHARED_SECRET = SECRET;
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const owner = await store.createUser({
    email: 'owner@example.com',
    name: 'Owner',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Org', slug: 'org', ownerUserId: owner.id });
  return { app, store, org };
}

describe('internal metering ingest', () => {
  it('rejects calls without the internal secret', async () => {
    const { app, org } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/metering',
      payload: { kind: 'compute', organizationId: org.id, cpuMillicores: 1000, ramMb: 2048, seconds: 600 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('records a workspace compute event (shadow by default) and computes credit units', async () => {
    const { app, store, org } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/metering',
      headers: internalAuth,
      payload: { kind: 'compute', organizationId: org.id, projectId: 'p1', cpuMillicores: 1000, ramMb: 2048, seconds: 600 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kind).toBe('compute');
    expect(body.shadow).toBe(true); // BILLING_CREDITS_ENABLED not set
    expect(body.result.computeUnits).toBeGreaterThan(0);
    expect(body.result.minutes).toBe(10);

    const events = await store.listUsageEvents(org.id);
    expect(events.some((e: { type: string }) => e.type === 'workspaces.runtimeMinutes')).toBe(true);
  });

  it('records object-storage, database and deployment events', async () => {
    const { app, store, org } = await setup();

    const storage = await app.inject({
      method: 'POST',
      url: '/internal/metering',
      headers: internalAuth,
      payload: { kind: 'object-storage', organizationId: org.id, gibMonths: 5, transferGib: 2 },
    });
    expect(storage.statusCode).toBe(200);

    const db = await app.inject({
      method: 'POST',
      url: '/internal/metering',
      headers: internalAuth,
      payload: { kind: 'database', organizationId: org.id, cpuMillicores: 500, ramMb: 1024, hours: 3 },
    });
    expect(db.statusCode).toBe(200);

    const deploy = await app.inject({
      method: 'POST',
      url: '/internal/metering',
      headers: internalAuth,
      payload: { kind: 'deployment', organizationId: org.id, deploymentKind: 'autoscale', computeUnits: 1000, requests: 5000 },
    });
    expect(deploy.statusCode).toBe(200);

    const types = (await store.listUsageEvents(org.id)).map((e: { type: string }) => e.type);
    expect(types).toContain('storage.objectGiBMonths');
    expect(types).toContain('database.activeHours');
  });

  it('rejects an unknown metering kind', async () => {
    const { app, org } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/metering',
      headers: internalAuth,
      payload: { kind: 'nonsense', organizationId: org.id },
    });
    expect(res.statusCode).toBe(400);
  });
});
