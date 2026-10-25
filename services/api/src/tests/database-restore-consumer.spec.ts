import { randomUUID, createHash } from 'node:crypto';
import { Client } from 'pg';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresRestoreConsumer } from '../database-restore-consumer.js';

const url = process.env.RESTORE_TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
run('participating restore consumer — real dedicated PostgreSQL, no physical restore', () => {
  let admin: Client;
  let systemIdentifier: string;
  const table = `restore_consumer_${randomUUID().replaceAll('-', '')}`;
  const attempt = { operationId: randomUUID(), attemptToken: randomUUID() };
  const binding = { targetId: 'synthetic-target', bindingVersion: 1 };
  const consumers: PostgresRestoreConsumer[] = [];
  const rows = [{ value: 'synthetic restored row' }];
  const expectedReadbackSha256 = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  beforeAll(async () => {
    const target = new URL(url!);
    if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.port === '55439')
      throw new Error('Dedicated loopback database required');
    admin = new Client({ connectionString: url });
    await admin.connect();
    systemIdentifier = (await admin.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0]
      .system_identifier;
    await admin.query(`CREATE TABLE "${table}" (value text NOT NULL)`);
    await admin.query(`INSERT INTO "${table}" VALUES ($1)`, [rows[0].value]);
  });
  afterAll(async () => {
    await Promise.all(consumers.map((c) => c.close()));
    await admin.query(`DROP TABLE IF EXISTS "${table}"`);
    await admin.end();
  });
  async function consumer() {
    const c = await PostgresRestoreConsumer.connect(url!, { targetId: 'synthetic-source', bindingVersion: 0 });
    consumers.push(c);
    return c;
  }
  function input() {
    return {
      ...attempt,
      ...binding,
      connectionUri: url!,
      systemIdentifier,
      expectedReadbackSha256,
      readback: { text: `SELECT value FROM "${table}" ORDER BY value` },
    };
  }
  it('denies new requests immediately and drains a real blocked query before acknowledging closure', async () => {
    const c = await consumer();
    const lock = Math.floor(Math.random() * 1e9);
    await admin.query('SELECT pg_advisory_lock($1)', [lock]);
    const pending = Promise.all(Array.from({ length: 3 }, () => c.query('SELECT pg_advisory_xact_lock($1)', [lock])));
    let drained = false;
    const drain = c.quiesce(attempt).then(() => {
      drained = true;
    });
    try {
      await expect(c.query('SELECT 1')).rejects.toMatchObject({ code: 'RESTORE_APPLICATION_QUIESCED' });
      // Actual database round trip while the lock prevents the old request ending.
      await admin.query('SELECT 1');
      expect(drained).toBe(false);
    } finally {
      await admin.query('SELECT pg_advisory_unlock($1)', [lock]);
    }
    await pending;
    await drain;
    expect(drained).toBe(true);
  });
  it('verifies data through the replacement pool, keeps admission closed, and releases only the exact binding', async () => {
    const c = await consumer();
    await c.quiesce(attempt);
    await c.quiesce(attempt);
    expect(await c.verify(input())).toMatchObject({
      ...binding,
      systemIdentifier,
      observedReadbackSha256: expectedReadbackSha256,
    });
    await expect(c.query('SELECT 1')).rejects.toMatchObject({ code: 'RESTORE_APPLICATION_QUIESCED' });
    await expect(c.release(attempt, { ...binding, targetId: 'wrong' })).rejects.toMatchObject({
      code: 'RESTORE_CONSUMER_BINDING_MISMATCH',
    });
    await expect(c.release({ ...attempt, attemptToken: 'stale' }, binding)).rejects.toMatchObject({
      code: 'RESTORE_CONSUMER_ATTEMPT_MISMATCH',
    });
    await c.release(attempt, binding);
    await c.release(attempt, binding);
    expect((await c.query(`SELECT value FROM "${table}"`)).rows).toEqual(rows);
    await expect(c.quiesce(attempt)).rejects.toMatchObject({ code: 'RESTORE_CONSUMER_ALREADY_RELEASED' });
  });
  it('does not let an older queued release reopen admission after a newer pause request', async () => {
    const c = await consumer();
    await c.quiesce(attempt);
    await c.verify(input());
    await c.release(attempt, binding);
    const releasing = c.release(attempt, binding).catch((error) => error);
    const pausing = c.pauseVerified(attempt);
    await Promise.resolve();
    await expect(c.query('SELECT 1')).rejects.toMatchObject({ code: 'RESTORE_APPLICATION_QUIESCED' });
    await releasing;
    await pausing;
    await c.reconnectVerified(input());
    await c.release(attempt, binding);
    expect((await c.query('SELECT 1 AS value')).rows).toEqual([{ value: 1 }]);
  });

  it.each(['hash', 'identity', 'version', 'connection', 'write'] as const)(
    'fails closed for %s without releasing the application',
    async (kind) => {
      const c = await consumer();
      await c.quiesce(attempt);
      const request = input();
      if (kind === 'hash') request.expectedReadbackSha256 = 'b'.repeat(64);
      if (kind === 'identity') request.systemIdentifier = 'wrong';
      if (kind === 'version') request.bindingVersion = 0;
      if (kind === 'connection') {
        const failed = new URL(url!);
        failed.port = '1';
        request.connectionUri = failed.toString();
      }
      if (kind === 'write') request.readback.text = `INSERT INTO "${table}" VALUES ('must not persist')`;
      await expect(c.verify(request)).rejects.toThrow();
      await expect(c.release(attempt, binding)).rejects.toMatchObject({ code: 'RESTORE_CONSUMER_BINDING_MISMATCH' });
      await expect(c.query('SELECT 1')).rejects.toMatchObject({ code: 'RESTORE_APPLICATION_QUIESCED' });
      expect((await admin.query(`SELECT value FROM "${table}"`)).rows).toEqual(rows);
      // A verified retry can recover; the rejected replacement pool was discarded.
      await c.verify(input());
      await c.release(attempt, binding);
    },
  );
  it('uses the consumer through the real QA child IPC and HTTP, including ordinary reads after release', async () => {
    const schema = `consumer_http_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".restore_probe (id text, value text)`);
    await admin.query(`INSERT INTO "${schema}".restore_probe VALUES ('one', 'synthetic row')`);
    const connection = new URL(url!);
    connection.searchParams.set('options', `-c search_path=${schema}`);
    const child = fork(
      fileURLToPath(new URL('../../../../scripts/qa/database-restore-qa-app.ts', import.meta.url)),
      [],
      {
        execArgv: ['--import', 'tsx'],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    );
    const exit = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    let sequence = 0;
    const call = (body: object) =>
      new Promise<any>((resolve, reject) => {
        const id = ++sequence;
        const listener = (message: any) => {
          if (message.id !== id) return;
          child.off('message', listener);
          if (message.error) reject(new Error(message.error));
          else resolve(message.result);
        };
        child.on('message', listener);
        child.send({ ...body, id });
      });
    try {
      const port = await new Promise<number>((resolve) =>
        child.on('message', (m: any) => {
          if (m.ready) resolve(m.port);
        }),
      );
      const read = (path: string) => fetch(`http://127.0.0.1:${port}${path}`);
      await call({ action: 'connect', connectionUri: connection.toString(), activate: true });
      const expected = [{ id: 'one', value: 'synthetic row' }];
      expect(((await (await read('/value')).json()) as any).rows).toEqual(expected);
      await call({ action: 'quiesce' });
      expect((await read('/value')).status).toBe(503);
      const digest = createHash('sha256').update(JSON.stringify(expected)).digest('hex');
      await call({
        action: 'connect',
        connectionUri: connection.toString(),
        ...binding,
        systemIdentifier,
        expectedReadbackSha256: digest,
      });
      expect(((await (await read('/restore-readback')).json()) as any).observedReadbackSha256).toBe(digest);
      expect((await read('/value')).status).toBe(503);
      await call({ action: 'release', bindingVersion: 1 });
      expect(((await (await read('/value')).json()) as any).rows).toEqual(expected);
      await call({ action: 'suspend' });
      expect((await read('/value')).status).toBe(503);
      // Same binding reconnect, as used after target restart by the physical drill.
      await call({
        action: 'connect',
        connectionUri: connection.toString(),
        ...binding,
        systemIdentifier,
        expectedReadbackSha256: digest,
      });
      await call({ action: 'release', bindingVersion: 1 });
      expect(((await (await read('/value')).json()) as any).rows).toEqual(expected);
      await call({ action: 'stop' });
      await exit;
    } finally {
      if (child.exitCode === null) {
        child.kill();
        await exit;
      }
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  });
});
