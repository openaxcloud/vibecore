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
  previewLifecycle: Record<string, ValidatedPreviewLifecycleState>;
  recordPreviewLifecycle: (event: ValidatedPreviewLifecycleEvent) => void;
  clearPreviewLifecycleScope: (scope: string) => void;
  clearPreviewLifecycleOwner: (owner: string) => void;
  clearPreviewLifecycleWindow: (owner: string, instancePrefix: string) => void;
  clearPreviewLifecycleInstance: (owner: string, instanceId: string) => void;
  prunePreviewLifecycleInstance: (owner: string, instanceId: string, keepScope: string) => void;
  setDiagnosticsForSource: (source: string, diagnostics: Diagnostic[]) => void;
  clearDiagnosticsForSource: (source: string) => void;
}

export type PreviewLifecycleStatus = 'document' | 'blank' | 'mounted' | 'ok';

export interface ValidatedPreviewLifecycleEvent {
  scope: string;
  status: PreviewLifecycleStatus;
  documentId: string;
  observedAt: number;
  message?: string;
}

interface ValidatedPreviewLifecycleState {
  status: PreviewLifecycleStatus;
  documentId: string;
  observedAt: number;
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
  previewLifecycle: {},
  recordPreviewLifecycle: (event) => {
    const source = `preview-lifecycle:${event.scope}`;
    const current = get();
    const previous = current.previewLifecycle[event.scope];

    if (
      (event.status === 'document' && previous && event.observedAt < previous.observedAt) ||
      (event.status !== 'document' &&
        (!previous || previous.documentId !== event.documentId || event.observedAt < previous.observedAt))
    ) {
      return;
    }

    const withoutScope = current.diagnostics.filter((diagnostic) => diagnostic.source !== source);

    const nextDiagnostics =
      event.status === 'blank'
        ? sortDiagnostics([
            ...withoutScope,
            {
              id: `${source}:blank`,
              severity: 'error',
              source,
              message: event.message ?? 'preview.blank',
              detail: `document=${event.documentId}`,
              occurrences: 1,
              firstSeenAt: event.observedAt,
              lastSeenAt: event.observedAt,
            },
          ]).slice(0, MAX_DIAGNOSTICS)
        : current.diagnostics;

    /* MOUNTED is evidence only; only stable OK is allowed to clear BLANK. */
    const settledDiagnostics =
      event.status === 'ok'
        ? sortDiagnostics(current.diagnostics.filter((diagnostic) => diagnostic.source !== source))
        : nextDiagnostics;

    const counts = countBySeverity(settledDiagnostics);

    set({
      diagnostics: settledDiagnostics,
      ...counts,
      previewLifecycle: {
        ...current.previewLifecycle,
        [event.scope]: {
          status: event.status,
          documentId: event.documentId,
          observedAt: event.observedAt,
        },
      },
    });
  },
  clearPreviewLifecycleScope: (scope) => {
    const source = `preview-lifecycle:${scope}`;
    const current = get();
    const diagnostics = sortDiagnostics(current.diagnostics.filter((diagnostic) => diagnostic.source !== source));
    const previewLifecycle = { ...current.previewLifecycle };
    delete previewLifecycle[scope];

    set({ diagnostics, ...countBySeverity(diagnostics), previewLifecycle });
  },
  clearPreviewLifecycleOwner: (owner) => {
    const sourcePrefix = `preview-lifecycle:${owner}:`;
    const current = get();

    const diagnostics = sortDiagnostics(
      current.diagnostics.filter((diagnostic) => !diagnostic.source.startsWith(sourcePrefix)),
    );
    const previewLifecycle = Object.fromEntries(
      Object.entries(current.previewLifecycle).filter(([scope]) => !scope.startsWith(`${owner}:`)),
    );

    set({ diagnostics, ...countBySeverity(diagnostics), previewLifecycle });
  },
  clearPreviewLifecycleWindow: (owner, instancePrefix) => {
    const scopePrefix = `${owner}:`;
    const sourcePrefix = 'preview-lifecycle:';
    const current = get();

    const belongsToWindow = (scope: string) => {
      if (!scope.startsWith(scopePrefix)) {
        return false;
      }

      const portSeparator = scope.indexOf(':', scopePrefix.length);
      const instanceId = portSeparator === -1 ? '' : scope.slice(portSeparator + 1);

      return instanceId.startsWith(instancePrefix);
    };

    const diagnostics = sortDiagnostics(
      current.diagnostics.filter((diagnostic) =>
        diagnostic.source.startsWith(sourcePrefix)
          ? !belongsToWindow(diagnostic.source.slice(sourcePrefix.length))
          : true,
      ),
    );
    const previewLifecycle = Object.fromEntries(
      Object.entries(current.previewLifecycle).filter(([scope]) => !belongsToWindow(scope)),
    );

    set({ diagnostics, ...countBySeverity(diagnostics), previewLifecycle });
  },
  clearPreviewLifecycleInstance: (owner, instanceId) => {
    const scopePrefix = `${owner}:`;
    const sourcePrefix = `preview-lifecycle:${scopePrefix}`;
    const current = get();

    const belongsToInstance = (scope: string) => {
      if (!scope.startsWith(scopePrefix)) {
        return false;
      }

      const portSeparator = scope.indexOf(':', scopePrefix.length);

      return portSeparator !== -1 && scope.slice(portSeparator + 1) === instanceId;
    };

    const diagnostics = sortDiagnostics(
      current.diagnostics.filter((diagnostic) => {
        if (!diagnostic.source.startsWith(sourcePrefix)) {
          return true;
        }

        return !belongsToInstance(diagnostic.source.slice('preview-lifecycle:'.length));
      }),
    );
    const previewLifecycle = Object.fromEntries(
      Object.entries(current.previewLifecycle).filter(([scope]) => !belongsToInstance(scope)),
    );

    set({ diagnostics, ...countBySeverity(diagnostics), previewLifecycle });
  },
  prunePreviewLifecycleInstance: (owner, instanceId, keepScope) => {
    const scopePrefix = `${owner}:`;
    const sourcePrefix = 'preview-lifecycle:';
    const current = get();

    const shouldPrune = (scope: string) => {
      if (scope === keepScope || !scope.startsWith(scopePrefix)) {
        return false;
      }

      const portSeparator = scope.indexOf(':', scopePrefix.length);

      return portSeparator !== -1 && scope.slice(portSeparator + 1) === instanceId;
    };
    const diagnostics = sortDiagnostics(
      current.diagnostics.filter((diagnostic) =>
        diagnostic.source.startsWith(sourcePrefix) ? !shouldPrune(diagnostic.source.slice(sourcePrefix.length)) : true,
      ),
    );
    const previewLifecycle = Object.fromEntries(
      Object.entries(current.previewLifecycle).filter(([scope]) => !shouldPrune(scope)),
    );

    set({ diagnostics, ...countBySeverity(diagnostics), previewLifecycle });
  },
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
const LEGACY_BLANK_PREVIEW_MESSAGES = new Set([
  'Preview loaded but the app never mounted (blank page). Check the app entry or console. Auto-reloading once…',
  'L’aperçu a été chargé, mais l’application ne s’est pas montée (page blanche). Vérifiez le point d’entrée ou la console. Une actualisation automatique va être tentée…',
]);

function isLegacyBlankPreviewMessage(message: string) {
  return LEGACY_BLANK_PREVIEW_MESSAGES.has(message);
}

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
  previewLive = false,
}: {
  workspaceError?: string | Error | null;
  workspaceLogs: string[];

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
      return undefined;
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
      !isLegacyBlankPreviewMessage(normalizedMessage) &&
      TRANSIENT_RUNTIME_ERROR_PATTERN.test(normalizedMessage)
    ) {
      return undefined;
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

    return id;
  };

  if (workspaceError) {
    const message = workspaceError instanceof Error ? workspaceError.message : workspaceError;
    addDiagnostic('error', message);
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

    /*
     * Preview lifecycle is deliberately NOT parsed from workspaceLogs: project
     * stdout is untrusted and could forge a recovery marker. PREVIEW_BLANK/OK
     * reach the dedicated validated store action after iframe validation instead.
     * This is an anti-stale/navigation boundary, not authentication against code
     * running inside the same preview realm.
     */
    if (RUNTIME_ERROR_PATTERN.test(normalizedLine) && !isLegacyBlankPreviewMessage(normalizedLine)) {
      addDiagnostic('error', normalizedLine);
    } else if (RUNTIME_WARNING_PATTERN.test(normalizedLine) && !isLegacyBlankPreviewMessage(normalizedLine)) {
      addDiagnostic('warning', normalizedLine);
    }
  }

  return sortDiagnostics([...diagnosticsById.values()]);
}
