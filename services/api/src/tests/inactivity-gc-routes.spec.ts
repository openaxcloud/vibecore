import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'internal-secret';
const internalAuth = { authorization: `Bearer ${SECRET}` };

const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;

afterEach(() => {
  if (prevSecret === undefined) {
    delete process.env.INTERNAL_API_SHARED_SECRET;
  } else {
    process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
  }
});

async function setup() {
  process.env.INTERNAL_API_SHARED_SECRET = SECRET;
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const now = Date.now();

  const mkUser = async (email: string, lastActiveDaysAgo: number) => {
    const u = await store.createUser({ email, name: email, passwordHash: hashPassword('password123') });
    await store.touchUserActivity(u.id, now - lastActiveDaysAgo * DAY);
    return u;
  };

  const inactiveFree = await mkUser('inactive-free@example.com', 400); // eligible
  const warningFree = await mkUser('warning-free@example.com', 340); // warning
  const recentFree = await mkUser('recent-free@example.com', 10); // not a candidate

  const inactivePaid = await mkUser('inactive-paid@example.com', 400);
  const org = await store.createOrganization({ name: 'Paid Org', slug: 'paid-org', ownerUserId: inactivePaid.id });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'pro', status: 'ACTIVE' });

  return { app, store, inactiveFree, warningFree, recentFree, inactivePaid };
}

describe('internal inactivity GC', () => {
  it('rejects calls without the internal secret', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/internal/inactivity-gc', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('dry-runs by default: counts warnings/eligible, exempts paid, deletes nothing', async () => {
    const { app, store, inactiveFree } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/internal/inactivity-gc',
      headers: internalAuth,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(false);
    expect(body.scanned).toBe(3); // inactiveFree + warningFree + inactivePaid (recentFree excluded)
    expect(body.warned).toBe(1);
    expect(body.eligible).toBe(1);
    expect(body.exemptPaid).toBe(1);
    expect(body.deleted).toBe(0);

    // Nothing deleted in dry-run.
    expect(await store.findUserById(inactiveFree.id)).toBeTruthy();
  });

  it('deletes eligible free accounts when enabled, leaving paid accounts intact', async () => {
    const { app, store, inactiveFree, inactivePaid, warningFree, recentFree } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/internal/inactivity-gc',
      headers: internalAuth,
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(true);
    expect(body.deleted).toBe(1);

    expect(await store.findUserById(inactiveFree.id)).toBeUndefined(); // purged
    expect(await store.findUserById(inactivePaid.id)).toBeTruthy(); // paid exempt
    expect(await store.findUserById(warningFree.id)).toBeTruthy(); // only warned
    expect(await store.findUserById(recentFree.id)).toBeTruthy(); // active
  });
});
