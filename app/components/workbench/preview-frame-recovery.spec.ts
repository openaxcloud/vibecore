import { describe, expect, it } from 'vitest';
import {
  MAX_PREVIEW_BOOT_ATTEMPTS,
  beginPreviewFrameReload,
  MAX_PREVIEW_LOAD_RETRIES,
  decidePreviewLoadOutcome,
  shouldAutoRunPreview,
  shouldHoldPreviewLoadingOverlay,
  shouldReloadPreviewOnReadyEdge,
  shouldRunPreviewBootLoop,
} from './preview-frame-recovery';

describe('decidePreviewLoadOutcome', () => {
  it('does NOT treat a load as rendered while the port is reported not-ready (the 502 holding-page race)', () => {
    const decision = decidePreviewLoadOutcome({ attempt: 0, ready: false, erroredLoad: false });

    /*
     * The core bug: the cross-origin iframe fires onLoad even for a 502 body.
     * If we trusted it the overlay would be dismissed onto a JSON error blob.
     */
    expect(decision.treatAsRendered).toBe(false);
    expect(decision.scheduleReload).toBe(true);
    expect(decision.nextAttempt).toBe(1);
  });

  it('treats a load as a real render once the port is confirmed ready', () => {
    const decision = decidePreviewLoadOutcome({ attempt: 3, ready: true, erroredLoad: false });

    expect(decision.treatAsRendered).toBe(true);
    expect(decision.scheduleReload).toBe(false);
    expect(decision.nextAttempt).toBe(0);
  });

  it('treats a load with unknown readiness as a real render (no port watcher signal)', () => {
    const decision = decidePreviewLoadOutcome({ attempt: 0, ready: undefined, erroredLoad: false });

    expect(decision.treatAsRendered).toBe(true);
    expect(decision.scheduleReload).toBe(false);
  });

  it('schedules a bounded retry on a frame error event instead of dismissing the overlay', () => {
    const decision = decidePreviewLoadOutcome({ attempt: 0, ready: true, erroredLoad: true });

    expect(decision.treatAsRendered).toBe(false);
    expect(decision.scheduleReload).toBe(true);
    expect(decision.nextAttempt).toBe(1);
  });

  it('stops retrying once the retry budget is exhausted (errored)', () => {
    const decision = decidePreviewLoadOutcome({
      attempt: MAX_PREVIEW_LOAD_RETRIES,
      ready: false,
      erroredLoad: true,
    });

    expect(decision.scheduleReload).toBe(false);
  });

  it('surfaces a stuck not-ready load as rendered once retries are exhausted (avoids an infinite spinner)', () => {
    const decision = decidePreviewLoadOutcome({
      attempt: MAX_PREVIEW_LOAD_RETRIES,
      ready: false,
      erroredLoad: false,
    });

    expect(decision.treatAsRendered).toBe(true);
    expect(decision.scheduleReload).toBe(false);
    expect(decision.nextAttempt).toBe(MAX_PREVIEW_LOAD_RETRIES);
  });

  /*
   * BUG-UX-PREVIEW-OVERLAY-LAG (live 24/08): the aggregate `ready` stays false
   * on reopen (manager status lags, client beacon reflects the previous page)
   * while the port genuinely serves 200s. Every real render was discarded as a
   * "502 holding page" and reloaded — the overlay never dropped.
   */
  it('trusts a load when the server reports the port SERVING, even while the aggregate ready is still false', () => {
    const decision = decidePreviewLoadOutcome({ attempt: 2, ready: false, serving: true, erroredLoad: false });

    expect(decision.treatAsRendered).toBe(true);
    expect(decision.scheduleReload).toBe(false);
    expect(decision.nextAttempt).toBe(0);
  });

  it('still retries a frame ERROR even while the port reports serving (network-level failure, nothing rendered)', () => {
    const decision = decidePreviewLoadOutcome({ attempt: 0, ready: false, serving: true, erroredLoad: true });

    expect(decision.treatAsRendered).toBe(false);
    expect(decision.scheduleReload).toBe(true);
  });

  it('keeps distrusting a not-ready load when serving is unknown (the original 502 race is unchanged)', () => {
    const decision = decidePreviewLoadOutcome({ attempt: 0, ready: false, serving: undefined, erroredLoad: false });

    expect(decision.treatAsRendered).toBe(false);
    expect(decision.scheduleReload).toBe(true);
  });
});

describe('shouldHoldPreviewLoadingOverlay (BUG-UX-PREVIEW-OVERLAY-LAG)', () => {
  const base = {
    hasActivePreview: true,
    hasIframeUrl: true,
    frameLoaded: true,
    loadedUrlMatches: true,
  };

  it('drops the overlay once the frame loaded and the port is SERVING, even while the aggregate ready is still false', () => {
    // The measured live state: URL renders the app in a plain tab, overlay still said "Starting".
    expect(shouldHoldPreviewLoadingOverlay({ ...base, ready: false, serving: true })).toBe(false);
  });

  it('keeps the overlay while the frame has not loaded the current URL yet', () => {
    expect(shouldHoldPreviewLoadingOverlay({ ...base, ready: true, serving: true, frameLoaded: false })).toBe(true);
    expect(shouldHoldPreviewLoadingOverlay({ ...base, ready: true, serving: true, loadedUrlMatches: false })).toBe(
      true,
    );
  });

  it('keeps the overlay over a loaded frame only when the port is not-ready AND not serving (the real 502 page)', () => {
    expect(shouldHoldPreviewLoadingOverlay({ ...base, ready: false, serving: undefined })).toBe(true);
    expect(shouldHoldPreviewLoadingOverlay({ ...base, ready: false, serving: false })).toBe(true);
  });

  it('drops the overlay for a loaded frame with a ready (or unknown) port', () => {
    expect(shouldHoldPreviewLoadingOverlay({ ...base, ready: true })).toBe(false);
    expect(shouldHoldPreviewLoadingOverlay({ ...base, ready: undefined })).toBe(false);
  });

  it('never shows without an active preview or iframe URL', () => {
    expect(shouldHoldPreviewLoadingOverlay({ ...base, hasActivePreview: false, ready: false })).toBe(false);
    expect(shouldHoldPreviewLoadingOverlay({ ...base, hasIframeUrl: false, ready: false })).toBe(false);
  });
});

describe('shouldRunPreviewBootLoop', () => {
  const base = {
    autoStart: true,
    workspaceReady: true,
    hasStaticPreview: false,
    previewsLength: 0,
    previewRunFailed: false,
    hasWorkspaceError: false,
  };

  it('runs the boot loop on a healthy, ready, auto-start workspace', () => {
    expect(shouldRunPreviewBootLoop(base)).toBe(true);
  });

  it('short-circuits immediately when a workspace boot error is known (no 5-minute hammering of a dead agent)', () => {
    expect(shouldRunPreviewBootLoop({ ...base, hasWorkspaceError: true })).toBe(false);
  });

  it('stops retrying when the dependency install has reached a deterministic error', () => {
    expect(shouldRunPreviewBootLoop({ ...base, hasPreviewServerError: true })).toBe(false);
  });

  it('does not run before the workspace is ready', () => {
    expect(shouldRunPreviewBootLoop({ ...base, workspaceReady: false })).toBe(false);
  });

  it('does not run once a preview port already exists', () => {
    expect(shouldRunPreviewBootLoop({ ...base, previewsLength: 1 })).toBe(false);
  });

  it('KEEPS relaunching on a dev-server-absent 502 (previewRunFailed) while the workspace is healthy', () => {
    /*
     * The regression this fixes: a transient 502 preview_upstream_unreachable set
     * previewRunFailed and STOPPED the loop, stranding the dev server down. With a
     * healthy workspace and no port, the loop must keep relaunching it.
     */
    expect(shouldRunPreviewBootLoop({ ...base, previewRunFailed: true })).toBe(true);
  });

  it('stops relaunching once the bounded attempt budget is spent (hands off to manual UI)', () => {
    expect(shouldRunPreviewBootLoop({ ...base, previewRunFailed: true, bootAttempts: MAX_PREVIEW_BOOT_ATTEMPTS })).toBe(
      false,
    );
    expect(shouldRunPreviewBootLoop({ ...base, bootAttempts: MAX_PREVIEW_BOOT_ATTEMPTS + 5 })).toBe(false);

    // Still under budget → keeps running.
    expect(
      shouldRunPreviewBootLoop({ ...base, previewRunFailed: true, bootAttempts: MAX_PREVIEW_BOOT_ATTEMPTS - 1 }),
    ).toBe(true);
  });

  it('still bails immediately on a genuine workspace error even under budget', () => {
    expect(
      shouldRunPreviewBootLoop({ ...base, hasWorkspaceError: true, previewRunFailed: true, bootAttempts: 0 }),
    ).toBe(false);
  });

  it('does not run for a static preview or when autoStart is off', () => {
    expect(shouldRunPreviewBootLoop({ ...base, hasStaticPreview: true })).toBe(false);
    expect(shouldRunPreviewBootLoop({ ...base, autoStart: false })).toBe(false);
  });
});

describe('shouldAutoRunPreview', () => {
  it('auto-runs on desktop for a real project regardless of the active tab', () => {
    /*
     * The bug: on the default Code tab the boot loop never ran, so no port was
     * detected and the Webview was never revealed without a manual click.
     */
    expect(shouldAutoRunPreview({ isMobileWorkbench: false, hasProject: true, isPreviewTabActive: false })).toBe(true);
  });

  it('still auto-runs when the Preview tab is focused (any platform / no project)', () => {
    expect(shouldAutoRunPreview({ isMobileWorkbench: true, hasProject: false, isPreviewTabActive: true })).toBe(true);
  });

  it('does NOT background-run on mobile (frozen mobile bars keep their explicit control)', () => {
    expect(shouldAutoRunPreview({ isMobileWorkbench: true, hasProject: true, isPreviewTabActive: false })).toBe(false);
  });

  it('does not run without a project and off the preview tab', () => {
    expect(shouldAutoRunPreview({ isMobileWorkbench: false, hasProject: false, isPreviewTabActive: false })).toBe(
      false,
    );
  });
});

describe('shouldReloadPreviewOnReadyEdge', () => {
  it('reloads to rescue a frame that has NOT yet rendered the app (stuck on the 502 holding page)', () => {
    expect(shouldReloadPreviewOnReadyEdge({ readyEdgeReload: true, frameRendered: false })).toBe(true);
  });

  it('does NOT reload once the app is rendered — a readiness re-probe flap must not flicker a healthy frame', () => {
    /*
     * This is the exact bug: probePortReady blips false→true while the dev server is
     * up, firing the ready edge; reloading the already-rendered app is the flicker.
     */
    expect(shouldReloadPreviewOnReadyEdge({ readyEdgeReload: true, frameRendered: true })).toBe(false);
  });

  it('never reloads when there was no ready edge, regardless of render state', () => {
    expect(shouldReloadPreviewOnReadyEdge({ readyEdgeReload: false, frameRendered: false })).toBe(false);
    expect(shouldReloadPreviewOnReadyEdge({ readyEdgeReload: false, frameRendered: true })).toBe(false);
  });
});

describe('beginPreviewFrameReload (BUG-A — "Refresh preview" must force a REAL iframe reload)', () => {
  /*
   * Live 23/08: dev server serving on 5173 (app rendered fine in a standalone
   * tab), embedded Webview blank, "Refresh preview" a silent no-op. The old
   * inline handler only forced a navigation when contentWindow.location.reload()
   * THREW (cross-origin); a frame parked on about:blank reloads "successfully"
   * — and stays blank.
   */

  function fakeFrame(input: { href?: string; crossOrigin?: boolean; noWindow?: boolean }) {
    const reloadCalls: string[] = [];

    const frame = {
      src: input.href ?? '',
      contentWindow: input.noWindow
        ? null
        : {
            location: {
              get href(): string {
                if (input.crossOrigin) {
                  throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError');
                }

                return input.href ?? 'about:blank';
              },
              reload() {
                if (input.crossOrigin) {
                  throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError');
                }

                reloadCalls.push('reload');
              },
            },
          },
    };

    return { frame, reloadCalls };
  }

  it('forces a navigation when the frame is parked on about:blank — the silent no-op that left the Webview blank', () => {
    const { frame, reloadCalls } = fakeFrame({ href: 'about:blank' });

    expect(beginPreviewFrameReload(frame)).toBe('force-navigation');

    // The frame is parked for the bounce; the caller re-assigns the target src.
    expect(frame.src).toBe('about:blank');

    // Reloading about:blank is NOT a real reload and must never count as one.
    expect(reloadCalls).toHaveLength(0);
  });

  it('forces a navigation when contentWindow is missing (the optional chain used to skip the reload entirely)', () => {
    const { frame } = fakeFrame({ noWindow: true, href: 'https://ws-x-5173.preview.e-code.ai/' });

    expect(beginPreviewFrameReload(frame)).toBe('force-navigation');
    expect(frame.src).toBe('about:blank');
  });

  it('forces a navigation for a cross-origin frame (reload() throws — the one case the old code did handle)', () => {
    const { frame, reloadCalls } = fakeFrame({ crossOrigin: true, href: 'https://ws-x-5173.preview.e-code.ai/' });

    expect(() => beginPreviewFrameReload(frame)).not.toThrow();
    expect(beginPreviewFrameReload(frame)).toBe('force-navigation');
    expect(reloadCalls).toHaveLength(0);
  });

  it('keeps the same-origin fast path: a genuinely loaded page is reloaded in place, without a src bounce', () => {
    const { frame, reloadCalls } = fakeFrame({ href: 'http://localhost:5173/' });

    expect(beginPreviewFrameReload(frame)).toBe('same-origin-reload');
    expect(reloadCalls).toEqual(['reload']);

    // No bounce: the frame keeps its src (no flicker on the healthy path).
    expect(frame.src).toBe('http://localhost:5173/');
  });
});
