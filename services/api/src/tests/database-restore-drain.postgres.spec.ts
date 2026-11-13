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
});
