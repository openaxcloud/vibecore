import { Client } from 'pg';

export class RestoreDrainError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** An observation, never an AttemptFenceReceipt or permission to cut over. */
export type RestoreDrainObservation = {
  systemIdentifier: string;
  databaseName: string;
  databaseOid: string;
  otherSessions: number;
  preparedTransactions: number;
  observedEmpty: boolean;
  globalFence: false;
};

/**
 * Read-only, database-wide countercheck after cooperating consumers drain.
 * Counts idle/active/unknown sessions, not application_name tags (SQL can change
 * them), and prepared transactions which survive the originating connection.
 * No cancellation/termination, credentials, SQL text or transaction GIDs escape.
 *
 * A zero count is only an observation: callers still need durable admission
 * closure and exclusion of every old worker and its external effects. In
 * particular another connection may arrive immediately after this sample.
 */
export async function observePostgresRestoreDrain(
  connectionUri: string,
  expected: { systemIdentifier: string; databaseName: string },
): Promise<RestoreDrainObservation> {
  if (!/^[1-9][0-9]*$/.test(expected.systemIdentifier) || !expected.databaseName) {
    throw new RestoreDrainError('RESTORE_DRAIN_IDENTITY_INVALID');
  }

  let client: Client | undefined;

  try {
    client = new Client({ connectionString: connectionUri, connectionTimeoutMillis: 5000, query_timeout: 5000 });
    await client.connect();
    await client.query('BEGIN READ ONLY');

    const identity = await client.query<{ system_identifier: string; database_name: string; database_oid: string }>(
      `SELECT system_identifier::text, current_database() AS database_name,
         (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS database_oid
       FROM pg_control_system()`,
    );

    const row = identity.rows[0];

    if (
      identity.rows.length !== 1 ||
      row?.system_identifier !== expected.systemIdentifier ||
      row.database_name !== expected.databaseName ||
      !/^[1-9][0-9]*$/.test(row.database_oid)
    ) {
      throw new RestoreDrainError('RESTORE_DRAIN_IDENTITY_MISMATCH');
    }

    // No reused statistics snapshot from earlier observations in a transaction.
    await client.query('SELECT pg_stat_clear_snapshot()');

    const result = await client.query<{ other_sessions: number; prepared_transactions: number }>(
      `SELECT
        (SELECT count(*)::int FROM pg_stat_activity
          WHERE datid = $1::oid AND pid <> pg_backend_pid()) AS other_sessions,
        (SELECT count(*)::int FROM pg_prepared_xacts
          WHERE database = current_database()) AS prepared_transactions`,
      [row.database_oid],
    );

    const counts = result.rows[0];

    if (
      result.rows.length !== 1 ||
      !Number.isSafeInteger(counts?.other_sessions) ||
      counts.other_sessions < 0 ||
      !Number.isSafeInteger(counts?.prepared_transactions) ||
      counts.prepared_transactions < 0
    ) {
      throw new RestoreDrainError('RESTORE_DRAIN_OBSERVATION_INVALID');
    }

    await client.query('COMMIT');

    return {
      systemIdentifier: row.system_identifier,
      databaseName: row.database_name,
      databaseOid: row.database_oid,
      otherSessions: counts.other_sessions,
      preparedTransactions: counts.prepared_transactions,
      observedEmpty: counts.other_sessions === 0 && counts.prepared_transactions === 0,
      globalFence: false,
    };
  } catch (error) {
    throw error instanceof RestoreDrainError ? error : new RestoreDrainError('RESTORE_DRAIN_OBSERVATION_FAILED');
  } finally {
    await client?.end().catch(() => undefined);
  }
}
