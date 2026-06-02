export type CompactPreviewRunState = 'idle' | 'static' | 'starting' | 'running' | 'stopping' | 'error';

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

  if (runtimeRunning || previewServerStatus === 'running') {
    return 'running';
  }

  if (runtimeStarting || previewServerStatus === 'starting') {
    return 'starting';
  }

  if (previewServerStatus === 'static') {
    return 'static';
  }

  if (previewServerStatus === 'error') {
    return 'error';
  }

  return 'idle';
}

export function isCompactPreviewRunActive(state: CompactPreviewRunState) {
  return state === 'starting' || state === 'running' || state === 'static' || state === 'stopping';
}

export function compactPreviewRunAriaLabel(state: CompactPreviewRunState) {
  switch (state) {
    case 'starting':
      return 'Starting project';
    case 'running':
    case 'static':
      return 'Stop running';
    case 'stopping':
      return 'Stopping project';
    case 'error':
      return 'Retry run';
    case 'idle':
      return 'Run project';
  }

  return 'Run project';
}

export function compactPreviewRunText(state: CompactPreviewRunState) {
  switch (state) {
    case 'starting':
      return 'Starting';
    case 'running':
    case 'static':
      return 'Stop';
    case 'stopping':
      return 'Stopping';
    case 'error':
      return 'Retry';
    case 'idle':
      return 'Run';
  }

  return 'Run';
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
