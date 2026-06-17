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

  const target = await store.createUser({
    email: 'target@example.com',
    name: 'Target',
    passwordHash: hashPassword('password123'),
  });
  await store.createSession({ userId: target.id, token: 'target-token', expiresAt: new Date(Date.now() + 3600_000) });

  const admin = await store.createUser({
    email: 'admin@example.com',
    name: 'Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });

  // Satisfy requireRecentAdminReauth for the strike mutations.
  const reauth = await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers: auth('admin-token'),
    payload: { password: 'password123' },
  });
  expect(reauth.statusCode).toBe(200);

  return { app, store, target };
}

describe('admin moderation strike routes', () => {
  it('reports no consequence before any strike', async () => {
    const { app, target } = await setup();
    const res = await app.inject({ method: 'GET', url: `/admin/users/${target.id}/strikes`, headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.consequence).toBe('NONE');
    expect(body.activeStrikes).toBe(0);
    expect(body.permissions.canPostPublicly).toBe(true);
    expect(body.appealsEmail).toContain('@');
  });

  it('issues a minor strike → WARNING (no access lost)', async () => {
    const { app, target } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: `/admin/users/${target.id}/strikes`,
      headers: auth('admin-token'),
      payload: { severity: 'minor', reason: 'spammy comment' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.consequence).toBe('WARNING');
    expect(body.activeStrikes).toBe(1);
    expect(body.permissions).toEqual({ canLogin: true, canUseIde: true, canPostPublicly: true });
  });

  it('escalates a severe strike → ACCOUNT_BAN and revokes the user’s sessions', async () => {
    const { app, target } = await setup();
    await app.inject({
      method: 'POST',
      url: `/admin/users/${target.id}/strikes`,
      headers: auth('admin-token'),
      payload: { severity: 'minor' },
    });
    const ban = await app.inject({
      method: 'POST',
      url: `/admin/users/${target.id}/strikes`,
      headers: auth('admin-token'),
      payload: { severity: 'severe', reason: 'abuse' },
    });
    expect(ban.statusCode).toBe(200);
    const body = ban.json();
    expect(body.consequence).toBe('ACCOUNT_BAN');
    expect(body.permissions.canLogin).toBe(false);

    // The banned user can no longer authenticate (sessions revoked + suspended).
    const blocked = await app.inject({ method: 'GET', url: '/account/deletion', headers: auth('target-token') });
    expect([401, 403]).toContain(blocked.statusCode);

    // The consequence persists on read.
    const read = await app.inject({ method: 'GET', url: `/admin/users/${target.id}/strikes`, headers: auth('admin-token') });
    expect(read.json().consequence).toBe('ACCOUNT_BAN');
    expect(read.json().activeStrikes).toBe(2);
  });

  it('clears strikes on a successful appeal', async () => {
    const { app, target } = await setup();
    await app.inject({
      method: 'POST',
      url: `/admin/users/${target.id}/strikes`,
      headers: auth('admin-token'),
      payload: { severity: 'major' },
    });
    const cleared = await app.inject({ method: 'DELETE', url: `/admin/users/${target.id}/strikes`, headers: auth('admin-token') });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().cleared).toBe(true);

    const read = await app.inject({ method: 'GET', url: `/admin/users/${target.id}/strikes`, headers: auth('admin-token') });
    expect(read.json().consequence).toBe('NONE');
    expect(read.json().activeStrikes).toBe(0);
  });

  it('forbids non-admins', async () => {
    const { app, target } = await setup();
    const res = await app.inject({ method: 'GET', url: `/admin/users/${target.id}/strikes`, headers: auth('target-token') });
    expect(res.statusCode).toBe(403);
  });

  it('validates the severity', async () => {
    const { app, target } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: `/admin/users/${target.id}/strikes`,
      headers: auth('admin-token'),
      payload: { severity: 'nuclear' },
    });
    expect(res.statusCode).toBe(400);
  });
});
