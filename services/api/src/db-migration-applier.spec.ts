import { describe, expect, it, vi } from 'vitest';
import { createPostgresMigrationApplier } from './db-migration-applier.js';
import { MigrationRolledBackError } from './db-migration-execution.js';

describe('migration transaction certainty', () => {
  it.each(['COMMIT', 'ROLLBACK'])('does not attest rollback after %s failure', async (failure) => {
    const query = vi.fn(async (sql: string) => {
      if (sql === failure || (failure === 'ROLLBACK' && sql === 'BAD SQL')) {
        throw new Error('connection lost');
      }

      return { rows: [], command: sql };
    });

    const end = vi.fn(async () => {});

    const apply = createPostgresMigrationApplier({
      sha256: () => 'hash',
      createClient: () => ({ query, end, connect: async () => {} }),
    });
    await expect(
      apply({ connectionString: 'unused', migrations: [{ name: 'test', sql: 'BAD SQL' }] }),
    ).rejects.not.toBeInstanceOf(MigrationRolledBackError);
    expect(end).toHaveBeenCalled();

    if (failure === 'COMMIT') {
      expect(query).not.toHaveBeenCalledWith('ROLLBACK');
    }
  });
  it('attests only acknowledged rollback before commit', async () => {
    const apply = createPostgresMigrationApplier({
      sha256: () => 'hash',
      createClient: () => ({
        connect: async () => {},
        end: async () => {},
        query: async (sql: string) => {
          if (sql === 'BAD SQL') {
            throw new Error('syntax error');
          }

          return { rows: [], command: sql };
        },
      }),
    });
    await expect(
      apply({ connectionString: 'unused', migrations: [{ name: 'test', sql: 'BAD SQL' }] }),
    ).rejects.toBeInstanceOf(MigrationRolledBackError);
  });
});

it.each([
  'COMMIT',
  'CREATE TABLE x (id int); COMMIT',
  '/* nested /* x */ y */ END',
  'ROLLBACK',
  "PREPARE TRANSACTION 'x'",
  '-- note\nSTART TRANSACTION',
  '-- note\rCOMMIT',
  'DO $$ BEGIN NULL; END $$; COMMIT',
])('refuses transaction control: %s', async (sql) => {
  const createClient = vi.fn();
  const apply = createPostgresMigrationApplier({ sha256: () => 'hash', createClient });
  await expect(apply({ connectionString: 'unused', migrations: [{ name: 'x', sql }] })).rejects.toThrow();
  expect(createClient).not.toHaveBeenCalled();
});

it('accepts ordinary DDL and dollar-quoted function bodies', async () => {
  const apply = createPostgresMigrationApplier({
    sha256: () => 'hash',
    createClient: () => ({
      connect: async () => {},
      end: async () => {},
      query: async (sql) => ({ rows: [], command: sql }),
    }),
  });
  expect(
    await apply({
      connectionString: 'unused',
      migrations: [
        {
          name: 'function',
          sql: "/* outer /* inner */ comment */ CREATE FUNCTION f() RETURNS void AS $body$ BEGIN RAISE NOTICE 'hello'; END; $body$ LANGUAGE plpgsql; CREATE TABLE t (id int, label text DEFAULT 'COMMIT;')",
        },
      ],
    }),
  ).toMatchObject({ committed: true });
});

it('refuses a COMMIT answered with a ROLLBACK command tag', async () => {
  const apply = createPostgresMigrationApplier({
    sha256: () => 'hash',
    createClient: () => ({
      connect: async () => {},
      end: async () => {},
      query: async (sql) => ({ rows: [], command: sql === 'COMMIT' ? 'ROLLBACK' : sql }),
    }),
  });
  await expect(apply({ connectionString: 'unused', migrations: [] })).rejects.not.toBeInstanceOf(
    MigrationRolledBackError,
  );
});

it.each(['table$x$', 'table$$', 'é$x$'])(
  'refuses dollar signs embedded in identifiers before connection: %s',
  async (identifier) => {
    const createClient = vi.fn();
    const apply = createPostgresMigrationApplier({ sha256: () => 'hash', createClient });
    await expect(
      apply({
        connectionString: 'unused',
        migrations: [{ name: 'identifier', sql: `CREATE TABLE ${identifier} (id int); -- $x$ $$` }],
      }),
    ).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  },
);
