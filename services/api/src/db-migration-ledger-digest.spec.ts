import { describe, expect, it } from 'vitest';

import {
  exactMigrationLedgerDigest,
  inspectExactPostgresMigrationLedger,
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

