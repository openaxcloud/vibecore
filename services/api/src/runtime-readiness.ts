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
