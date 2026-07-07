import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const owner = await store.createUser({
    email: 'owner@example.com',
    name: 'Owner',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'CP Org', slug: 'cp-org', ownerUserId: owner.id });

  const admin = await store.createUser({
    email: 'admin@example.com',
    name: 'Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });
  await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers: auth('admin-token'),
    payload: { password: 'password123' },
  });

  // one recent COMPLETED, one 200-day-old COMPLETED, one 200-day-old PENDING (never purged)
  const recent = await store.createAgentCheckpoint({ organizationId: org.id });
  await store.completeAgentCheckpoint({ id: recent.id, status: 'COMPLETED', creditCents: 100, inputTokens: 10 });

  const oldDone = await store.createAgentCheckpoint({ organizationId: org.id });
  await store.completeAgentCheckpoint({ id: oldDone.id, status: 'COMPLETED', creditCents: 50, inputTokens: 5 });
  store.agentCheckpoints.get(oldDone.id)!.startedAt = new Date(Date.now() - 200 * 86_400_000).toISOString();

  const oldPending = await store.createAgentCheckpoint({ organizationId: org.id });
  store.agentCheckpoints.get(oldPending.id)!.startedAt = new Date(Date.now() - 200 * 86_400_000).toISOString();

  return { app, store, org };
}

describe('F21 admin agent-checkpoint storage + purge', () => {
  it('summarizes per-org storage and estimates the purge', async () => {
    const { app, org } = await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/checkpoints/storage?olderThanDays=90',
      headers: auth('admin-token'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.retentionDays).toBe(90);
    expect(body.totalCheckpoints).toBe(3);
    const orgRow = body.byOrg.find((r: { organizationId: string }) => r.organizationId === org.id);
    expect(orgRow).toMatchObject({ checkpoints: 3, creditCents: 150 });
    // only the 200-day-old COMPLETED is purgeable (old PENDING and recent COMPLETED are not)
    expect(body.purgeEstimate).toBe(1);
  });

  it('purges terminal checkpoints older than the cutoff and audits it', async () => {
    const { app, store, org } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/checkpoints/purge',
      headers: auth('admin-token'),
      payload: { olderThanDays: 90 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toBe(1);

    const after = await store.summarizeAgentCheckpoints();
    expect(after.find((r) => r.organizationId === org.id)?.checkpoints).toBe(2);
  });

  it('forbids non-admins from purge', async () => {
    const { app, store } = await setup();
    const user = await store.createUser({
      email: 'nope@example.com',
      name: 'Nope',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/checkpoints/purge',
      headers: auth('user-token'),
      payload: { olderThanDays: 90 },
    });
    expect(res.statusCode).toBe(403);
  });
});
