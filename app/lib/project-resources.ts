export type ProjectResourceKey = 'cpu' | 'memory' | 'storage';

export type ProjectResourceMetric =
  | {
      key: ProjectResourceKey;
      label: string;
      availability: 'available';
      value: string;
      detail: string;
      measuredBytes?: number;
      measuredMillicores?: number;
      measuredPercentage?: number;
    }
  | {
      key: ProjectResourceKey;
      label: string;
      availability: 'unavailable';
      value: 'Unavailable';
      detail: string;
    };

export interface ProjectResourcesSnapshot {
  metrics: [ProjectResourceMetric, ProjectResourceMetric, ProjectResourceMetric];
  runtimeStatus?: string;
  runtimeStatusAvailable: boolean;
  workspaceId?: string;
}

type UnknownRecord = Record<string, unknown>;

interface ByteMeasurement {
  usedBytes: number;
  limitBytes?: number;
}

interface PercentageMeasurement {
  percentage: number;
}

interface CpuMeasurement {
  millicores?: number;
  percentage?: number;
  limitMillicores?: number;
}

const BYTE_MULTIPLIERS = {
  b: 1,
  k: 1000,
  kb: 1000,
  ki: 1024,
  kib: 1024,
  m: 1000 ** 2,
  mb: 1000 ** 2,
  mi: 1024 ** 2,
  mib: 1024 ** 2,
  g: 1000 ** 3,
  gb: 1000 ** 3,
  gi: 1024 ** 3,
  gib: 1024 ** 3,
  t: 1000 ** 4,
  tb: 1000 ** 4,
  ti: 1024 ** 4,
  tib: 1024 ** 4,
} as const;

const MAX_CPU_MILLICORES = 1_000_000_000;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim();

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    return undefined;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstParsed<T>(values: unknown[], parser: (value: unknown) => T | undefined): T | undefined {
  for (const value of values) {
    const parsed = parser(value);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function parsePercentage(value: unknown): number | undefined {
  const normalized = typeof value === 'string' ? value.trim().replace(/%$/, '').trim() : value;
  const percentage = finiteNumber(normalized);

  if (percentage === undefined || percentage < 0 || percentage > 100) {
    return undefined;
  }

  return percentage;
}

function parseByteQuantity(value: unknown, assumedMultiplier?: number): number | undefined {
  if (typeof value === 'number') {
    if (assumedMultiplier === undefined || !Number.isFinite(value) || value < 0) {
      return undefined;
    }

    const bytes = Math.round(value * assumedMultiplier);

    return Number.isSafeInteger(bytes) ? bytes : undefined;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*([kmgt]?i?b?|bytes?)?$/);

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2]?.replace(/^bytes?$/, 'b');
  const multiplier = unit ? BYTE_MULTIPLIERS[unit as keyof typeof BYTE_MULTIPLIERS] : assumedMultiplier;

  if (!Number.isFinite(amount) || amount < 0 || multiplier === undefined) {
    return undefined;
  }

  const bytes = Math.round(amount * multiplier);

  return Number.isSafeInteger(bytes) ? bytes : undefined;
}

function parseCpuMillicores(value: unknown, multiplier: number): number | undefined {
  const amount = finiteNumber(value);

  if (amount === undefined || amount < 0) {
    return undefined;
  }

  const millicores = amount * multiplier;

  return Number.isFinite(millicores) && millicores <= MAX_CPU_MILLICORES ? millicores : undefined;
}

function parseCpuNanocores(value: unknown): number | undefined {
  return parseCpuMillicores(value, 1 / 1_000_000);
}

function parseCpuQuantity(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return parseCpuMillicores(value, 1000);
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const match = value
    .trim()
    .toLowerCase()
    .match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(n|u|m|cores?|cpus?)?$/);

  if (!match) {
    return undefined;
  }

  const multiplier = match[2] === 'n' ? 1 / 1_000_000 : match[2] === 'u' ? 1 / 1000 : match[2] === 'm' ? 1 : 1000;

  return parseCpuMillicores(match[1], multiplier);
}

function humanizeRuntimeStatus(status: string): string {
  return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPercentage(percentage: number): string {
  if (percentage > 0 && percentage < 0.01) {
    return '<0.01%';
  }

  const precision = percentage > 0 && percentage < 1 ? 2 : 1;

  return `${percentage.toFixed(precision).replace(/\.0+$|(?<=\.\d)0+$/, '')}%`;
}

function formatCpuMillicores(millicores: number): string {
  if (millicores < 1000) {
    if (millicores > 0 && millicores < 0.01) {
      return '<0.01 mCPU';
    }

    const precision = millicores > 0 && millicores < 1 ? 2 : Number.isInteger(millicores) ? 0 : 1;

    return `${millicores.toFixed(precision).replace(/\.0$/, '')} mCPU`;
  }

  const cores = millicores / 1000;
  const formatted = cores.toFixed(cores >= 10 ? 0 : 2).replace(/\.0+$|(?<=\.\d)0+$/, '');

  return `${formatted} ${cores === 1 ? 'CPU' : 'CPUs'}`;
}

export function projectResourcesUrl(projectId: string, workspaceId?: string): string {
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/ide-panel/monitoring`;

  if (!workspaceId) {
    return endpoint;
  }

  return `${endpoint}?workspaceId=${encodeURIComponent(workspaceId)}`;
}

export function formatProjectResourceBytes(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error('Resource byte counts must be non-negative safe integers.');
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'] as const;

  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 ? 0 : 1;

  return `${value.toFixed(precision).replace(/\.0$/, '')} ${units[unitIndex]}`;
}

function unavailableMetric(key: ProjectResourceKey, label: string, detail: string): ProjectResourceMetric {
  return {
    key,
    label,
    availability: 'unavailable',
    value: 'Unavailable',
    detail,
  };
}

function nestedRecords(root: UnknownRecord, keys: string[]): UnknownRecord[] {
  return keys.map((key) => asRecord(root[key])).filter((record): record is UnknownRecord => Boolean(record));
}

function telemetryRoots(data: UnknownRecord, runtimeStatus?: UnknownRecord): UnknownRecord[] {
  const roots: UnknownRecord[] = [];
  const seen = new Set<UnknownRecord>();

  const add = (value: unknown) => {
    const record = asRecord(value);

    if (record && !seen.has(record)) {
      seen.add(record);
      roots.push(record);
    }
  };

  const addContainer = (container: UnknownRecord | undefined) => {
    if (!container) {
      return;
    }

    for (const key of ['telemetry', 'metrics', 'resourceMetrics', 'resourceUsage', 'resources']) {
      add(container[key]);
    }

    add(container);
  };

  const runtimeMetadata = asRecord(runtimeStatus?.metadata);
  const managerWorkspace = asRecord(runtimeMetadata?.managerWorkspace);
  const managerMetadata = asRecord(managerWorkspace?.metadata);

  addContainer(runtimeStatus);
  addContainer(runtimeMetadata);
  addContainer(managerWorkspace);
  addContainer(managerMetadata);

  for (const container of [runtimeStatus, runtimeMetadata, managerWorkspace, managerMetadata]) {
    const resources = asRecord(container?.resources);

    addContainer(resources);
  }

  addContainer(data);

  for (const key of ['telemetry', 'metrics', 'resourceMetrics', 'resourceUsage', 'resources']) {
    addContainer(asRecord(data[key]));
  }

  return roots;
}

function cpuMeasurement(roots: UnknownRecord[]): CpuMeasurement | undefined {
  for (const root of roots) {
    const candidates = [
      ...nestedRecords(root, ['cpu', 'compute']).map((record) => ({ record, nested: true })),
      { record: root, nested: false },
    ];

    for (const { record: candidate, nested } of candidates) {
      const percentage = firstParsed(
        [
          ...(nested ? [candidate.usagePercent, candidate.usedPercent, candidate.utilizationPercent] : []),
          candidate.cpuUsagePercent,
          candidate.cpuUsedPercent,
          candidate.cpuUtilizationPercent,
        ],
        parsePercentage,
      );
      const millicores = firstParsed(
        [
          ...(nested ? [candidate.usageMillicores, candidate.usedMillicores] : []),
          candidate.cpuUsageMillicores,
          candidate.cpuUsedMillicores,
        ],
        (value) => parseCpuMillicores(value, 1),
      );
      const cores = firstParsed(
        [
          ...(nested ? [candidate.usageCores, candidate.usedCores] : []),
          candidate.cpuUsageCores,
          candidate.cpuUsedCores,
        ],
        (value) => parseCpuMillicores(value, 1000),
      );
      const nanocores = firstParsed(
        [
          ...(nested
            ? [candidate.usageNanocores, candidate.usageNanoCores, candidate.usedNanocores, candidate.usedNanoCores]
            : []),
          candidate.cpuUsageNanocores,
          candidate.cpuUsageNanoCores,
        ],
        parseCpuNanocores,
      );
      const quantity = nested
        ? firstParsed([candidate.usage, candidate.used, candidate.current], parseCpuQuantity)
        : undefined;

      const measuredMillicores = millicores ?? cores ?? nanocores ?? quantity;

      if (percentage === undefined && measuredMillicores === undefined) {
        continue;
      }

      const limitMillicores =
        firstParsed(
          [...(nested ? [candidate.limitMillicores, candidate.capacityMillicores] : []), candidate.cpuLimitMillicores],
          (value) => parseCpuMillicores(value, 1),
        ) ??
        firstParsed(
          [...(nested ? [candidate.limitCores, candidate.capacityCores] : []), candidate.cpuLimitCores],
          (value) => parseCpuMillicores(value, 1000),
        ) ??
        (nested ? firstParsed([candidate.limit, candidate.capacity], parseCpuQuantity) : undefined);

      return {
        percentage,
        millicores: measuredMillicores,
        limitMillicores: limitMillicores && limitMillicores > 0 ? limitMillicores : undefined,
      };
    }
  }

  return undefined;
}

function cpuMetric(roots: UnknownRecord[]): ProjectResourceMetric {
  const measurement = cpuMeasurement(roots);

  if (!measurement) {
    return unavailableMetric('cpu', 'CPU', 'Live CPU usage is not exposed by the current monitoring API.');
  }

  if (measurement.millicores !== undefined) {
    const limitDetail = measurement.limitMillicores
      ? ` Runtime-reported limit: ${formatCpuMillicores(measurement.limitMillicores)}.`
      : '';

    return {
      key: 'cpu',
      label: 'CPU',
      availability: 'available',
      value: formatCpuMillicores(measurement.millicores),
      measuredMillicores: measurement.millicores,
      measuredPercentage: measurement.percentage,
      detail: `Live CPU use measured by the runtime.${limitDetail}`,
    };
  }

  return {
    key: 'cpu',
    label: 'CPU',
    availability: 'available',
    value: formatPercentage(measurement.percentage!),
    measuredPercentage: measurement.percentage,
    detail: 'Live CPU utilization measured by the runtime.',
  };
}

const BYTE_FIELD_MULTIPLIERS: ReadonlyArray<readonly [readonly string[], number]> = [
  [['usedBytes', 'usageBytes', 'consumedBytes', 'currentBytes'], 1],
  [['usedKiB', 'usageKiB'], 1024],
  [['usedMiB', 'usageMiB'], 1024 ** 2],
  [['usedGiB', 'usageGiB'], 1024 ** 3],
];

const LIMIT_FIELD_MULTIPLIERS: ReadonlyArray<readonly [readonly string[], number]> = [
  [['limitBytes', 'capacityBytes', 'quotaBytes', 'totalBytes'], 1],
  [['limitKiB', 'capacityKiB', 'totalKiB'], 1024],
  [['limitMiB', 'capacityMiB', 'totalMiB'], 1024 ** 2],
  [['limitGiB', 'capacityGiB', 'totalGiB'], 1024 ** 3],
];

function parsedFieldGroup(
  record: UnknownRecord,
  groups: ReadonlyArray<readonly [readonly string[], number]>,
): number | undefined {
  for (const [fields, multiplier] of groups) {
    const parsed = firstParsed(
      fields.map((field) => record[field]),
      (value) => parseByteQuantity(value, multiplier),
    );

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function byteMeasurement(
  roots: UnknownRecord[],
  nestedKeys: string[],
  flattenedPrefixes: string[],
  additionalUsedSuffixes: string[] = [],
): ByteMeasurement | PercentageMeasurement | undefined {
  for (const root of roots) {
    const candidates = [
      ...nestedRecords(root, nestedKeys).map((record) => ({ record, nested: true })),
      { record: root, nested: false },
    ];

    for (const { record: candidate, nested } of candidates) {
      const flattenedUsedFields = flattenedPrefixes.flatMap((prefix) => [
        `${prefix}UsedBytes`,
        `${prefix}UsageBytes`,
        `${prefix}ConsumedBytes`,
        ...additionalUsedSuffixes.map((suffix) => `${prefix}${suffix.slice(0, 1).toUpperCase()}${suffix.slice(1)}`),
      ]);
      const usedBytes =
        (nested ? parsedFieldGroup(candidate, BYTE_FIELD_MULTIPLIERS) : undefined) ??
        (nested
          ? firstParsed([candidate.usage, candidate.used, candidate.current], (value) => parseByteQuantity(value, 1))
          : undefined) ??
        firstParsed(
          [...(nested ? additionalUsedSuffixes : []), ...flattenedUsedFields].map((field) => candidate[field]),
          (value) => parseByteQuantity(value, 1),
        );

      if (usedBytes !== undefined) {
        const flattenedLimitFields = flattenedPrefixes.flatMap((prefix) => [
          `${prefix}LimitBytes`,
          `${prefix}CapacityBytes`,
          `${prefix}QuotaBytes`,
          `${prefix}TotalBytes`,
        ]);
        const limitBytes =
          (nested ? parsedFieldGroup(candidate, LIMIT_FIELD_MULTIPLIERS) : undefined) ??
          (nested
            ? firstParsed([candidate.limit, candidate.capacity, candidate.total], (value) =>
                parseByteQuantity(value, 1),
              )
            : undefined) ??
          firstParsed(
            flattenedLimitFields.map((field) => candidate[field]),
            (value) => parseByteQuantity(value, 1),
          );

        return { usedBytes, limitBytes: limitBytes && limitBytes > 0 ? limitBytes : undefined };
      }

      const percentageFields = flattenedPrefixes.flatMap((prefix) => [
        `${prefix}UsagePercent`,
        `${prefix}UsedPercent`,
        `${prefix}UtilizationPercent`,
      ]);
      const percentage = firstParsed(
        [
          ...(nested ? [candidate.usagePercent, candidate.usedPercent, candidate.utilizationPercent] : []),
          ...percentageFields.map((field) => candidate[field]),
        ],
        parsePercentage,
      );

      if (percentage !== undefined) {
        return { percentage };
      }
    }
  }

  return undefined;
}

function byteMetric(
  key: 'memory' | 'storage',
  label: 'RAM' | 'Storage',
  measurement: ByteMeasurement | PercentageMeasurement | undefined,
): ProjectResourceMetric | undefined {
  if (!measurement) {
    return undefined;
  }

  if ('percentage' in measurement) {
    return {
      key,
      label,
      availability: 'available',
      value: formatPercentage(measurement.percentage),
      measuredPercentage: measurement.percentage,
      detail: `Live ${label} utilization measured by the runtime.`,
    };
  }

  const value = measurement.limitBytes
    ? `${formatProjectResourceBytes(measurement.usedBytes)} / ${formatProjectResourceBytes(measurement.limitBytes)}`
    : formatProjectResourceBytes(measurement.usedBytes);
  const detail = measurement.limitBytes
    ? `${formatPercentage((measurement.usedBytes / measurement.limitBytes) * 100)} of the runtime-reported ${label} limit.`
    : `Live ${label} use measured by the runtime.`;

  return {
    key,
    label,
    availability: 'available',
    value,
    measuredBytes: measurement.usedBytes,
    detail,
  };
}

function storageFilesMetric(files: unknown): ProjectResourceMetric {
  if (!Array.isArray(files)) {
    return unavailableMetric(
      'storage',
      'Storage',
      'The monitoring response did not include measured runtime storage or project-file sizes.',
    );
  }

  let totalBytes = 0;

  for (const file of files) {
    const sizeBytes = parseByteQuantity(asRecord(file)?.sizeBytes, 1);

    if (sizeBytes === undefined) {
      return unavailableMetric(
        'storage',
        'Storage',
        'One or more project files had no reliable size, so a partial total is not shown.',
      );
    }

    totalBytes += sizeBytes;

    if (!Number.isSafeInteger(totalBytes)) {
      return unavailableMetric('storage', 'Storage', 'The measured project-file total exceeded a safe byte count.');
    }
  }

  const fileLabel = `${files.length} indexed project ${files.length === 1 ? 'file' : 'files'}`;

  return {
    key: 'storage',
    label: 'Storage',
    availability: 'available',
    value: formatProjectResourceBytes(totalBytes),
    measuredBytes: totalBytes,
    detail: `${fileLabel}. Runtime disk capacity is not exposed by the monitoring API.`,
  };
}

/**
 * Converts the Monitoring envelope into the compact top-bar Resources view.
 * Only explicitly named usage/utilization fields are accepted as telemetry;
 * plan tiers, requested resources and limits without a measurement never make
 * a metric appear available.
 */
export function resolveProjectResources(payload: unknown): ProjectResourcesSnapshot {
  const envelope = asRecord(payload);

  if (!envelope) {
    throw new Error('The resources response was not a valid monitoring payload.');
  }

  if (envelope.panel !== undefined && envelope.panel !== 'monitoring') {
    throw new Error('The resources endpoint returned data for a different panel.');
  }

  if (envelope.status === 'error') {
    const serverMessage = nonEmptyString(asRecord(envelope.error)?.message);
    throw new Error(serverMessage ?? 'The monitoring service could not load project resources.');
  }

  const data = asRecord(envelope.data);

  if (!data) {
    throw new Error('The monitoring response did not include resource data.');
  }

  const runtimeStatusPayload = asRecord(data.runtimeStatus);
  const runtimeStatus = nonEmptyString(runtimeStatusPayload?.status);

  const workspaceId =
    nonEmptyString(data.selectedWorkspaceId) ??
    nonEmptyString(data.workspaceId) ??
    nonEmptyString(runtimeStatusPayload?.id);

  const roots = telemetryRoots(data, runtimeStatusPayload);

  const memory = byteMetric(
    'memory',
    'RAM',
    byteMeasurement(roots, ['memory', 'ram'], ['memory', 'ram'], ['workingSetBytes', 'rssBytes']),
  );
  const storage = byteMetric(
    'storage',
    'Storage',
    byteMeasurement(roots, ['storage', 'disk', 'filesystem'], ['storage', 'disk', 'filesystem'], ['sizeBytes']),
  );

  return {
    metrics: [
      cpuMetric(roots),
      memory ?? unavailableMetric('memory', 'RAM', 'Live RAM usage is not exposed by the current monitoring API.'),
      storage ?? storageFilesMetric(data.files),
    ],
    runtimeStatus: runtimeStatus ? humanizeRuntimeStatus(runtimeStatus) : undefined,
    runtimeStatusAvailable: Boolean(runtimeStatus),
    workspaceId,
  };
}
