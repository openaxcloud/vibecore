/* eslint-disable no-restricted-imports -- API Vitest resolves service-relative modules, not the web `~/` alias. */
import { Client } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPostgresMigrationApplier, MIGRATION_LEDGER_TABLE } from '../db-migration-applier.js';
import { sha256, type DeclaredMigration } from '../db-migration-execution.js';

const databaseUrl = process.env.V311_TEST_DATABASE_URL;
const applier = createPostgresMigrationApplier({ statementTimeoutMs: 5_000, lockTimeoutMs: 2_000 });
const declared = (name: string, sql: string): DeclaredMigration => ({ name, sql, sha256: sha256(sql) });

async function withClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

describe.skipIf(!databaseUrl)('fenced target migration on real PostgreSQL', () => {
  beforeEach(async () => {
    await withClient(async (client) => {
      await client.query(`DROP TABLE IF EXISTS ${MIGRATION_LEDGER_TABLE}`);
      await client.query('DROP TABLE IF EXISTS v311_orders');
      await client.query('DROP TABLE IF EXISTS v311_customers');
    });
  });

  it('commits schema and exact content hashes in one transaction', async () => {
    const migrations = [
      declared('001_customers.sql', 'CREATE TABLE v311_customers (id bigint PRIMARY KEY)'),
      declared('002_orders.sql', 'CREATE TABLE v311_orders (id bigint PRIMARY KEY)'),
    ];
    const result = await applier.apply({
      connectionString: databaseUrl!,
      lockKey: 'v311:production',
      migrations,
      beforeCommit: async () => undefined,
    });
    expect(result.applied).toEqual(['001_customers.sql', '002_orders.sql']);
    await withClient(async (client) => {
      const ledger = await client.query(`SELECT name, sha256 FROM ${MIGRATION_LEDGER_TABLE} ORDER BY name`);
      expect(ledger.rows).toEqual(migrations.map(({ name, sha256: digest }) => ({ name, sha256: digest })));
      expect((await client.query("SELECT to_regclass('v311_customers') AS value")).rows[0].value).toBeTruthy();
    });
  });

  it('rolls back the whole DDL batch when a later statement fails', async () => {
    await withClient(async (client) => {
      await client.query('CREATE TABLE v311_customers (id bigint PRIMARY KEY, email text)');
      await client.query("INSERT INTO v311_customers VALUES (1, 'kept@example.com')");
    });
    await expect(
      applier.apply({
        connectionString: databaseUrl!,
        lockKey: 'v311:production',
        migrations: [
          declared('010_orders.sql', 'CREATE TABLE v311_orders (id bigint PRIMARY KEY)'),
          declared('011_invalid.sql', 'ALTER TABLE v311_customers ADD COLUMN email text'),
        ],
        beforeCommit: async () => undefined,
      }),
    ).rejects.toThrow();
    await withClient(async (client) => {
      expect((await client.query("SELECT to_regclass('v311_orders') AS value")).rows[0].value).toBeNull();
      expect((await client.query('SELECT email FROM v311_customers')).rows).toEqual([{ email: 'kept@example.com' }]);
      expect(
        (await client.query('SELECT to_regclass($1) AS value', [MIGRATION_LEDGER_TABLE])).rows[0].value,
      ).toBeNull();
    });
  });

  it('keeps both schema and ledger empty when release authority is lost immediately before COMMIT', async () => {
    const migration = declared('020_release_fence.sql', 'CREATE TABLE v311_orders (id bigint PRIMARY KEY)');

    await expect(
      applier.apply({
        connectionString: databaseUrl!,
        lockKey: 'v311:production',
        migrations: [migration],
        beforeCommit: async () => {
          throw Object.assign(new Error('Project release barrier was lost.'), {
            code: 'PROJECT_RELEASE_BARRIER_LOST',
            statusCode: 409,
          });
        },
      }),
    ).rejects.toMatchObject({
      code: 'MIGRATION_ROLLED_BACK',
      cause: expect.objectContaining({ code: 'PROJECT_RELEASE_BARRIER_LOST' }),
    });

    await withClient(async (client) => {
      expect((await client.query("SELECT to_regclass('v311_orders') AS value")).rows[0].value).toBeNull();
      expect(
        (await client.query('SELECT to_regclass($1) AS value', [MIGRATION_LEDGER_TABLE])).rows[0].value,
      ).toBeNull();
    });
  });

  it('refuses a reused migration name whose SQL hash changed', async () => {
    const original = declared('001_customers.sql', 'CREATE TABLE v311_customers (id bigint PRIMARY KEY)');
    await applier.apply({
      connectionString: databaseUrl!,
      lockKey: 'v311:production',
      migrations: [original],
      beforeCommit: async () => undefined,
    });
    await expect(
      applier.apply({
        connectionString: databaseUrl!,
        lockKey: 'v311:production',
        migrations: [declared('001_customers.sql', 'CREATE TABLE v311_customers (id text PRIMARY KEY)')],
        beforeCommit: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_LEDGER_MISMATCH' });
  });

  it('serializes two clients on the target advisory lock and applies once', async () => {
    const migration = declared('001_customers.sql', 'CREATE TABLE v311_customers (id bigint PRIMARY KEY)');

    const [first, second] = await Promise.all(
      [1, 2].map(() =>
        applier.apply({
          connectionString: databaseUrl!,
          lockKey: 'v311:production',
          migrations: [migration],
          beforeCommit: async () => undefined,
        }),
      ),
    );
    expect([...first.applied, ...second.applied]).toEqual(['001_customers.sql']);
    await expect(
      applier.inspect({
        connectionString: databaseUrl!,
        lockKey: 'v311:production',
        plan: [{ name: migration.name, sha256: migration.sha256 }],
      }),
    ).resolves.toMatchObject({ status: 'COMPLETE' });
  });
});
