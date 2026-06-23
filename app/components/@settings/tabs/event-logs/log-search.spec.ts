import { describe, expect, it } from 'vitest';
import { countMatchingLogs } from './log-search';
import type { LogEntry } from '~/lib/stores/logs';

function makeLog(partial: Partial<LogEntry> & Pick<LogEntry, 'id' | 'message'>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    category: 'system',
    ...partial,
  } as LogEntry;
}

describe('countMatchingLogs', () => {
  const logs: LogEntry[] = [
    makeLog({ id: '1', message: 'Hello world', level: 'info', category: 'system' }),
    makeLog({ id: '2', message: 'Provider call', level: 'info', category: 'provider' }),
    makeLog({ id: '3', message: 'An ERROR occurred', level: 'error', category: 'error' }),
    makeLog({ id: '4', message: 'API request', level: 'info', category: 'api' }),
  ];

  it('counts all logs when level is all and no query', () => {
    expect(countMatchingLogs(logs, 'all', '')).toBe(4);
  });

  it('matches search query case-insensitively against the message', () => {
    expect(countMatchingLogs(logs, 'all', 'error')).toBe(1);
    expect(countMatchingLogs(logs, 'all', 'PROVIDER')).toBe(1);
    expect(countMatchingLogs(logs, 'all', 'nomatch')).toBe(0);
  });

  it('filters by category', () => {
    expect(countMatchingLogs(logs, 'provider', '')).toBe(1);
    expect(countMatchingLogs(logs, 'api', '')).toBe(1);
  });

  it('filters by level', () => {
    expect(countMatchingLogs(logs, 'error', '')).toBe(1);
    expect(countMatchingLogs(logs, 'info', '')).toBe(3);
  });

  it('combines level/category and search query', () => {
    expect(countMatchingLogs(logs, 'info', 'world')).toBe(1);
    expect(countMatchingLogs(logs, 'info', 'error')).toBe(0);
  });

  /*
   * Regression guard for the once-per-second log storm: the search-logging
   * effect writes a log entry whose message embeds the search query. That entry
   * would itself match the active query. countMatchingLogs is a pure function of
   * its inputs, so the effect can compute the count without re-triggering on the
   * resulting length change. Here we prove that appending such a self-referential
   * entry is observable as a count change (i.e. it WOULD have re-fired the effect
   * had length been a dependency), which is exactly why the count must be derived
   * via this pure helper read from a ref rather than from an effect dependency.
   */
  it('reflects a self-referential search log entry (the storm trigger)', () => {
    const query = 'world';
    const before = countMatchingLogs(logs, 'all', query);

    const withSearchLog = [
      ...logs,
      makeLog({ id: '5', message: `Search performed with query "${query}" (1 results)`, level: 'info' }),
    ];

    const after = countMatchingLogs(withSearchLog, 'all', query);

    expect(after).toBe(before + 1);
  });
});
