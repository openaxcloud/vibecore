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
    expect(
      resolveCompactPreviewRunState({
        previewServerStatus: 'idle',
        runtimeRunning: false,
        runtimeStarting: true,
      }),
    ).toBe('starting');
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

  it('surfaces a preview dev-server error even while the workspace pod stays running', () => {
    /*
     * Regression: the dev server can fail to launch while the remote pod is still RUNNING.
     * The compact control must expose the retry affordance instead of masking it as 'running'.
     */
    const state = resolveCompactPreviewRunState({ previewServerStatus: 'error', runtimeRunning: true });

    expect(state).toBe('error');
    expect(isCompactPreviewRunActive(state)).toBe(false);
    expect(compactPreviewRunAriaLabel(state)).toBe('Retry run');
    expect(compactPreviewRunIcon(state)).toBe('i-ph:warning-fill');
  });

  it('localizes compact preview controls when French is active', () => {
    expect(compactPreviewRunAriaLabel('starting', 'fr-FR')).toBe('Démarrage du projet');
    expect(compactPreviewRunText('starting', 'fr-FR')).toBe('Démarrage');
    expect(compactPreviewRunAriaLabel('running', 'fr-FR')).toBe('Arrêter l’exécution');
    expect(compactPreviewRunText('running', 'fr-FR')).toBe('Arrêter');
    expect(compactPreviewRunAriaLabel('error', 'fr-FR')).toBe('Relancer le projet');
    expect(compactPreviewRunText('error', 'fr-FR')).toBe('Réessayer');
  });
});
