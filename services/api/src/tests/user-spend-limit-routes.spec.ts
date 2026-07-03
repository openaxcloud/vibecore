import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const prevCredits = process.env.BILLING_CREDITS_ENABLED;
afterEach(() => {
  if (prevCredits === undefined) {
    delete process.env.BILLING_CREDITS_ENABLED;
  } else {
    process.env.BILLING_CREDITS_ENABLED = prevCredits;
  }
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const user = await store.createUser({
    email: 'member@example.com',
    name: 'Member',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Ent Org', slug: 'ent-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'usl-token', expiresAt: new Date(Date.now() + 3600_000) });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });
  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });
  return { app, store, org, user, project, token: 'usl-token' };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('Per-user (Enterprise) spend limits', () => {
  it('admin sets a member limit; the member is blocked once their spend reaches it', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';
    const { app, store, org, user, project, token } = await setup();

    const put = await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 100 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().limitCents).toBe(100);

    const ok = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: {},
    });
    expect(ok.statusCode).toBe(200);

    const cp = await store.createAgentCheckpoint({ organizationId: org.id, userId: user.id, buildTier: 'power' });
    await store.completeAgentCheckpoint({ id: cp.id, status: 'COMPLETED', creditCents: 150 });

    const blocked = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: {},
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe('USER_SPEND_LIMIT_REACHED');
  });

  it('clearing the limit re-allows the member', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';
    const { app, store, org, user, project, token } = await setup();
    await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 100 },
    });
    const cp = await store.createAgentCheckpoint({ organizationId: org.id, userId: user.id, buildTier: 'power' });
    await store.completeAgentCheckpoint({ id: cp.id, status: 'COMPLETED', creditCents: 150 });

    const clear = await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: null },
    });
    expect(clear.json().limitCents).toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('does not enforce while the credit model is dormant (flag off)', async () => {
    delete process.env.BILLING_CREDITS_ENABLED;
    const { app, store, org, user, project, token } = await setup();
    await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 100 },
    });
    const cp = await store.createAgentCheckpoint({ organizationId: org.id, userId: user.id, buildTier: 'power' });
    await store.completeAgentCheckpoint({ id: cp.id, status: 'COMPLETED', creditCents: 150 });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('lists member limits + members for the admin UI', async () => {
    const { app, org, user, token } = await setup();
    await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 500 },
    });
    const res = await app.inject({ method: 'GET', url: `/orgs/${org.id}/usage/limits`, headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.limits).toHaveLength(1);
    expect(body.limits[0]).toMatchObject({ userId: user.id, limitCents: 500 });
    expect(body.members.length).toBeGreaterThanOrEqual(1);
  });
});
