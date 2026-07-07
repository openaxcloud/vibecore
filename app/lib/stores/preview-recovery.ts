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
 * Whether reopening a project should proactively kick the preview server (which
 * reprovisions the pod via #ensureWorkspaceProvisioned) instead of leaving the
 * user behind a manual Run.
 *
 * The auto-start boot loop bails the moment a workspace error is known, so it
 * never fires for a reopened project whose pod was stopped or crashed. This gate
 * covers exactly that case: a desktop project (autoStart), not already starting,
 * whose workspace status is reprovisionable. The caller fires it at most once per
 * stopped/crashed session id so a persistently-failing pod falls back to the
 * manual recovery UI rather than looping.
 */
export function shouldKickReopenPreview(input: {
  autoStart: boolean;
  hasProject: boolean;
  isStartingPreview: boolean;
  workspaceStatus: WorkspaceSession | undefined;
}): boolean {
  return (
    input.autoStart && input.hasProject && !input.isStartingPreview && workspaceNeedsReprovision(input.workspaceStatus)
  );
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

/**
 * Whether a single error/log message matches a transient runtime-failure pattern
 * (cold-start 502/unavailable, dropped socket, aborted stream, …).
 */
export function isTransientFailureMessage(message: string): boolean {
  return TRANSIENT_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export function isTransientCommandFailure(logTail: readonly string[]): boolean {
  return logTail.some((line) => isTransientFailureMessage(line));
}

/**
 * Whether an auto-start preview failure should LATCH the manual "Run to preview"
 * recovery UI (previewRunFailed = true) or be swallowed so the boot loop keeps
 * retrying.
 *
 * The auto boot loop fires an immediate `startPreviewServer()` the moment a
 * project opens. On a freshly (re)provisioned / cold pod that first attempt very
 * often throws a transient failure — the agent is still booting, the manager is
 * mid-reprovision, the install socket dropped — before the pod is warm. Latching
 * on that first transient throw permanently disabled the retry interval + 5-min
 * budget (all three gate on `!previewRunFailed`), stranding the user behind a
 * manual Run even though a couple more seconds would have succeeded. So on the
 * auto path we DON'T latch a transient failure — the interval keeps retrying and
 * the 5-minute timeout remains the single legitimate give-up. A DETERMINISTIC
 * failure (missing package.json, ERESOLVE, 404 archive) still latches promptly so
 * a genuinely-broken project surfaces the recovery UI without a 5-minute wait.
 *
 * A MANUAL run/restart always latches on failure — the user asked explicitly and
 * must see the immediate result rather than a silent retry.
 */
export function shouldLatchPreviewStartFailure(input: { manual: boolean; message: string }): boolean {
  if (input.manual) {
    return true;
  }

  return !isTransientFailureMessage(input.message);
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
