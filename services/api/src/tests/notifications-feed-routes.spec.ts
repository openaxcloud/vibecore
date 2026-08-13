import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

async function registerUser(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string) {
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Notif Tester', organizationName: 'NotifOrg' },
  });
  expect(register.statusCode).toBe(201);

  const body = register.json() as { token: string; user: { id: string } };

  return { token: body.token, userId: body.user.id };
}

type FeedResponse = {
  notifications: Array<{ id: string; title: string; read: boolean; category: string }>;
  unreadCount: number;
};

describe('In-app notification feed routes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'notif-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'notif-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("lists the current user's notifications, unread first, with an unread count", async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const { token, userId } = await registerUser(app, 'feed-owner@example.com');

    // A read one and two unread ones. The read one must sort last.
    const read = await store.createNotification({ userId, category: 'system', title: 'Welcome' });
    await store.markNotificationRead({ id: read.id });
    await new Promise((r) => setTimeout(r, 2));
    await store.createNotification({ userId, category: 'security', title: 'Reconnect GitHub' });
    await new Promise((r) => setTimeout(r, 2));
    const newest = await store.createNotification({ userId, category: 'billing', title: 'Payment failed' });

    const res = await app.inject({
      method: 'GET',
      url: '/user/notifications',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);

    const feed = res.json() as FeedResponse;
    expect(feed.unreadCount).toBe(2);
    expect(feed.notifications).toHaveLength(3);
    // Unread first (the two unread), read one ("Welcome") last.
    expect(feed.notifications[0].read).toBe(false);
    expect(feed.notifications[1].read).toBe(false);
    expect(feed.notifications[2].title).toBe('Welcome');
    expect(feed.notifications[2].read).toBe(true);
    // Among unread, newest first.
    expect(feed.notifications[0].id).toBe(newest.id);

    await app.close();
  });

  it('marks a single notification read and flips its state + unread count', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const { token, userId } = await registerUser(app, 'mark-one@example.com');

    const n = await store.createNotification({ userId, category: 'security', title: 'Reconnect GitHub' });

    const before = await app.inject({
      method: 'GET',
      url: '/user/notifications',
      headers: { authorization: `Bearer ${token}` },
    });
    expect((before.json() as FeedResponse).unreadCount).toBe(1);

    const marked = await app.inject({
      method: 'POST',
      url: `/user/notifications/${n.id}/read`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(marked.statusCode).toBe(200);

    const markedBody = marked.json() as { notification: { id: string; read: boolean }; unreadCount: number };
    expect(markedBody.notification.id).toBe(n.id);
    expect(markedBody.notification.read).toBe(true);
    expect(markedBody.unreadCount).toBe(0);

    const after = await app.inject({
      method: 'GET',
      url: '/user/notifications',
      headers: { authorization: `Bearer ${token}` },
    });
    const afterFeed = after.json() as FeedResponse;
    expect(afterFeed.unreadCount).toBe(0);
    expect(afterFeed.notifications[0].read).toBe(true);

    await app.close();
  });

  it('marks all notifications read in one call', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const { token, userId } = await registerUser(app, 'mark-all@example.com');

    await store.createNotification({ userId, title: 'One' });
    await store.createNotification({ userId, title: 'Two' });
    await store.createNotification({ userId, title: 'Three' });

    const res = await app.inject({
      method: 'POST',
      url: '/user/notifications/read-all',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { marked: number; unreadCount: number };
    expect(body.marked).toBe(3);
    expect(body.unreadCount).toBe(0);

    const feed = await app.inject({
      method: 'GET',
      url: '/user/notifications',
      headers: { authorization: `Bearer ${token}` },
    });
    expect((feed.json() as FeedResponse).unreadCount).toBe(0);

    await app.close();
  });

  it("does not leak or let a user read/modify another user's notifications", async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const { token: tokenA, userId: userIdA } = await registerUser(app, 'owner-a@example.com');
    const { token: tokenB } = await registerUser(app, 'intruder-b@example.com');

    const aNotification = await store.createNotification({ userId: userIdA, category: 'security', title: "A's alert" });

    // B's feed is empty — A's notification never appears.
    const bFeed = await app.inject({
      method: 'GET',
      url: '/user/notifications',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(bFeed.statusCode).toBe(200);
    expect((bFeed.json() as FeedResponse).notifications).toHaveLength(0);
    expect((bFeed.json() as FeedResponse).unreadCount).toBe(0);

    // B cannot mark A's notification read — 404, not-found (no cross-user leak).
    const bMark = await app.inject({
      method: 'POST',
      url: `/user/notifications/${aNotification.id}/read`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(bMark.statusCode).toBe(404);
    expect((bMark.json() as { code: string }).code).toBe('NOTIFICATION_NOT_FOUND');

    // A's notification is still unread (B's attempt was a no-op).
    const aFeed = await app.inject({
      method: 'GET',
      url: '/user/notifications',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect((aFeed.json() as FeedResponse).unreadCount).toBe(1);
    expect((aFeed.json() as FeedResponse).notifications[0].read).toBe(false);

    // B's mark-all does not touch A's feed either.
    await app.inject({
      method: 'POST',
      url: '/user/notifications/read-all',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    const aFeedAfter = await app.inject({
      method: 'GET',
      url: '/user/notifications',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect((aFeedAfter.json() as FeedResponse).unreadCount).toBe(1);

    await app.close();
  });

  it('rejects unauthenticated access to the feed', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const res = await app.inject({ method: 'GET', url: '/user/notifications' });
    expect(res.statusCode).toBe(401);

    await app.close();
  });
});
