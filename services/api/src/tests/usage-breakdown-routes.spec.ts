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
    email: 'usage@example.com',
    name: 'Usage User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Usage Org', slug: 'usage-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'usage-token', expiresAt: new Date(Date.now() + 3600_000) });
  return { app, store, org, token: 'usage-token' };
}

describe('GET /orgs/:orgId/usage/breakdown', () => {
  it('aggregates spend + quantity per resource category for the period', async () => {
    const { app, store, org, token } = await setup();

    // Workspace compute: 3600 compute units over 10 minutes.
    await store.recordUsageEvent({
      organizationId: org.id,
      type: 'workspaces.runtimeMinutes',
      quantity: 10,
      metadata: { computeUnits: 3600 },
    });
    // Object storage: 5 GiB-months.
    await store.recordUsageEvent({ organizationId: org.id, type: 'storage.objectGiBMonths', quantity: 5 });
    // Database storage: 2 GiB-months.
    await store.recordUsageEvent({ organizationId: org.id, type: 'database.storageGiBMonths', quantity: 2 });
    // One deployment slice.
    await store.recordUsageEvent({ organizationId: org.id, type: 'deployment.compute', quantity: 1 });

    // One settled agent checkpoint at 42 cents.
    const cp = await store.createAgentCheckpoint({ organizationId: org.id, buildTier: 'power' });
    await store.completeAgentCheckpoint({ id: cp.id, status: 'COMPLETED', creditCents: 42 });

    const res = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/usage/breakdown`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const byKey = Object.fromEntries(body.categories.map((c: { key: string }) => [c.key, c]));

    // Agent = real settled checkpoint cost.
    expect(byKey.agent).toMatchObject({ quantity: 1, costCents: 42 });
    // Compute units are exact; 3600 CU × $3.20/M = 1.152¢ → ceil 2.
    expect(byKey.compute).toMatchObject({ quantity: 3600, costCents: 2 });
    // Object storage 5 GiB-months × $0.03 = 15¢.
    expect(byKey.objectStorage).toMatchObject({ quantity: 5, costCents: 15 });
    // DB storage 2 GiB-months × $0.03 = 6¢.
    expect(byKey.database).toMatchObject({ quantity: 2, costCents: 6 });

    expect(body.totalCents).toBe(42 + 2 + 15 + 6);
    expect(typeof body.periodStart).toBe('string');
    expect(body.creditsEnabled).toBe(false);
  });

  it('requires usage:read (401 without auth)', async () => {
    const { app, org } = await setup();
    const res = await app.inject({ method: 'GET', url: `/orgs/${org.id}/usage/breakdown` });
    expect(res.statusCode).toBe(401);
  });

  it('returns empty categories (no events) without erroring', async () => {
    const { app, org, token } = await setup();
    const res = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/usage/breakdown`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().totalCents).toBe(0);
    expect(res.json().categories).toHaveLength(5);
  });
});
