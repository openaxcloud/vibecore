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

  const otherAdmin = await store.createUser({
    email: 'other-admin@example.com',
    name: 'Other Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });

  const suspended = await store.createUser({
    email: 'suspended@example.com',
    name: 'Suspended',
    passwordHash: hashPassword('password123'),
  });
  await store.mutateSystemSettingIds('admin.suspendedUserIds', { add: suspended.id });

  const admin = await store.createUser({
    email: 'admin@example.com',
    name: 'Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });

  const reauth = await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers: auth('admin-token'),
    payload: { password: 'password123' },
  });
  expect(reauth.statusCode).toBe(200);

  return { app, store, admin, target, otherAdmin, suspended };
}

describe('admin impersonation routes', () => {
  it('mints a time-boxed impersonation session flagged with the admin id', async () => {
    const { app, admin, target } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/admin/users/${target.id}/impersonate`,
      headers: auth('admin-token'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe('target@example.com');
    expect(typeof body.token).toBe('string');
    // ~30-minute time box
    const ttl = new Date(body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(25 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000);

    // The minted token acts AS the target and /auth/me reports the impersonator.
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: auth(body.token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.id).toBe(target.id);
    expect(me.json().impersonatedBy).toBe(admin.id);
  });

  it('refuses to impersonate self, another admin, or a suspended user', async () => {
    const { app, admin, otherAdmin, suspended } = await setup();

    const self = await app.inject({
      method: 'POST',
      url: `/admin/users/${admin.id}/impersonate`,
      headers: auth('admin-token'),
    });
    expect(self.statusCode).toBe(400);

    const otherAdminRes = await app.inject({
      method: 'POST',
      url: `/admin/users/${otherAdmin.id}/impersonate`,
      headers: auth('admin-token'),
    });
    expect(otherAdminRes.statusCode).toBe(403);
    expect(otherAdminRes.json()).toMatchObject({
      code: 'IMPERSONATION_ADMIN_FORBIDDEN',
      error: 'You cannot impersonate another platform administrator.',
    });

    const suspendedRes = await app.inject({
      method: 'POST',
      url: `/admin/users/${suspended.id}/impersonate`,
      headers: auth('admin-token'),
    });
    expect(suspendedRes.statusCode).toBe(409);
  });

  it('forbids non-admins from impersonating', async () => {
    const { app, otherAdmin } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: `/admin/users/${otherAdmin.id}/impersonate`,
      headers: auth('target-token'),
    });
    expect(res.statusCode).toBe(403);
  });

  it('stops impersonation: revokes the session and clears the flag', async () => {
    const { app, target } = await setup();
    const start = await app.inject({
      method: 'POST',
      url: `/admin/users/${target.id}/impersonate`,
      headers: auth('admin-token'),
    });
    const impToken = start.json().token;

    const stop = await app.inject({ method: 'POST', url: '/auth/impersonation/stop', headers: auth(impToken) });
    expect(stop.statusCode).toBe(200);
    expect(stop.json().stopped).toBe(true);

    // The impersonation session is now revoked — the token no longer authenticates.
    const after = await app.inject({ method: 'GET', url: '/auth/me', headers: auth(impToken) });
    expect(after.statusCode).toBe(401);
  });

  it('returns 409 when stopping with a normal (non-impersonation) session', async () => {
    const { app } = await setup();
    const stop = await app.inject({ method: 'POST', url: '/auth/impersonation/stop', headers: auth('target-token') });
    expect(stop.statusCode).toBe(409);
    expect(stop.json()).toMatchObject({
      code: 'NOT_IMPERSONATING',
      error: 'No impersonation session is active.',
    });
  });

  it('does not flag a normal session as impersonated', async () => {
    const { app } = await setup();
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: auth('target-token') });
    expect(me.json().impersonatedBy).toBeNull();
  });
});
