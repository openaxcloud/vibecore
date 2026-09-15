import { describe, expect, it } from 'vitest';

import {
  parseCgroupScalar,
  parseCpuMax,
  parseCpuStatUsageUsec,
  readWorkspaceResources,
  type ResourceReaderDeps,
} from './workspace-resources.js';

function fakeDeps(files: Record<string, string>, overrides: Partial<ResourceReaderDeps> = {}): Partial<ResourceReaderDeps> {
  let clock = 1_000;

  return {
    readFile: async (path) => {
      if (!(path in files)) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }

      return files[path];
    },
    statfs: async () => {
      throw Object.assign(new Error('ENOSYS'), { code: 'ENOSYS' });
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    ...overrides,
  };
}

describe('parseCgroupScalar', () => {
  it('reads a byte count', () => {
    expect(parseCgroupScalar('123456\n')).toBe(123456);
  });

  it('treats max and -1 as no limit', () => {
    expect(parseCgroupScalar('max')).toBeNull();
    expect(parseCgroupScalar('-1')).toBeNull();
  });

  it('rejects garbage rather than coercing it to zero', () => {
    expect(parseCgroupScalar('not-a-number')).toBeNull();
    expect(parseCgroupScalar('')).toBeNull();
  });
});

describe('parseCpuMax', () => {
  it('reads a quota and period', () => {
    expect(parseCpuMax('200000 100000')).toEqual({ quotaUsec: 200000, periodUsec: 100000 });
  });

  it('reports an unlimited quota', () => {
    expect(parseCpuMax('max 100000')).toEqual({ quotaUsec: null, periodUsec: 100000 });
  });

  it('rejects a missing or zero period', () => {
    expect(parseCpuMax('200000')).toBeNull();
    expect(parseCpuMax('200000 0')).toBeNull();
  });
});

describe('parseCpuStatUsageUsec', () => {
  it('picks usage_usec out of the block', () => {
    expect(parseCpuStatUsageUsec('usage_usec 987654\nuser_usec 1\nsystem_usec 2\n')).toBe(987654);
  });

  it('returns null when the key is absent', () => {
    expect(parseCpuStatUsageUsec('nr_periods 0\n')).toBeNull();
  });
});

describe('readWorkspaceResources', () => {
  it('reads memory, CPU and storage from a cgroup v2 host', async () => {
    let cpuReads = 0;

    const deps = fakeDeps({
      '/sys/fs/cgroup/memory.current': '536870912',
      '/sys/fs/cgroup/memory.max': '2147483648',
      '/sys/fs/cgroup/cpu.max': '200000 100000',
      '/sys/fs/cgroup/cpu.stat': '',
    });

    const snapshot = await readWorkspaceResources('/workspace', {
      sampleMs: 200,
      deps: {
        ...deps,
        readFile: async (path) => {
          if (path === '/sys/fs/cgroup/cpu.stat') {
            // 100 ms of CPU burned across a 200 ms window ⇒ 50 % of one core.
            cpuReads += 1;
            return `usage_usec ${cpuReads === 1 ? 1_000_000 : 1_100_000}\n`;
          }

          return deps.readFile!(path);
        },
        statfs: async () => ({ bsize: 4096, blocks: 2_621_440, bavail: 1_310_720 }),
      },
    });

    expect(snapshot.memory).toEqual({ usedBytes: 536870912, limitBytes: 2147483648, source: 'cgroup-v2' });
    expect(snapshot.cpu).toMatchObject({ usedPercent: 50, limitCores: 2, source: 'cgroup-v2' });
    expect(snapshot.storage).toEqual({
      usedBytes: 5_368_709_120,
      totalBytes: 10_737_418_240,
      path: '/workspace',
    });
    expect(snapshot.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('falls back to the cgroup v1 hierarchy', async () => {
    let cpuReads = 0;

    const files: Record<string, string> = {
      '/sys/fs/cgroup/memory/memory.usage_in_bytes': '104857600',
      '/sys/fs/cgroup/memory/memory.limit_in_bytes': '1073741824',
      '/sys/fs/cgroup/cpu/cpu.cfs_quota_us': '100000',
      '/sys/fs/cgroup/cpu/cpu.cfs_period_us': '100000',
    };

    const base = fakeDeps(files);

    const snapshot = await readWorkspaceResources('/workspace', {
      sampleMs: 200,
      deps: {
        ...base,
        readFile: async (path) => {
          if (path === '/sys/fs/cgroup/cpuacct/cpuacct.usage') {
            cpuReads += 1;
            // Nanoseconds: 20 ms of CPU over a 200 ms window ⇒ 10 %.
            return `${cpuReads === 1 ? 1_000_000_000 : 1_020_000_000}\n`;
          }

          return base.readFile!(path);
        },
      },
    });

    expect(snapshot.memory).toEqual({ usedBytes: 104857600, limitBytes: 1073741824, source: 'cgroup-v1' });
    expect(snapshot.cpu).toMatchObject({ usedPercent: 10, limitCores: 1, source: 'cgroup-v1' });
  });

  it('treats the cgroup v1 unlimited sentinel as no limit', async () => {
    const snapshot = await readWorkspaceResources('/workspace', {
      deps: fakeDeps({
        '/sys/fs/cgroup/memory/memory.usage_in_bytes': '104857600',
        '/sys/fs/cgroup/memory/memory.limit_in_bytes': '9223372036854771712',
      }),
    });

    expect(snapshot.memory).toEqual({ usedBytes: 104857600, limitBytes: null, source: 'cgroup-v1' });
  });

  /**
   * The whole point of the null-vs-zero discipline: an unmeasurable resource
   * must not render as "0 % of 0 GB", which reads like a measurement.
   */
  it('returns null — never zero — for what it cannot measure', async () => {
    const snapshot = await readWorkspaceResources('/workspace', { deps: fakeDeps({}) });

    expect(snapshot.memory).toBeNull();
    expect(snapshot.cpu).toBeNull();
    expect(snapshot.storage).toBeNull();
  });

  it('degrades one section at a time', async () => {
    const snapshot = await readWorkspaceResources('/workspace', {
      deps: {
        ...fakeDeps({ '/sys/fs/cgroup/memory.current': '1048576', '/sys/fs/cgroup/memory.max': 'max' }),
        statfs: async () => ({ bsize: 1024, blocks: 1000, bavail: 400 }),
      },
    });

    expect(snapshot.memory).toEqual({ usedBytes: 1048576, limitBytes: null, source: 'cgroup-v2' });
    expect(snapshot.cpu).toBeNull();
    expect(snapshot.storage).toEqual({ usedBytes: 614400, totalBytes: 1024000, path: '/workspace' });
  });

  it('never reports a negative percentage when the CPU counter rewinds', async () => {
    let cpuReads = 0;

    const base = fakeDeps({ '/sys/fs/cgroup/cpu.max': 'max 100000' });

    const snapshot = await readWorkspaceResources('/workspace', {
      sampleMs: 200,
      deps: {
        ...base,
        readFile: async (path) => {
          if (path === '/sys/fs/cgroup/cpu.stat') {
            cpuReads += 1;
            return `usage_usec ${cpuReads === 1 ? 5_000_000 : 1_000_000}\n`;
          }

          return base.readFile!(path);
        },
      },
    });

    expect(snapshot.cpu).toMatchObject({ usedPercent: 0, limitCores: null });
  });
});
