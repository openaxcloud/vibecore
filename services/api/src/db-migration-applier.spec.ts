import { describe, expect, it, vi } from 'vitest';

import {
  createPostgresMigrationApplier,
  MigrationCommitAmbiguousError,
  MigrationLedgerMismatchError,
  MigrationRolledBackError,
} from './db-migration-applier.js';
import { sha256 } from './db-migration-execution.js';

function fakeClient(options: { ledger?: Array<{ name: string; sha256: string }>; failCommit?: boolean } = {}) {
  const queries: string[] = [];
  return {
    queries,
    async connect() {
      return undefined;
    },
    async query(sql: string) {
      queries.push(sql);

      if (sql === 'COMMIT' && options.failCommit) {
        throw new Error('socket closed');
      }

      if (sql.includes('SELECT name, sha256')) {
        return { rows: options.ledger ?? [] };
      }

      if (sql.includes('to_regclass')) {
        return { rows: [{ ledger: '_ecode_schema_migrations' }] };
      }

      return { rows: [] };
    },
    async end() {
      return undefined;
    },
  };
}

describe('Postgres migration applicator failure boundaries', () => {
  it('does not classify a lost COMMIT acknowledgement as rolled back', async () => {
    const client = fakeClient({ failCommit: true });
    const applier = createPostgresMigrationApplier({ createClient: () => client });
    const sql = 'CREATE TABLE customers (id bigint)';
    await expect(
      applier.apply({
        connectionString: 'ignored',
        lockKey: 'project:production',
        migrations: [{ name: '001.sql', sql, sha256: sha256(sql) }],
        beforeCommit: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(MigrationCommitAmbiguousError);
    expect(client.queries).not.toContain('ROLLBACK');
  });

  it('runs the lease guard immediately before COMMIT', async () => {
    const client = fakeClient();
    const applier = createPostgresMigrationApplier({ createClient: () => client });

    const guard = vi.fn(async () => {
      throw new Error('lease lost');
    });

    const sql = 'CREATE TABLE customers (id bigint)';

    const result = applier.apply({
      connectionString: 'ignored',
      lockKey: 'project:production',
      migrations: [{ name: '001.sql', sql, sha256: sha256(sql) }],
      beforeCommit: guard,
    });
    await expect(result).rejects.toMatchObject({
      code: 'MIGRATION_ROLLED_BACK',
      cause: expect.objectContaining({ message: 'lease lost' }),
    });
    await expect(result).rejects.toBeInstanceOf(MigrationRolledBackError);
    expect(guard).toHaveBeenCalledOnce();
    expect(client.queries).toContain('ROLLBACK');
    expect(client.queries).not.toContain('COMMIT');
  });

  it('rejects a migration name whose target hash differs', async () => {
    const client = fakeClient({ ledger: [{ name: '001.sql', sha256: 'a'.repeat(64) }] });
    const applier = createPostgresMigrationApplier({ createClient: () => client });
    const sql = 'CREATE TABLE customers (id bigint)';
    await expect(
      applier.apply({
        connectionString: 'ignored',
        lockKey: 'project:production',
        migrations: [{ name: '001.sql', sql, sha256: sha256(sql) }],
        beforeCommit: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(MigrationLedgerMismatchError);
  });
});
