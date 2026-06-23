import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  batchFileApplied,
  flushPendingToastBatch,
  resetToastBatcher,
  runUndos,
  type BatchedFileApplied,
} from './toast-batcher';

const emit = vi.fn<(entries: BatchedFileApplied[]) => void>();

beforeEach(() => {
  vi.useFakeTimers();
  emit.mockReset();
  resetToastBatcher(emit);
});

afterEach(() => {
  vi.useRealTimers();
  resetToastBatcher();
});

describe('toast-batcher', () => {
  it('emits one coalesced batch after the throttle window', () => {
    batchFileApplied({ filePath: 'src/a.ts' });
    batchFileApplied({ filePath: 'src/b.ts' });
    batchFileApplied({ filePath: 'src/c.ts' });

    expect(emit).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].map((entry) => entry.filePath)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('dedupes by filePath so a re-applied file only appears once per batch', () => {
    const firstUndo = vi.fn();
    const secondUndo = vi.fn();

    batchFileApplied({ filePath: 'src/a.ts', undo: firstUndo });
    batchFileApplied({ filePath: 'src/a.ts', undo: secondUndo });

    vi.runAllTimers();

    const batch = emit.mock.calls[0][0];
    expect(batch).toHaveLength(1);
    expect(batch[0].filePath).toBe('src/a.ts');

    batch[0].undo?.();

    expect(firstUndo).not.toHaveBeenCalled();
    expect(secondUndo).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh batch after the previous one flushed', () => {
    batchFileApplied({ filePath: 'src/a.ts' });
    vi.runAllTimers();

    expect(emit).toHaveBeenCalledTimes(1);

    batchFileApplied({ filePath: 'src/b.ts' });
    vi.runAllTimers();

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1][0]).toHaveLength(1);
    expect(emit.mock.calls[1][0][0].filePath).toBe('src/b.ts');
  });

  it('flushPendingToastBatch emits immediately without waiting for the timer', () => {
    batchFileApplied({ filePath: 'src/a.ts' });
    batchFileApplied({ filePath: 'src/b.ts' });

    flushPendingToastBatch();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toHaveLength(2);

    vi.runAllTimers();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('flushPendingToastBatch on an empty buffer is a no-op', () => {
    flushPendingToastBatch();
    expect(emit).not.toHaveBeenCalled();
  });

  it('resetToastBatcher discards any pending entries', () => {
    batchFileApplied({ filePath: 'src/a.ts' });

    resetToastBatcher(emit);

    vi.runAllTimers();

    expect(emit).not.toHaveBeenCalled();
  });

  it('captures undo callbacks the consumer wires into the emit payload', () => {
    const undoA = vi.fn();
    const undoB = vi.fn();

    batchFileApplied({ filePath: 'src/a.ts', undo: undoA });
    batchFileApplied({ filePath: 'src/b.ts', undo: undoB });

    vi.runAllTimers();

    const batch = emit.mock.calls[0][0];
    batch.forEach((entry) => entry.undo?.());

    expect(undoA).toHaveBeenCalledTimes(1);
    expect(undoB).toHaveBeenCalledTimes(1);
  });
});

describe('runUndos', () => {
  it('runs every undo and reports zero failures when all succeed', async () => {
    const a = vi.fn(() => undefined);
    const b = vi.fn(async () => {});

    const failures = await runUndos([a, b]);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(failures).toBe(0);
  });

  it('counts rejected async reverts without short-circuiting the rest', async () => {
    const ok = vi.fn(async () => {});

    const rejects = vi.fn(async () => {
      throw new Error('Remote file changed');
    });

    const alsoOk = vi.fn(async () => {});

    const failures = await runUndos([ok, rejects, alsoOk]);

    expect(ok).toHaveBeenCalledTimes(1);
    expect(rejects).toHaveBeenCalledTimes(1);
    expect(alsoOk).toHaveBeenCalledTimes(1);
    expect(failures).toBe(1);
  });

  it('counts a synchronous throw as a failure', async () => {
    const throws = vi.fn(() => {
      throw new Error('locked');
    });

    const failures = await runUndos([throws]);

    expect(failures).toBe(1);
  });

  it('does not reject overall even when every undo fails', async () => {
    const failures = await runUndos([
      async () => {
        throw new Error('a');
      },
      async () => {
        throw new Error('b');
      },
    ]);

    expect(failures).toBe(2);
  });
});
