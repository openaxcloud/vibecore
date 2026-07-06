import { mergeJsonContent } from '~/lib/chat/merge-json-content';

/**
 * Resolve a concurrent-write conflict in the agent-patch pipeline: the file we
 * are about to write has already changed (a parallel multi-agent lane wrote the
 * same path) relative to the base our patch was computed against. Rather than
 * fail with "Remote file changed since it was loaded", reconcile our content
 * with the fresh version:
 *
 *  - JSON (package.json, …): UNION both lanes' edits via a tolerant deep-merge,
 *    so neither lane's dependencies / scripts are lost.
 *  - everything else (index.html, source files, …): keep OUR content — a single
 *    coherent document, last write wins (the lanes converge on one valid file;
 *    a byte-merge of two full HTML/TS files would just corrupt them).
 *
 * Pure + exported so the reconcile decision is unit-testable without the store.
 */
export function reconcileRemoteWrite(filePath: string, freshContent: string, ourContent: string): string {
  const basename = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? '';

  if (basename.endsWith('.json')) {
    const merged = mergeJsonContent(freshContent, ourContent);

    if (merged !== undefined) {
      return merged;
    }
  }

  return ourContent;
}
