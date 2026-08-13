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
    email: 'grant@example.com',
    name: 'Grant User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Grant Org', slug: 'grant-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'grant-token', expiresAt: new Date(Date.now() + 3600_000) });
  return { app, store, org, token: 'grant-token' };
}

describe('GET /orgs/:orgId/credits — included grant + billing cycle', () => {
  it('reports the plan monthly grant and a billing-period window', async () => {
    const { app, store, org, token } = await setup();
    // Core plan → $25/mo included credits.
    await store.upsertSubscription({ organizationId: org.id, planKey: 'core', status: 'ACTIVE' });

    const res = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/credits`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.monthlyGrantCents).toBe(2500);
    expect(typeof body.periodStart).toBe('string');
    expect(typeof body.periodEnd).toBe('string');
  });

  it('defaults a free org to a 0 monthly grant', async () => {
    const { app, org, token } = await setup();
    const res = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/credits`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().monthlyGrantCents).toBe(0);
  });
});
