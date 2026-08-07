import { describe, expect, it } from 'vitest';
import { readLivePids, reconcileDebugSessions } from './debug-session-status';

const running = { id: 's1', status: 'running', processId: '4711' };

describe('reconcileDebugSessions', () => {
  it('keeps a session running while its pid is alive', () => {
    expect(reconcileDebugSessions([running], { processes: [{ pid: 4711, command: 'node' }] })).toEqual([running]);
  });

  it('marks a session exited once its pid is gone (audit cluster D, BUG-IDE-005)', () => {
    const [session] = reconcileDebugSessions([running], { processes: [{ pid: 22, command: 'vite' }] });

    expect(session.status).toBe('exited');
  });

  it('marks it exited when the workspace reports no processes at all', () => {
    expect(reconcileDebugSessions([running], { processes: [] })[0].status).toBe('exited');
  });

  it('leaves statuses untouched when the process list is unavailable', () => {
    for (const unusable of [undefined, null, {}, { error: 'runtime asleep', processes: [] }, 'nope']) {
      expect(reconcileDebugSessions([running], unusable)).toEqual([running]);
    }
  });

  it('never downgrades paused, stopped or failed sessions', () => {
    const others = [
      { id: 'a', status: 'paused', processId: '1' },
      { id: 'b', status: 'stopped', processId: '2' },
      { id: 'c', status: 'failed', processId: '3' },
    ];

    expect(reconcileDebugSessions(others, { processes: [] })).toEqual(others);
  });

  it('leaves a running session with no recorded pid alone — nothing to compare', () => {
    const pidless = { id: 'd', status: 'running' };

    expect(reconcileDebugSessions([pidless], { processes: [] })).toEqual([pidless]);
  });

  it('does not mutate the input sessions', () => {
    const input = [{ ...running }];
    reconcileDebugSessions(input, { processes: [] });

    expect(input[0].status).toBe('running');
  });
});

describe('readLivePids', () => {
  it('accepts a bare array as well as a { processes } envelope', () => {
    expect(readLivePids([{ pid: 7 }])).toEqual(new Set(['7']));
    expect(readLivePids({ processes: [{ pid: 7 }] })).toEqual(new Set(['7']));
  });

  it('reads pid, processId or id, and plain scalars', () => {
    expect(readLivePids([{ pid: 1 }, { processId: '2' }, { id: 3 }, 4, '5'])).toEqual(
      new Set(['1', '2', '3', '4', '5']),
    );
  });

  it('returns null when there is no usable list', () => {
    expect(readLivePids({ error: 'boom', processes: [] })).toBeNull();
    expect(readLivePids(undefined)).toBeNull();
  });
});
