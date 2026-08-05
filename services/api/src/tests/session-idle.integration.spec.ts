import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { PrismaApiStore } from '../prisma-store.js';
import type { EmailProvider } from '../email.js';

/*
 * Session idle-timeout against a REAL Postgres. Skipped unless DATABASE_URL points
 * at a migrated database. Uses real DB timestamps (no fake clock) to prove: an
 * idle session is rejected by findSessionByToken AND the HTTP layer; touchSession
 * refreshes lastActiveAt (and is throttled); concurrent heartbeats are safe.
 *
 * Run: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55435/vibecore \
 *      pnpm exec vitest run src/tests/session-idle.integration.spec.ts
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const hasDb = Boolean(process.env.DATABASE_URL);
const IDLE_MS = 72 * 60 * 60 * 1000;

describe.skipIf(!hasDb)('session idle timeout — real Postgres', () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let store: PrismaApiStore;

  beforeAll(async () => {
    store = new PrismaApiStore();
    app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
  });
  afterAll(async () => {
    await app?.close().catch(() => {});
  });

  async function newSession() {
    const email = `idle-${randomUUID().slice(0, 8)}@local.test`;
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'password123', name: 'I', organizationName: `${email} Org` },
    });
    const token = (reg.json() as { token: string }).token;
    const userId = (reg.json() as { user: { id: string } }).user.id;
    const row = await store.prisma.session.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return { token, userId, sessionId: row!.id };
  }

  it('a session idle past the timeout is rejected — store + HTTP', async () => {
    const { token, userId, sessionId } = await newSession();
    // Age the session's last activity past the idle window.
    await store.prisma.session.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date(Date.now() - (IDLE_MS + 60_000)) },
    });

    const row = await store.prisma.session.findUnique({ where: { id: sessionId } });
    console.log('SESSION_IDLE_DB_EXTRACT', JSON.stringify({ sessionId, lastActiveAt: row?.lastActiveAt, revokedAt: row?.revokedAt }));

    expect(await store.findSessionByToken(token)).toBeUndefined(); // store rejects it
    const http = await app.inject({ method: 'GET', url: '/auth/sessions', headers: { authorization: `Bearer ${token}` } });
    expect(http.statusCode).toBe(401); // and so does the API

    await store.prisma.user.deleteMany({ where: { id: userId } });
  });

  it('touchSession refreshes lastActiveAt and is throttled', async () => {
    const { userId, sessionId } = await newSession();
    // Make it stale (beyond the 60s throttle) but still within the idle window.
    await store.prisma.session.update({ where: { id: sessionId }, data: { lastActiveAt: new Date(Date.now() - 90_000) } });

    await store.touchSession(sessionId, Date.now());
    const afterFirst = (await store.prisma.session.findUnique({ where: { id: sessionId } }))!.lastActiveAt!;
    expect(Date.now() - afterFirst.getTime()).toBeLessThan(5_000); // bumped to ~now

    // Immediately touch again — within the throttle window, so no write.
    await store.touchSession(sessionId, Date.now());
    const afterSecond = (await store.prisma.session.findUnique({ where: { id: sessionId } }))!.lastActiveAt!;
    expect(afterSecond.getTime()).toBe(afterFirst.getTime()); // unchanged

    await store.prisma.user.deleteMany({ where: { id: userId } });
  });

  it('concurrent heartbeats are safe (no error, session stays valid & fresh)', async () => {
    const { token, userId, sessionId } = await newSession();
    await store.prisma.session.update({ where: { id: sessionId }, data: { lastActiveAt: new Date(Date.now() - 90_000) } });

    await Promise.all(Array.from({ length: 12 }, () => store.touchSession(sessionId, Date.now())));

    expect(await store.findSessionByToken(token)).toBeDefined(); // still valid
    const row = (await store.prisma.session.findUnique({ where: { id: sessionId } }))!;
    expect(Date.now() - row.lastActiveAt!.getTime()).toBeLessThan(5_000); // fresh

    await store.prisma.user.deleteMany({ where: { id: userId } });
  });
});
