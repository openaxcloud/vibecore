import { atom } from 'nanostores';
import { buildReviewableDiffHunks, summarizeReviewableDiffHunks } from '~/utils/diff';

/**
 * A human save that lost the optimistic-concurrency race: the file on disk
 * changed after the editor loaded it. Holds every version the UI needs to offer
 * a real choice, so the unsaved buffer is never thrown away (BUG-IDE-004).
 */
export interface FileSaveConflict {
  filePath: string;

  /** On disk now — what "Reload" adopts. */
  remoteContent: string;

  /** The unsaved editor buffer — what "Overwrite" writes. */
  localContent: string;

  /** What the editor originally loaded, for a 3-way reading of the change. */
  baselineContent: string;

  detectedAt: number;
}

/**
 * The conflict currently awaiting a decision, or null. One at a time: the
 * dialog is modal, and resolving it re-runs the save that raised it.
 */
export const fileSaveConflictStore = atom<FileSaveConflict | null>(null);

export function openFileSaveConflict(conflict: FileSaveConflict) {
  fileSaveConflictStore.set(conflict);
}

/**
 * Clear the pending conflict. Pass a path to clear it only if that file is the
 * one showing — so a late resolution for an already-replaced conflict cannot
 * dismiss a newer one.
 */
export function clearFileSaveConflict(filePath?: string) {
  const current = fileSaveConflictStore.get();

  if (!current) {
    return;
  }

  if (filePath === undefined || current.filePath === filePath) {
    fileSaveConflictStore.set(null);
  }
}

export interface FileSaveConflictSummary {
  fileName: string;

  /** Lines the user would gain/lose by choosing "Overwrite" over "Reload". */
  additions: number;
  deletions: number;

  /**
   * True when the two sides are byte-identical. The guard compares against the
   * baseline, so a remote write that happens to land on exactly the user's text
   * still raises a conflict — there is nothing to decide, and the caller can
   * resolve it silently instead of showing a dialog with an empty diff.
   */
  identical: boolean;
}

export function describeFileSaveConflict(conflict: FileSaveConflict): FileSaveConflictSummary {
  const fileName = conflict.filePath.split('/').filter(Boolean).pop() ?? conflict.filePath;

  if (conflict.remoteContent === conflict.localContent) {
    return { fileName, additions: 0, deletions: 0, identical: true };
  }

  const hunks = buildReviewableDiffHunks(conflict.filePath, conflict.remoteContent, conflict.localContent);
  const summary = summarizeReviewableDiffHunks(hunks);

  return {
    fileName,
    additions: summary.addedLines,
    deletions: summary.removedLines,
    identical: false,
  };
}

/** Hunks describing remote → local, i.e. what "Overwrite" would change on disk. */
export function fileSaveConflictHunks(conflict: FileSaveConflict) {
  return buildReviewableDiffHunks(conflict.filePath, conflict.remoteContent, conflict.localContent);
}
