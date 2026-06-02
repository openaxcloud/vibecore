import { describe, expect, it } from 'vitest';
import {
  compactPreviewRunAriaLabel,
  compactPreviewRunIcon,
  compactPreviewRunText,
  isCompactPreviewRunActive,
  resolveCompactPreviewRunState,
} from './preview-run-state';

describe('compact preview run state', () => {
  it('treats a real running runtime as active even when the preview server state is idle', () => {
    const state = resolveCompactPreviewRunState({ previewServerStatus: 'idle', runtimeRunning: true });

    expect(state).toBe('running');
    expect(isCompactPreviewRunActive(state)).toBe(true);
    expect(compactPreviewRunAriaLabel(state)).toBe('Stop running');
    expect(compactPreviewRunText(state)).toBe('Stop');
    expect(compactPreviewRunIcon(state)).toBe('i-ph:square-fill');
  });

  it('keeps transition states explicit for disabled and busy UI states', () => {
    expect(resolveCompactPreviewRunState({ previewServerStatus: 'starting', runtimeRunning: false })).toBe('starting');
    expect(resolveCompactPreviewRunState({ previewServerStatus: 'stopping', runtimeRunning: true })).toBe('stopping');
    expect(compactPreviewRunAriaLabel('starting')).toBe('Starting project');
    expect(compactPreviewRunAriaLabel('stopping')).toBe('Stopping project');
    expect(compactPreviewRunIcon('starting')).toBe('i-ph:square-fill');
  });

  it('keeps an error retryable and visually distinct', () => {
    const state = resolveCompactPreviewRunState({ previewServerStatus: 'error', runtimeRunning: false });

    expect(state).toBe('error');
    expect(isCompactPreviewRunActive(state)).toBe(false);
    expect(compactPreviewRunAriaLabel(state)).toBe('Retry run');
    expect(compactPreviewRunText(state)).toBe('Retry');
    expect(compactPreviewRunIcon(state)).toBe('i-ph:warning-fill');
  });
});
