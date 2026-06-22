import { diffLines, type Change } from 'diff';
import type { FileHistory } from '~/types/actions';

export interface FileDiffStats {
  additions: number;
  deletions: number;
}

/**
 * Compute the added/removed line counts for a file's pending modifications,
 * used to render the +N/-N change badges next to a file in the explorer.
 *
 * jsdiff line chunks end with a trailing newline, so a naive split('\n')
 * yields a spurious empty final segment that inflates the count by one.
 * Prefer the library-provided line count, and fall back to a
 * trailing-newline-stripped split. This mirrors the corrected logic in
 * Workbench.client.tsx and DiffView.tsx.
 */
export function computeFileDiffStats(fileModifications: FileHistory | undefined): FileDiffStats {
  if (!fileModifications?.originalContent) {
    return { additions: 0, deletions: 0 };
  }

  const normalizedOriginal = fileModifications.originalContent.replace(/\r\n/g, '\n');

  const normalizedCurrent =
    fileModifications.versions[fileModifications.versions.length - 1]?.content?.replace(/\r\n/g, '\n') || '';

  if (normalizedOriginal === normalizedCurrent) {
    return { additions: 0, deletions: 0 };
  }

  const changes = diffLines(normalizedOriginal, normalizedCurrent, {
    newlineIsToken: false,
    ignoreWhitespace: true,
    ignoreCase: false,
  });

  return changes.reduce(
    (acc: FileDiffStats, change: Change) => {
      const lineCount = change.count ?? change.value.replace(/\n$/, '').split('\n').length;

      if (change.added) {
        acc.additions += lineCount;
      }

      if (change.removed) {
        acc.deletions += lineCount;
      }

      return acc;
    },
    { additions: 0, deletions: 0 },
  );
}
