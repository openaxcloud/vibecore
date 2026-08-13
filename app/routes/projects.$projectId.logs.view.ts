/*
 * Pure view-model helpers for the project Logs route.
 *
 * Extracted so the loading / empty / error / live-polling decisions can be unit
 * tested without rendering the route. The route renders real runtime stdout /
 * stderr fetched from the runtime logs snapshot endpoint, so these helpers must
 * faithfully distinguish "no workspace", "backend error", "no output yet", and
 * "we have lines" rather than collapsing them into a single static blob.
 */

export type RuntimeLogLevel = 'info' | 'warn' | 'error';
export type RuntimeLogSource = 'workflow' | 'console' | 'system';

export type RuntimeLogEntry = {
  level: RuntimeLogLevel;
  message: string;
  source?: RuntimeLogSource;
  timestamp?: string;
};

export type RuntimeLogsSnapshot = {
  logs?: RuntimeLogEntry[];

  /* The web loader stores any fetch failure here instead of throwing. */
  error?: string;
};

export type LogsLoaderData = {
  workspace: { id: string; status: string; runtimeMode: string; updatedAt?: string } | null;
  runtimeLogs?: RuntimeLogsSnapshot | null;
};

export type LogsViewModel =
  | { kind: 'no-workspace' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'logs'; entries: RuntimeLogEntry[] };

/*
 * A workspace that is actively coming up or running can still be emitting fresh
 * stdout/stderr, so the route polls (revalidates) while in these states. Once a
 * workspace is stopped/failed its log buffer is terminal and polling stops.
 */
const LIVE_WORKSPACE_STATUSES = new Set(['STARTING', 'PENDING', 'RUNNING']);

export function shouldPollLogs(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }

  return LIVE_WORKSPACE_STATUSES.has(status.toUpperCase());
}

export function buildLogsViewModel(data: LogsLoaderData): LogsViewModel {
  if (!data.workspace) {
    return { kind: 'no-workspace' };
  }

  const snapshot = data.runtimeLogs;

  if (snapshot?.error) {
    return { kind: 'error', message: snapshot.error };
  }

  const entries = (snapshot?.logs ?? []).filter((entry) => typeof entry?.message === 'string');

  if (entries.length === 0) {
    return { kind: 'empty' };
  }

  return { kind: 'logs', entries };
}

export function formatRuntimeLogLine(entry: RuntimeLogEntry): string {
  const stamp = entry.timestamp ? `${entry.timestamp} ` : '';
  const source = entry.source ? `[${entry.source}] ` : '';

  return `${stamp}${source}${entry.message}`;
}
