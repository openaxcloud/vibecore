import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { isLockedNow, type LoginThrottleConfig } from '../login-throttle.js';
import { PrismaApiStore } from '../prisma-store.js';
import type { EmailProvider } from '../email.js';

/*
 * Per-account login lockout against a REAL Postgres (PrismaApiStore). Skipped
 * unless DATABASE_URL points at a migrated database. Proves the property the
 * in-memory store cannot: recordFailedLogin is ATOMIC under true concurrency
 * (the advisory-lock serialization means N concurrent failures increment to
 * exactly N — no lost updates), plus lock-cap, auto-expiry (DoS is bounded), and
 * per-account isolation.
 *
 * Run: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/vibecore \
 *      pnpm exec vitest run src/tests/login-lockout.integration.spec.ts
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('per-account login lockout — real Postgres', () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let store: PrismaApiStore;

  beforeAll(async () => {
    store = new PrismaApiStore();
    app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
  });
  afterAll(async () => {
    await app?.close().catch(() => {});
  });

  async function freshUserId(): Promise<string> {
    const email = `lock-${randomUUID().slice(0, 8)}@local.test`;
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'password123', name: 'L', organizationName: `${email} Org` },
    });
    expect(reg.statusCode).toBe(201);
    return (reg.json() as { user: { id: string } }).user.id;
  }

  it('CONCURRENCY: N simultaneous failures increment to exactly N (atomic, no lost updates)', async () => {
    const userId = await freshUserId();
    const cfg: LoginThrottleConfig = { maxFailures: 1000, windowMs: 60_000, lockMs: 60_000 };
    const now = 1_900_000_000_000;
    const N = 25;

    await Promise.all(Array.from({ length: N }, () => store.recordFailedLogin(userId, now, cfg)));

    const state = await store.getLoginLockout(userId);
    expect(state?.failedCount).toBe(N); // a single lost update would make this < N
    expect(state?.lockedUntilMs).toBeNull(); // maxFailures not reached

    const raw = await store.prisma.$queryRawUnsafe(
      `SELECT "userId", "failedCount", "firstFailedAt", "lockedUntil" FROM "AccountLockout" WHERE "userId" = $1`,
      userId,
    );
    console.log('LOCKOUT_DB_EXTRACT', JSON.stringify((raw as any[])[0]));
    expect(Number((raw as Array<{ failedCount: number }>)[0].failedCount)).toBe(N);
    await store.prisma.user.deleteMany({ where: { id: userId } });
  });

  it('CONCURRENCY: with a low threshold, the count caps at maxFailures and the lock arms (no overshoot bypass)', async () => {
    const userId = await freshUserId();
    const cfg: LoginThrottleConfig = { maxFailures: 5, windowMs: 60_000, lockMs: 60_000 };
    const now = 1_900_000_000_000;

    await Promise.all(Array.from({ length: 25 }, () => store.recordFailedLogin(userId, now, cfg)));

    const state = await store.getLoginLockout(userId);
    expect(state?.failedCount).toBe(5); // capped — a failure while locked does not increment
    expect(isLockedNow(state!, now + 1)).toBe(true); // and it IS locked
  });

  it('auto-expires: a lock set in the past is no longer active now (DoS is bounded)', async () => {
    const userId = await freshUserId();
    const past = Date.now() - 10 * 60 * 1000;
    const cfg: LoginThrottleConfig = { maxFailures: 3, windowMs: 60_000, lockMs: 1_000 };
    for (let i = 0; i < 3; i++) await store.recordFailedLogin(userId, past + i, cfg);

    const state = await store.getLoginLockout(userId);
    expect(state?.lockedUntilMs).not.toBeNull();
    expect(isLockedNow(state!, Date.now())).toBe(false); // the short lock has elapsed
  });

  it('per-account isolation + clear', async () => {
    const a = await freshUserId();
    const b = await freshUserId();
    const cfg: LoginThrottleConfig = { maxFailures: 3, windowMs: 60_000, lockMs: 60_000 };
    const now = 1_900_000_000_000;

    for (let i = 0; i < 3; i++) await store.recordFailedLogin(a, now, cfg);
    expect(isLockedNow((await store.getLoginLockout(a))!, now + 1)).toBe(true);
    expect(await store.getLoginLockout(b)).toBeUndefined(); // B untouched

    await store.clearLoginLockout(a);
    expect(await store.getLoginLockout(a)).toBeUndefined(); // reset on success

    // cleanup
    await store.prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  });
});
