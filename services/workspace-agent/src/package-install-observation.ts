import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';

const UNKNOWN = () => ({
  lockfile: 'unknown',
  nodeModules: 'unknown',
  dependencyCount: null as number | null,
  devDependencyCount: null as number | null,
  processActivity: 'unknown',
  leaderCpuMs: null as number | null,
  activitySampleAgeMs: null as number | null,
});

/** Fixed paths only; reject final-component symlinks, FIFO waits, whole-file reads and raw-data retention. */
async function boundedFile(path: string, limit: number): Promise<string | undefined> {
  // Missing flags must not silently become zero and follow a link or block on a special file.
  if (!(constants.O_NOFOLLOW > 0) || !(constants.O_NONBLOCK > 0)) {
    return undefined;
  }

  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    const stat = await file.stat();

    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > limit) {
      return undefined;
    }

    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);

    /*
     * A regular-file read may be short. Do not parse a valid JSON prefix as a complete manifest.
     * procfs reports size zero, so its complete line/record is validated by the parsers below.
     */
    if (bytesRead > limit || (stat.size > 0 && bytesRead !== stat.size)) {
      return undefined;
    }

    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    await file.close();
  }
}

async function presence(path: string, directory: boolean) {
  try {
    const stat = await lstat(path);
    return (directory ? stat.isDirectory() : stat.isFile()) ? 'present' : 'unknown';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'unknown';
  }
}

export function manifestCounts(text: string | undefined) {
  try {
    if (text === undefined) {
      return { dependencyCount: null, devDependencyCount: null };
    }

    const value = JSON.parse(text);

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error();
    }

    const count = (x: unknown) =>
      x === undefined
        ? 0
        : x && typeof x === 'object' && !Array.isArray(x)
          ? Math.min(Object.keys(x).length, 1000)
          : null;

    return { dependencyCount: count(value.dependencies), devDependencyCount: count(value.devDependencies) };
  } catch {
    return { dependencyCount: null, devDependencyCount: null };
  }
}

/** Linux stat has 52 fields including pid/comm. Reject truncated or unsupported records. */
function statFields(stat: string | undefined) {
  if (!stat || !/^[1-9]\d* \([^\n]*\) [A-Za-z] /.test(stat) || !stat.endsWith('\n')) {
    return undefined;
  }

  const fields = stat
    .slice(stat.lastIndexOf(')') + 2)
    .trim()
    .split(/\s+/);

  if (fields.length < 50 || !/^[A-Za-z]$/.test(fields[0]) || !fields.slice(1).every((x) => /^-?\d+$/.test(x))) {
    return undefined;
  }

  return fields;
}

/** /proc data describes the spawned leader only, never the full install tree or DNS. */
export function processSample(stat: string | undefined, sched: string | undefined) {
  const fields = statFields(stat);

  if (!fields) {
    return { processActivity: 'unknown', leaderCpuMs: null };
  }

  const state = fields[0];

  const processActivity =
    state === 'R'
      ? 'running'
      : state === 'S'
        ? 'sleeping'
        : state === 'D'
          ? 'uninterruptible'
          : state === 'Z'
            ? 'zombie'
            : 'unknown';

  // schedstat is a complete three-counter line; only its first counter is nanoseconds of leader CPU.
  const token = sched?.match(/^(\d{1,16})[ \t]+\d+[ \t]+\d+\n$/)?.[1];
  const ns = token === undefined ? NaN : Number(token);
  const leaderCpuMs = Number.isSafeInteger(ns) && ns >= 0 ? Math.min(Math.floor(ns / 1e6), 86_400_000) : null;

  return { processActivity, leaderCpuMs };
}

/** Best effort only. Nothing here is awaited by execution, termination or response delivery. */
export function observePackageInstall(cwd: string, command: string, args: readonly string[], pid?: number) {
  const value = UNKNOWN();

  let active = true;
  let sampledAt: number | undefined;
  let busy = false;
  let startIdentity: string | undefined;

  const timers: ReturnType<typeof setTimeout>[] = [];
  const eligible = ['npm', 'pnpm', 'yarn', 'bun'].includes(command) && ['install', 'add', 'ci'].includes(args[0]);

  if (eligible) {
    void Promise.all([
      Promise.all(
        ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'].map(
          (name) => presence(join(cwd, name), false),
        ),
      ),
      presence(join(cwd, 'node_modules'), true),
      boundedFile(join(cwd, 'package.json'), 65_536).catch(() => undefined),
    ])
      .then(([locks, modules, manifest]) => {
        if (!active) {
          return;
        }

        value.lockfile = locks.includes('present')
          ? 'present'
          : locks.every((x) => x === 'absent')
            ? 'absent'
            : 'unknown';
        value.nodeModules = modules;
        Object.assign(value, manifestCounts(manifest));
      })
      .catch(() => {
        // Observation failures must not affect command execution.
      });

    if (Number.isSafeInteger(pid) && pid! > 0) {
      const sample = async () => {
        if (!active || busy) {
          return;
        }

        busy = true;

        const sampleStartedAt = performance.now();

        try {
          const identity = (stat: string | undefined) => {
            if (!stat?.startsWith(`${pid} (`)) {
              return undefined;
            }

            const start = statFields(stat)?.[19];

            return start && /^\d+$/.test(start) ? start : undefined;
          };

          const stat = await boundedFile(`/proc/${pid}/stat`, 4096);

          if (!active) {
            return;
          }

          const currentIdentity = identity(stat);

          if (!currentIdentity || (startIdentity !== undefined && currentIdentity !== startIdentity)) {
            throw new Error();
          }

          startIdentity ??= currentIdentity;

          // Some supported kernels (including gVisor) omit schedstat. Keep independently validated state.
          const sched = await boundedFile(`/proc/${pid}/schedstat`, 1024).catch(() => undefined);

          if (!active) {
            return;
          }

          const after = await boundedFile(`/proc/${pid}/stat`, 4096);

          if (identity(after) !== startIdentity) {
            throw new Error();
          }

          if (active) {
            Object.assign(value, processSample(stat, sched));
            sampledAt = sampleStartedAt;
          }
        } catch {
          if (active) {
            value.processActivity = 'unknown';
            value.leaderCpuMs = null;
            sampledAt = undefined;
          }
        } finally {
          busy = false;
        }
      };

      // Six samples maximum; no continuous polling or timer/timeout extension.
      for (const delay of [0, 5000, 10000, 15000, 20000, 25000]) {
        const timer = setTimeout(() => {
          void sample();
        }, delay);
        timer.unref();
        timers.push(timer);
      }
    }
  }

  return {
    stop(exited = false) {
      if (active && exited) {
        value.processActivity = 'exited';
        value.leaderCpuMs = null;
        sampledAt = performance.now();
      }

      active = false;

      for (const timer of timers) {
        clearTimeout(timer);
      }
    },
    snapshot() {
      return {
        ...value,
        activitySampleAgeMs:
          sampledAt === undefined ? null : Math.min(Math.max(0, Math.floor(performance.now() - sampledAt)), 86_400_000),
      };
    },
  };
}
