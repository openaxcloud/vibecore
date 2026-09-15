/**
 * RPL-IDE-001.7 — presentation maths for the Resources panel.
 *
 * Kept separate from the component so the rules that actually matter — never
 * render an unmeasured value as a number, never divide by an absent limit — are
 * unit-testable rather than buried in JSX.
 */

export interface WorkspaceMemoryUsage {
  usedBytes: number;
  limitBytes: number | null;
  source: string;
}

export interface WorkspaceCpuUsage {
  usedPercent: number;
  limitCores: number | null;
  sampleMs: number;
  source: string;
}

export interface WorkspaceStorageUsage {
  usedBytes: number;
  totalBytes: number;
  path: string;
}

export interface WorkspaceResourceSnapshot {
  capturedAt: string;
  memory: WorkspaceMemoryUsage | null;
  cpu: WorkspaceCpuUsage | null;
  storage: WorkspaceStorageUsage | null;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Human byte size. Uses 1024 steps because these are memory and filesystem
 * figures, which the kernel reports in binary units — showing 512 MB for
 * 536 870 912 bytes matches what `free` and `df -h` say inside the workspace.
 */
export function formatBytes(bytes: number, locale?: string): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }

  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const fractionDigits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ${BYTE_UNITS[unit]}`;
}

/**
 * Fill ratio for a bar, as a 0-100 number, or `null` when there is nothing to
 * be a ratio *of*. A missing limit is not "0 % full" and must not draw a bar.
 */
export function usageRatio(used: number, limit: number | null | undefined): number | null {
  if (limit === null || limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return null;
  }

  return Math.max(0, Math.min(100, (used / limit) * 100));
}

/** Severity band driving the bar's colour. */
export function usageTone(ratio: number | null): 'unknown' | 'normal' | 'warning' | 'critical' {
  if (ratio === null) {
    return 'unknown';
  }

  if (ratio >= 90) {
    return 'critical';
  }

  if (ratio >= 75) {
    return 'warning';
  }

  return 'normal';
}

/**
 * CPU is reported as a percentage of ONE core, so with a 2-core quota it
 * legitimately reaches 200 %. The bar is therefore filled against the quota
 * rather than against 100.
 */
export function cpuRatio(cpu: WorkspaceCpuUsage | null): number | null {
  if (!cpu) {
    return null;
  }

  if (cpu.limitCores === null) {
    // Unlimited: show the raw single-core percentage, capped for the bar only.
    return Math.max(0, Math.min(100, cpu.usedPercent));
  }

  return usageRatio(cpu.usedPercent, cpu.limitCores * 100);
}

/** "12.4 % of 2 cores", or "12.4 %" when the quota is unlimited. */
export function formatCpu(cpu: WorkspaceCpuUsage | null, locale: string | undefined, ofCores: (n: number) => string) {
  if (!cpu) {
    return null;
  }

  const percent = `${cpu.usedPercent.toLocaleString(locale, { maximumFractionDigits: 1 })} %`;

  return cpu.limitCores === null ? percent : `${percent} · ${ofCores(cpu.limitCores)}`;
}
