export const PROJECT_PANEL_DEFAULT_REFRESH_MS = 60_000;
export const PROJECT_PANEL_LIVE_REFRESH_MS = 15_000;

const LIVE_REFRESH_PANELS = new Set(['activity', 'logs', 'monitoring']);

export function projectPanelRefreshIntervalMs(panel: string): number {
  return LIVE_REFRESH_PANELS.has(panel) ? PROJECT_PANEL_LIVE_REFRESH_MS : PROJECT_PANEL_DEFAULT_REFRESH_MS;
}

export function formatProjectPanelRefreshCadence(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.max(1, Math.round(seconds / 60));

  return `${minutes}m`;
}

export function formatProjectPanelUpdatedLabel(value?: string | Date, now: Date = new Date()): string {
  if (!value) {
    return 'Waiting for first update';
  }

  const updatedAt = value instanceof Date ? value : new Date(value);
  const updatedAtMs = updatedAt.getTime();

  if (!Number.isFinite(updatedAtMs)) {
    return 'Waiting for first update';
  }

  const elapsedSeconds = Math.max(0, Math.round((now.getTime() - updatedAtMs) / 1000));

  if (elapsedSeconds < 5) {
    return 'Updated just now';
  }

  if (elapsedSeconds < 60) {
    return `Updated ${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return `Updated ${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `Updated ${elapsedHours}h ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);

  return `Updated ${elapsedDays}d ago`;
}
