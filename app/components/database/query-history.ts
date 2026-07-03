/**
 * MRU list of successfully executed SQL statements in the Database Studio,
 * persisted per-project per-browser. SSR-safe (returns [] on the server) and
 * storage-failure-safe (private mode), same pattern as
 * app/components/dashboard/recent-commands.ts.
 */
export const MAX_QUERY_HISTORY = 20;

export function queryHistoryStorageKey(projectId: string): string {
  return `ecode:db-history:${projectId}`;
}

export function readQueryHistory(projectId: string): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(queryHistoryStorageKey(projectId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, MAX_QUERY_HISTORY);
  } catch {
    return [];
  }
}

/** Pure MRU update, exported for tests: newest first, identical statements deduped to the front, capped. */
export function pushQueryHistoryEntry(existing: string[], statement: string): string[] {
  const trimmed = statement.trim();

  if (!trimmed) {
    return existing;
  }

  return [trimmed, ...existing.filter((value) => value !== trimmed)].slice(0, MAX_QUERY_HISTORY);
}

/** Pure removal of one statement, exported for tests. */
export function removeQueryHistoryEntry(existing: string[], statement: string): string[] {
  return existing.filter((value) => value !== statement);
}

function persistQueryHistory(projectId: string, entries: string[]): string[] {
  if (typeof window === 'undefined') {
    return entries;
  }

  try {
    window.localStorage.setItem(queryHistoryStorageKey(projectId), JSON.stringify(entries));
  } catch {
    // Storage blocked (private mode) — history just doesn't persist.
  }

  return entries;
}

/** Record a successfully executed statement; returns the new list for state updates. */
export function recordQueryHistory(projectId: string, statement: string): string[] {
  return persistQueryHistory(projectId, pushQueryHistoryEntry(readQueryHistory(projectId), statement));
}

/** Remove a single statement; returns the new list for state updates. */
export function removeQueryHistory(projectId: string, statement: string): string[] {
  return persistQueryHistory(projectId, removeQueryHistoryEntry(readQueryHistory(projectId), statement));
}

/** Clear the whole per-project history; returns the (empty) new list for state updates. */
export function clearQueryHistory(projectId: string): string[] {
  return persistQueryHistory(projectId, []);
}
