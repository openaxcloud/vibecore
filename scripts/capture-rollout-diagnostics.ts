import { execFile, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { constants } from 'node:os';
import { promisify } from 'node:util';

type RecordValue = Record<string, unknown>;
type Scalar = string | number | boolean;
type Fields = Record<string, Scalar>;

export interface ResourceStatus {
  kind: string;
  name: string;
  status: Fields;
  conditions: Fields[];
  containers: Array<{ status: Fields; state: Record<string, Fields>; lastState: Record<string, Fields> }>;
}

export interface Snapshot {
  resources?: ResourceStatus[];
  captureError?: string;
}

export interface CaptureOptions {
  command: string[];
  namespace: string;
  release: string;
  output: string;
  intervalMs?: number;
  snapshot?: () => Promise<Snapshot>;
  // Injection points exercise actual filesystem failures without exhausting a runner.
  write?: (fd: number, value: string) => void;
  warn?: (value: string) => void;
}

const exec = promisify(execFile);
const record = (value: unknown): RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function fields(value: unknown, keys: string[]): Fields {
  const source = record(value);
  const result: Fields = {};
  for (const key of keys) {
    const item = source[key];
    if (typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) {
      result[key] = item;
    }
  }
  return result;
}

function states(value: unknown): Record<string, Fields> {
  const source = record(value);
  const result: Record<string, Fields> = {};
  for (const state of ['running', 'waiting', 'terminated']) {
    if (source[state] !== undefined) {
      result[state] = fields(source[state], ['reason', 'exitCode', 'signal', 'startedAt', 'finishedAt']);
    }
  }
  return result;
}

export function summarize(items: unknown, release: string): ResourceStatus[] {
  const result: ResourceStatus[] = [];
  for (const raw of list(items)) {
    const item = record(raw);
    const name = record(item.metadata).name;
    if (
      typeof name !== 'string' ||
      !name.startsWith(`${release}-vibecore-platform-`) ||
      typeof item.kind !== 'string' ||
      !['Pod', 'Job', 'Deployment'].includes(item.kind)
    ) {
      continue;
    }
    const status = record(item.status);
    result.push({
      kind: item.kind,
      name,
      status: fields(status, [
        'phase',
        'replicas',
        'readyReplicas',
        'availableReplicas',
        'updatedReplicas',
        'active',
        'succeeded',
        'failed',
      ]),
      conditions: list(status.conditions).map((value) => fields(value, ['type', 'status', 'reason'])),
      containers: [...list(status.initContainerStatuses), ...list(status.containerStatuses)].map((value) => {
        const container = record(value);
        return {
          status: fields(container, ['name', 'ready', 'restartCount']),
          state: states(container.state),
          lastState: states(container.lastState),
        };
      }),
    });
  }
  return result.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export async function snapshot(namespace: string, release: string): Promise<Snapshot> {
  try {
    const result = await exec(
      'kubectl',
      ['--request-timeout=8s', '-n', namespace, 'get', 'pods,jobs,deployments', '-o', 'json'],
      {
        timeout: 10_000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const data = record(JSON.parse(result.stdout) as unknown);
    if (!Array.isArray(data.items)) {
      return { captureError: 'InvalidKubernetesResponse' };
    }
    return { resources: summarize(data.items, release) };
  } catch {
    // Do not persist arbitrary stderr/messages, which may contain credentials.
    return { captureError: 'KubernetesReadFailed' };
  }
}

export async function capture(options: CaptureOptions): Promise<number> {
  if (!options.command.length) {
    throw new Error('A wrapped command is required');
  }
  const interval = options.intervalMs ?? 15_000;
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error('The capture interval must be positive');
  }
  mkdirSync(dirname(options.output), { recursive: true });
  const fd = openSync(options.output, 'w');
  const write = options.write ?? ((file: number, value: string) => writeFileSync(file, value));
  const warn = options.warn ?? ((value: string) => console.error(value));
  const takeSnapshot = options.snapshot ?? (() => snapshot(options.namespace, options.release));
  let writable = true;
  const append = (payload: unknown): void => {
    if (writable) {
      write(fd, JSON.stringify({ time: new Date().toISOString(), ...record(payload) }) + '\n');
    }
  };
  try {
    // All filesystem preconditions are checked before starting Helm.
    append(await takeSnapshot());
    const child = spawn(options.command[0], options.command.slice(1), { stdio: 'inherit' });
    const done = new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve(code ?? (signal ? 128 + constants.signals[signal] : 1)));
    });
    const exit = done.then((code) => ({ finished: true as const, code }));
    const safelyAppend = (payload: unknown): void => {
      try {
        append(payload);
      } catch {
        writable = false;
        warn('::warning::Rollout evidence write failed; waiting for Helm to finish. The artifact is incomplete.');
      }
    };
    safelyAppend({ commandStarted: true });
    while (true) {
      let timer: NodeJS.Timeout | undefined;
      const sample = new Promise<{ finished: false }>((resolve) => {
        timer = setTimeout(() => resolve({ finished: false }), interval);
      });
      const outcome = await Promise.race([exit, sample]).finally(() => clearTimeout(timer));
      if (outcome.finished) {
        // Helm has completed, including its atomic rollback. A failed evidence
        // write must not hide Helm success from UPGRADE_APPLIED in the workflow.
        safelyAppend(await takeSnapshot().catch(() => ({ captureError: 'SnapshotFailed' })));
        safelyAppend({ commandExitCode: outcome.code, evidenceComplete: writable });
        return outcome.code;
      }
      // Snapshot or disk errors after spawn never detach a running upgrade.
      safelyAppend(await takeSnapshot().catch(() => ({ captureError: 'SnapshotFailed' })));
    }
  } finally {
    // Failure to close diagnostics must not replace a completed Helm exit code.
    try {
      closeSync(fd);
    } catch {
      warn('::warning::Unable to close rollout evidence.');
    }
  }
}
