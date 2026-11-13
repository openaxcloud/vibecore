import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pools: [] as Array<{ fail: () => void; ended: boolean }>,
  failProbe: false,
  failReadbackRelease: false,
}));
vi.mock('pg', () => ({
  Pool: class {
    ended = false;
    private _onError: () => void = () => undefined;
    constructor() {
      state.pools.push(this);
    }
    on(_event: string, callback: () => void) {
      this._onError = callback;
    }
    fail() {
      this._onError();
    }
    async query() {
      if (state.failProbe) {
        this.fail();
      }

      return { rows: [] };
    }
    async connect() {
      return {
        query: async (text: string) => ({
          rows: text.includes('pg_control_system') ? [{ system_identifier: '123' }] : [],
        }),
        release: () => {
          if (state.failReadbackRelease) {
            this.fail();
          }
        },
      };
    }
    async end() {
      this.ended = true;
    }
  },
}));
import { PostgresRestoreConsumer } from '../database-restore-consumer.js';

const attempt = { operationId: 'operation', attemptToken: 'attempt' };
const binding = { targetId: 'replacement', bindingVersion: 1 };

const input = {
  ...attempt,
  ...binding,
  connectionUri: 'unused-by-test-double',
  systemIdentifier: '123',
  expectedReadbackSha256: createHash('sha256').update('[]').digest('hex'),
  readback: { text: 'SELECT value FROM fixture ORDER BY value' },
};

async function verifiedConsumer() {
  const consumer = await PostgresRestoreConsumer.connect('unused-by-test-double', {
    targetId: 'source',
    bindingVersion: 0,
  });
  await consumer.quiesce(attempt);
  await consumer.verify(input);

  return consumer;
}
beforeEach(() => {
  state.pools = [];
  state.failProbe = false;
  state.failReadbackRelease = false;
});
describe('restore consumer pool-error admission races (deterministic transport fault injection)', () => {
  it('does not admit a pool whose initial probe succeeded but whose idle error already fired', async () => {
    state.failProbe = true;
    await expect(
      PostgresRestoreConsumer.connect('unused', { targetId: 'source', bindingVersion: 0 }),
    ).rejects.toMatchObject({
      code: 'RESTORE_CONSUMER_CONNECT_FAILED',
    });
    expect(state.pools[0].ended).toBe(true);
  });
  it('invalidates a release queued before the idle error', async () => {
    const consumer = await verifiedConsumer();
    const release = consumer.release(attempt, binding);
    state.pools[1].fail();
    await expect(release).rejects.toMatchObject({ code: 'RESTORE_CONSUMER_ADMISSION_CHANGED' });
    await expect(consumer.query('SELECT 1')).rejects.toMatchObject({ code: 'RESTORE_APPLICATION_QUIESCED' });
    await consumer.close();
  });
  it('rejects later release retries until a fresh pool has been verified', async () => {
    const consumer = await verifiedConsumer();
    await consumer.release(attempt, binding);
    state.pools[1].fail();
    await expect(consumer.release(attempt, binding)).rejects.toMatchObject({ code: 'RESTORE_CONSUMER_POOL_FAILED' });
    await expect(consumer.query('SELECT 1')).rejects.toMatchObject({ code: 'RESTORE_APPLICATION_QUIESCED' });
    await consumer.pauseVerified(attempt);
    expect(state.pools[1].ended).toBe(true);
    await consumer.reconnectVerified(input);
    await consumer.release(attempt, binding);
    await expect(consumer.query('SELECT 1')).resolves.toEqual({ rows: [] });
    await consumer.close();
  });
  it('rejects a replacement pool that failed as its readback client was returned', async () => {
    const consumer = await PostgresRestoreConsumer.connect('unused', { targetId: 'source', bindingVersion: 0 });
    await consumer.quiesce(attempt);
    state.failReadbackRelease = true;
    await expect(consumer.verify(input)).rejects.toMatchObject({ code: 'RESTORE_CONSUMER_ADMISSION_CHANGED' });
    expect(state.pools[1].ended).toBe(true);
    await expect(consumer.release(attempt, binding)).rejects.toMatchObject({
      code: 'RESTORE_CONSUMER_BINDING_MISMATCH',
    });
    await consumer.close();
  });
});
