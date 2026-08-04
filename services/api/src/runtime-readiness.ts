/*
 * Pure, unit-testable helpers extracted from app.ts for two core-journey
 * provisioning/preview correctness paths:
 *
 *  - Port readiness: a dev server binds (LISTEN) its port BEFORE it can serve
 *    HTTP. The agent reports a port the moment it is listening, but the Preview
 *    component's auto-reload edge only fires on a ready=false -> ready=true
 *    transition. Emitting ready=true unconditionally makes that recovery dead
 *    code, so we drive readiness from an HTTP probe instead.
 *
 *  - Snapshot -> live workspace sync: restoring a snapshot rewrites project
 *    storage but must also be pushed into the running pod (write restored files,
 *    delete paths that no longer exist) so the preview/terminal reflect the
 *    rolled-back state. computeWorkspaceRestorePlan computes that delta.
 */

export type PortProbeResult =
  | {
      kind: 'response';
      status: number;

      /**
       * Bytes actually served for the probed document. `undefined` means the
       * prober did not read the body (older callers); readiness then falls back
       * to the status check alone.
       */
      bodyBytes?: number;
    }
  | { kind: 'unreachable' };

/**
 * Decide whether a detected workspace port is actually ready to serve content.
 *
 * A port is ready only when the request REACHED a server that answered with a
 * success/redirect status AND returned a non-empty body.
 *
 * Previously this was `probe.status < 500`, which was far too permissive and is
 * a proven contributor to the "RUNNING + port open + 0 Problems + blank webview"
 * state (SOLUTIONS_REAL_PROOF_BLOCKERS.md §5): a **404 counted as ready**, so a
 * dev server that bound its port but served nothing at `/` — or a proxy that
 * answered "not found" for the workspace — latched the preview to ready and
 * disarmed the not-ready -> ready auto-reload recovery.
 *
 * Deliberately NOT stricter than this: a Vite `index.html` is legitimately just
 * `<div id="root"></div><script type="module">`, so requiring substantive
 * rendered DOM here would false-negative every SPA. Proving the app actually
 * MOUNTED is a client-side concern and is handled by the blank-preview beacon.
 */
export function isPortReadyFromProbe(probe: PortProbeResult): boolean {
  if (probe.kind === 'unreachable') {
    return false;
  }

  // 4xx and 5xx both mean "not serving this app"; only 2xx/3xx qualify.
  if (probe.status >= 400) {
    return false;
  }

  // A 200 with zero bytes is a bound socket, not a served application.
  if (probe.bodyBytes !== undefined && probe.bodyBytes === 0) {
    return false;
  }

  return true;
}

export interface RestoreFile {
  path: string;
  content: string;
  encoding?: string;
}

export interface WorkspaceRestorePlan {
  writes: RestoreFile[];
  deletes: string[];
}

/**
 * Compute the file operations needed to make a running workspace match a
 * restored snapshot: write every restored file, and delete any path that was
 * present in the live tree but is absent from the snapshot.
 *
 * Paths are normalised (leading "./" and "/" stripped) so the live-tree set and
 * the restored set are compared on the same basis; otherwise a leading-slash
 * mismatch would spuriously re-create or fail to delete files.
 */
export function computeWorkspaceRestorePlan(
  restoredFiles: ReadonlyArray<RestoreFile>,
  liveWorkspacePaths: ReadonlyArray<string>,
): WorkspaceRestorePlan {
  const normalize = (path: string): string => path.replace(/^\.?\/+/, '');

  const restoredByNormalized = new Map<string, RestoreFile>();

  for (const file of restoredFiles) {
    restoredByNormalized.set(normalize(file.path), file);
  }

  const deletes: string[] = [];

  for (const livePath of liveWorkspacePaths) {
    if (!restoredByNormalized.has(normalize(livePath))) {
      deletes.push(livePath);
    }
  }

  return { writes: [...restoredFiles], deletes };
}

/*
 * BLOCKER #5 — honest preview readiness (SOLUTIONS_REAL_PROOF_BLOCKERS.md §5).
 *
 * `isPortReadyFromProbe` proves the PORT alone (a server answered 2xx/3xx with a
 * non-empty body). But the observed "RUNNING + port open + 0 Problems + blank
 * webview" lie also needs the OTHER actors to agree. A preview is only honestly
 * ready when ALL of these hold:
 *
 *   - port    : the HTTP probe reached a served app (isPortReadyFromProbe)
 *   - process : the port is backed by a live dev-server process (the agent
 *               reported a processId for it) — a stale WorkspacePort row with no
 *               process is a ghost, not a ready server.
 *   - manager : the workspace-manager considers the workspace RUNNING — a
 *               STOPPED/FAILED/STARTING workspace can still have a lingering
 *               probe hit and must never latch ready.
 *   - client  : no fresh negative beacon. The browser is the only actor that can
 *               see the app never mounted (blank DOM) or threw a console error;
 *               when it reports one, the server must DROP readiness even though
 *               the port probe passed. `ok` clears it; absence is neutral.
 *
 * Any single "no" ⇒ not ready, with the disagreeing signal named for diagnostics
 * (#6). Deliberately does NOT re-check body substance here — that is the port
 * probe's job and, for the client, the beacon's job.
 */
export type PreviewClientBeacon = 'ok' | 'blank' | 'error' | 'none';

export interface PreviewReadinessSignals {
  portReady: boolean;
  hasLiveProcess: boolean;
  managerStatus: string | undefined;
  clientBeacon: PreviewClientBeacon;
}

export interface PreviewReadinessVerdict {
  ready: boolean;
  /** The first signal that vetoed readiness, for the diagnostics trail (#6). */
  blockedBy?: 'port' | 'process' | 'manager' | 'client';
}

export function aggregatePreviewReadiness(signals: PreviewReadinessSignals): PreviewReadinessVerdict {
  if (!signals.portReady) {
    return { ready: false, blockedBy: 'port' };
  }

  if (!signals.hasLiveProcess) {
    return { ready: false, blockedBy: 'process' };
  }

  // The manager may legitimately not know a brand-new workspace yet (undefined);
  // only a KNOWN non-RUNNING status is a veto. RUNNING or unknown passes here.
  if (signals.managerStatus !== undefined && signals.managerStatus !== 'RUNNING') {
    return { ready: false, blockedBy: 'manager' };
  }

  // A fresh blank/error beacon vetoes; 'ok' and 'none' (no report) do not.
  if (signals.clientBeacon === 'blank' || signals.clientBeacon === 'error') {
    return { ready: false, blockedBy: 'client' };
  }

  return { ready: true };
}
