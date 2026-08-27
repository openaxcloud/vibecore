export type MetricLabels = Record<string, string | number | boolean | undefined>;

interface MetricDefinition {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  buckets?: number[];
}

const defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];

export const platformMetricDefinitions: MetricDefinition[] = [
  {
    name: 'api_request_duration_seconds',
    help: 'API request latency by route and status.',
    type: 'histogram',
    buckets: defaultBuckets,
  },
  { name: 'api_requests_total', help: 'Total API requests.', type: 'counter' },
  { name: 'api_errors_total', help: 'Total API errors.', type: 'counter' },
  { name: 'auth_failures_total', help: 'Authentication failures.', type: 'counter' },
  { name: 'db_latency_seconds', help: 'Database operation latency.', type: 'histogram', buckets: defaultBuckets },
  { name: 'redis_latency_seconds', help: 'Redis operation latency.', type: 'histogram', buckets: defaultBuckets },
  { name: 'queue_depth', help: 'Queue depth by queue.', type: 'gauge' },
  { name: 'job_failures_total', help: 'Background job failures.', type: 'counter' },
  { name: 'workspace_starts_total', help: 'Workspace start attempts.', type: 'counter' },
  {
    name: 'workspace_start_latency_seconds',
    help: 'Workspace start latency.',
    type: 'histogram',
    buckets: defaultBuckets,
  },
  { name: 'workspace_failures_total', help: 'Workspace failures.', type: 'counter' },

  /*
   * Incremented by the api when a workspace start/restart reconciles the runtime
   * back toward the persisted ide-state. It was being incremented WITHOUT being
   * declared here: the registry throws on an unknown name, the throw landed in
   * the reconciliation's catch, and every successful reseed was logged as
   * « runtime reseed reconciliation failed ». Observed live on the audit env
   * while chasing project-creation defects — a log that says the opposite of
   * what happened is worse than no log at all.
   */
  {
    name: 'workspace_runtime_reseed_total',
    help: 'Workspace runtime reseeds reconciled from persisted ide-state, by reason.',
    type: 'counter',
  },
  {
    name: 'workspace_cold_start_pending_total',
    help: 'Workspace opens that returned "starting" while a cold start was still provisioning.',
    type: 'counter',
  },
  {
    name: 'workspace_cold_start_write_recovered_total',
    help: 'Workspace file writes that self-recovered after waiting out a cold start.',
    type: 'counter',
  },
  { name: 'active_workspaces', help: 'Active workspaces.', type: 'gauge' },
  { name: 'terminal_sessions', help: 'Open terminal sessions.', type: 'gauge' },
  { name: 'preview_requests_total', help: 'Preview proxy requests.', type: 'counter' },
  { name: 'ai_tokens_total', help: 'AI token usage.', type: 'counter' },
  { name: 'ai_provider_latency_seconds', help: 'AI provider latency.', type: 'histogram', buckets: defaultBuckets },
  { name: 'ai_provider_errors_total', help: 'AI provider errors.', type: 'counter' },
  { name: 'stripe_webhook_failures_total', help: 'Stripe webhook failures.', type: 'counter' },
  { name: 'resend_webhook_events_total', help: 'Resend transactional-email webhook events received.', type: 'counter' },
  { name: 'abuse_events_total', help: 'Abuse events.', type: 'counter' },
  { name: 'kubernetes_pod_failures_total', help: 'Kubernetes pod failures.', type: 'counter' },
  { name: 'node_pool_capacity', help: 'Node pool allocatable capacity.', type: 'gauge' },
  { name: 'pvc_usage_bytes', help: 'Persistent volume claim usage.', type: 'gauge' },
  { name: 'storage_usage_bytes', help: 'Object storage usage.', type: 'gauge' },
  {
    name: 'project_archive_objects_total',
    help: 'Project archive objects written by backend and kind.',
    type: 'counter',
  },
  { name: 'project_archive_bytes_total', help: 'Project archive bytes written by backend and kind.', type: 'counter' },
  {
    name: 'project_snapshot_restore_fallbacks_total',
    help: 'Snapshot restores served by durable fallback storage.',
    type: 'counter',
  },
  { name: 'project_snapshot_restore_failures_total', help: 'Snapshot restore failures by reason.', type: 'counter' },
  { name: 'cost_estimate_cents', help: 'Estimated platform cost in cents.', type: 'gauge' },
  { name: 'synthetic_check_success', help: 'Synthetic check success as 0 or 1.', type: 'gauge' },
  { name: 'backup_restore_dry_run_success', help: 'Backup restore dry run success as 0 or 1.', type: 'gauge' },
];

type SampleValue = {
  value: number;
  labels: Record<string, string>;
};

type HistogramValue = {
  labels: Record<string, string>;
  buckets: Map<number, number>;
  count: number;
  sum: number;
};

/**
 * Structured, JSON-serialisable view of a single metric. This is what the admin
 * Monitoring dashboard consumes: instead of re-scraping and re-parsing the
 * Prometheus text exposition, callers read the live registry objects directly.
 */
export type MetricSampleJson = {
  labels: Record<string, string>;
  value: number;
};

export type HistogramSampleJson = {
  labels: Record<string, string>;
  count: number;
  sum: number;

  /** Cumulative bucket counts keyed by the upper bound (`le`). */
  buckets: Array<{ le: number; count: number }>;

  /** Estimated quantiles from bucket interpolation (undefined when no observations). */
  p50?: number;
  p95?: number;
  p99?: number;

  /** Arithmetic mean of observations (sum / count), undefined when no observations. */
  avg?: number;
};

export type MetricJson = {
  name: string;
  help: string;
  type: MetricDefinition['type'];

  /** True when no sample has ever been recorded for this metric. */
  empty: boolean;

  /** Sum of all series values (counters/gauges) — a quick headline number. */
  total?: number;

  /** Per-label-set series for counters and gauges. */
  samples?: MetricSampleJson[];

  /** Per-label-set histogram series (histograms only). */
  histograms?: HistogramSampleJson[];
};

export type RegistrySnapshotJson = {
  generatedAt: string;
  metrics: MetricJson[];
};

/**
 * Estimate a quantile from cumulative histogram buckets via linear interpolation
 * within the containing bucket. Returns undefined when there are no observations.
 * Mirrors the intent of Prometheus `histogram_quantile` for a single series.
 */
function estimateQuantile(buckets: Array<{ le: number; count: number }>, total: number, quantile: number) {
  if (total <= 0 || buckets.length === 0) {
    return undefined;
  }

  const rank = quantile * total;

  let previousLe = 0;
  let previousCount = 0;

  for (const bucket of buckets) {
    if (bucket.count >= rank) {
      const bucketCount = bucket.count - previousCount;

      if (bucketCount <= 0) {
        return bucket.le;
      }

      const fraction = (rank - previousCount) / bucketCount;

      return previousLe + (bucket.le - previousLe) * fraction;
    }

    previousLe = bucket.le;
    previousCount = bucket.count;
  }

  return buckets[buckets.length - 1]?.le;
}

export class PrometheusRegistry {
  #definitions = new Map<string, MetricDefinition>();
  #samples = new Map<string, SampleValue>();
  #histograms = new Map<string, HistogramValue>();

  constructor(definitions: MetricDefinition[] = platformMetricDefinitions) {
    for (const definition of definitions) {
      this.#definitions.set(definition.name, definition);
    }
  }

  increment(name: string, labels: MetricLabels = {}, value = 1) {
    this.#assertType(name, 'counter');

    const key = this.#key(name, labels);
    const sample = this.#samples.get(key) ?? { value: 0, labels: normalizeLabels(labels) };
    sample.value += value;
    this.#samples.set(key, sample);
  }

  setGauge(name: string, labels: MetricLabels = {}, value: number) {
    this.#assertType(name, 'gauge');
    this.#samples.set(this.#key(name, labels), { value, labels: normalizeLabels(labels) });
  }

  observe(name: string, labels: MetricLabels = {}, value: number) {
    const definition = this.#assertType(name, 'histogram');
    const key = this.#key(name, labels);
    const buckets = definition.buckets ?? defaultBuckets;

    const histogram =
      this.#histograms.get(key) ??
      ({
        labels: normalizeLabels(labels),
        buckets: new Map(buckets.map((bucket) => [bucket, 0])),
        count: 0,
        sum: 0,
      } satisfies HistogramValue);

    for (const bucket of buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) ?? 0) + 1);
      }
    }
    histogram.count += 1;
    histogram.sum += value;
    this.#histograms.set(key, histogram);
  }

  render() {
    const lines: string[] = [];

    for (const definition of this.#definitions.values()) {
      lines.push(`# HELP ${definition.name} ${definition.help}`);
      lines.push(`# TYPE ${definition.name} ${definition.type}`);

      if (definition.type === 'histogram') {
        const entries = [...this.#histograms.entries()].filter(
          ([key]) => key === definition.name || key.startsWith(`${definition.name}{`),
        );

        if (entries.length === 0) {
          lines.push(...renderEmptyHistogram(definition));
          continue;
        }

        for (const [, histogram] of entries) {
          for (const [bucket, count] of histogram.buckets) {
            lines.push(`${definition.name}_bucket${labelString({ ...histogram.labels, le: bucket })} ${count}`);
          }
          lines.push(`${definition.name}_bucket${labelString({ ...histogram.labels, le: '+Inf' })} ${histogram.count}`);
          lines.push(`${definition.name}_sum${labelString(histogram.labels)} ${histogram.sum}`);
          lines.push(`${definition.name}_count${labelString(histogram.labels)} ${histogram.count}`);
        }
        continue;
      }

      const entries = [...this.#samples.entries()].filter(

        /*
         * Match the bare name too: a sample recorded with NO labels keys to the
         * plain metric name (labelString({})===''), and `name{`-only filtering
         * silently dropped those samples from the exposition.
         */
        ([key]) => key === definition.name || key.startsWith(`${definition.name}{`),
      );

      if (entries.length === 0) {
        lines.push(`${definition.name} 0`);
        continue;
      }

      for (const [, sample] of entries) {
        lines.push(`${definition.name}${labelString(sample.labels)} ${sample.value}`);
      }
    }

    return `${lines.join('\n')}\n`;
  }

  /**
   * Structured JSON snapshot of every defined metric with its current values and
   * per-label-set breakdowns. Reads the live in-memory series directly (no text
   * re-parse), so the admin dashboard sees exactly what `/metrics` exposes.
   */
  toJSON(): RegistrySnapshotJson {
    const metrics: MetricJson[] = [];

    for (const definition of this.#definitions.values()) {
      if (definition.type === 'histogram') {
        const entries = [...this.#histograms.entries()].filter(
          ([key]) => key === definition.name || key.startsWith(`${definition.name}{`),
        );

        const histograms: HistogramSampleJson[] = entries.map(([, histogram]) => {
          const buckets = [...histogram.buckets.entries()]
            .sort(([left], [right]) => left - right)
            .map(([le, count]) => ({ le, count }));

          // Include the implicit +Inf bucket (total count) for quantile math.
          const cumulative = [...buckets, { le: Number.POSITIVE_INFINITY, count: histogram.count }];

          return {
            labels: histogram.labels,
            count: histogram.count,
            sum: histogram.sum,
            buckets,
            p50: estimateQuantile(cumulative, histogram.count, 0.5),
            p95: estimateQuantile(cumulative, histogram.count, 0.95),
            p99: estimateQuantile(cumulative, histogram.count, 0.99),
            avg: histogram.count > 0 ? histogram.sum / histogram.count : undefined,
          };
        });

        metrics.push({
          name: definition.name,
          help: definition.help,
          type: definition.type,
          empty: histograms.length === 0 || histograms.every((h) => h.count === 0),
          histograms,
        });
        continue;
      }

      const entries = [...this.#samples.entries()].filter(
        ([key]) => key === definition.name || key.startsWith(`${definition.name}{`),
      );

      const samples: MetricSampleJson[] = entries.map(([, sample]) => ({
        labels: sample.labels,
        value: sample.value,
      }));

      metrics.push({
        name: definition.name,
        help: definition.help,
        type: definition.type,
        empty: samples.length === 0,
        total: samples.reduce((accumulator, sample) => accumulator + sample.value, 0),
        samples,
      });
    }

    return { generatedAt: new Date().toISOString(), metrics };
  }

  #assertType(name: string, type: MetricDefinition['type']) {
    const definition = this.#definitions.get(name);

    if (!definition) {
      throw new Error(`Unknown metric: ${name}`);
    }

    if (definition.type !== type) {
      throw new Error(`Metric ${name} is ${definition.type}, not ${type}`);
    }

    return definition;
  }

  #key(name: string, labels: MetricLabels) {
    const normalized = normalizeLabels(labels);
    return `${name}${labelString(normalized)}`;
  }
}

export function createPrometheusRegistry() {
  return new PrometheusRegistry();
}

export function nowSeconds() {
  return Date.now() / 1000;
}

export function durationSeconds(start: number) {
  return Math.max(0, Date.now() / 1000 - start);
}

export function createSentryReporter(input: { dsn?: string; environment?: string; release?: string } = {}) {
  const dsn = input.dsn ?? process.env.SENTRY_INGEST_URL ?? process.env.SENTRY_DSN;
  return {
    async captureException(error: unknown, context: Record<string, unknown> = {}) {
      if (!dsn) {
        return;
      }

      const payload = {
        event_id: randomEventId(),
        level: 'error',
        platform: 'node',
        environment: input.environment ?? process.env.NODE_ENV ?? 'development',
        release: input.release ?? process.env.SENTRY_RELEASE,
        exception: {
          values: [
            {
              type: error instanceof Error ? error.name : 'Error',
              value: error instanceof Error ? error.message : String(error),
            },
          ],
        },
        contexts: context,
        timestamp: new Date().toISOString(),
      };

      /*
       * Bound the report so a slow/unreachable Sentry endpoint can't leak a
       * socket per error during an error storm (no default fetch timeout).
       */
      await fetch(dsn, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined);
    },
  };
}

function renderEmptyHistogram(definition: MetricDefinition) {
  const buckets = definition.buckets ?? defaultBuckets;
  return [
    ...buckets.map((bucket) => `${definition.name}_bucket${labelString({ le: bucket })} 0`),
    `${definition.name}_bucket${labelString({ le: '+Inf' })} 0`,
    `${definition.name}_sum 0`,
    `${definition.name}_count 0`,
  ];
}

function normalizeLabels(labels: MetricLabels) {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(labels).sort(([left], [right]) => left.localeCompare(right))) {
    if (value !== undefined) {
      normalized[key] = String(value);
    }
  }

  return normalized;
}

function labelString(labels: Record<string, string | number>) {
  const entries = Object.entries(labels);

  if (entries.length === 0) {
    return '';
  }

  /*
   * Escape per the Prometheus text exposition format: backslash, double-quote AND
   * newline. Omitting \n let a user-controlled label value (e.g. provider/model
   * from /ai/record-usage, validated only as a non-empty string) embed a literal
   * newline that terminates the metric line and injects arbitrary fake series
   * into the /metrics scrape output.
   */
  const escapeLabelValue = (value: string | number) =>
    String(value).replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"');

  return `{${entries.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`).join(',')}}`;
}

function randomEventId() {
  return Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32);
}
