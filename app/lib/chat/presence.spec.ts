import { describe, expect, it } from 'vitest';

import { PRESENCE_STALE_AFTER_MS, emptyPresence, listPresenceEntries, presenceReducer } from './presence';

describe('presenceReducer', () => {
  it('records a ping and updates lastSeenAt', () => {
    const state = presenceReducer(emptyPresence(), {
      type: 'ping',
      userId: 'u-1',
      name: 'Alice',
      status: 'viewing',
      at: 100,
    });

    expect(state.entries['u-1']).toMatchObject({ userId: 'u-1', status: 'viewing', lastSeenAt: 100 });
  });

  it('returns the same state when a ping is a no-op', () => {
    const state = presenceReducer(emptyPresence(), {
      type: 'ping',
      userId: 'u-1',
      name: 'Alice',
      status: 'viewing',
      at: 100,
    });

    const next = presenceReducer(state, {
      type: 'ping',
      userId: 'u-1',
      name: 'Alice',
      status: 'viewing',
      at: 50,
    });

    expect(next).toBe(state);
  });

  it('removes an entry on leave', () => {
    let state = presenceReducer(emptyPresence(), {
      type: 'ping',
      userId: 'u-1',
      name: 'Alice',
      status: 'viewing',
      at: 100,
    });

    state = presenceReducer(state, { type: 'leave', userId: 'u-1' });
    expect(state.entries['u-1']).toBeUndefined();
  });

  it('prunes stale entries', () => {
    let state = emptyPresence();
    state = presenceReducer(state, { type: 'ping', userId: 'old', name: 'Old', status: 'viewing', at: 50 });
    state = presenceReducer(state, { type: 'ping', userId: 'fresh', name: 'Fresh', status: 'viewing', at: 200 });

    state = presenceReducer(state, { type: 'prune', before: 100 });

    expect(state.entries.old).toBeUndefined();
    expect(state.entries.fresh).toBeDefined();
  });
});

describe('listPresenceEntries', () => {
  it('orders by status (typing first) then lastSeenAt (most-recent first)', () => {
    let state = emptyPresence();

    const now = 1_000_000;

    state = presenceReducer(state, { type: 'ping', userId: 'a', name: 'Alice', status: 'viewing', at: now - 1000 });
    state = presenceReducer(state, { type: 'ping', userId: 'b', name: 'Bob', status: 'typing', at: now - 500 });
    state = presenceReducer(state, { type: 'ping', userId: 'c', name: 'Carol', status: 'idle', at: now - 100 });
    state = presenceReducer(state, { type: 'ping', userId: 'd', name: 'Dee', status: 'viewing', at: now - 10 });

    const ordered = listPresenceEntries(state, { now }).map((entry) => entry.userId);
    expect(ordered).toEqual(['b', 'd', 'a', 'c']);
  });

  it('drops entries older than the staleness horizon', () => {
    let state = emptyPresence();

    const now = 1_000_000;

    state = presenceReducer(state, {
      type: 'ping',
      userId: 'stale',
      name: 'S',
      status: 'viewing',
      at: now - PRESENCE_STALE_AFTER_MS - 1,
    });
    state = presenceReducer(state, { type: 'ping', userId: 'fresh', name: 'F', status: 'viewing', at: now - 1000 });

    const ordered = listPresenceEntries(state, { now }).map((entry) => entry.userId);
    expect(ordered).toEqual(['fresh']);
  });
});
