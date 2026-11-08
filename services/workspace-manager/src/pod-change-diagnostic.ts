import { isDeepStrictEqual } from 'node:util';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

/** Fixed categories only. Neither Kubernetes errors nor manifest values may escape. */
export function podChangeDiagnostic(current: unknown, desired: unknown) {
  const unavailable = { baselineAvailable: false, categories: [] as string[] };

  const annotation = object(object(object(current)?.metadata)?.annotations)?.[
    'kubectl.kubernetes.io/last-applied-configuration'
  ];

  if (typeof annotation !== 'string' || annotation.length > 1_048_576) {
    return unavailable;
  }

  let baseline: unknown;

  try {
    baseline = JSON.parse(annotation);
  } catch {
    return unavailable;
  }

  const before = object(object(baseline)?.spec);
  const after = object(object(desired)?.spec);

  if (!before || !after) {
    return unavailable;
  }

  const containers = (spec: JsonObject) =>
    [
      ...(Array.isArray(spec.containers) ? spec.containers : []),
      ...(Array.isArray(spec.initContainers) ? spec.initContainers : []),
    ].map((container) => object(container) ?? {});
  const fields = (spec: JsonObject, keys: string[]) =>
    containers(spec).map((container) => keys.map((key) => container[key]));

  const categories: string[] = [];

  const groups = {
    image: ['image', 'imagePullPolicy'],
    env: ['env', 'envFrom'],
    resources: ['resources'],
    securityContext: ['securityContext'],
    mounts: ['volumeMounts', 'volumeDevices'],
    command: ['command', 'args', 'workingDir'],
    probes: ['readinessProbe', 'livenessProbe', 'startupProbe'],
    ports: ['ports'],
  };

  for (const [category, keys] of Object.entries(groups)) {
    if (!isDeepStrictEqual(fields(before, keys), fields(after, keys))) {
      categories.push(category);
    }
  }

  for (const [category, keys] of Object.entries({
    volumes: ['volumes'],
    securityContext: ['securityContext'],
    scheduling: ['nodeSelector', 'affinity', 'tolerations', 'schedulerName'],
    runtime: ['runtimeClassName', 'serviceAccountName'],
    network: ['hostNetwork', 'dnsPolicy', 'dnsConfig'],
  })) {
    if (keys.some((key) => !isDeepStrictEqual(before[key], after[key])) && !categories.includes(category)) {
      categories.push(category);
    }
  }

  if (containers(before).length !== containers(after).length) {
    categories.push('containers');
  }

  if (!categories.includes('env')) {
    return { baselineAvailable: true, categories };
  }

  const sortedEnv = (spec: JsonObject) =>
    containers(spec).map((container) => ({
      env: Array.isArray(container.env)
        ? [...container.env].sort((a, b) => String(object(a)?.name).localeCompare(String(object(b)?.name)))
        : container.env,
      envFrom: container.envFrom,
    }));

  return {
    baselineAvailable: true,
    categories,
    envOrderingOnly: isDeepStrictEqual(sortedEnv(before), sortedEnv(after)),
  };
}
