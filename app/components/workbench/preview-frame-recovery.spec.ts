import { describe, expect, it } from 'vitest';
import { MAX_PREVIEW_LOAD_RETRIES, decidePreviewLoadOutcome, shouldRunPreviewBootLoop } from './preview-frame-recovery';

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

  it('does not run before the workspace is ready', () => {
    expect(shouldRunPreviewBootLoop({ ...base, workspaceReady: false })).toBe(false);
  });

  it('does not run once a preview already exists or the run already failed', () => {
    expect(shouldRunPreviewBootLoop({ ...base, previewsLength: 1 })).toBe(false);
    expect(shouldRunPreviewBootLoop({ ...base, previewRunFailed: true })).toBe(false);
  });

  it('does not run for a static preview or when autoStart is off', () => {
    expect(shouldRunPreviewBootLoop({ ...base, hasStaticPreview: true })).toBe(false);
    expect(shouldRunPreviewBootLoop({ ...base, autoStart: false })).toBe(false);
  });
});
