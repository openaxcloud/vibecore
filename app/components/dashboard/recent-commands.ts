/**
 * MRU list of command-palette destinations, persisted per-browser. SSR-safe
 * (returns [] on the server) and storage-failure-safe (private mode), same
 * pattern as resolve-preferred-model.ts.
 */
export const RECENT_COMMANDS_STORAGE_KEY = 'ecode:recent-commands';

export const MAX_RECENT_COMMANDS = 5;

export function readRecentCommands(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_RECENT_COMMANDS);
  } catch {
    return [];
  }
}

/** Pure MRU update, exported for tests: newest first, deduped, capped. */
export function pushRecentCommand(existing: string[], to: string): string[] {
  return [to, ...existing.filter((value) => value !== to)].slice(0, MAX_RECENT_COMMANDS);
}

export function recordRecentCommand(to: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      RECENT_COMMANDS_STORAGE_KEY,
      JSON.stringify(pushRecentCommand(readRecentCommands(), to)),
    );
  } catch {
    // Storage blocked (private mode) — recents just don't persist.
  }
}
