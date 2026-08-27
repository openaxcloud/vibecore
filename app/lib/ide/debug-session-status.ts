/**
 * Reconcile stored debug-session status against the workspace's live processes.
 *
 * `start-session` writes `status: 'running'` when it launches a config and
 * nothing ever writes it again except an explicit `stop-session`. So a launch
 * that exited a second later — normal for a script, and the usual outcome for a
 * crash — kept reporting "running" with a live Stop button forever (audit
 * cluster D, BUG-IDE-005). The runtime already reports the workspace's live
 * processes on every debugger load; comparing the recorded pid against that list
 * is enough to tell the user the truth.
 *
 * Fail-safe: when the process list is unavailable or unreadable (runtime asleep,
 * request errored) nothing is downgraded — an unknown process table must never
 * be mistaken for "the process is gone".
 */

export interface ReconcilableSession {
  status?: string;
  processId?: string;
  [key: string]: unknown;
}

/** Pull the pid out of whatever shape the runtime returned for a process row. */
function processPid(entry: unknown): string | undefined {
  if (entry == null) {
    return undefined;
  }

  if (typeof entry === 'number' || typeof entry === 'string') {
    return String(entry).trim() || undefined;
  }

  if (typeof entry !== 'object') {
    return undefined;
  }

  const row = entry as Record<string, unknown>;

  for (const key of ['pid', 'processId', 'id']) {
    const value = row[key];

    if (typeof value === 'number' || (typeof value === 'string' && value.trim())) {
      return String(value).trim();
    }
  }

  return undefined;
}

/**
 * @returns the set of live pids, or `null` when the runtime did not give a
 * usable list (in which case callers must leave statuses untouched).
 */
export function readLivePids(runtimeProcesses: unknown): Set<string> | null {
  const list = Array.isArray(runtimeProcesses)
    ? runtimeProcesses
    : Array.isArray((runtimeProcesses as { processes?: unknown })?.processes)
      ? ((runtimeProcesses as { processes: unknown[] }).processes as unknown[])
      : null;

  if (!list) {
    return null;
  }

  // An errored response can still carry `processes: []`; that is not evidence.
  if ((runtimeProcesses as { error?: unknown })?.error) {
    return null;
  }

  const pids = new Set<string>();

  for (const entry of list) {
    const pid = processPid(entry);

    if (pid) {
      pids.add(pid);
    }
  }

  return pids;
}

export function reconcileDebugSessions<T extends ReconcilableSession>(
  sessions: readonly T[],
  runtimeProcesses: unknown,
): T[] {
  const livePids = readLivePids(runtimeProcesses);

  if (!livePids) {
    return [...sessions];
  }

  return sessions.map((session) => {
    if (session.status !== 'running' || !session.processId) {
      return session;
    }

    if (livePids.has(String(session.processId))) {
      return session;
    }

    /*
     * `exited` (not `stopped`) so the panel can distinguish "the process ended
     * on its own" from "the user pressed Stop", which stop-session records.
     */
    return { ...session, status: 'exited' };
  });
}
