import { createHash } from 'node:crypto';

export type ProjectFileEntry = { path?: string; content?: string };

export type ProjectFileStabilityState = {
  /** Latest successfully observed persisted-file revision. */
  revision?: string;

  /** Elapsed time covered by uninterrupted, unchanged observations. */
  stableForMs: number;

  /** Number of successful reads after the first read of this revision. */
  unchangedReads: number;

  /** Wall-clock timestamp of the latest successful read. */
  lastObservedAtMs?: number;
};

export const EMPTY_PROJECT_FILE_STABILITY: ProjectFileStabilityState = {
  stableForMs: 0,
  unchangedReads: 0,
};

/**
 * Fold one persisted-file observation into a conservative stability window.
 *
 * Missing revisions, file changes, a regressing clock, or an unexpectedly long
 * observation gap reset the proof window. This is deliberately independent of
 * chat/agent completion annotations: `/api/chat` can persist those annotations
 * before the final multi-agent lane has finished writing files.
 */
export function observeProjectFileRevision(
  previous: Readonly<ProjectFileStabilityState>,
  revision: string | undefined,
  observedAtMs: number,
  maximumObservationGapMs: number,
): ProjectFileStabilityState {
  if (
    !revision ||
    !Number.isFinite(observedAtMs) ||
    !Number.isFinite(maximumObservationGapMs) ||
    maximumObservationGapMs <= 0
  ) {
    return { ...EMPTY_PROJECT_FILE_STABILITY };
  }

  const elapsedMs = previous.lastObservedAtMs === undefined ? undefined : observedAtMs - previous.lastObservedAtMs;

  const continuousObservation =
    previous.revision === revision && elapsedMs !== undefined && elapsedMs >= 0 && elapsedMs <= maximumObservationGapMs;

  if (!continuousObservation) {
    return {
      revision,
      stableForMs: 0,
      unchangedReads: 0,
      lastObservedAtMs: observedAtMs,
    };
  }

  return {
    revision,
    stableForMs: previous.stableForMs + elapsedMs,
    unchangedReads: previous.unchangedReads + 1,
    lastObservedAtMs: observedAtMs,
  };
}

/** Require both elapsed quiet time and repeated API observations. */
export function projectFilesAreStable(
  state: Readonly<ProjectFileStabilityState>,
  minimumStableForMs: number,
  minimumUnchangedReads: number,
) {
  return (
    Boolean(state.revision) && state.stableForMs >= minimumStableForMs && state.unchangedReads >= minimumUnchangedReads
  );
}

/** Normalize UI text before comparing a submitted prompt with its user bubble. */
export function normalizeCaptureProofText(value: string) {
  return value.replace(/\s+/gu, ' ').trim();
}

/** Hash only persisted project files, independent of chat/progress metadata. */
export function projectFilesRevisionFromEntries(entries: readonly ProjectFileEntry[]) {
  if (entries.length === 0) {
    return undefined;
  }

  const files = [...entries]
    .sort((left, right) => (left.path ?? '').localeCompare(right.path ?? ''))
    .map((file) => ({ path: file.path ?? '', content: file.content ?? '' }));

  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
