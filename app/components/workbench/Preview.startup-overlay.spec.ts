import { describe, expect, it } from 'vitest';
import { shouldShowStartupOverlay } from './Preview';

const base = {
  hasActivePreview: false,
  hasStaticPreview: false,
  autoStart: true,
  previewRunFailed: false,
  hasWorkspaceError: false,
  isStartingPreview: true,
  isRefreshingPorts: false,
  workspaceReady: false,
  previewStatus: 'Starting project workspace…' as string | undefined,
};

describe('shouldShowStartupOverlay', () => {
  it('shows the boot overlay while the workspace is starting normally', () => {
    expect(shouldShowStartupOverlay(base)).toBe(true);
  });

  it('does NOT show the perpetual spinner once a workspace boot error is set (renders the error UI instead)', () => {
    /*
     * The core fix: a boot error leaves workspaceReady false forever — without this
     * the overlay spun indefinitely with no error and no recovery.
     */
    expect(shouldShowStartupOverlay({ ...base, hasWorkspaceError: true })).toBe(false);
  });

  it('does NOT show the spinner when the preview run already failed (error UI handles it)', () => {
    expect(shouldShowStartupOverlay({ ...base, previewRunFailed: true })).toBe(false);
  });

  it('does not show the overlay once a live preview exists', () => {
    expect(shouldShowStartupOverlay({ ...base, hasActivePreview: true })).toBe(false);
  });

  it('does not show the overlay when autoStart is off', () => {
    expect(shouldShowStartupOverlay({ ...base, autoStart: false })).toBe(false);
  });
});
