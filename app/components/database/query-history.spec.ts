import { describe, expect, it } from 'vitest';
import {
  MAX_QUERY_HISTORY,
  clearQueryHistory,
  pushQueryHistoryEntry,
  queryHistoryStorageKey,
  removeQueryHistoryEntry,
} from './query-history';

describe('queryHistoryStorageKey', () => {
  it('is namespaced per project', () => {
    expect(queryHistoryStorageKey('p-1')).toBe('ecode:db-history:p-1');
  });
});

describe('pushQueryHistoryEntry', () => {
  it('prepends the newest statement', () => {
    expect(pushQueryHistoryEntry(['SELECT 1;'], 'SELECT 2;')).toEqual(['SELECT 2;', 'SELECT 1;']);
  });

  it('dedupes an identical statement by moving it to the front', () => {
    expect(pushQueryHistoryEntry(['SELECT 1;', 'SELECT 2;'], 'SELECT 2;')).toEqual(['SELECT 2;', 'SELECT 1;']);
  });

  it('trims before deduping so re-runs with stray whitespace collapse', () => {
    expect(pushQueryHistoryEntry(['SELECT 1;'], '  SELECT 1;\n')).toEqual(['SELECT 1;']);
  });

  it('ignores empty statements', () => {
    expect(pushQueryHistoryEntry(['SELECT 1;'], '   ')).toEqual(['SELECT 1;']);
  });

  it(`caps the list at ${MAX_QUERY_HISTORY}`, () => {
    const full = Array.from({ length: MAX_QUERY_HISTORY }, (_, i) => `SELECT ${i};`);
    const next = pushQueryHistoryEntry(full, 'SELECT new;');

    expect(next).toHaveLength(MAX_QUERY_HISTORY);
    expect(next[0]).toBe('SELECT new;');
    expect(next).not.toContain(`SELECT ${MAX_QUERY_HISTORY - 1};`);
  });
});

describe('removeQueryHistoryEntry', () => {
  it('removes only the matching statement', () => {
    expect(removeQueryHistoryEntry(['SELECT 1;', 'SELECT 2;'], 'SELECT 1;')).toEqual(['SELECT 2;']);
  });

  it('is a no-op for an unknown statement', () => {
    expect(removeQueryHistoryEntry(['SELECT 1;'], 'SELECT 9;')).toEqual(['SELECT 1;']);
  });
});

describe('clearQueryHistory', () => {
  it('returns an empty list (SSR-safe without window)', () => {
    expect(clearQueryHistory('p-1')).toEqual([]);
  });
});
