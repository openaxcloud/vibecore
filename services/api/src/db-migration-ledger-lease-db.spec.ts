import { Client as PgClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  acquireExactPostgresMigrationLedgerLease,
  withExactPostgresMigrationLedgerLease,
  type MigrationPgClient,
} from './db-migration-applier.js';

const runDbTests = process.env.DATABASE_URL ? describe.sequential : describe.skip;

function key(label: string): string {
  return `rollback-ledger-lease:${label}:${Date.now()}:${Math.random()}`;
}

function leaseClientWithShortIdleTimeout(connectionString: string): MigrationPgClient {
  const client = new PgClient({ connectionString });

  return {
    async connect() {
      await client.connect();
      await client.query("SET idle_in_transaction_session_timeout = '50ms'");
    },
    async query(sql, values) {
      const result = await client.query(sql, values);
      return { rows: result.rows as Array<Record<string, unknown>> };
    },
    async end() {
      await client.end();
    },
  };
}

runDbTests('exact migration ledger session lease — PostgreSQL contention', () => {
  it('survives a short idle-in-transaction timeout and blocks migration until release', async () => {
    const connectionString = process.env.DATABASE_URL!;
    const lockKey = key('long-effect');
    const lease = await acquireExactPostgresMigrationLedgerLease({
      connectionString,
      lockKey,
      createClient: leaseClientWithShortIdleTimeout,
    });
    const migration = new PgClient({ connectionString });

    try {
      await migration.connect();
      await migration.query('BEGIN');
      await migration.query("SET LOCAL statement_timeout = '5s'");
      let acquired = false;
      const waiting = migration.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]).then(() => {
        acquired = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(acquired).toBe(false);
      await expect(lease.assertHeldAndInspect()).resolves.toEqual(lease.inspection);

      await lease.release();
      await waiting;
      expect(acquired).toBe(true);
      await migration.query('ROLLBACK');
    } finally {
      await lease.release().catch(() => undefined);
      await migration.query('ROLLBACK').catch(() => undefined);
      await migration.end().catch(() => undefined);
    }
  });

  it('times out before the effect when a migration owns the lock', async () => {
    const connectionString = process.env.DATABASE_URL!;
    const lockKey = key('timeout');
    const blocker = new PgClient({ connectionString });
    const effect = vi.fn(async () => undefined);

    try {
      await blocker.connect();
      await blocker.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [lockKey]);

      await expect(
        withExactPostgresMigrationLedgerLease({ connectionString, lockKey, lockTimeoutMs: 50 }, effect),
      ).rejects.toMatchObject({ code: 'ROLLBACK_DB_LEDGER_UNAVAILABLE' });
      expect(effect).not.toHaveBeenCalled();
    } finally {
      await blocker.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]).catch(() => undefined);
      await blocker.end().catch(() => undefined);
    }
  });

  it('releases the session lock when the protected effect throws', async () => {
    const connectionString = process.env.DATABASE_URL!;
    const lockKey = key('throw');

    await expect(
      withExactPostgresMigrationLedgerLease({ connectionString, lockKey }, async () => {
        throw new Error('injected protected effect failure');
      }),
    ).rejects.toThrow('injected protected effect failure');

    const checker = new PgClient({ connectionString });
    try {
      await checker.connect();
      const result = await checker.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [lockKey],
      );
      expect(result.rows[0]?.acquired).toBe(true);
      await checker.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]);
    } finally {
      await checker.end().catch(() => undefined);
    }
  });

  it('refuses the commit edge after the lease backend is terminated and lets migration take the fence', async () => {
    const connectionString = process.env.DATABASE_URL!;
    const lockKey = key('lost-session');
    let leaseBackendPid: number | undefined;
    const lease = await acquireExactPostgresMigrationLedgerLease({
      connectionString,
      lockKey,
      createClient: (url) => {
        const client = new PgClient({ connectionString: url });
        return {
          async connect() {
            await client.connect();
            const pid = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
            leaseBackendPid = pid.rows[0]?.pid;
          },
          async query(sql, values) {
            const result = await client.query(sql, values);
            return { rows: result.rows as Array<Record<string, unknown>> };
          },
          async end() {
            await client.end();
          },
          on(event, listener) {
            client.on(event, listener);
          },
        };
      },
    });
    const killer = new PgClient({ connectionString });
    const migration = new PgClient({ connectionString });
    const commitManifestReady = vi.fn(async () => undefined);

    try {
      expect(leaseBackendPid).toBeTypeOf('number');
      await killer.connect();
      await migration.connect();
      await expect(
        killer.query('SELECT pg_terminate_backend($1) AS terminated', [leaseBackendPid]),
      ).resolves.toMatchObject({ rows: [{ terminated: true }] });

      await migration.query('BEGIN');
      await migration.query("SET LOCAL statement_timeout = '5s'");
      await migration.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);

      await expect(lease.assertHeldAndInspect().then(async () => commitManifestReady())).rejects.toMatchObject({
        code: 'ROLLBACK_DB_LEDGER_UNAVAILABLE',
      });
      expect(commitManifestReady).not.toHaveBeenCalled();
    } finally {
      await lease.release().catch(() => undefined);
      await migration.query('ROLLBACK').catch(() => undefined);
      await Promise.allSettled([killer.end(), migration.end()]);
    }
  });
});
