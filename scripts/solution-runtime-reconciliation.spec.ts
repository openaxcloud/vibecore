import { describe, expect, it } from 'vitest';

import {
  observeRuntimeWriteFence,
  reconcileRuntimeFileSnapshot,
  shouldCompleteTrackedIdeRequest,
  shouldReloadAfterPostChatRuntimeChurn,
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
  const postChatChurn = (overrides: Partial<Parameters<typeof shouldReloadAfterPostChatRuntimeChurn>[0]> = {}) => ({
    chatInflight: 0,
    chatRequestCount: 1,
    lastChatActivityAtMs: 10_000,
    lastRuntimeActivityAtMs: 70_000,
    maximumRuntimeSilenceMs: 5_000,
    minimumPostChatChurnMs: 60_000,
    observedAtMs: 70_000,
    reloadCount: 0,
    runtimeMutationCount: 710,
    ...overrides,
  });

  it('requests one reload only for recent runtime churn at least 60s after a completed chat', () => {
    expect(shouldReloadAfterPostChatRuntimeChurn(postChatChurn())).toBe(true);
  });

  it('completes a runtime 204 response without waiting for requestfinished', () => {
    expect(shouldCompleteTrackedIdeRequest('runtime', 'response')).toBe(true);
  });

  it('keeps a streaming chat in flight after its initial HTTP response', () => {
    expect(shouldCompleteTrackedIdeRequest('chat', 'response')).toBe(false);
    expect(shouldCompleteTrackedIdeRequest('chat', 'requestfinished')).toBe(true);
    expect(shouldCompleteTrackedIdeRequest('chat', 'requestfailed')).toBe(true);
  });

  it.each([
    ['chat still in flight', { chatInflight: 1 }],
    ['no observed chat request', { chatRequestCount: 0 }],
    ['less than 60s after chat completion', { observedAtMs: 69_999, lastRuntimeActivityAtMs: 69_999 }],
    ['reload allowance already used', { reloadCount: 1 }],
    ['runtime activity is no longer continuing', { lastRuntimeActivityAtMs: 64_999 }],
  ])('does not reload when %s', (_label, overrides) => {
    expect(shouldReloadAfterPostChatRuntimeChurn(postChatChurn(overrides))).toBe(false);
  });

  it('does not accept a 30.205s runtime-write pause while the chat stream is still in flight', () => {
    const paused = observeRuntimeWriteFence({
      chatInflight: 1,
      lastChatActivityAtMs: 0,
      lastRuntimeActivityAtMs: 0,
      minimumQuietForMs: 30_000,
      observedAtMs: 30_205,
      runtimeMutationInflight: 0,
      waitStartedAtMs: 0,
    });

    expect(paused).toEqual({ quietForMs: 30_205, ready: false });

    const chatFinishedAtMs = 40_000;

    const afterChatQuiet = observeRuntimeWriteFence({
      chatInflight: 0,
      lastChatActivityAtMs: chatFinishedAtMs,
      lastRuntimeActivityAtMs: 0,
      minimumQuietForMs: 30_000,
      observedAtMs: chatFinishedAtMs + 30_000,
      runtimeMutationInflight: 0,
      waitStartedAtMs: 0,
    });

    expect(afterChatQuiet).toEqual({ quietForMs: 30_000, ready: true });
  });

  it('resets the quiet window after the last runtime mutation completes', () => {
    expect(
      observeRuntimeWriteFence({
        chatInflight: 0,
        lastChatActivityAtMs: 10_000,
        lastRuntimeActivityAtMs: 35_000,
        minimumQuietForMs: 12_000,
        observedAtMs: 46_999,
        runtimeMutationInflight: 0,
        waitStartedAtMs: 20_000,
      }),
    ).toEqual({ quietForMs: 11_999, ready: false });
  });

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
