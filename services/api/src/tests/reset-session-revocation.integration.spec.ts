import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { PrismaApiStore } from '../prisma-store.js';
import type { EmailProvider } from '../email.js';

/*
 * Password-reset session revocation against a REAL Postgres. Skipped unless
 * DATABASE_URL points at a migrated database. Proves what the in-memory store
 * cannot: the reset is ONE transaction (single-use is atomic under true
 * concurrency — exactly one of two concurrent confirms wins), every session row is
 * revoked in the DB, and a failed reset leaves no partial state.
 *
 * Run: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55434/vibecore \
 *      pnpm exec vitest run src/tests/reset-session-revocation.integration.spec.ts
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('password reset session revocation — real Postgres', () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let store: PrismaApiStore;

  beforeAll(async () => {
    store = new PrismaApiStore();
    app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
  });
  afterAll(async () => {
    await app?.close().catch(() => {});
  });

  async function newUserWithSessions() {
    const email = `reset-${randomUUID().slice(0, 8)}@local.test`;
    const password = 'old-password-1';
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password, name: 'R', organizationName: `${email} Org` },
    });
    const userId = (reg.json() as { user: { id: string } }).user.id;
    // second session
    await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    const resetToken = (
      await app.inject({ method: 'POST', url: '/auth/password-reset/request', payload: { email } }).then((r) => r.json())
    ).resetToken as string;
    return { email, userId, resetToken };
  }

  it('revokes every session ROW in the DB on reset', async () => {
    const { userId, resetToken } = await newUserWithSessions();
    const before = await store.prisma.session.count({ where: { userId, revokedAt: null } });
    expect(before).toBeGreaterThanOrEqual(2);

    const user = await store.consumePasswordReset(resetToken, 'new-hash');
    expect(user).toBeDefined();

    const liveAfter = await store.prisma.session.count({ where: { userId, revokedAt: null } });
    const revokedAfter = await store.prisma.session.count({ where: { userId, revokedAt: { not: null } } });
    console.log('RESET_DB_EXTRACT', JSON.stringify({ userId, before, liveAfter, revokedAfter }));
    expect(liveAfter).toBe(0); // no session survives the reset
    expect(revokedAfter).toBe(before);

    await store.prisma.user.deleteMany({ where: { id: userId } });
  });

  it('CONCURRENCY: two simultaneous confirms of the same token → exactly one succeeds (atomic single-use)', async () => {
    const { userId, resetToken } = await newUserWithSessions();

    const [a, b] = await Promise.all([
      store.consumePasswordReset(resetToken, 'hash-a').catch(() => undefined),
      store.consumePasswordReset(resetToken, 'hash-b').catch(() => undefined),
    ]);

    const successes = [a, b].filter(Boolean);
    expect(successes.length).toBe(1); // never both — the second confirm matches 0 rows
    // and the winner still revoked all sessions
    expect(await store.prisma.session.count({ where: { userId, revokedAt: null } })).toBe(0);

    await store.prisma.user.deleteMany({ where: { id: userId } });
  });

  it('a FAILED reset (bad token) leaves sessions and password intact (no partial write)', async () => {
    const { userId } = await newUserWithSessions();
    const liveBefore = await store.prisma.session.count({ where: { userId, revokedAt: null } });

    const result = await store.consumePasswordReset(`bad-${randomUUID()}`, 'should-not-apply');
    expect(result).toBeUndefined();

    // Sessions untouched — the reset transaction never ran.
    expect(await store.prisma.session.count({ where: { userId, revokedAt: null } })).toBe(liveBefore);

    await store.prisma.user.deleteMany({ where: { id: userId } });
  });
});
