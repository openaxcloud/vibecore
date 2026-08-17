import { describe, expect, it } from 'vitest';
import { resolvePreviewBootProgress } from './Preview';

const base = {
  workspaceReady: true,
  previewsLength: 0,
  isStartingPreview: false,
  isRefreshingPorts: false,
  previewRunFailed: false,
  previewStatus: undefined as string | undefined,
};

describe('resolvePreviewBootProgress', () => {
  it('reports ready once a preview is registered and nothing contradicts it', () => {
    expect(resolvePreviewBootProgress({ ...base, previewsLength: 1 })).toEqual({
      activeStep: 'ready',
      progress: 100,
    });
  });

  /*
   * BUG-UX-014: the panel showed "Ready" with all four steps ticked while its
   * own task line said "Preview server is still starting; retrying…". A
   * registered preview entry is not proof the dev server answers, so the
   * upstream signal has to win over the mere existence of that entry.
   */
  it('does NOT claim ready while the panel says the upstream is not up yet', () => {
    const progress = resolvePreviewBootProgress({
      ...base,
      previewsLength: 1,
      upstreamNotReady: true,
    });

    expect(progress.activeStep).toBe('server');
    expect(progress.progress).toBeLessThan(100);
  });

  it('still reports ready when the upstream signal clears', () => {
    expect(
      resolvePreviewBootProgress({ ...base, previewsLength: 1, upstreamNotReady: false }).activeStep,
    ).toBe('ready');
  });

  it('keeps reporting dependencies while the workspace is not ready', () => {
    expect(resolvePreviewBootProgress({ ...base, workspaceReady: false }).activeStep).toBe('dependencies');
  });
});
