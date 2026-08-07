import { getWorkbenchSurfaceCopy } from '~/lib/i18n/catalogs/workbench-surface';
import { getI18nInstance } from '~/lib/i18n/runtime';

export type CompactPreviewRunState = 'idle' | 'static' | 'starting' | 'running' | 'stopping' | 'error';

function previewRunCopy(language?: string | null) {
  const i18n = getI18nInstance();

  return getWorkbenchSurfaceCopy(language ?? i18n.resolvedLanguage ?? i18n.language);
}

export function resolveCompactPreviewRunState({
  previewServerStatus,
  runtimeRunning = false,
  runtimeStarting = false,
}: {
  previewServerStatus: CompactPreviewRunState;
  runtimeRunning?: boolean;
  runtimeStarting?: boolean;
}): CompactPreviewRunState {
  if (previewServerStatus === 'stopping') {
    return 'stopping';
  }

  /*
   * The preview dev-server can fail to launch while the workspace pod itself stays RUNNING.
   * Surface the dev-server 'error' state (retry affordance) instead of masking it behind the
   * pod-derived `runtimeRunning` flag, which is independent of the preview server status.
   */
  if (previewServerStatus === 'error') {
    return 'error';
  }

  if (runtimeRunning || previewServerStatus === 'running') {
    return 'running';
  }

  if (runtimeStarting || previewServerStatus === 'starting') {
    return 'starting';
  }

  if (previewServerStatus === 'static') {
    return 'static';
  }

  return 'idle';
}

export function isCompactPreviewRunActive(state: CompactPreviewRunState) {
  return state === 'starting' || state === 'running' || state === 'static' || state === 'stopping';
}

export function compactPreviewRunAriaLabel(state: CompactPreviewRunState, language?: string | null) {
  const copy = previewRunCopy(language);

  switch (state) {
    case 'starting':
      return copy['workbenchSurface.run.startingAria'];
    case 'running':
    case 'static':
      return copy['workbenchSurface.run.stopAria'];
    case 'stopping':
      return copy['workbenchSurface.run.stoppingAria'];
    case 'error':
      return copy['workbenchSurface.run.retryAria'];
    case 'idle':
      return copy['workbenchSurface.run.runAria'];
  }

  return copy['workbenchSurface.run.runAria'];
}

export function compactPreviewRunText(state: CompactPreviewRunState, language?: string | null) {
  const copy = previewRunCopy(language);

  switch (state) {
    case 'starting':
      return copy['workbenchSurface.run.starting'];
    case 'running':
    case 'static':
      return copy['workbenchSurface.run.stop'];
    case 'stopping':
      return copy['workbenchSurface.run.stopping'];
    case 'error':
      return copy['workbenchSurface.run.retry'];
    case 'idle':
      return copy['workbenchSurface.run.run'];
  }

  return copy['workbenchSurface.run.run'];
}

export function compactPreviewRunIcon(state: CompactPreviewRunState) {
  if (isCompactPreviewRunActive(state)) {
    return 'i-ph:square-fill';
  }

  if (state === 'error') {
    return 'i-ph:warning-fill';
  }

  return 'i-ph:play-fill';
}
