import { describe, expect, it, vi } from 'vitest';

import {
  acquireExactPostgresMigrationLedgerLease,
  exactMigrationLedgerDigest,
  inspectExactPostgresMigrationLedger,
  withExactPostgresMigrationLedgerLease,
  type MigrationPgClient,
} from './db-migration-applier.js';

function clientFor(options: { rows?: Array<Record<string, unknown>>; missing?: boolean; fail?: boolean }) {
  const queries: string[] = [];
  const client: MigrationPgClient = {
    async connect() {
      if (options.fail) throw new Error('unavailable');
    },
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT to_regclass')) {
        return { rows: [{ ledger: options.missing ? null : '_ecode_schema_migrations' }] };
      }
      if (sql.startsWith('SELECT name, sha256')) return { rows: options.rows ?? [] };
      return { rows: [] };
    },
    async end() {},
  };
  return { client, queries };
}

describe('exact migration ledger digest', () => {
  it('is order-independent but changes for mismatch and an advanced ledger', () => {
    const a = { name: '001_init', sha256: 'a'.repeat(64) };
    const b = { name: '002_users', sha256: 'b'.repeat(64) };
    const exact = exactMigrationLedgerDigest([a, b]);

    expect(exactMigrationLedgerDigest([b, a])).toBe(exact);
    expect(exactMigrationLedgerDigest([a, { ...b, sha256: 'c'.repeat(64) }])).not.toBe(exact);
    expect(exactMigrationLedgerDigest([a, b, { name: '003_advanced', sha256: 'd'.repeat(64) }])).not.toBe(exact);
  });

  it('uses a session advisory lock, reads in autocommit, and explicitly releases the session', async () => {
    const ended = vi.fn(async () => undefined);
    const run = clientFor({ rows: [{ name: '001_init', sha256: 'a'.repeat(64) }] });
    run.client.end = ended;
    run.client.query = async (sql, values) => {
      run.queries.push(sql);
      if (sql.startsWith('SELECT to_regclass')) return { rows: [{ ledger: '_ecode_schema_migrations' }] };
      if (sql.startsWith('SELECT name, sha256')) return { rows: [{ name: '001_init', sha256: 'a'.repeat(64) }] };
      if (sql.includes('FROM pg_locks')) return { rows: [{ held: true }] };
      if (sql.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }] };
      void values;
      return { rows: [] };
    };

    const lease = await acquireExactPostgresMigrationLedgerLease({
      connectionString: 'postgres://test',
      lockKey: 'project:preview',
      createClient: () => run.client,
      lockTimeoutMs: 25,
    });

    expect(lease.inspection).toMatchObject({ status: 'EXACT', entries: 1 });
    expect(run.queries.some((query) => query === 'BEGIN')).toBe(false);
    expect(run.queries.some((query) => query.includes('pg_advisory_xact_lock'))).toBe(false);
    expect(run.queries.some((query) => query.includes('pg_advisory_lock('))).toBe(true);
    expect(run.queries).toContain("SELECT set_config('statement_timeout', '0', false)");
    expect(ended).not.toHaveBeenCalled();

    await expect(lease.assertHeldAndInspect()).resolves.toEqual(lease.inspection);

    await lease.release();
    expect(run.queries.some((query) => query.includes('pg_advisory_unlock'))).toBe(true);
    expect(ended).toHaveBeenCalledOnce();
  });

  it('never enters the effect when session-lock acquisition times out', async () => {
    const effect = vi.fn(async () => undefined);
    const client = clientFor({}).client;
    client.query = async (sql) => {
      if (sql.includes('pg_advisory_lock(')) throw new Error('canceling statement due to statement timeout');
      return { rows: [] };
    };

    await expect(
      withExactPostgresMigrationLedgerLease(
        {
          connectionString: 'postgres://test',
          lockKey: 'project:production',
          createClient: () => client,
          lockTimeoutMs: 5,
        },
        effect,
      ),
    ).rejects.toMatchObject({ code: 'ROLLBACK_DB_LEDGER_UNAVAILABLE' });
    expect(effect).not.toHaveBeenCalled();
  });

  it('releases the session lock when the fenced effect throws', async () => {
    const queries: string[] = [];
    let ended = false;
    const client: MigrationPgClient = {
      async connect() {},
      async query(sql) {
        queries.push(sql);
        if (sql.startsWith('SELECT to_regclass')) return { rows: [{ ledger: null }] };
        if (sql.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }] };
        return { rows: [] };
      },
      async end() {
        ended = true;
      },
    };

    await expect(
      withExactPostgresMigrationLedgerLease(
        { connectionString: 'postgres://test', lockKey: 'project:production', createClient: () => client },
        async () => {
          throw new Error('effect failed');
        },
      ),
    ).rejects.toThrow('effect failed');
    expect(queries.some((query) => query.includes('pg_advisory_unlock'))).toBe(true);
    expect(ended).toBe(true);
  });

  it('reads the complete ledger under the migration advisory lock', async () => {
    const run = clientFor({
      rows: [
        { name: '002_users', sha256: 'b'.repeat(64) },
        { name: '001_init', sha256: 'a'.repeat(64) },
      ],
    });
    const inspected = await inspectExactPostgresMigrationLedger({
      connectionString: 'postgres://test',
      lockKey: 'project:production',
      createClient: () => run.client,
    });

    expect(inspected).toEqual({
      status: 'EXACT',
      digest: exactMigrationLedgerDigest([
        { name: '001_init', sha256: 'a'.repeat(64) },
        { name: '002_users', sha256: 'b'.repeat(64) },
      ]),
      entries: 2,
    });
    expect(run.queries.some((query) => query.includes('pg_advisory_xact_lock'))).toBe(true);
  });

  it.each([
    ['MISSING', clientFor({ missing: true }).client],
    ['INVALID', clientFor({ rows: [{ name: '001', sha256: 'tampered' }] }).client],
    ['UNAVAILABLE', clientFor({ fail: true }).client],
  ] as const)('fails closed as %s', async (status, client) => {
    await expect(
      inspectExactPostgresMigrationLedger({
        connectionString: 'postgres://test',
        lockKey: 'project:production',
        createClient: () => client,
      }),
    ).resolves.toEqual({ status });
  });
});
