import { describe, expect, it } from 'vitest';

import { cpuRatio, formatBytes, formatCpu, usageRatio, usageTone } from './workspace-resources-format';

describe('formatBytes', () => {
  it('uses binary steps so the figures match df/free inside the workspace', () => {
    expect(formatBytes(536_870_912, 'en-US')).toBe('512 MB');
    expect(formatBytes(1_073_741_824, 'en-US')).toBe('1.00 GB');
    expect(formatBytes(512, 'en-US')).toBe('512 B');
  });

  it('drops decimals once the number is large enough not to need them', () => {
    expect(formatBytes(120 * 1024 * 1024, 'en-US')).toBe('120 MB');
    expect(formatBytes(12 * 1024 * 1024, 'en-US')).toBe('12.0 MB');
  });

  it('refuses to render a nonsense size as a number', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('usageRatio', () => {
  it('computes a percentage against a real limit', () => {
    expect(usageRatio(512, 1024)).toBe(50);
  });

  it('clamps rather than overflowing the bar', () => {
    expect(usageRatio(2048, 1024)).toBe(100);
  });

  /** The core rule: an absent limit is not "0 % full". */
  it('returns null when there is no limit to be a ratio of', () => {
    expect(usageRatio(512, null)).toBeNull();
    expect(usageRatio(512, undefined)).toBeNull();
    expect(usageRatio(512, 0)).toBeNull();
  });
});

describe('usageTone', () => {
  it('bands the severity', () => {
    expect(usageTone(10)).toBe('normal');
    expect(usageTone(80)).toBe('warning');
    expect(usageTone(95)).toBe('critical');
  });

  it('marks an unknown ratio as unknown, not as healthy', () => {
    expect(usageTone(null)).toBe('unknown');
  });
});

describe('cpuRatio', () => {
  it('fills against the quota, since usage is a percentage of one core', () => {
    // 100 % of one core on a 2-core quota is half the allowance.
    expect(cpuRatio({ usedPercent: 100, limitCores: 2, sampleMs: 200, source: 'cgroup-v2' })).toBe(50);
  });

  it('caps the bar but keeps the reading when the quota is unlimited', () => {
    expect(cpuRatio({ usedPercent: 340, limitCores: null, sampleMs: 200, source: 'cgroup-v2' })).toBe(100);
  });

  it('returns null with no reading at all', () => {
    expect(cpuRatio(null)).toBeNull();
  });
});

describe('formatCpu', () => {
  const cores = (n: number) => `${n} cores`;

  it('states the quota alongside the percentage', () => {
    expect(formatCpu({ usedPercent: 12.4, limitCores: 2, sampleMs: 200, source: 'cgroup-v2' }, 'en-US', cores)).toBe(
      '12.4 % · 2 cores',
    );
  });

  it('omits a quota it does not have', () => {
    expect(formatCpu({ usedPercent: 12.4, limitCores: null, sampleMs: 200, source: 'cgroup-v2' }, 'en-US', cores)).toBe(
      '12.4 %',
    );
  });

  it('returns null rather than a fabricated zero', () => {
    expect(formatCpu(null, 'en-US', cores)).toBeNull();
  });
});
