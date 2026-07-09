import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class RecordingEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const emailProvider = new RecordingEmailProvider();
  const app = await buildApiApp({ store, emailProvider });

  const offender = await store.createUser({
    email: 'offender@example.com',
    name: 'Offender',
    passwordHash: hashPassword('password123'),
  });

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

  return { app, store, emailProvider, offender };
}

describe('F22 admin abuse events — dismiss / warn / status', () => {
  it('dismiss resolves the event with a dismissed disposition', async () => {
    const { app, store, offender } = await setup();
    const event = await store.createAbuseEvent({ userId: offender.id, type: 'rate_limit', severity: 'low' });

    const res = await app.inject({
      method: 'POST',
      url: `/admin/abuse-events/${event.id}/dismiss`,
      headers: auth('admin-token'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().abuseEvent).toMatchObject({ resolved: true, disposition: 'dismissed' });

    const list = await app.inject({ method: 'GET', url: '/admin/abuse-events', headers: auth('admin-token') });
    const row = list.json().abuseEvents.find((e: { id: string }) => e.id === event.id);
    expect(row).toMatchObject({ resolved: true, disposition: 'dismissed' });
  });

  it('warn emails the offender and keeps the event open (warned)', async () => {
    const { app, store, emailProvider, offender } = await setup();
    const event = await store.createAbuseEvent({ userId: offender.id, type: 'spam', severity: 'medium' });

    const res = await app.inject({
      method: 'POST',
      url: `/admin/abuse-events/${event.id}/warn`,
      headers: auth('admin-token'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ warned: true });
    expect(res.json().abuseEvent).toMatchObject({ resolved: false, disposition: 'warned' });
    expect(emailProvider.sent).toHaveLength(1);
    expect(emailProvider.sent[0].to).toBe('offender@example.com');
  });

  it('warn without an associated user is a 400', async () => {
    const { app, store } = await setup();
    const event = await store.createAbuseEvent({ type: 'anomaly', severity: 'low' });

    const res = await app.inject({
      method: 'POST',
      url: `/admin/abuse-events/${event.id}/warn`,
      headers: auth('admin-token'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('suspend blocks the offending user, resolves the event, and requires a reason', async () => {
    const { app, store, offender } = await setup();
    const event = await store.createAbuseEvent({ userId: offender.id, type: 'fraud', severity: 'high' });

    // A reason is mandatory.
    const noReason = await app.inject({
      method: 'POST',
      url: `/admin/abuse-events/${event.id}/suspend`,
      headers: auth('admin-token'),
      payload: {},
    });
    expect(noReason.statusCode).toBe(400);

    const res = await app.inject({
      method: 'POST',
      url: `/admin/abuse-events/${event.id}/suspend`,
      headers: auth('admin-token'),
      payload: { reason: 'Confirmed fraudulent activity' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ suspended: true });
    expect(res.json().abuseEvent).toMatchObject({ resolved: true, disposition: 'suspended' });

    // The offender is now in the suspended set + the action is audited.
    const suspendedSetting = (await store.listSystemSettings()).find((s) => s.key === 'admin.suspendedUserIds');
    expect(Array.isArray(suspendedSetting?.value) ? (suspendedSetting!.value as string[]) : []).toContain(offender.id);
    const adminLog = await store.listAdminAuditLogs();
    expect(adminLog.some((entry) => entry.action === 'admin.abuse_event.suspend')).toBe(true);
  });

  it('suspend without an associated user is a 400', async () => {
    const { app, store } = await setup();
    const event = await store.createAbuseEvent({ type: 'anomaly', severity: 'low' });

    const res = await app.inject({
      method: 'POST',
      url: `/admin/abuse-events/${event.id}/suspend`,
      headers: auth('admin-token'),
      payload: { reason: 'no user attached' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('forbids non-admins', async () => {
    const { app, store, offender } = await setup();
    await store.createSession({ userId: offender.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });
    const event = await store.createAbuseEvent({ userId: offender.id, type: 'rate_limit', severity: 'low' });

    const res = await app.inject({
      method: 'POST',
      url: `/admin/abuse-events/${event.id}/dismiss`,
      headers: auth('user-token'),
    });
    expect(res.statusCode).toBe(403);
  });
});
