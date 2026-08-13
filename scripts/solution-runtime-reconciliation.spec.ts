import { describe, expect, it } from 'vitest';

import {
  reconcileRuntimeFileSnapshot,
  verifyRuntimeFileSnapshotStable,
  type RuntimeFileSnapshot,
  type RuntimeReconciliationOperations,
  type RuntimeReconciliationOptions,
} from './solution-runtime-reconciliation.js';

type FakeFile = { path: string; content: string };

const snapshot = (revision: string): RuntimeFileSnapshot<FakeFile> => ({
  revision,
  files: [{ path: 'src/main.tsx', content: revision }],
});

const options: RuntimeReconciliationOptions = {
  budgetMs: 120_000,
  maxWriteCycles: 3,
  minimumWriteQuiescenceMs: 5_000,
  minimumMatchingReads: 4,
  minimumStableForMs: 12_000,
  pollIntervalMs: 4_000,
  preRestartGraceMs: 0,
};

const quiescenceDiagnostic = (quietForMs: number) => ({
  chatInflight: 0,
  chatRequestCount: 1,
  quietForMs,
  runtimeMutationCount: 8,
  runtimeMutationInflight: 0,
});

describe('runtime file reconciliation', () => {
  it('adopts a late persisted-file revision and writes that immutable snapshot in the next cycle', async () => {
    let nowMs = 0;
    let persisted = snapshot('revision-a');
    let runtimeRevision = 'stale-runtime';

    const actions: string[] = [];
    const writes: string[] = [];

    let restartCount = 0;

    const operations: RuntimeReconciliationOperations<FakeFile> = {
      now: () => nowMs,
      sleep: async (durationMs) => {
        nowMs += durationMs;
      },
      readSnapshot: async () => persisted,
      readStatus: async () => 'running',
      observeRuntime: async (current) => ({
        status: 'running',
        mismatches: runtimeRevision === current.revision ? [] : ['src/main.tsx'],
      }),
      restart: async () => {
        restartCount += 1;
        actions.push('restart');
        runtimeRevision = 'restart-seed';

        return 'running';
      },
      waitForWriteQuiescence: async (quietForMs) => {
        nowMs += quietForMs;

        return quiescenceDiagnostic(quietForMs);
      },
      writeSnapshot: async (current) => {
        actions.push(`write:${current.revision}`);
        writes.push(current.revision);
        runtimeRevision = current.revision;

        // A final agent lane persists newer files after the first PUT completed.
        if (writes.length === 1) {
          persisted = snapshot('revision-b');
        }
      },
    };

    const result = await reconcileRuntimeFileSnapshot(operations, options);

    expect(restartCount).toBe(1);
    expect(writes).toEqual(['revision-a', 'revision-b']);
    expect(result.snapshot.revision).toBe('revision-b');
    expect(result.writeCycles).toBe(2);
    expect(result.matchingReads).toBe(4);
    expect(result.stableForMs).toBe(12_000);

    // The only restart happens before every authoritative write; never after.
    expect(actions).toEqual(['restart', 'write:revision-a', 'write:revision-b']);
  });

  it('repairs a late runtime reseed with a final write and never issues a second restart', async () => {
    let nowMs = 0;

    const persisted = snapshot('revision-a');

    let runtimeRevision = 'stale-runtime';
    let observationsSinceWrite = 0;

    const actions: string[] = [];

    let restartCount = 0;
    let writeCount = 0;

    const operations: RuntimeReconciliationOperations<FakeFile> = {
      now: () => nowMs,
      sleep: async (durationMs) => {
        nowMs += durationMs;

        // Replacement/reseed lands after the first post-write read looked good.
        if (writeCount === 1 && observationsSinceWrite === 1) {
          runtimeRevision = 'late-reseed';
        }
      },
      readSnapshot: async () => persisted,
      readStatus: async () => 'running',
      observeRuntime: async (current) => {
        observationsSinceWrite += 1;
        return {
          status: 'running',
          mismatches: runtimeRevision === current.revision ? [] : ['src/main.tsx'],
        };
      },
      restart: async () => {
        restartCount += 1;
        actions.push('restart');

        return 'running';
      },
      waitForWriteQuiescence: async (quietForMs) => {
        actions.push('quiet');
        nowMs += quietForMs;

        return quiescenceDiagnostic(quietForMs);
      },
      writeSnapshot: async (current) => {
        writeCount += 1;
        observationsSinceWrite = 0;
        runtimeRevision = current.revision;
        actions.push(`write-${writeCount}`);
      },
    };

    const result = await reconcileRuntimeFileSnapshot(operations, options);

    expect(restartCount).toBe(1);
    expect(writeCount).toBe(2);
    expect(result.writeCycles).toBe(2);
    expect(result.snapshot.revision).toBe('revision-a');
    expect(actions).toEqual(['quiet', 'restart', 'quiet', 'write-1', 'quiet', 'write-2']);
    expect(actions.at(-1)).toBe('write-2');
  });

  it('keeps the pre-promotion stability gate strictly read-only', async () => {
    let nowMs = 0;

    const persisted = snapshot('revision-a');

    let observations = 0;

    const operations: RuntimeReconciliationOperations<FakeFile> = {
      now: () => nowMs,
      sleep: async (durationMs) => {
        nowMs += durationMs;
      },
      readSnapshot: async () => persisted,
      readStatus: async () => 'running',
      observeRuntime: async () => {
        observations += 1;
        return { status: 'running', mismatches: [] };
      },
      restart: async () => {
        throw new Error('pre-promotion verification must never restart');
      },
      waitForWriteQuiescence: async (quietForMs) => {
        nowMs += quietForMs;

        return quiescenceDiagnostic(quietForMs);
      },
      writeSnapshot: async () => {
        throw new Error('pre-promotion verification must never write');
      },
    };

    const result = await verifyRuntimeFileSnapshotStable(operations, options);

    expect(observations).toBe(4);
    expect(result.restartCount).toBe(0);
    expect(result.writeCycles).toBe(0);
    expect(result.snapshot.revision).toBe('revision-a');
  });
});
