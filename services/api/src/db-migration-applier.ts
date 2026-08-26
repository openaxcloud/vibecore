import { Client as PgClient } from 'pg';

import type {
  DeclaredMigration,
  MigrationTargetInspection,
  PersistedMigrationPlanEntry,
  SqlApplier,
} from './db-migration-execution.js';

export const MIGRATION_LEDGER_TABLE = '_ecode_schema_migrations';

const DEFAULT_STATEMENT_TIMEOUT_MS = 60_000;
const DEFAULT_LOCK_TIMEOUT_MS = 10_000;

const CREATE_LEDGER = `CREATE TABLE IF NOT EXISTS ${MIGRATION_LEDGER_TABLE} (
  name text PRIMARY KEY,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

type QueryResult = { rows: Array<Record<string, unknown>> };
export interface MigrationPgClient {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<QueryResult>;
  end(): Promise<void>;
}

export interface PostgresMigrationApplierOptions {
  createClient?: (connectionString: string) => MigrationPgClient;
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
}

export class MigrationCommitAmbiguousError extends Error {
  readonly code = 'MIGRATION_COMMIT_AMBIGUOUS';
}

export class MigrationLedgerMismatchError extends Error {
  readonly code = 'MIGRATION_LEDGER_MISMATCH';
}

export class MigrationRolledBackError extends Error {
  readonly code = 'MIGRATION_ROLLED_BACK';
  constructor(readonly cause: unknown) {
    super('migration transaction rolled back');
  }
}

function rowsToLedger(rows: Array<Record<string, unknown>>): Map<string, string> {
  return new Map(rows.map((row) => [String(row.name), String(row.sha256)]));
}

function classifyLedger(
  existing: Map<string, string>,
  plan: readonly PersistedMigrationPlanEntry[],
): MigrationTargetInspection {
  const applied: string[] = [];

  let mismatch = false;

  for (const migration of plan) {
    const digest = existing.get(migration.name);

    if (digest === undefined) {
      continue;
    }

    if (digest !== migration.sha256) {
      mismatch = true;
    } else {
      applied.push(migration.name);
    }
  }

  if (mismatch) {
    return { status: 'MISMATCH', applied };
  }

  if (applied.length === 0) {
    return { status: 'EMPTY', applied };
  }

  if (applied.length === plan.length) {
    return { status: 'COMPLETE', applied };
  }

  return { status: 'PARTIAL', applied };
}

async function configureTransaction(
  client: MigrationPgClient,
  input: { lockKey: string; statementTimeoutMs: number; lockTimeoutMs: number },
): Promise<void> {
  await client.query("SELECT set_config('statement_timeout', $1, true)", [String(input.statementTimeoutMs)]);
  await client.query("SELECT set_config('lock_timeout', $1, true)", [String(input.lockTimeoutMs)]);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.lockKey]);
}

export function createPostgresMigrationApplier(options: PostgresMigrationApplierOptions = {}): SqlApplier {
  const createClient =
    options.createClient ?? ((connectionString: string) => new PgClient({ connectionString }) as MigrationPgClient);

  const statementTimeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;

  return {
    async apply(input: {
      connectionString: string;
      lockKey: string;
      migrations: DeclaredMigration[];
      beforeCommit: () => Promise<void>;
    }) {
      const client = createClient(input.connectionString);
      await client.connect();

      let transactionOpen = false;
      let commitStarted = false;

      try {
        await client.query('BEGIN');
        transactionOpen = true;
        await configureTransaction(client, { lockKey: input.lockKey, statementTimeoutMs, lockTimeoutMs });
        await client.query(CREATE_LEDGER);

        const existingResult = await client.query(`SELECT name, sha256 FROM ${MIGRATION_LEDGER_TABLE}`);
        const existing = rowsToLedger(existingResult.rows);
        const applied: string[] = [];

        for (const migration of input.migrations) {
          const priorDigest = existing.get(migration.name);

          if (priorDigest !== undefined) {
            if (priorDigest !== migration.sha256) {
              throw new MigrationLedgerMismatchError(`migration ledger conflict: ${migration.name}`);
            }

            continue;
          }

          await client.query(migration.sql);
          await client.query(`INSERT INTO ${MIGRATION_LEDGER_TABLE} (name, sha256) VALUES ($1, $2)`, [
            migration.name,
            migration.sha256,
          ]);
          applied.push(migration.name);
        }

        await input.beforeCommit();
        commitStarted = true;

        try {
          await client.query('COMMIT');
          transactionOpen = false;
        } catch {
          throw new MigrationCommitAmbiguousError('migration commit acknowledgement unavailable');
        }

        return { applied };
      } catch (error) {
        if (transactionOpen && !commitStarted) {
          try {
            await client.query('ROLLBACK');
            transactionOpen = false;
          } catch {
            throw new MigrationCommitAmbiguousError('migration rollback acknowledgement unavailable');
          }

          if (error instanceof MigrationLedgerMismatchError) {
            throw error;
          }

          throw new MigrationRolledBackError(error);
        }

        throw error;
      } finally {
        await client.end().catch(() => undefined);
      }
    },

    async inspect(input: {
      connectionString: string;
      lockKey: string;
      plan: PersistedMigrationPlanEntry[];
    }): Promise<MigrationTargetInspection> {
      const client = createClient(input.connectionString);

      try {
        await client.connect();
        await client.query('BEGIN');
        await configureTransaction(client, { lockKey: input.lockKey, statementTimeoutMs, lockTimeoutMs });

        const table = await client.query('SELECT to_regclass($1) AS ledger', [MIGRATION_LEDGER_TABLE]);

        if (!table.rows[0]?.ledger) {
          await client.query('ROLLBACK');
          return { status: 'EMPTY', applied: [] };
        }

        const rows = await client.query(`SELECT name, sha256 FROM ${MIGRATION_LEDGER_TABLE}`);
        const result = classifyLedger(rowsToLedger(rows.rows), input.plan);
        await client.query('ROLLBACK');

        return result;
      } catch {
        await client.query('ROLLBACK').catch(() => undefined);
        return { status: 'UNAVAILABLE', applied: [] };
      } finally {
        await client.end().catch(() => undefined);
      }
    },
  };
}
