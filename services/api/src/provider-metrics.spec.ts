import { describe, expect, it } from 'vitest';

import { aggregateProviderMetrics, percentile } from './provider-metrics.js';

describe('percentile (nearest-rank)', () => {
  it('returns 0 for an empty set', () => {
    expect(percentile([], 0.95)).toBe(0);
  });

  it('returns the max for a tiny sample (honest: too few points)', () => {
    expect(percentile([10, 20, 30], 0.95)).toBe(30);
  });

  it('picks the nearest-rank value at ceil(p*n)', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    // ceil(0.95*100)=95 → index 94 → value 95
    expect(percentile(values, 0.95)).toBe(95);
    // ceil(0.5*100)=50 → index 49 → value 50
    expect(percentile(values, 0.5)).toBe(50);
  });

  it('is order-independent (sorts internally) and rounds', () => {
    expect(percentile([30, 10, 20.4], 0.95)).toBe(30);
  });
});

describe('aggregateProviderMetrics', () => {
  it('rolls up p95 latency + error rate per provider', () => {
    const samples = [
      ...Array.from({ length: 20 }, (_, i) => ({ provider: 'openai', latencyMs: (i + 1) * 10, errored: i < 2 })),
      { provider: 'anthropic', latencyMs: 500, errored: false },
      { provider: 'anthropic', latencyMs: 700, errored: true },
    ];

    const out = aggregateProviderMetrics(samples);

    // Busiest provider first.
    expect(out.map((r) => r.provider)).toEqual(['openai', 'anthropic']);

    const openai = out.find((r) => r.provider === 'openai')!;
    expect(openai.sampleCount).toBe(20);
    // ceil(0.95*20)=19 → index 18 → 19*10 = 190
    expect(openai.p95LatencyMs).toBe(190);
    // 2 errored / 20 = 10.0%
    expect(openai.errorRatePct).toBe(10);

    const anthropic = out.find((r) => r.provider === 'anthropic')!;
    expect(anthropic.sampleCount).toBe(2);
    expect(anthropic.errorRatePct).toBe(50);
  });

  it('returns an empty array for no samples', () => {
    expect(aggregateProviderMetrics([])).toEqual([]);
  });

  it('rounds the error rate to one decimal', () => {
    // 1 errored / 3 = 33.333% → 33.3
    const out = aggregateProviderMetrics([
      { provider: 'p', latencyMs: 1, errored: true },
      { provider: 'p', latencyMs: 2, errored: false },
      { provider: 'p', latencyMs: 3, errored: false },
    ]);
    expect(out[0].errorRatePct).toBe(33.3);
  });
});
