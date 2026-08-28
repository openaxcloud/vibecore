import { createHash } from 'node:crypto';

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
  /** pg emits backend loss outside the in-flight query promise. */
  on?(event: 'error', listener: (error: Error) => void): unknown;
}

export class MigrationLedgerLeaseUnavailableError extends Error {
  readonly code = 'ROLLBACK_DB_LEDGER_UNAVAILABLE';
}

export interface ExactPostgresMigrationLedgerLease {
  inspection: ExactMigrationLedgerInspection;
  /** Prove this same backend still owns the key and the exact ledger is unchanged. */
  assertHeldAndInspect(): Promise<ExactMigrationLedgerInspection>;
  release(): Promise<void>;
}

export type ExactMigrationLedgerInspection =
  | { status: 'EXACT'; digest: string; entries: number }
  | { status: 'MISSING' | 'INVALID' | 'UNAVAILABLE' };

/**
 * Hash the COMPLETE migration ledger, not merely the release's migration plan.
 * Consequently both a rewritten historical row and a later/advanced migration
 * produce a different digest and block deterministic rollback.
 */
export function exactMigrationLedgerDigest(rows: ReadonlyArray<{ name: string; sha256: string }>): string {
  const canonical = [...rows]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((row) => `${row.name}\0${row.sha256}`)
    .join('\0');

  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

async function inspectConnectedMigrationLedger(client: MigrationPgClient): Promise<ExactMigrationLedgerInspection> {
  const table = await client.query('SELECT to_regclass($1) AS ledger', [MIGRATION_LEDGER_TABLE]);

  if (!table.rows[0]?.ledger) return { status: 'MISSING' };

  const result = await client.query(`SELECT name, sha256 FROM ${MIGRATION_LEDGER_TABLE} ORDER BY name ASC`);
  const rows: Array<{ name: string; sha256: string }> = [];

  for (const row of result.rows) {
    if (
      typeof row.name !== 'string' ||
      row.name.length < 1 ||
      row.name.length > 255 ||
      typeof row.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(row.sha256)
    ) {
      return { status: 'INVALID' };
    }
    rows.push({ name: row.name, sha256: row.sha256 });
  }

  return { status: 'EXACT', digest: exactMigrationLedgerDigest(rows), entries: rows.length };
}

function sameExactMigrationLedgerInspection(
  left: ExactMigrationLedgerInspection,
  right: ExactMigrationLedgerInspection,
): boolean {
  return (
    left.status === right.status &&
    (left.status !== 'EXACT' ||
      (right.status === 'EXACT' && left.digest === right.digest && left.entries === right.entries))
  );
}

export async function inspectExactPostgresMigrationLedger(input: {
  connectionString: string;
  lockKey: string;
  createClient?: (connectionString: string) => MigrationPgClient;
}): Promise<ExactMigrationLedgerInspection> {
  const createClient =
    input.createClient ?? ((connectionString: string) => new PgClient({ connectionString }) as MigrationPgClient);
  const client = createClient(input.connectionString);

  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', $1, true)", [String(DEFAULT_STATEMENT_TIMEOUT_MS)]);
    await client.query("SELECT set_config('lock_timeout', $1, true)", [String(DEFAULT_LOCK_TIMEOUT_MS)]);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.lockKey]);
    const table = await client.query('SELECT to_regclass($1) AS ledger', [MIGRATION_LEDGER_TABLE]);

    if (!table.rows[0]?.ledger) {
      await client.query('ROLLBACK');
      return { status: 'MISSING' };
    }

    const result = await client.query(`SELECT name, sha256 FROM ${MIGRATION_LEDGER_TABLE} ORDER BY name ASC`);
    const rows: Array<{ name: string; sha256: string }> = [];

    for (const row of result.rows) {
      if (
        typeof row.name !== 'string' ||
        row.name.length < 1 ||
        row.name.length > 255 ||
        typeof row.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(row.sha256)
      ) {
        await client.query('ROLLBACK');
        return { status: 'INVALID' };
      }
      rows.push({ name: row.name, sha256: row.sha256 });
    }

    await client.query('ROLLBACK');
    return { status: 'EXACT', digest: exactMigrationLedgerDigest(rows), entries: rows.length };
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return { status: 'UNAVAILABLE' };
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Hold a PostgreSQL SESSION advisory lock on the same key used by migration
 * transactions while a release effect and its manifest commit linearize. The
 * ledger read is autocommit and the session stays open until release(), so an
 * idle-in-transaction timeout cannot silently drop the fence during manager IO.
 */
export async function acquireExactPostgresMigrationLedgerLease(input: {
  connectionString: string;
  lockKey: string;
  createClient?: (connectionString: string) => MigrationPgClient;
  lockTimeoutMs?: number;
}): Promise<ExactPostgresMigrationLedgerLease> {
  const createClient =
    input.createClient ?? ((connectionString: string) => new PgClient({ connectionString }) as MigrationPgClient);
  const client = createClient(input.connectionString);
  const lockTimeoutMs = input.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  let lockHeld = false;
  let asynchronousClientError: Error | undefined;

  client.on?.('error', (error) => {
    asynchronousClientError = error;
    lockHeld = false;
  });

  if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1 || lockTimeoutMs > 60_000) {
    throw new TypeError('MIGRATION_LEDGER_LEASE_LOCK_TIMEOUT_INVALID');
  }

  try {
    await client.connect();
    await client.query("SELECT set_config('statement_timeout', $1, false)", [String(lockTimeoutMs)]);
    await client.query("SELECT set_config('lock_timeout', $1, false)", [String(lockTimeoutMs)]);
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [input.lockKey]);
    lockHeld = true;
    await client.query("SELECT set_config('statement_timeout', '0', false)");
    await client.query("SELECT set_config('lock_timeout', '0', false)");
    await client.query("SELECT set_config('statement_timeout', $1, false)", [String(DEFAULT_STATEMENT_TIMEOUT_MS)]);
    const inspection = await inspectConnectedMigrationLedger(client);

    await client.query("SELECT set_config('statement_timeout', '0', false)");

    let released = false;

    return {
      inspection,
      async assertHeldAndInspect() {
        if (released || !lockHeld || asynchronousClientError) {
          throw new MigrationLedgerLeaseUnavailableError('migration ledger lease unavailable');
        }

        try {
          await client.query("SELECT set_config('statement_timeout', $1, false)", [
            String(DEFAULT_STATEMENT_TIMEOUT_MS),
          ]);
          const held = await client.query(
            `SELECT EXISTS (
               SELECT 1 FROM pg_locks
               WHERE locktype = 'advisory'
                 AND pid = pg_backend_pid()
                 AND granted
                 AND classid = (((hashtextextended($1, 0) >> 32) & 4294967295)::oid)
                 AND objid = ((hashtextextended($1, 0) & 4294967295)::oid)
                 AND objsubid = 1
             ) AS held`,
            [input.lockKey],
          );

          if (held.rows[0]?.held !== true) {
            throw new MigrationLedgerLeaseUnavailableError();
          }

          const current = await inspectConnectedMigrationLedger(client);
          if (!sameExactMigrationLedgerInspection(inspection, current)) {
            throw new MigrationLedgerLeaseUnavailableError();
          }
          await client.query("SELECT set_config('statement_timeout', '0', false)");
          return current;
        } catch {
          lockHeld = false;
          await client.end().catch(() => undefined);
          throw new MigrationLedgerLeaseUnavailableError('migration ledger lease unavailable');
        }
      },
      async release() {
        if (released) return;
        released = true;
        try {
          if (lockHeld) {
            const unlocked = await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked', [
              input.lockKey,
            ]);
            lockHeld = false;
            /* A false/malformed result is handled by destroying the session below. */
            void unlocked.rows[0]?.unlocked;
          }
        } finally {
          /* Closing the session is the fail-safe unlock if the explicit result is doubtful. */
          await client.end().catch(() => undefined);
        }
      },
    };
  } catch {
    await client.end().catch(() => undefined);
    throw new MigrationLedgerLeaseUnavailableError('migration ledger lease unavailable');
  }
}

export async function withExactPostgresMigrationLedgerLease<T>(
  input: {
    connectionString: string;
    lockKey: string;
    createClient?: (connectionString: string) => MigrationPgClient;
    lockTimeoutMs?: number;
  },
  callback: (inspection: ExactMigrationLedgerInspection) => Promise<T>,
): Promise<T> {
  const lease = await acquireExactPostgresMigrationLedgerLease(input);

  try {
    return await callback(lease.inspection);
  } finally {
    await lease.release();
  }
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
