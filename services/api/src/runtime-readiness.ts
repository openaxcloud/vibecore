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
  | { kind: 'response'; status: number }
  | { kind: 'unreachable' };

/**
 * Decide whether a detected workspace port is actually ready to serve content.
 *
 * A port is "ready" only once an HTTP request to it returns a non-5xx response.
 * A connection error (server bound the socket but is not serving yet, or the
 * route 502s through the proxy) and any 5xx are treated as not-ready so the
 * Preview's not-ready -> ready reload edge can fire once it comes up.
 */
export function isPortReadyFromProbe(probe: PortProbeResult): boolean {
  if (probe.kind === 'unreachable') {
    return false;
  }

  return probe.status < 500;
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
