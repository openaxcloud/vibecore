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

  await store.recordAudit({ action: 'auth.login.failed', resourceType: 'user', actorUserId: 'u1' });
  await store.recordAudit({ action: 'security.breach.detected', resourceType: 'org' });
  await store.recordAudit({ action: 'project.create', resourceType: 'project' }); // not a security event

  return { app, store };
}

describe('F23 admin security events — severity + resolve + open count', () => {
  it('lists security events with derived severity and an open count', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/admin/security-events', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // the non-security project.create is excluded; setup's own auth.* audits may add more.
    expect(body.events.some((e: { action: string }) => e.action === 'project.create')).toBe(false);
    const failed = body.events.find((e: { action: string }) => e.action === 'auth.login.failed');
    const breach = body.events.find((e: { action: string }) => e.action === 'security.breach.detected');
    expect(failed.severity).toBe('medium');
    expect(breach.severity).toBe('high');
    expect(failed.resolved).toBe(false);
    expect(body.openCount).toBeGreaterThanOrEqual(2);
    expect(body.openCount).toBe(body.events.filter((e: { resolved: boolean }) => !e.resolved).length);
  });

  it('marks an event resolved with a note and drops the open count', async () => {
    const { app } = await setup();
    const before = await app.inject({ method: 'GET', url: '/admin/security-events', headers: auth('admin-token') });
    const beforeOpen = before.json().openCount;
    const target = before.json().events.find((e: { action: string }) => e.action === 'security.breach.detected');

    const resolve = await app.inject({
      method: 'POST',
      url: `/admin/security-events/${target.id}/resolve`,
      headers: auth('admin-token'),
      payload: { note: 'investigated — false positive' },
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().resolution).toMatchObject({ auditLogId: target.id, resolved: true });

    const after = await app.inject({ method: 'GET', url: '/admin/security-events', headers: auth('admin-token') });
    expect(after.json().openCount).toBe(beforeOpen - 1);
    const resolved = after.json().events.find((e: { id: string }) => e.id === target.id);
    expect(resolved.resolved).toBe(true);
    expect(resolved.note).toBe('investigated — false positive');
  });

  it('forbids non-admins from resolving', async () => {
    const { app, store } = await setup();
    const user = await store.createUser({
      email: 'nope@example.com',
      name: 'Nope',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/security-events/whatever/resolve',
      headers: auth('user-token'),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});
