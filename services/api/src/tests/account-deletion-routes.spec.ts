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
    email: 'deleteme@example.com',
    name: 'Delete Me',
    passwordHash: hashPassword('password123'),
  });
  await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });

  const admin = await store.createUser({
    email: 'admin@example.com',
    name: 'Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });

  // Platform admins must have MFA enabled to reach /admin/* (global gate).
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store, user, admin };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('self-serve account deletion routes', () => {
  it('reports no deletion before a request', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/account/deletion', headers: auth('user-token') });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.status).toBe('none');
    expect(body.canCancel).toBe(false);
    expect(body.gracePeriodDays).toBe(14);
    expect(Array.isArray(body.scope.deleted)).toBe(true);
    expect(Array.isArray(body.scope.retained)).toBe(true);
  });

  it('requests deletion, enters the grace period, and indexes the user for purge', async () => {
    const { app, store, user } = await setup();
    const res = await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.status).toBe('grace_period');
    expect(body.canCancel).toBe(true);
    expect(typeof body.requestedAt).toBe('string');
    expect(typeof body.purgeDueAt).toBe('string');

    // purge due ~14 days after request
    expect(new Date(body.purgeDueAt).getTime() - new Date(body.requestedAt).getTime()).toBe(14 * 24 * 60 * 60 * 1000);

    // pending-deletion index updated
    const settings = await store.listSystemSettings();
    const pending = settings.find((s) => s.key === 'account.pendingDeletionUserIds');
    expect(pending?.value).toContain(user.id);

    // GET reflects the pending state
    const status = await app.inject({ method: 'GET', url: '/account/deletion', headers: auth('user-token') });
    expect(status.json().status).toBe('grace_period');
  });

  it('is idempotent on repeat requests within the grace period', async () => {
    const { app } = await setup();
    const first = await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
    const firstAt = first.json().requestedAt;
    const second = await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
    expect(second.statusCode).toBe(200);

    // unchanged request timestamp — a second click doesn't reset the clock
    expect(second.json().requestedAt).toBe(firstAt);
  });

  it('cancels within the grace period and clears the index', async () => {
    const { app, store, user } = await setup();
    await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });

    const cancel = await app.inject({ method: 'POST', url: '/account/deletion/cancel', headers: auth('user-token') });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().cancelled).toBe(true);

    const status = await app.inject({ method: 'GET', url: '/account/deletion', headers: auth('user-token') });
    expect(status.json().status).toBe('none');

    const settings = await store.listSystemSettings();
    const pending = settings.find((s) => s.key === 'account.pendingDeletionUserIds');
    expect(pending?.value ?? []).not.toContain(user.id);
  });

  it('returns 409 when cancelling with no pending request', async () => {
    const { app } = await setup();
    const cancel = await app.inject({ method: 'POST', url: '/account/deletion/cancel', headers: auth('user-token') });
    expect(cancel.statusCode).toBe(409);
    expect(cancel.json()).toMatchObject({
      code: 'ACCOUNT_DELETION_CANNOT_CANCEL',
      error: 'The account deletion request can no longer be canceled.',
    });
  });

  it('hides the request endpoint when ACCOUNT_SELF_DELETION_ENABLED=false', async () => {
    const previous = process.env.ACCOUNT_SELF_DELETION_ENABLED;
    process.env.ACCOUNT_SELF_DELETION_ENABLED = 'false';

    try {
      const { app } = await setup();
      const res = await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
      expect(res.statusCode).toBe(404);
    } finally {
      if (previous === undefined) {
        delete process.env.ACCOUNT_SELF_DELETION_ENABLED;
      } else {
        process.env.ACCOUNT_SELF_DELETION_ENABLED = previous;
      }
    }
  });

  it('exposes pending deletions to platform admins', async () => {
    const { app, user } = await setup();
    await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });

    const list = await app.inject({ method: 'GET', url: '/admin/account-deletions', headers: auth('admin-token') });
    expect(list.statusCode).toBe(200);

    const body = list.json();
    expect(body.gracePeriodDays).toBe(14);

    const entry = body.requests.find((r: { userId: string }) => r.userId === user.id);
    expect(entry).toBeTruthy();
    expect(entry.email).toBe('deleteme@example.com');
    expect(entry.status).toBe('grace_period');
  });

  it('forbids non-admins from the admin listing', async () => {
    const { app } = await setup();
    const list = await app.inject({ method: 'GET', url: '/admin/account-deletions', headers: auth('user-token') });
    expect(list.statusCode).toBe(403);
  });

  it('F24: admin cancels a pending deletion (clears state + drops from purge queue)', async () => {
    const { app, user } = await setup();
    await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
    await app.inject({
      method: 'POST',
      url: '/auth/reauth',
      headers: auth('admin-token'),
      payload: { password: 'password123' },
    });

    const cancel = await app.inject({
      method: 'POST',
      url: `/admin/account-deletions/${user.id}/cancel`,
      headers: auth('admin-token'),
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ cancelled: true, userId: user.id });

    // no longer queued for purge
    const list = await app.inject({ method: 'GET', url: '/admin/account-deletions', headers: auth('admin-token') });
    expect(list.json().requests.find((r: { userId: string }) => r.userId === user.id)).toBeUndefined();

    // the user's own deletion state is cleared
    const self = await app.inject({ method: 'GET', url: '/account/deletion', headers: auth('user-token') });
    expect(self.json().status).toBe('none');
  });

  it('F24: forbids non-admins from cancelling a deletion', async () => {
    const { app, user } = await setup();
    await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });

    const denied = await app.inject({
      method: 'POST',
      url: `/admin/account-deletions/${user.id}/cancel`,
      headers: auth('user-token'),
    });
    expect(denied.statusCode).toBe(403);
  });

  it('F24: admin exports a target user’s GDPR data (reauth-gated, correct shape, attachment, no secrets)', async () => {
    const { app, user } = await setup();
    await app.inject({
      method: 'POST',
      url: '/auth/reauth',
      headers: auth('admin-token'),
      payload: { password: 'password123' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/admin/account-deletions/${user.id}/export`,
      headers: auth('admin-token'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');

    const body = res.json();
    expect(body.export.kind).toBe('gdpr-data-export');
    expect(body.export.user.id).toBe(user.id);
    expect(body.export.user.email).toBe('deleteme@example.com');

    // The shared builder strips every secret-bearing field.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('keyHash');
    expect(serialized).not.toContain('tokenHash');
    expect(serialized).not.toContain('Encrypted');
  });

  it('F24: forbids non-admins from exporting account data', async () => {
    const { app, user } = await setup();

    const denied = await app.inject({
      method: 'GET',
      url: `/admin/account-deletions/${user.id}/export`,
      headers: auth('user-token'),
    });
    expect(denied.statusCode).toBe(403);
  });

  it('F24: returns 404 when exporting an unknown user (reauthed admin)', async () => {
    const { app } = await setup();
    await app.inject({
      method: 'POST',
      url: '/auth/reauth',
      headers: auth('admin-token'),
      payload: { password: 'password123' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/admin/account-deletions/nonexistent-user-id/export',
      headers: auth('admin-token'),
    });
    expect(res.statusCode).toBe(404);
  });
});
