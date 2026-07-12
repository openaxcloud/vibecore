/**
 * F18 — pure aggregation of per-request AI provider outcomes into the p95 latency
 * + error-rate figures the admin Providers panel renders. Kept pure + store-agnostic
 * (fed a plain row array) so it is unit-testable and identical across the Prisma and
 * in-memory test stores.
 */

/** One recorded provider request (the fields the aggregation needs). */
export interface ProviderMetricSample {
  provider: string;
  latencyMs: number;
  errored: boolean;
}

/** Per-provider rollup over the sampled window. */
export interface ProviderMetricSummary {
  provider: string;
  sampleCount: number;
  /** p95 of latencyMs across successful+failed requests, rounded to an integer ms. */
  p95LatencyMs: number;
  /** Percentage of sampled requests that errored, 0–100, one decimal. */
  errorRatePct: number;
}

/**
 * Nearest-rank p95: sort ascending, pick the value at ceil(0.95 * n) − 1. For n < 20
 * this returns the max sample (honest: too few points for a real p95). Returns 0 for
 * an empty set. Nearest-rank (not interpolation) keeps the result a real observed
 * latency and is deterministic.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));

  return Math.round(sorted[index]);
}

/**
 * Roll samples up per provider. Providers are returned sorted by descending sample
 * count (busiest first) then name, so the panel order is stable. Latency uses p95;
 * error rate is errored/total × 100 rounded to one decimal.
 */
export function aggregateProviderMetrics(samples: ProviderMetricSample[]): ProviderMetricSummary[] {
  const byProvider = new Map<string, { latencies: number[]; errors: number }>();

  for (const sample of samples) {
    const entry = byProvider.get(sample.provider) ?? { latencies: [], errors: 0 };
    entry.latencies.push(sample.latencyMs);

    if (sample.errored) {
      entry.errors += 1;
    }

    byProvider.set(sample.provider, entry);
  }

  return [...byProvider.entries()]
    .map(([provider, entry]) => {
      const sampleCount = entry.latencies.length;
      return {
        provider,
        sampleCount,
        p95LatencyMs: percentile(entry.latencies, 0.95),
        errorRatePct: sampleCount === 0 ? 0 : Math.round((entry.errors / sampleCount) * 1000) / 10,
      };
    })
    .sort((a, b) => b.sampleCount - a.sampleCount || a.provider.localeCompare(b.provider));
}
