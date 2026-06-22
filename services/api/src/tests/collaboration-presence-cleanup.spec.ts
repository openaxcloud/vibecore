import { describe, expect, it } from 'vitest';

import { shouldRetirePresenceRow } from '../collaboration-presence-cleanup.js';

describe('shouldRetirePresenceRow', () => {
  it('retires the row when persisted updatedAt matches this connection (sole owner)', () => {
    const ts = '2026-06-22T10:00:00.000Z';

    expect(shouldRetirePresenceRow(ts, ts)).toBe(true);
  });

  it('does NOT retire when a newer connection has upserted (cross-replica reconnect)', () => {
    const own = '2026-06-22T10:00:00.000Z';
    const persistedNewer = '2026-06-22T10:00:05.000Z';

    expect(shouldRetirePresenceRow(persistedNewer, own)).toBe(false);
  });

  it('retires when the persisted row is older than this connection (stale read)', () => {
    const own = '2026-06-22T10:00:05.000Z';
    const persistedOlder = '2026-06-22T10:00:00.000Z';

    expect(shouldRetirePresenceRow(persistedOlder, own)).toBe(true);
  });

  it('does not retire when the row is already gone', () => {
    expect(shouldRetirePresenceRow(undefined, '2026-06-22T10:00:00.000Z')).toBe(false);
  });

  it('retires defensively when this connection never recorded a write', () => {
    expect(shouldRetirePresenceRow('2026-06-22T10:00:00.000Z', undefined)).toBe(true);
  });

  it('retires defensively on unparseable timestamps', () => {
    expect(shouldRetirePresenceRow('not-a-date', '2026-06-22T10:00:00.000Z')).toBe(true);
    expect(shouldRetirePresenceRow('2026-06-22T10:00:00.000Z', 'not-a-date')).toBe(true);
  });
});
