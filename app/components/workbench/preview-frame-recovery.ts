/*
 * Pure decision helpers for the Preview iframe recovery path.
 *
 * Extracted from Preview.tsx so the branchy logic that decides whether a frame
 * "load" should be trusted as a real render, and how to react to an iframe
 * `error`, can be unit-tested without a DOM. The remote preview iframe is
 * cross-origin and the browser fires `onLoad` even for HTTP 5xx bodies, so a
 * dev-server that has bound its port but is still compiling makes the proxy
 * return a bare `502 {error:'Preview upstream error'}` page that the frame
 * happily "loads" — previously marked as a finished render. These helpers keep
 * the loading overlay up and schedule a bounded auto-reload until a real render
 * arrives, instead of stranding the user on a JSON error blob.
 */

export const MAX_PREVIEW_LOAD_RETRIES = 8;

export interface PreviewLoadRetryState {
  /* How many auto-reloads have already been attempted for the current url. */
  attempt: number;

  /* The runtime port watcher's readiness signal (undefined when unknown). */
  ready?: boolean;

  /* Whether an iframe `error` event (not `load`) triggered this evaluation. */
  erroredLoad: boolean;
}

export interface PreviewLoadRetryDecision {
  /* Treat this load as a confirmed, user-visible render. */
  treatAsRendered: boolean;

  /* Schedule another bounded auto-reload through about:blank. */
  scheduleReload: boolean;

  /* The attempt counter to persist for the next evaluation. */
  nextAttempt: number;
}

/*
 * Decide what to do when the preview iframe reports a load (or error) event.
 *
 * - A real `load` while the port watcher has NOT yet flipped ready is suspect:
 *   it is most likely the proxy's 502 holding response, so we keep retrying
 *   (up to the cap) rather than dismissing the overlay.
 * - An `error` event is always treated as a transient upstream failure worth a
 *   bounded retry.
 * - A `load` once the port is confirmed ready (ready === true) is trusted as a
 *   genuine render and stops the retry loop.
 */
export function decidePreviewLoadOutcome(state: PreviewLoadRetryState): PreviewLoadRetryDecision {
  const exhausted = state.attempt >= MAX_PREVIEW_LOAD_RETRIES;

  if (state.erroredLoad) {
    return {
      treatAsRendered: false,
      scheduleReload: !exhausted,
      nextAttempt: state.attempt + 1,
    };
  }

  /*
   * A successful load while the runtime explicitly reports the port as
   * not-ready is the classic "port bound, still compiling → 502 body" race.
   * Do not dismiss the overlay; schedule another reload until the port is ready
   * or we exhaust the retry budget.
   */
  if (state.ready === false) {
    return {
      treatAsRendered: exhausted,
      scheduleReload: !exhausted,
      nextAttempt: exhausted ? state.attempt : state.attempt + 1,
    };
  }

  return {
    treatAsRendered: true,
    scheduleReload: false,
    nextAttempt: 0,
  };
}

/*
 * Whether the preview auto-start / port-watch / reinstall loop should run at
 * all. It must short-circuit the moment a workspace boot error is known so a
 * crashed/unreachable runtime surfaces the recovery UI immediately instead of
 * the loop hammering a dead agent for the full 5-minute failure timeout.
 */
export function shouldRunPreviewBootLoop(input: {
  autoStart: boolean;
  workspaceReady: boolean;
  hasStaticPreview: boolean;
  previewsLength: number;
  previewRunFailed: boolean;
  hasWorkspaceError: boolean;
}): boolean {
  if (input.hasWorkspaceError) {
    return false;
  }

  return (
    input.autoStart &&
    input.workspaceReady &&
    !input.hasStaticPreview &&
    input.previewsLength === 0 &&
    !input.previewRunFailed
  );
}

/**
 * Replit-parity auto-run gate for the preview boot loop.
 *
 * On desktop, a real project's dev server should boot + detect its port in the
 * BACKGROUND — regardless of which workbench tab is focused — so the app comes
 * up and the existing "auto-switch to preview once a port appears" effect reveals
 * the Webview with zero clicks. Wiring the boot loop only to the active Preview
 * tab meant the default Code tab never ran it, so nothing ever started.
 *
 * Mobile keeps its explicit run control (frozen mobile bars), and the Preview
 * tab always auto-runs when focused.
 */
export function shouldAutoRunPreview(input: {
  isMobileWorkbench: boolean;
  hasProject: boolean;
  isPreviewTabActive: boolean;
}): boolean {
  return (!input.isMobileWorkbench && input.hasProject) || input.isPreviewTabActive;
}

/**
 * Whether the not-ready → ready auto-reload should actually fire.
 *
 * The readiness of a remote preview port is driven by an HTTP probe on the API
 * (`probePortReady`), so `ready` legitimately FLAPS false ↔ true whenever the dev
 * server is briefly slow to answer — vite re-optimizing deps, a GC pause, CPU
 * contention on the gVisor node. The auto-reload exists ONLY to rescue a frame
 * that loaded the upstream "dev server is starting / 502" holding page before the
 * server was serving. Once the iframe has genuinely RENDERED the app, replaying a
 * full reload on every subsequent probe flap is the preview FLICKER Avi filmed
 * (app → black → app → black). So reload on the ready edge only while the frame is
 * NOT yet showing the app; a real dev-server death removes the port entirely (a
 * `close` event resets the frame), which is a different, correctly-handled path.
 */
export function shouldReloadPreviewOnReadyEdge(input: { readyEdgeReload: boolean; frameRendered: boolean }): boolean {
  return input.readyEdgeReload && !input.frameRendered;
}
