export const PROJECT_PANEL_DEFAULT_REFRESH_MS = 60_000;
export const PROJECT_PANEL_LIVE_REFRESH_MS = 15_000;

const LIVE_REFRESH_PANELS = new Set(['activity', 'logs', 'monitoring']);

export function projectPanelRefreshIntervalMs(panel: string): number {
  return LIVE_REFRESH_PANELS.has(panel) ? PROJECT_PANEL_LIVE_REFRESH_MS : PROJECT_PANEL_DEFAULT_REFRESH_MS;
}

function projectPanelLocale(language?: string | null): 'en-US' | 'fr-FR' {
  return language?.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US';
}

export function formatProjectPanelRefreshCadence(milliseconds: number, language?: string | null): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  const number = new Intl.NumberFormat(projectPanelLocale(language));

  if (seconds < 60) {
    return language?.toLowerCase().startsWith('fr') ? `${number.format(seconds)} s` : `${number.format(seconds)}s`;
  }

  const minutes = Math.max(1, Math.round(seconds / 60));

  return language?.toLowerCase().startsWith('fr') ? `${number.format(minutes)} min` : `${number.format(minutes)}m`;
}

export function formatProjectPanelUpdatedLabel(
  value?: string | Date,
  now: Date = new Date(),
  language?: string | null,
): string {
  const french = language?.toLowerCase().startsWith('fr') ?? false;
  const number = new Intl.NumberFormat(projectPanelLocale(language));

  if (!value) {
    return french ? 'En attente de la première mise à jour' : 'Waiting for first update';
  }

  const updatedAt = value instanceof Date ? value : new Date(value);
  const updatedAtMs = updatedAt.getTime();

  if (!Number.isFinite(updatedAtMs)) {
    return french ? 'En attente de la première mise à jour' : 'Waiting for first update';
  }

  const elapsedSeconds = Math.max(0, Math.round((now.getTime() - updatedAtMs) / 1000));

  if (elapsedSeconds < 5) {
    return french ? 'Mis à jour à l’instant' : 'Updated just now';
  }

  if (elapsedSeconds < 60) {
    return french
      ? `Mis à jour il y a ${number.format(elapsedSeconds)} s`
      : `Updated ${number.format(elapsedSeconds)}s ago`;
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return french
      ? `Mis à jour il y a ${number.format(elapsedMinutes)} min`
      : `Updated ${number.format(elapsedMinutes)}m ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return french
      ? `Mis à jour il y a ${number.format(elapsedHours)} h`
      : `Updated ${number.format(elapsedHours)}h ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);

  return french ? `Mis à jour il y a ${number.format(elapsedDays)} j` : `Updated ${number.format(elapsedDays)}d ago`;
}
