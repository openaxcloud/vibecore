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

/*
 * Cap the retained diagnostics so a noisy, long-running preview that emits many
 * distinct error lines can't grow the array (and the per-update full re-sort +
 * Problems-panel re-render) without bound. sortDiagnostics orders errors first
 * then most-recent, so the cap keeps the most relevant entries.
 */
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

/*
 * The single strongest "your app is not actually working" signal we have: the
 * injected reporter served the page and the SPA root never mounted.
 *
 * It used to produce NO diagnostic at all — its message ("Preview loaded but the
 * app never mounted (blank page)…") contains none of the keywords above, so it
 * matched neither pattern and was silently dropped. That is why Problems read 0
 * over a blank webview (SOLUTIONS_REAL_PROOF_BLOCKERS.md §5). Matched explicitly
 * and classified as an ERROR, and never suppressed by `previewLive` — a live
 * port is exactly the condition under which this fires.
 */
const BLANK_PREVIEW_PATTERN = /\bapp never mounted\b|\bblank page\b/i;

/*
 * Cold-start / provisioning failures that are RESOLVED the moment a forwarded port
 * is actually serving: the runtime request 5xx'd (or 425/429), the workspace was
 * momentarily unreachable, or the preview proxy hadn't caught up — then the pod came
 * up and the app rendered. These are NOT app-level errors, so once the preview is
 * live they are stale and must stop lingering in Problems. Deliberately specific
 * ("Remote runtime request failed: 5xx", proxy-unreachable, workspace-unavailable)
 * so a genuine HTTP 500 from the user's own app is never suppressed.
 */
const TRANSIENT_RUNTIME_ERROR_PATTERN =
  /remote runtime request failed:\s*(?:4(?:25|29)|5\d\d)|workspace[_\s-]?(?:not[_\s-]?started|unavailable|manager[_\s-]?unavailable)|preview[\s._-]?proxy[\s._-]?unreachable|\bstream closed before completion\b|\b(?:502|503|504)\b/i;

const ANSI_ESCAPE_SEQUENCE = /\x1B\[[0-?]*[ -/]*[@-~]/g;

/*
 * A dev-server BUILD error names the module it failed on. Unlike a runtime
 * exception these are *fixable*: the moment the user repairs the file, the dev
 * server transforms it successfully and the error is dead. `workspaceLogs` is an
 * append-only ring buffer, though, so the error line stays in it forever — which
 * left Problems showing a red error count over already-fixed code until the page
 * was reloaded (audit cluster D, BUG-IDE-003). Recognise the error and its
 * recovery so a later success can retire the earlier failure.
 */
const BUILD_ERROR_FILE_PATTERN =
  /(?:pre-transform error|transform failed|internal server error|failed to (?:load|resolve|transform))[^\n]*?((?:\/|\.{0,2}\/)?[\w@][\w@./-]*\.[a-z]{1,6})\b/i;

/*
 * Vite announces a SUCCESSFUL re-transform of a module as an hmr update / page
 * reload for that path. Both carry the same module id the failure did, so they
 * are the recovery signal for `BUILD_ERROR_FILE_PATTERN`.
 */
const BUILD_RECOVERY_FILE_PATTERN =
  /\b(?:hmr update|page reload|hot updated)\b[^\n]*?((?:\/|\.{0,2}\/)?[\w@][\w@./-]*\.[a-z]{1,6})\b/i;

function normalizeRuntimeLine(line: string) {
  return line.replace(ANSI_ESCAPE_SEQUENCE, '').replace(/\s+/g, ' ').trim();
}

/*
 * Module ids appear with different prefixes for the same file — Vite logs the
 * absolute `/workspace/src/App.tsx` on a transform error but the served id
 * `/src/App.tsx` on the hmr update. Compare on the trailing path so the recovery
 * still matches the failure it resolves.
 */
function moduleKey(filePath: string) {
  return filePath.replace(/^.*?((?:src|app|pages|components|lib)\/)/i, '$1').replace(/^\/+/, '');
}

function buildErrorModule(line: string) {
  return BUILD_ERROR_FILE_PATTERN.exec(line)?.[1];
}

function buildRecoveryModule(line: string) {
  return BUILD_RECOVERY_FILE_PATTERN.exec(line)?.[1];
}

function stableDiagnosticId(source: string, severity: DiagnosticSeverity, message: string) {
  return `${source}:${severity}:${message.toLowerCase()}`;
}

export function buildRuntimeDiagnostics({
  workspaceError,
  workspaceLogs,
  quotaWarning,
  quotaUpgrade,
  previewLive = false,
}: {
  workspaceError?: string | Error | null;
  workspaceLogs: string[];

  /*
   * Quota refusal (HTTP 429 QUOTA_EXCEEDED on workspace start) and its upgrade
   * copy. Both were computed and stored, then rendered ONLY as a bare "!" glyph
   * on a status-bar pill plus a `title` tooltip. Measured on the audit env: a
   * project whose workspace start was refused showed « Aucun problème détecté ·
   * 0 erreurs · 0 avertissements » with the word "quota" absent from the whole
   * page, while the console carried the 429. A refusal the user cannot act on
   * is indistinguishable from a product that is simply broken, so it belongs in
   * Problems like any other blocking condition.
   *
   * Unlike a cold-start blip this is NOT transient: it stays until the user
   * frees a workspace or upgrades.
   */
  quotaWarning?: string | null;
  quotaUpgrade?: string | null;

  /*
   * When a forwarded port is genuinely serving the app, transient cold-start
   * runtime errors (the 500/502 provisioning blips, proxy-unreachable, workspace
   * unavailable) are stale and are dropped from Problems — both the ones carried on
   * workspaceError and the ones logged to workspaceLogs.
   */
  previewLive?: boolean;
}) {
  const now = Date.now();
  const diagnosticsById = new Map<string, Diagnostic>();

  // moduleKey -> ids of the build errors currently blamed on that module.
  const buildErrorIdsByModule = new Map<string, Set<string>>();

  const addDiagnostic = (severity: DiagnosticSeverity, message: string, detail?: string) => {
    const normalizedMessage = normalizeRuntimeLine(message);

    if (!normalizedMessage) {
      return;
    }

    /*
     * Drop stale cold-start runtime errors once the preview is actually serving —
     * but NEVER the blank-preview signal, which by definition only fires when a
     * port is live and is the one diagnostic that must survive to explain a blank
     * webview.
     */
    if (
      previewLive &&
      severity === 'error' &&
      !BLANK_PREVIEW_PATTERN.test(normalizedMessage) &&
      TRANSIENT_RUNTIME_ERROR_PATTERN.test(normalizedMessage)
    ) {
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

    if (severity === 'error') {
      const failedModule = buildErrorModule(normalizedMessage);

      if (failedModule) {
        const key = moduleKey(failedModule);
        const ids = buildErrorIdsByModule.get(key) ?? new Set<string>();
        ids.add(id);
        buildErrorIdsByModule.set(key, ids);
      }
    }
  };

  if (workspaceError) {
    addDiagnostic('error', workspaceError instanceof Error ? workspaceError.message : workspaceError);
  }

  if (quotaWarning) {
    addDiagnostic('error', quotaWarning, quotaUpgrade ?? undefined);
  }

  for (const line of workspaceLogs) {
    const normalizedLine = normalizeRuntimeLine(line);

    /*
     * Retire build errors for a module as soon as the dev server reports a
     * successful re-transform of it. Ordered scan, so only failures logged
     * BEFORE the recovery are dropped — a module that breaks again after an
     * hmr update re-adds its error on the next pass.
     */
    const recoveredModule = buildRecoveryModule(normalizedLine);

    if (recoveredModule) {
      const resolvedIds = buildErrorIdsByModule.get(moduleKey(recoveredModule));

      if (resolvedIds) {
        for (const resolvedId of resolvedIds) {
          diagnosticsById.delete(resolvedId);
        }

        resolvedIds.clear();
      }
    }

    if (BLANK_PREVIEW_PATTERN.test(normalizedLine) || RUNTIME_ERROR_PATTERN.test(normalizedLine)) {
      addDiagnostic('error', normalizedLine);
    } else if (RUNTIME_WARNING_PATTERN.test(normalizedLine)) {
      addDiagnostic('warning', normalizedLine);
    }
  }

  return sortDiagnostics([...diagnosticsById.values()]);
}
