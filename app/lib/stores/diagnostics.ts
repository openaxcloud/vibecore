import { create } from 'zustand';

export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  message: string;
  source: string;
  detail?: string;
  occurrences?: number;
  firstSeenAt?: number;
  lastSeenAt?: number;
}

interface DiagnosticsState {
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
  setDiagnosticsForSource: (source: string, diagnostics: Diagnostic[]) => void;
  clearDiagnosticsForSource: (source: string) => void;
}

// Cap the retained diagnostics so a noisy, long-running preview that emits many
// distinct error lines can't grow the array (and the per-update full re-sort +
// Problems-panel re-render) without bound. sortDiagnostics orders errors first
// then most-recent, so the cap keeps the most relevant entries.
const MAX_DIAGNOSTICS = 200;

function countBySeverity(diagnostics: Diagnostic[]) {
  return diagnostics.reduce(
    (counts, diagnostic) => {
      if (diagnostic.severity === 'error') {
        counts.errors += 1;
      } else {
        counts.warnings += 1;
      }

      return counts;
    },
    { errors: 0, warnings: 0 },
  );
}

function sortDiagnostics(diagnostics: Diagnostic[]) {
  return [...diagnostics].sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === 'error' ? -1 : 1;
    }

    return (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0);
  });
}

export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => ({
  diagnostics: [],
  errors: 0,
  warnings: 0,
  setDiagnosticsForSource: (source, diagnostics) => {
    const nextDiagnostics = sortDiagnostics([
      ...get().diagnostics.filter((diagnostic) => diagnostic.source !== source),
      ...diagnostics.map((diagnostic) => ({ ...diagnostic, source })),
    ]).slice(0, MAX_DIAGNOSTICS);

    const counts = countBySeverity(nextDiagnostics);

    set({ diagnostics: nextDiagnostics, ...counts });
  },
  clearDiagnosticsForSource: (source) => {
    const nextDiagnostics = sortDiagnostics(get().diagnostics.filter((diagnostic) => diagnostic.source !== source));
    const counts = countBySeverity(nextDiagnostics);

    set({ diagnostics: nextDiagnostics, ...counts });
  },
}));

const RUNTIME_ERROR_PATTERN = /\b(error|failed|exception|crash|fatal|cannot\s+read\s+properties)\b/i;
const RUNTIME_WARNING_PATTERN = /\b(warn|warning|deprecated)\b/i;
const ANSI_ESCAPE_SEQUENCE = /\x1B\[[0-?]*[ -/]*[@-~]/g;

function normalizeRuntimeLine(line: string) {
  return line.replace(ANSI_ESCAPE_SEQUENCE, '').replace(/\s+/g, ' ').trim();
}

function stableDiagnosticId(source: string, severity: DiagnosticSeverity, message: string) {
  return `${source}:${severity}:${message.toLowerCase()}`;
}

export function buildRuntimeDiagnostics({
  workspaceError,
  workspaceLogs,
}: {
  workspaceError?: string | Error | null;
  workspaceLogs: string[];
}) {
  const now = Date.now();
  const diagnosticsById = new Map<string, Diagnostic>();

  const addDiagnostic = (severity: DiagnosticSeverity, message: string, detail?: string) => {
    const normalizedMessage = normalizeRuntimeLine(message);

    if (!normalizedMessage) {
      return;
    }

    const id = stableDiagnosticId('runtime', severity, normalizedMessage);
    const existing = diagnosticsById.get(id);

    diagnosticsById.set(id, {
      id,
      severity,
      source: 'runtime',
      message: normalizedMessage,
      detail: detail ? normalizeRuntimeLine(detail) : undefined,
      occurrences: (existing?.occurrences ?? 0) + 1,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    });
  };

  if (workspaceError) {
    addDiagnostic('error', workspaceError instanceof Error ? workspaceError.message : workspaceError);
  }

  for (const line of workspaceLogs) {
    const normalizedLine = normalizeRuntimeLine(line);

    if (RUNTIME_ERROR_PATTERN.test(normalizedLine)) {
      addDiagnostic('error', normalizedLine);
    } else if (RUNTIME_WARNING_PATTERN.test(normalizedLine)) {
      addDiagnostic('warning', normalizedLine);
    }
  }

  return sortDiagnostics([...diagnosticsById.values()]);
}
