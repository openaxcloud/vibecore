/**
 * RPL-IDE-001.7 — real RAM / CPU / Storage for the Resources panel.
 *
 * The figures are read from inside the workspace container itself rather than
 * from the Kubernetes metrics API, for three reasons:
 *
 * 1. **It is the truth the user cares about.** cgroup accounting is what the
 *    kernel enforces against the workspace; metrics-server reports a sampled,
 *    ~15-60 s-stale approximation of the same thing.
 * 2. **Storage has no metrics-server equivalent.** The PVC's real usage only
 *    exists as a filesystem statfs at the mount point.
 * 3. **No cluster dependency.** metrics-server is an optional GKE add-on; a
 *    panel that silently shows nothing when it is absent is not a panel.
 *
 * Everything that cannot be read honestly comes back `null` — never zero.
 * A zero would render as "0 % of 0 GB", which reads as a measurement rather
 * than as the absence of one.
 */
import { readFile, statfs } from 'node:fs/promises';

export interface WorkspaceMemoryUsage {
  usedBytes: number;

  /** `null` when the container is genuinely unlimited (cgroup reports `max`). */
  limitBytes: number | null;
  source: CgroupSource;
}

export interface WorkspaceCpuUsage {
  /**
   * Percentage of ONE core consumed over the sample window. With a 2-core
   * limit this legitimately goes up to 200.
   */
  usedPercent: number;

  /** Cores the cgroup quota allows, or `null` when unlimited. */
  limitCores: number | null;

  /** Width of the window the percentage was measured over. */
  sampleMs: number;
  source: CgroupSource;
}

export interface WorkspaceStorageUsage {
  usedBytes: number;
  totalBytes: number;

  /** Mount point the figures describe — the workspace root. */
  path: string;
}

export interface WorkspaceResourceSnapshot {
  capturedAt: string;
  memory: WorkspaceMemoryUsage | null;
  cpu: WorkspaceCpuUsage | null;
  storage: WorkspaceStorageUsage | null;
}

export type CgroupSource = 'cgroup-v2' | 'cgroup-v1';

/** Default CPU sample window. Long enough to be stable, short enough for a UI request. */
export const CPU_SAMPLE_MS = 200;

const CGROUP_V2 = '/sys/fs/cgroup';
const CGROUP_V1_MEMORY = '/sys/fs/cgroup/memory';
const CGROUP_V1_CPU = '/sys/fs/cgroup/cpu';
const CGROUP_V1_CPUACCT = '/sys/fs/cgroup/cpuacct';

export interface ResourceReaderDeps {
  readFile: (path: string) => Promise<string>;
  statfs: (path: string) => Promise<{ bsize: number; blocks: number; bavail: number }>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const defaultDeps: ResourceReaderDeps = {
  readFile: (path) => readFile(path, 'utf8'),
  statfs: async (path) => {
    const stats = await statfs(path);

    return { bsize: Number(stats.bsize), blocks: Number(stats.blocks), bavail: Number(stats.bavail) };
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

/** Parse a cgroup scalar file; `max`/`-1` mean "no limit", anything unparseable means "unknown". */
export function parseCgroupScalar(raw: string): number | null {
  const value = raw.trim();

  if (!value || value === 'max' || value === '-1') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** `cpu.max` is "<quota_usec> <period_usec>", or "max <period_usec>" when unlimited. */
export function parseCpuMax(raw: string): { quotaUsec: number | null; periodUsec: number } | null {
  const [quota, period] = raw.trim().split(/\s+/);

  if (!quota) {
    return null;
  }

  const periodUsec = Number(period);

  if (!Number.isFinite(periodUsec) || periodUsec <= 0) {
    return null;
  }

  return { quotaUsec: quota === 'max' ? null : parseCgroupScalar(quota), periodUsec };
}

/** Pull `usage_usec` out of a cgroup v2 `cpu.stat`. */
export function parseCpuStatUsageUsec(raw: string): number | null {
  for (const line of raw.split('\n')) {
    const [key, value] = line.trim().split(/\s+/);

    if (key === 'usage_usec') {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

async function readMemory(deps: ResourceReaderDeps): Promise<WorkspaceMemoryUsage | null> {
  try {
    const [current, max] = await Promise.all([
      deps.readFile(`${CGROUP_V2}/memory.current`),
      deps.readFile(`${CGROUP_V2}/memory.max`).catch(() => 'max'),
    ]);

    const usedBytes = parseCgroupScalar(current);

    if (usedBytes !== null) {
      return { usedBytes, limitBytes: parseCgroupScalar(max), source: 'cgroup-v2' };
    }
  } catch {
    // Fall through to the v1 hierarchy.
  }

  try {
    const [usage, limit] = await Promise.all([
      deps.readFile(`${CGROUP_V1_MEMORY}/memory.usage_in_bytes`),
      deps.readFile(`${CGROUP_V1_MEMORY}/memory.limit_in_bytes`).catch(() => 'max'),
    ]);

    const usedBytes = parseCgroupScalar(usage);

    if (usedBytes === null) {
      return null;
    }

    /*
     * cgroup v1 reports "unlimited" as a huge sentinel (PAGE_COUNTER_MAX scaled
     * by the page size) rather than as `max`, so anything at or beyond an
     * implausible ceiling is treated as no limit.
     */
    const rawLimit = parseCgroupScalar(limit);
    const limitBytes = rawLimit !== null && rawLimit < Number.MAX_SAFE_INTEGER / 2 ? rawLimit : null;

    return { usedBytes, limitBytes, source: 'cgroup-v1' };
  } catch {
    return null;
  }
}

async function readCpu(deps: ResourceReaderDeps, sampleMs: number): Promise<WorkspaceCpuUsage | null> {
  const sampleV2 = async () => {
    const stat = await deps.readFile(`${CGROUP_V2}/cpu.stat`);

    return parseCpuStatUsageUsec(stat);
  };

  const sampleV1 = async () => {
    const usageNs = parseCgroupScalar(await deps.readFile(`${CGROUP_V1_CPUACCT}/cpuacct.usage`));

    return usageNs === null ? null : usageNs / 1000;
  };

  for (const [source, sample, readLimit] of [
    [
      'cgroup-v2' as const,
      sampleV2,
      async () => {
        const parsed = parseCpuMax(await deps.readFile(`${CGROUP_V2}/cpu.max`));

        return parsed?.quotaUsec == null ? null : parsed.quotaUsec / parsed.periodUsec;
      },
    ],
    [
      'cgroup-v1' as const,
      sampleV1,
      async () => {
        const [quota, period] = await Promise.all([
          deps.readFile(`${CGROUP_V1_CPU}/cpu.cfs_quota_us`),
          deps.readFile(`${CGROUP_V1_CPU}/cpu.cfs_period_us`),
        ]);

        const quotaUsec = parseCgroupScalar(quota);
        const periodUsec = parseCgroupScalar(period);

        return quotaUsec === null || !periodUsec ? null : quotaUsec / periodUsec;
      },
    ],
  ] as const) {
    try {
      const startedAt = deps.now();
      const first = await sample();

      if (first === null) {
        continue;
      }

      await deps.sleep(sampleMs);

      const second = await sample();
      const elapsedMs = deps.now() - startedAt;

      if (second === null || elapsedMs <= 0) {
        continue;
      }

      /*
       * usage is cumulative microseconds of CPU time; (Δusage / Δwall) × 100
       * is the percentage of a single core burned over the window. Clamped at
       * zero because a cgroup can be recreated mid-sample and rewind the
       * counter, which would otherwise surface as a negative percentage.
       */
      const usedPercent = Math.max(0, ((second - first) / (elapsedMs * 1000)) * 100);
      const limitCores = await readLimit().catch(() => null);

      return {
        usedPercent: Math.round(usedPercent * 10) / 10,
        limitCores,
        sampleMs: elapsedMs,
        source,
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function readStorage(deps: ResourceReaderDeps, path: string): Promise<WorkspaceStorageUsage | null> {
  try {
    const { bsize, blocks, bavail } = await deps.statfs(path);

    if (!Number.isFinite(bsize) || !Number.isFinite(blocks) || blocks <= 0) {
      return null;
    }

    const totalBytes = blocks * bsize;

    /*
     * Used is derived from the blocks available to an UNPRIVILEGED writer, which
     * is what the workspace actually is. Using `bfree` instead would under-report
     * usage by the root-reserved slice and let the bar sit at 92 % while writes
     * were already failing.
     */
    const usedBytes = Math.max(0, totalBytes - bavail * bsize);

    return { usedBytes, totalBytes, path };
  } catch {
    return null;
  }
}

/**
 * Capture one snapshot. Every section degrades independently: a workspace on a
 * host without cgroups still reports its storage, and vice versa.
 */
export async function readWorkspaceResources(
  workspaceRoot: string,
  options: { sampleMs?: number; deps?: Partial<ResourceReaderDeps> } = {},
): Promise<WorkspaceResourceSnapshot> {
  const deps: ResourceReaderDeps = { ...defaultDeps, ...options.deps };
  const sampleMs = options.sampleMs ?? CPU_SAMPLE_MS;

  const [memory, cpu, storage] = await Promise.all([
    readMemory(deps),
    readCpu(deps, sampleMs),
    readStorage(deps, workspaceRoot),
  ]);

  return { capturedAt: new Date(deps.now()).toISOString(), memory, cpu, storage };
}
