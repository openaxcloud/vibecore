import type { WorkspaceSession, WorkspaceStatus } from '@vibecore/runtime-contract';
import {
  hasLivePreviewPort,
  isWorkspaceReallyRunning,
  type WorkspacePortLike,
  type WorkspaceStatusLike,
} from '~/lib/runtime/workspace-status';

/**
 * Pure decision helpers for the preview start / recovery path in WorkbenchStore.
 *
 * These exist so the tricky branch conditions (which the editor's core journey
 * depends on) can be unit-tested without standing up a full runtime adapter.
 */

/**
 * Whether reopening a project should REATTACH to the already-running dev server
 * instead of cold-booting one.
 *
 * On reopen the workspace pod is often still up and already serving its
 * forwarded port (the inactivity GC hasn't reaped it). Cold-booting then —
 * re-running `npm install` / `npm run dev` — needlessly tears down a live app
 * and shows a from-scratch rebuild. When the workspace is genuinely running AND
 * a port is actively serving, there is a live server to adopt: reattach. With no
 * live serving port there is nothing to attach to, so a real (cold) boot is
 * required.
 */
export function shouldReattachRunningPreview(
  workspace: WorkspaceStatusLike | undefined,
  ports?: readonly WorkspacePortLike[] | null,
): boolean {
  return isWorkspaceReallyRunning(workspace, ports) && hasLivePreviewPort(ports);
}

export type PreviewBootOverlayMode = 'resume' | 'rebuild' | 'none';

/**
 * Pick the boot overlay to show while the preview iframe has not yet rendered.
 *
 *   - 'none'    : no overlay needed.
 *   - 'resume'  : a lightweight "Reattaching to your running app…" skeleton —
 *                 the pod is up and serving, we are only re-adopting it.
 *   - 'rebuild' : the heavy install/boot progress overlay — a genuine cold start.
 *
 * Reattaching to a live workspace must never show the from-scratch rebuild
 * progress; it makes a resume look like a full regeneration.
 */
export function resolvePreviewBootOverlay(input: {
  overlayVisible: boolean;
  reattaching: boolean;
}): PreviewBootOverlayMode {
  if (!input.overlayVisible) {
    return 'none';
  }

  return input.reattaching ? 'resume' : 'rebuild';
}

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

  /**
   * `true` dès qu'un port d'aperçu est SERVI (il répond et un processus vivant
   * le détient). `undefined` quand l'information n'est pas encore connue — on
   * ne relance alors rien, pour ne pas tirer sur un serveur qui démarre.
   */
  hasServingPreview?: boolean;
}): boolean {
  if (!input.autoStart || !input.hasProject || input.isStartingPreview) {
    return false;
  }

  if (workspaceNeedsReprovision(input.workspaceStatus)) {
    return true;
  }

  /*
   * BUG-AGENT-007 — un workspace VIVANT sans serveur de dev.
   *
   * Jusqu'ici seuls les statuts `stopped` / `error` relançaient l'aperçu, et le
   * commentaire d'origine l'assumait : « Restart of an already-running preview
   * stays manual by design ». Mais un pod `running` qui n'a AUCUN processus Vite
   * n'est pas « un aperçu déjà démarré » — c'est un aperçu mort que personne ne
   * relance. Mesuré en direct le 21/08 : workspace `running`, 18 fichiers
   * écrits, `ps aux | grep -c '[v]ite'` → 0, rien sur 5173, `HTTP 000`, et ZÉRO
   * appel `/commands` à la réouverture. La condition confondait « workspace
   * vivant » et « serveur de dev vivant ».
   *
   * Le signal utilisé est `serving` — « le port répond ET un processus vivant le
   * détient » — et surtout PAS l'événement de port : celui-ci annonçait
   * `Runtime port event: 5173` avec une URL d'aperçu alors que rien n'écoutait.
   * Se brancher dessus donnerait une condition qui ne se déclenche jamais,
   * c'est-à-dire le défaut actuel.
   *
   * Prudence : on ne relance QUE si le workspace est explicitement `running`. Un
   * statut inconnu ou en cours de démarrage ne déclenche rien — le serveur est
   * peut-être simplement en train de monter, et le relancer le tuerait.
   */
  if (input.workspaceStatus?.status !== 'running') {
    return false;
  }

  return input.hasServingPreview === false;
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

/**
 * Which previously-detected preview ports a fresh, AUTHORITATIVE port poll no
 * longer reports listening — i.e. the dev servers that have since crashed/exited.
 *
 * `refreshPorts` reads the pod's real /proc listening sockets; a port that drops
 * out of that set is genuinely gone. `#applyPortEvent` only prunes on an explicit
 * watch-stream 'close', so a death the watch missed (pod flap / reconnect) left the
 * dead port in the previews store as ready+baseUrl forever — the preview then
 * "reattached" to a corpse and never relaunched (endless reload, blank app). The
 * caller synthesises a 'close' for each returned port so the store converges on the
 * poll. Pure so the reconciliation is unit-tested without a runtime adapter or DOM.
 */
export function previewPortsToPrune(
  currentPreviews: readonly { port: number }[],
  livePorts: ReadonlySet<number>,
): number[] {
  return currentPreviews.filter((preview) => !livePorts.has(preview.port)).map((preview) => preview.port);
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

/**
 * BUG-AGENT-007 — plafond dur sur les relances d'un aperçu mort.
 *
 * Le garde par session (`reopenKickedSessionRef`) suffit pour un pod qui
 * redémarre : l'id de session change, la ref se réarme une fois. Il ne suffit
 * PAS pour un workspace qui reste `running` en servant un aperçu mort — l'id ne
 * change pas, mais un remontage du composant remet la ref à zéro. Sans plafond,
 * chaque remontage relancerait le serveur : c'est exactement la boucle de
 * redémarrage que ce chemin a déjà connue.
 *
 * Le compteur vit au niveau du MODULE, donc il survit aux remontages, et il
 * s'efface par fenêtre glissante pour qu'un problème résolu n'interdise pas à
 * jamais une relance légitime.
 */
const DEAD_PREVIEW_KICK_WINDOW_MS = 5 * 60 * 1000;
const DEAD_PREVIEW_KICK_MAX = 2;

let deadPreviewKicks: number[] = [];

/** Testable : remet le plafond à zéro entre deux cas. */
export function resetDeadPreviewKicks(): void {
  deadPreviewKicks = [];
}

/**
 * Consomme un jeton de relance. Renvoie `false` — et ne consomme rien — quand le
 * plafond de la fenêtre est atteint.
 */
export function canKickDeadPreview(now: number = Date.now()): boolean {
  deadPreviewKicks = deadPreviewKicks.filter((at) => now - at < DEAD_PREVIEW_KICK_WINDOW_MS);

  if (deadPreviewKicks.length >= DEAD_PREVIEW_KICK_MAX) {
    return false;
  }

  deadPreviewKicks.push(now);

  return true;
}
