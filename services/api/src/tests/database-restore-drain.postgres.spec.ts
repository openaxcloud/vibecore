import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { observePostgresRestoreDrain } from '../database-restore-drain.js';

const url = process.env.RESTORE_TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
run('database-wide drain observation on real disposable PostgreSQL', () => {
  let client: Client;
  let identity: { systemIdentifier: string; databaseName: string };
  beforeAll(async () => {
    const endpoint = new URL(url!);

    if (
      endpoint.hostname !== '127.0.0.1' ||
      !endpoint.port ||
      endpoint.port === '55439' ||
      !/^\/(restore_fence_proof|vibecore_restore_ci_[a-f0-9]+)$/.test(endpoint.pathname)
    ) {
      throw new Error('Disposable local restore database required');
    }

    client = new Client({ connectionString: url });
    await client.connect();

    const result = await client.query('SELECT system_identifier::text FROM pg_control_system()');
    identity = {
      systemIdentifier: result.rows[0].system_identifier as string,
      databaseName: endpoint.pathname.slice(1),
    };
  });
  afterAll(async () => {
    await client?.end();
  });
  it('counts an idle untagged connection instead of trusting application acknowledgement', async () => {
    const observation = await observePostgresRestoreDrain(url!, identity);
    expect(observation.otherSessions).toBeGreaterThanOrEqual(1);
    expect(observation.observedEmpty).toBe(false);
    expect(observation.globalFence).toBe(false);
    expect(observation.databaseOid).toMatch(/^[1-9][0-9]*$/);
  });
  it('rejects the wrong database even on the same PostgreSQL system', async () => {
    await expect(
      observePostgresRestoreDrain(url!, { ...identity, databaseName: 'not-the-expected-database' }),
    ).rejects.toThrow('RESTORE_DRAIN_IDENTITY_MISMATCH');
  });
  it('rejects a different system identifier before counting sessions', async () => {
    await expect(observePostgresRestoreDrain(url!, { ...identity, systemIdentifier: '1' })).rejects.toThrow(
      'RESTORE_DRAIN_IDENTITY_MISMATCH',
    );
  });
  it('refuses an empty-session drain while a disconnected client has a prepared transaction', async () => {
    // No skip: the mandatory CI recipe must configure the disposable service.
    const setting = await client.query('SHOW max_prepared_transactions');
    expect(Number(setting.rows[0].max_prepared_transactions)).toBeGreaterThan(0);

    const gid = `restore_drain_${randomBytes(12).toString('hex')}`;
    const writer = new Client({ connectionString: url });

    let prepared = false;
    await writer.connect();

    try {
      await writer.query('BEGIN');
      await writer.query('SELECT 1');

      // Identifier is generated locally from hex only; no user SQL is accepted.
      await writer.query(`PREPARE TRANSACTION '${gid}'`);
      prepared = true;
    } finally {
      await writer.end();
    }

    try {
      /*
       * Close the suite's control client too: neither connection may explain
       * observedEmpty=false. Only the prepared transaction survives.
       */
      await client.end();

      let observation = await observePostgresRestoreDrain(url!, identity);

      const deadline = Date.now() + 5000;

      while (observation.otherSessions !== 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        observation = await observePostgresRestoreDrain(url!, identity);
      }

      // The deadline never certifies drainage; only the actual zero count does.
      expect(observation.otherSessions).toBe(0);
      expect(observation.preparedTransactions).toBe(1);
      expect(observation.observedEmpty).toBe(false);
      expect(observation.globalFence).toBe(false);
    } finally {
      // Reconnect even when an assertion fails; clean only our random owned GID.
      client = new Client({ connectionString: url });
      await client.connect();

      if (prepared) {
        await client.query(`ROLLBACK PREPARED '${gid}'`);
      }
    }

    const remaining = await client.query('SELECT count(*)::int AS count FROM pg_prepared_xacts WHERE gid = $1', [gid]);
    expect(remaining.rows[0].count).toBe(0);
  });
});
