type JsonObject = Record<string, unknown>;

const phases = ['Pending', 'Running', 'Succeeded', 'Failed', 'Unknown'] as const;

const reasons = [
  'Completed',
  'Error',
  'OOMKilled',
  'ContainerCannotRun',
  'ContainerStatusUnknown',
  'DeadlineExceeded',
  'Evicted',
  'NodeLost',
  'Shutdown',
  'UnexpectedAdmissionError',
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'ErrImageNeverPull',
  'InvalidImageName',
  'CreateContainerConfigError',
  'CreateContainerError',
  'RunContainerError',
  'ContainerCreating',
  'PodInitializing',
  'StartError',
] as const;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function category<T extends string>(value: unknown, allowed: readonly T[]): T | 'absent' | 'other' {
  if (value === undefined || value === null) {
    return 'absent';
  }

  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : 'other';
}

function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function containerState(value: unknown) {
  const state = object(value);
  const terminated = object(state?.terminated);
  const waiting = object(state?.waiting);

  return {
    state: terminated ? 'terminated' : waiting ? 'waiting' : object(state?.running) ? 'running' : 'absent',
    reason: category(terminated?.reason ?? waiting?.reason, reasons),
    exitCode: integer(terminated?.exitCode, -2147483648, 2147483647),
    signal: integer(terminated?.signal, 0, 64),
  };
}

/** Fixed categories and bounded numbers only; no pod IDs, names, messages, spec or logs. */
export function podFailureDiagnostic(value: unknown) {
  const pod = object(value);
  const status = object(pod?.status);
  const containers = Array.isArray(status?.containerStatuses) ? status.containerStatuses : [];

  return {
    phase: category(status?.phase, phases),
    reason: category(status?.reason, reasons),
    deletionTimestampPresent: object(pod?.metadata)?.deletionTimestamp != null,
    omittedContainers: Math.min(Math.max(0, containers.length - 4), 2147483647),
    containers: containers.slice(0, 4).map((value) => {
      const container = object(value);

      return {
        restartCount: integer(container?.restartCount, 0, 2147483647),
        current: containerState(container?.state),
        previous: containerState(container?.lastState),
      };
    }),
  };
}
