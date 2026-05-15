/**
 * Reviewable diff helpers for a single `FileActionBlock`.
 *
 * Sprint 2 — the agent panel renders an inline diff card under every
 * `<boltAction type="file">` block. To produce one we need:
 *   1. The original content from the workbench file store (or empty for
 *      a brand-new file).
 *   2. The proposed content from the block (which may still be streaming).
 *   3. Hunks + an at-a-glance "+N / -M" summary derived from those two.
 *
 * The pure helper `computeFileActionDiff(...)` is what the hook delegates
 * to; it's unit-tested separately so we don't need a DOM-aware test
 * environment for the React shim.
 */

import { useStore } from '@nanostores/react';
import { useMemo } from 'react';

import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';
import type { FileActionBlock } from '~/types/message-blocks';
import { WORK_DIR } from '~/utils/constants';
import {
  buildReviewableDiffHunks,
  summarizeReviewableDiffHunks,
  type ReviewableDiffHunk,
  type ReviewableDiffSummary,
} from '~/utils/diff';

export interface FileActionDiff {
  /**
   * Absolute path the diff is keyed on, normalised against WORK_DIR. The
   * caller can pass either a relative `src/App.tsx` or an absolute
   * `/home/project/src/App.tsx` — both reduce to the same key.
   */
  absolutePath: string;

  /** Source path as it appeared in the block, kept for display. */
  filePath: string;

  /** The pre-action content read from the workbench store, or '' if new. */
  originalContent: string;

  /** The proposed content streamed from the assistant action block. */
  proposedContent: string;

  /** True when no matching file exists in the workbench store yet. */
  isNewFile: boolean;

  /** Reviewable hunks suitable for per-hunk accept/reject. */
  hunks: ReviewableDiffHunk[];

  /** At-a-glance stats for the inline "+N / -M" pill. */
  summary: ReviewableDiffSummary;
}

function toAbsolutePath(filePath: string): string {
  if (filePath.startsWith('/')) {
    return filePath;
  }

  return `${WORK_DIR}/${filePath.replace(/^\.?\//, '')}`;
}

function readFileContent(files: FileMap, absolutePath: string): string | undefined {
  const dirent = files[absolutePath];

  if (!dirent || dirent.type !== 'file') {
    return undefined;
  }

  return dirent.content;
}

/**
 * Pure computation: given the workbench file map + a file action block,
 * produce the reviewable diff structure the renderer needs. Returns
 * stable empty hunks/summary when proposed === original.
 */
export function computeFileActionDiff(files: FileMap, action: FileActionBlock): FileActionDiff {
  const absolutePath = toAbsolutePath(action.filePath);
  const stored = readFileContent(files, absolutePath);
  const originalContent = stored ?? '';
  const proposedContent = action.content;
  const hunks = buildReviewableDiffHunks(absolutePath, originalContent, proposedContent);

  return {
    absolutePath,
    filePath: action.filePath,
    originalContent,
    proposedContent,
    isNewFile: stored === undefined,
    hunks,
    summary: summarizeReviewableDiffHunks(hunks),
  };
}

/**
 * React hook: subscribes to the workbench file map and recomputes the diff
 * whenever the original or proposed content actually changes. Memoised on
 * `(originalContent, proposedContent, filePath)` — re-renders triggered by
 * other files don't recompute.
 */
export function useFileActionDiff(action: FileActionBlock): FileActionDiff {
  const files = useStore(workbenchStore.files) as FileMap;
  const absolutePath = toAbsolutePath(action.filePath);
  const storedContent = readFileContent(files, absolutePath);

  /*
   * Pin recomputation to the slots the diff actually reads — the file's
   * stored content, the proposed content, and the action identity. A
   * write to an unrelated file mutates `files` but leaves those deps
   * untouched, so we don't rebuild hunks for every keystroke elsewhere.
   */
  return useMemo<FileActionDiff>(() => {
    const originalContent = storedContent ?? '';
    const proposedContent = action.content;
    const hunks = buildReviewableDiffHunks(absolutePath, originalContent, proposedContent);

    return {
      absolutePath,
      filePath: action.filePath,
      originalContent,
      proposedContent,
      isNewFile: storedContent === undefined,
      hunks,
      summary: summarizeReviewableDiffHunks(hunks),
    };
  }, [storedContent, action.content, action.filePath, absolutePath]);
}
