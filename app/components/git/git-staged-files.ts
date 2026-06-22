/*
 * Serialization helpers for the set of staged paths that the Git tab commit
 * form posts to the IDE git panel action.
 *
 * The action route parses the posted value with `stagedFiles.split(',')`
 * (see api.projects.$projectId.ide-panel.$panel.ts). Git paths legitimately
 * allow commas, so a staged file like `a,b.txt` would be mis-split into two
 * bogus paths (`a` and `b.txt`): the real file is never committed and
 * nonexistent paths are sent to the commit endpoint, yet the user still sees a
 * success toast.
 *
 * Until the wire format can carry comma-bearing paths losslessly, the safest
 * behaviour is to refuse the commit with an explicit message rather than
 * silently drop the change. These helpers keep that decision pure and testable.
 */

/** A path that, once comma-joined, cannot be recovered by a `split(',')` parser. */
export function pathBreaksCommaSerialization(path: string): boolean {
  return path.includes(',');
}

/** Staged paths that would be corrupted by the comma-joined wire format. */
export function findUnserializableStagedFiles(stagedFiles: readonly string[]): string[] {
  return stagedFiles.filter(pathBreaksCommaSerialization);
}

/**
 * Build the value posted as the `stagedFiles` form field. Returns the
 * comma-joined string the action route expects, plus the list of paths that
 * cannot be represented in that format so callers can block the commit.
 */
export function serializeStagedFiles(stagedFiles: readonly string[]): {
  value: string;
  unserializable: string[];
} {
  return {
    value: stagedFiles.join(','),
    unserializable: findUnserializableStagedFiles(stagedFiles),
  };
}
