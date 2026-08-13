export type RuntimeFileSnapshot<TFile> = {
  /** Hash of the persisted project-file entries only (never chat/UI metadata). */
  revision: string;

  /** Immutable copy of the exact bytes that may be written to the runtime. */
  files: readonly TFile[];
};

export type RuntimeSnapshotObservation = {
  status: string;
  mismatches: readonly string[];
};

export type RuntimeWriteQuiescenceDiagnostic = {
  chatInflight: number;
  chatRequestCount: number;
  lastRuntimeRequest?: RuntimeRequestCompletionDiagnostic;
  quietForMs: number;
  runtimeMutationCount: number;
  runtimeMutationInflight: number;
};

export type TrackedIdeRequestKind = 'chat' | 'runtime';
export type TrackedIdeRequestEndSource = 'requestfailed' | 'requestfinished' | 'response';

export type RuntimeRequestCompletionDiagnostic = {
  durationMs: number;
  endedAtMs: number;
  endSource: TrackedIdeRequestEndSource;
  filePath?: string;
  method: string;
  pathname: string;
  status?: number;
};

export type RuntimeWriteFenceObservation = {
  chatInflight: number;
  lastChatActivityAtMs: number;
  lastRuntimeActivityAtMs: number;
  minimumQuietForMs: number;
  observedAtMs: number;
  runtimeMutationInflight: number;
  waitStartedAtMs: number;
};

export type RuntimePostChatChurnObservation = {
  chatInflight: number;
  chatRequestCount: number;
  lastChatActivityAtMs: number;
  lastRuntimeActivityAtMs: number;
  maximumRuntimeSilenceMs: number;
  minimumPostChatChurnMs: number;
  observedAtMs: number;
  reloadCount: number;
  runtimeMutationCount: number;
};

/** Pure clock/fence decision used by the Playwright request tracker. */
export function observeRuntimeWriteFence(input: RuntimeWriteFenceObservation) {
  const quietSinceMs = Math.max(input.waitStartedAtMs, input.lastChatActivityAtMs, input.lastRuntimeActivityAtMs);
  const quietForMs = Math.max(0, input.observedAtMs - quietSinceMs);

  return {
    quietForMs,
    ready: input.chatInflight === 0 && input.runtimeMutationInflight === 0 && quietForMs >= input.minimumQuietForMs,
  };
}

/**
 * Detect a runaway client-side runtime writer after the real Agent stream has
 * ended. This is deliberately narrower than the normal quiescence fence: it
 * requires a completed chat request, recent runtime activity for at least the
 * configured post-chat window, and an unused single reload allowance.
 */
export function shouldReloadAfterPostChatRuntimeChurn(input: RuntimePostChatChurnObservation) {
  const postChatForMs = input.observedAtMs - input.lastChatActivityAtMs;
  const runtimeSilentForMs = input.observedAtMs - input.lastRuntimeActivityAtMs;

  return (
    input.reloadCount === 0 &&
    input.chatRequestCount > 0 &&
    input.chatInflight === 0 &&
    input.runtimeMutationCount > 0 &&
    input.lastRuntimeActivityAtMs >= input.lastChatActivityAtMs &&
    postChatForMs >= input.minimumPostChatChurnMs &&
    runtimeSilentForMs >= 0 &&
    runtimeSilentForMs <= input.maximumRuntimeSilenceMs
  );
}

/** Runtime mutations finish once HTTP response headers arrive; chat remains a streamed body. */
export function shouldCompleteTrackedIdeRequest(kind: TrackedIdeRequestKind, endSource: TrackedIdeRequestEndSource) {
  return kind === 'runtime' || endSource !== 'response';
}

export type RuntimeReconciliationOperations<TFile> = {
  now: () => number;
  sleep: (durationMs: number) => Promise<void>;
  readSnapshot: () => Promise<RuntimeFileSnapshot<TFile>>;
  readStatus: () => Promise<string>;
  observeRuntime: (snapshot: RuntimeFileSnapshot<TFile>) => Promise<RuntimeSnapshotObservation>;
  restart: () => Promise<string>;
  waitForWriteQuiescence: (quietForMs: number, deadlineMs: number) => Promise<RuntimeWriteQuiescenceDiagnostic>;
  writeSnapshot: (snapshot: RuntimeFileSnapshot<TFile>) => Promise<void>;
  onEvent?: (event: RuntimeReconciliationEvent) => void;
};

export type RuntimeReconciliationOptions = {
  budgetMs: number;
  maxWriteCycles: number;
  minimumWriteQuiescenceMs: number;
  minimumMatchingReads: number;
  minimumStableForMs: number;
  pollIntervalMs: number;
  preRestartGraceMs: number;
};

export type RuntimeReconciliationEvent =
  | { type: 'persisted-revision-changed'; from: string; to: string }
  | { type: 'restart-requested'; revision: string }
  | { type: 'restart-running'; revision: string }
  | ({ type: 'runtime-write-quiescent' } & RuntimeWriteQuiescenceDiagnostic)
  | { type: 'snapshot-write'; cycle: number; revision: string }
  | { type: 'runtime-mismatch'; mismatches: readonly string[]; revision: string }
  | { type: 'runtime-stable'; matchingReads: number; revision: string; stableForMs: number };

export type RuntimeReconciliationResult<TFile> = {
  matchingReads: number;
  restartCount: 0 | 1;
  snapshot: RuntimeFileSnapshot<TFile>;
  stableForMs: number;
  writeCycles: number;
};

type StabilityResult<TFile> =
  | {
      kind: 'stable';
      matchingReads: number;
      snapshot: RuntimeFileSnapshot<TFile>;
      stableForMs: number;
    }
  | {
      kind: 'not-stable';
      lastMismatches: readonly string[];
      snapshot: RuntimeFileSnapshot<TFile>;
      status: string;
    };

function positiveInteger(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a positive integer`);
  }

  return value;
}

function validateOptions(options: RuntimeReconciliationOptions) {
  positiveInteger(options.budgetMs, 'budgetMs');
  positiveInteger(options.maxWriteCycles, 'maxWriteCycles');
  positiveInteger(options.minimumWriteQuiescenceMs, 'minimumWriteQuiescenceMs');
  positiveInteger(options.minimumMatchingReads, 'minimumMatchingReads');
  positiveInteger(options.minimumStableForMs, 'minimumStableForMs');
  positiveInteger(options.pollIntervalMs, 'pollIntervalMs');

  if (!Number.isFinite(options.preRestartGraceMs) || options.preRestartGraceMs < 0) {
    throw new Error('preRestartGraceMs must be a non-negative number');
  }
}

function ensureBudget(now: () => number, deadlineMs: number, stage: string) {
  if (now() >= deadlineMs) {
    throw new Error(`Runtime reconciliation exceeded its explicit budget during ${stage}`);
  }
}

async function boundedSleep(
  operations: Pick<RuntimeReconciliationOperations<unknown>, 'now' | 'sleep'>,
  deadlineMs: number,
  durationMs: number,
) {
  const remainingMs = deadlineMs - operations.now();

  if (remainingMs <= 0) {
    return;
  }

  await operations.sleep(Math.min(durationMs, remainingMs));
}

async function waitUntilRunning<TFile>(
  operations: RuntimeReconciliationOperations<TFile>,
  deadlineMs: number,
  initialStatus?: string,
) {
  let status = initialStatus?.toLocaleLowerCase() ?? 'unknown';

  while (status !== 'running') {
    ensureBudget(operations.now, deadlineMs, 'restart readiness');
    await boundedSleep(operations, deadlineMs, 1_000);
    ensureBudget(operations.now, deadlineMs, 'restart readiness');
    status = (await operations.readStatus()).toLocaleLowerCase();

    if (status === 'failed' || status === 'error' || status === 'stopped') {
      throw new Error(`Runtime restart reached terminal status ${status}`);
    }
  }
}

/**
 * Require the SAME project-file revision to match the pinned runtime repeatedly
 * over a real time window. A single matching read is not evidence that a late
 * replacement pod/reseed will not overwrite the just-written bytes.
 */
async function observeStableSnapshot<TFile>(
  operations: RuntimeReconciliationOperations<TFile>,
  initialSnapshot: RuntimeFileSnapshot<TFile>,
  options: RuntimeReconciliationOptions,
  deadlineMs: number,
  phaseDeadlineMs: number,
  failFastOnMismatch: boolean,
): Promise<StabilityResult<TFile>> {
  let snapshot = initialSnapshot;
  let matchingReads = 0;
  let matchingSinceMs: number | undefined;
  let lastMismatches: readonly string[] = [];
  let lastStatus = 'unknown';

  while (operations.now() < deadlineMs && operations.now() < phaseDeadlineMs) {
    ensureBudget(operations.now, deadlineMs, 'stable runtime observation');

    const currentSnapshot = await operations.readSnapshot();

    if (currentSnapshot.revision !== snapshot.revision) {
      operations.onEvent?.({
        type: 'persisted-revision-changed',
        from: snapshot.revision,
        to: currentSnapshot.revision,
      });
      snapshot = currentSnapshot;
      matchingReads = 0;
      matchingSinceMs = undefined;
    }

    const observation = await operations.observeRuntime(snapshot);
    lastStatus = observation.status.toLocaleLowerCase();
    lastMismatches = observation.mismatches;

    if (lastStatus === 'running' && lastMismatches.length === 0) {
      const observedAtMs = operations.now();
      matchingSinceMs ??= observedAtMs;
      matchingReads += 1;

      const stableForMs = Math.max(0, observedAtMs - matchingSinceMs);

      if (matchingReads >= options.minimumMatchingReads && stableForMs >= options.minimumStableForMs) {
        operations.onEvent?.({
          type: 'runtime-stable',
          matchingReads,
          revision: snapshot.revision,
          stableForMs,
        });

        return { kind: 'stable', matchingReads, snapshot, stableForMs };
      }
    } else {
      matchingReads = 0;
      matchingSinceMs = undefined;

      if (lastMismatches.length > 0) {
        operations.onEvent?.({
          type: 'runtime-mismatch',
          mismatches: lastMismatches,
          revision: snapshot.revision,
        });
      }

      if (failFastOnMismatch) {
        return { kind: 'not-stable', lastMismatches, snapshot, status: lastStatus };
      }
    }

    await boundedSleep(operations, Math.min(deadlineMs, phaseDeadlineMs), options.pollIntervalMs);
  }

  return { kind: 'not-stable', lastMismatches, snapshot, status: lastStatus };
}

/**
 * Converge a pinned E-Code runtime to persisted project files without allowing
 * restart/write races:
 *
 * 1. Wait briefly for the normal runtime sync path.
 * 2. Restart at most once. A failed/unknown restart request is never swallowed.
 * 3. Once the replacement is RUNNING, only write immutable file snapshots.
 * 4. If persisted files change mid-write, adopt the new file revision and write
 *    that new snapshot in the next bounded cycle.
 * 5. Never restart after a write; require repeated matching reads over time.
 */
export async function reconcileRuntimeFileSnapshot<TFile>(
  operations: RuntimeReconciliationOperations<TFile>,
  options: RuntimeReconciliationOptions,
): Promise<RuntimeReconciliationResult<TFile>> {
  validateOptions(options);

  const startedAtMs = operations.now();
  const deadlineMs = startedAtMs + options.budgetMs;

  let snapshot = await operations.readSnapshot();

  const graceful = await observeStableSnapshot(
    operations,
    snapshot,
    options,
    deadlineMs,
    Math.min(deadlineMs, startedAtMs + options.preRestartGraceMs),
    false,
  );

  snapshot = graceful.snapshot;

  if (graceful.kind === 'stable') {
    return {
      matchingReads: graceful.matchingReads,
      restartCount: 0,
      snapshot: graceful.snapshot,
      stableForMs: graceful.stableForMs,
      writeCycles: 0,
    };
  }

  /*
   * The IDE Agent writes runtime files directly while streaming, independently
   * from persisted ide-state. Its composer can look idle before the final lane
   * closes, so fence those browser-originated writes before deciding whether a
   * restart/write is needed. The implementation requires a NEW uninterrupted
   * quiet window on every call; an old last-write timestamp is insufficient.
   */
  const initialQuiescence = await operations.waitForWriteQuiescence(options.minimumWriteQuiescenceMs, deadlineMs);
  operations.onEvent?.({ type: 'runtime-write-quiescent', ...initialQuiescence });

  snapshot = await operations.readSnapshot();

  const quietRuntime = await observeStableSnapshot(
    operations,
    snapshot,
    options,
    deadlineMs,
    Math.min(
      deadlineMs,
      operations.now() +
        Math.max(
          options.minimumStableForMs + options.pollIntervalMs,
          options.minimumMatchingReads * options.pollIntervalMs,
        ),
    ),
    true,
  );

  snapshot = quietRuntime.snapshot;

  if (quietRuntime.kind === 'stable') {
    return {
      matchingReads: quietRuntime.matchingReads,
      restartCount: 0,
      snapshot: quietRuntime.snapshot,
      stableForMs: quietRuntime.stableForMs,
      writeCycles: 0,
    };
  }

  ensureBudget(operations.now, deadlineMs, 'restart request');
  operations.onEvent?.({ type: 'restart-requested', revision: snapshot.revision });

  const restartStatus = await operations.restart();
  await waitUntilRunning(operations, deadlineMs, restartStatus);
  operations.onEvent?.({ type: 'restart-running', revision: snapshot.revision });

  let lastMismatches = graceful.lastMismatches;
  let lastStatus = graceful.status;

  for (let cycle = 1; cycle <= options.maxWriteCycles; cycle += 1) {
    ensureBudget(operations.now, deadlineMs, `authoritative write cycle ${cycle}`);

    const quiescence = await operations.waitForWriteQuiescence(options.minimumWriteQuiescenceMs, deadlineMs);
    operations.onEvent?.({ type: 'runtime-write-quiescent', ...quiescence });
    ensureBudget(operations.now, deadlineMs, `authoritative write cycle ${cycle}`);

    const currentSnapshot = await operations.readSnapshot();

    if (currentSnapshot.revision !== snapshot.revision) {
      operations.onEvent?.({
        type: 'persisted-revision-changed',
        from: snapshot.revision,
        to: currentSnapshot.revision,
      });
      snapshot = currentSnapshot;
    }

    operations.onEvent?.({ type: 'snapshot-write', cycle, revision: snapshot.revision });
    await operations.writeSnapshot(snapshot);

    const observed = await observeStableSnapshot(operations, snapshot, options, deadlineMs, deadlineMs, true);

    snapshot = observed.snapshot;

    if (observed.kind === 'stable') {
      return {
        matchingReads: observed.matchingReads,
        restartCount: 1,
        snapshot: observed.snapshot,
        stableForMs: observed.stableForMs,
        writeCycles: cycle,
      };
    }

    lastMismatches = observed.lastMismatches;
    lastStatus = observed.status;

    /*
     * A concurrent/late provision can temporarily move the pinned runtime back
     * to STARTING. Wait for that same workspace id to settle, then overwrite the
     * replacement in the next cycle. Crucially, this path never requests another
     * restart itself.
     */
    if (lastStatus !== 'running') {
      await waitUntilRunning(operations, deadlineMs, lastStatus);
    }
  }

  throw new Error(
    `Runtime files did not remain stable after ${options.maxWriteCycles} authoritative write cycles` +
      ` (status=${lastStatus}, revision=${snapshot.revision}, mismatches=${lastMismatches.join(', ') || 'unknown'})`,
  );
}

/** Read-only final gate used immediately before asset promotion. */
export async function verifyRuntimeFileSnapshotStable<TFile>(
  operations: RuntimeReconciliationOperations<TFile>,
  options: RuntimeReconciliationOptions,
): Promise<RuntimeReconciliationResult<TFile>> {
  validateOptions(options);

  const startedAtMs = operations.now();
  const deadlineMs = startedAtMs + options.budgetMs;

  const quiescence = await operations.waitForWriteQuiescence(options.minimumWriteQuiescenceMs, deadlineMs);
  operations.onEvent?.({ type: 'runtime-write-quiescent', ...quiescence });

  const snapshot = await operations.readSnapshot();
  const observed = await observeStableSnapshot(operations, snapshot, options, deadlineMs, deadlineMs, false);

  if (observed.kind !== 'stable') {
    throw new Error(
      `Runtime changed before asset promotion` +
        ` (status=${observed.status}, revision=${observed.snapshot.revision}, mismatches=${observed.lastMismatches.join(', ') || 'unknown'})`,
    );
  }

  return {
    matchingReads: observed.matchingReads,
    restartCount: 0,
    snapshot: observed.snapshot,
    stableForMs: observed.stableForMs,
    writeCycles: 0,
  };
}
