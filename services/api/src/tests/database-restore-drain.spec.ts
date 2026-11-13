import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  queries: [] as string[],
  identity: { system_identifier: '123', database_name: 'synthetic', database_oid: '42' },
  counts: { other_sessions: 0, prepared_transactions: 0 },
  fail: '',
  ended: false,
}));
vi.mock('pg', () => ({
  Client: class {
    async connect() {
      if (state.fail === 'connect') {
        throw new Error('postgres://private-secret');
      }
    }
    async query(text: string) {
      state.queries.push(text);

      if (text.includes(state.fail) && state.fail) {
        throw new Error('private-query-or-credential');
      }

      if (text.includes('pg_control_system')) {
        return { rows: [state.identity] };
      }

      if (text.includes('pg_stat_activity')) {
        return { rows: [state.counts] };
      }

      return { rows: [] };
    }
    async end() {
      state.ended = true;
    }
  },
}));
import { observePostgresRestoreDrain } from '../database-restore-drain.js';

const expected = { systemIdentifier: '123', databaseName: 'synthetic' };
beforeEach(() => {
  state.queries = [];
  state.identity = { system_identifier: '123', database_name: 'synthetic', database_oid: '42' };
  state.counts = { other_sessions: 0, prepared_transactions: 0 };
  state.fail = '';
  state.ended = false;
});
describe('read-only database-wide drain observation', () => {
  it('labels an empty sample as an observation, not a global fence', async () => {
    expect(await observePostgresRestoreDrain('unused', expected)).toEqual({
      ...expected,
      databaseOid: '42',
      otherSessions: 0,
      preparedTransactions: 0,
      observedEmpty: true,
      globalFence: false,
    });
    expect(state.queries[0]).toBe('BEGIN READ ONLY');
    expect(state.queries[2]).toBe('SELECT pg_stat_clear_snapshot()');
    expect(state.queries.at(-1)).toBe('COMMIT');
    expect(state.ended).toBe(true);
  });
  it.each([
    [1, 0],
    [0, 1],
    [4, 3],
  ])('does not certify drained sessions=%i prepared=%i', async (sessions, prepared) => {
    state.counts = { other_sessions: sessions, prepared_transactions: prepared };
    expect(await observePostgresRestoreDrain('unused', expected)).toMatchObject({
      observedEmpty: false,
      globalFence: false,
    });
  });
  it.each(['system_identifier', 'database_name', 'database_oid'] as const)(
    'rejects mismatching identity %s',
    async (key) => {
      state.identity[key] = 'wrong';
      await expect(observePostgresRestoreDrain('unused', expected)).rejects.toMatchObject({
        code: 'RESTORE_DRAIN_IDENTITY_MISMATCH',
      });
      expect(state.queries.some((sql) => sql.includes('pg_stat_activity'))).toBe(false);
      expect(state.ended).toBe(true);
    },
  );
  it.each([-1, 0.5, NaN, Infinity])('fails closed for malformed counter %s', async (value) => {
    state.counts.other_sessions = value;
    await expect(observePostgresRestoreDrain('unused', expected)).rejects.toMatchObject({
      code: 'RESTORE_DRAIN_OBSERVATION_INVALID',
    });
  });
  it.each(['connect', 'pg_control_system', 'pg_stat_clear_snapshot', 'pg_stat_activity', 'COMMIT'])(
    'sanitizes failures at %s and closes connection',
    async (failure) => {
      state.fail = failure;
      await expect(observePostgresRestoreDrain('unused', expected)).rejects.toThrow('RESTORE_DRAIN_OBSERVATION_FAILED');
      expect(state.ended).toBe(true);
    },
  );
  it('rejects invalid expected identity before opening a connection', async () => {
    await expect(observePostgresRestoreDrain('unused', { ...expected, systemIdentifier: '' })).rejects.toThrow(
      'RESTORE_DRAIN_IDENTITY_INVALID',
    );
    expect(state.queries).toEqual([]);
    expect(state.ended).toBe(false);
  });
});
