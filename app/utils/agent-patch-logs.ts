/**
 * Pure helpers that decide which workspace-log lines belong to a given
 * AI patch lifecycle event for a relative file path. The workbench store
 * uses these to retract stale "AI patch failed" / "AI patch blocked"
 * entries once the same path lands successfully on a later attempt, so
 * the Problems panel (which derives its entries from workspace logs)
 * doesn't keep showing a failure that was resolved on the next tick.
 *
 * Extracted from the workbench so the predicate stays testable in
 * isolation — the store class itself is hard to instantiate in tests.
 */

/**
 * Build the log-line prefix the workbench emits when a patch is blocked
 * by pre-write validation. The format is locked in:
 *   `AI patch blocked: <relativePath>: <validator message>`
 * Callers compare with `startsWith` so the trailing colon is what stops
 * partial-path collisions ("src/Foo" vs "src/Foo.ts").
 */
export function blockedPatchLogPrefix(relativePath: string): string {
  return `AI patch blocked: ${relativePath}:`;
}

/**
 * Build the log-line prefix for the post-write failure path:
 *   `AI patch failed: <relativePath>: <error message>`
 */
export function failedPatchLogPrefix(relativePath: string): string {
  return `AI patch failed: ${relativePath}:`;
}

/**
 * True when a workspace-log line is a stale failure entry for the given
 * relative path. Used by the workbench to drop the line once the same
 * path is accepted (transient race resolved) or explicitly rejected.
 */
export function isFailedPatchLogForPath(line: string, relativePath: string): boolean {
  if (!relativePath) {
    return false;
  }

  return line.startsWith(failedPatchLogPrefix(relativePath)) || line.startsWith(blockedPatchLogPrefix(relativePath));
}

/**
 * Return `lines` with every stale failure entry for `relativePath`
 * removed. Returns the input array reference unchanged when nothing
 * matches, so callers can skip a state update on the no-op case.
 */
export function dropFailedPatchLogsForPath(lines: readonly string[], relativePath: string): string[] | null {
  if (!relativePath) {
    return null;
  }

  let removed = 0;

  const next: string[] = [];

  for (const line of lines) {
    if (isFailedPatchLogForPath(line, relativePath)) {
      removed += 1;
      continue;
    }

    next.push(line);
  }

  return removed === 0 ? null : next;
}
