export function estimateETA(elapsedMs: number, progressPercent: number): number | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return null;
  }

  if (!Number.isFinite(progressPercent) || progressPercent <= 0 || progressPercent >= 100) {
    return null;
  }

  const progress = progressPercent / 100;

  return Math.max(0, (elapsedMs / progress) * (1 - progress));
}

export function formatDuration(milliseconds: number | null | undefined) {
  if (!Number.isFinite(milliseconds ?? Number.NaN) || !milliseconds || milliseconds <= 0) {
    return 'calculating';
  }

  const totalSeconds = Math.ceil(milliseconds / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
