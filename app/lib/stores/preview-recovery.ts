import type { WorkspaceSession, WorkspaceStatus } from '@vibecore/runtime-contract';

/**
 * Pure decision helpers for the preview start / recovery path in WorkbenchStore.
 *
 * These exist so the tricky branch conditions (which the editor's core journey
 * depends on) can be unit-tested without standing up a full runtime adapter.
 */

export interface PreviewReadiness {
  ready: boolean;
}

/**
 * Whether #runStartPreviewServer may short-circuit on an already-running dev
 * server instead of installing/launching.
 *
 * The old condition (`some preview.ready !== false`) let a port that was merely
 * detected — bound against an empty/incomplete node_modules — suppress a needed
 * install, stranding the iframe on a blank/500 app. We now require BOTH a
 * genuinely-ready port (`ready === true`) AND that dependencies are installed,
 * so a falsely-detected port can never skip the install.
 */
export function shouldUseExistingPreviewServer(
  previews: readonly PreviewReadiness[],
  dependenciesInstalled: boolean,
): boolean {
  if (!dependenciesInstalled) {
    return false;
  }

  return previews.some((preview) => preview.ready === true);
}

/**
 * Workspace statuses from which the preview server cannot be (re)started by
 * simply issuing dev-server commands at the existing pod — the pod is gone or
 * unhealthy, so the workspace must be reprovisioned (runtime.startWorkspace)
 * first. Without this the Run / Reinstall buttons just fire commands at a dead
 * pod and fail again.
 */
const REPROVISIONABLE_WORKSPACE_STATUSES: ReadonlySet<WorkspaceStatus> = new Set<WorkspaceStatus>(['stopped', 'error']);

export function workspaceNeedsReprovision(status: WorkspaceSession | undefined): boolean {
  if (!status) {
    return false;
  }

  return REPROVISIONABLE_WORKSPACE_STATUSES.has(status.status);
}

/**
 * Whether a failed setup-command run looks like a TRANSIENT runtime failure
 * (worth retrying) rather than a genuine install error (e.g. a missing package).
 *
 * The runtime-remote adapter surfaces an interrupted command stream — a pod
 * restart, an LB idle-kill, or a network blip mid-`npm install` — as a synthetic
 * "stream closed before completion" error, and the workspace agent returns 502 /
 * "unavailable" when transiently unreachable. Those are exactly the cold-start
 * fragility windows where a freshly provisioned pod is most likely to drop the
 * install, so re-running the install is the right recovery. A deterministic
 * install failure (unknown package, ERESOLVE) is NOT retried.
 */
const TRANSIENT_FAILURE_PATTERNS = [
  /stream closed before completion/i,
  /stream interrupted/i,
  /\b502\b/,
  /\b503\b/,
  /\b504\b/,
  /workspace[_\s-]?(?:not[_\s-]?started|unavailable|manager[_\s-]?unavailable)/i,
  /\bunavailable\b/i,
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /\bETIMEDOUT\b/i,
  /socket hang ?up/i,
  /network (?:error|drop)/i,
  /aborted/i,
];

export function isTransientCommandFailure(logTail: readonly string[]): boolean {
  return logTail.some((line) => TRANSIENT_FAILURE_PATTERNS.some((pattern) => pattern.test(line)));
}

export interface DecodedArchiveEntry {
  content: string;
  isBinary: boolean;
}

/**
 * Decode one project-archive entry's bytes into a ProjectStorageFile content
 * field. Text decodes as utf8; a NON-utf8 (binary) entry is base64-encoded
 * rather than dropped, so images/fonts/etc. hydrated from project storage keep
 * their bytes (the FileTree copy/duplicate path reads isBinary entries via
 * base64ToUint8Array(content); empty content there produced a 0-byte file).
 *
 * Pure: callers inject `decodeUtf8` (a fatal TextDecoder.decode) and
 * `encodeBase64` so this can be unit-tested without DOM/Buffer specifics.
 */
export function decodeArchiveEntry(
  bytes: Uint8Array,
  decodeUtf8: (bytes: Uint8Array) => string,
  encodeBase64: (bytes: Uint8Array) => string,
): DecodedArchiveEntry {
  try {
    return { content: decodeUtf8(bytes), isBinary: false };
  } catch {
    return { content: encodeBase64(bytes), isBinary: true };
  }
}

/**
 * Append streamed log lines onto the rolling buffer, capped at `limit`.
 *
 * Pure so the (timer-driven) coalescing in WorkbenchStore can be tested without
 * fake timers: the store buffers a burst of streamed lines and flushes them with
 * a single store.set, instead of a store.set per line (which re-rendered the
 * whole IDE shell on every install/build output line).
 */
export function appendWorkspaceLogLines(
  current: readonly string[],
  incoming: readonly string[],
  limit: number,
): string[] {
  if (incoming.length === 0) {
    return current as string[];
  }

  const next = [...current, ...incoming];

  if (next.length <= limit) {
    return next;
  }

  return next.slice(-limit);
}
