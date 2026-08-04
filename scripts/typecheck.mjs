import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/*
 * Type-checks the repo as a set of independent tiers (the web app, the node
 * scripts, the two electron bundles, and every workspace package). Two modes:
 *
 *  - FULL (default): run every tier. This is what CI runs (`pnpm typecheck`) — the
 *    authoritative, complete check. Do NOT weaken it.
 *  - CHANGED (`--changed`): run only the tiers whose files are staged. This is what
 *    the pre-commit hook runs, so a `services/api`-only commit no longer pays for a
 *    ~10-minute `tsconfig.web.json` (web app) type-check that can time out under
 *    load and force `--no-verify`. CI stays the backstop for cross-tier breaks.
 */

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const timeoutMs = Number(process.env.TYPECHECK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
const tsc = resolve('node_modules/typescript/bin/tsc');
const changedOnly = process.argv.includes('--changed');

const tscTask = (name, project, triggers) => ({
  name,
  command: process.execPath,
  args: [tsc, '--project', project, '--noEmit', '--pretty', 'false'],
  triggers,
});

// The full tier list (FULL mode / CI). `triggers` = the staged-path prefixes that
// make a tier relevant in CHANGED mode. A prefix ending in `/` matches a directory.
const tasks = [
  tscTask('web app', 'tsconfig.web.json', [
    'app/',
    'functions/',
    'types/',
    'load-context.ts',
    'uno.config.ts',
    'vite.config.ts',
    'vite-electron.config.ts',
    'worker-configuration.d.ts',
    'tsconfig.web.json',
  ]),
  tscTask('node scripts', 'tsconfig.scripts.json', [
    'scripts/',
    'playwright.config.ts',
    'playwright.config.preview.ts',
    'tsconfig.scripts.json',
  ]),
  tscTask('electron main', 'electron/main/tsconfig.json', ['electron/']),
  tscTask('electron preload', 'electron/preload/tsconfig.json', ['electron/']),
  {
    name: 'workspace packages',
    command: 'pnpm',
    args: ['--recursive', '--if-present', '--filter', '!@vibecore/web', 'run', 'typecheck'],
    // Handled specially in CHANGED mode (scoped to the changed workspace dirs).
    triggers: ['apps/', 'services/', 'packages/', 'infra/'],
  },
];

/*
 * Any of these staged paths can affect MANY tiers (shared base tsconfig, root
 * deps, the workspace manifest, or this runner itself), so they force a FULL run
 * even in CHANGED mode — better to over-check than to miss a config-wide break.
 */
const RUN_ALL_TRIGGERS = [
  'tsconfig.json',
  'tsconfig.base.json',
  'tsconfig.package.node.json',
  'tsconfig.package.json',
  'package.json', // root only (matcher below is exact, so nested package.json is excluded)
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  'scripts/typecheck.mjs',
];

const WORKSPACE_ROOTS = ['apps/', 'services/', 'packages/', 'infra/'];

function stagedFiles() {
  const result = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' });

  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return null; // git unavailable → caller falls back to FULL
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const matchesTrigger = (file, trigger) => (trigger.endsWith('/') ? file.startsWith(trigger) : file === trigger);

/** The `apps|services|packages|infra/<name>` dir a file belongs to, else null. */
function workspaceDirOf(file) {
  for (const root of WORKSPACE_ROOTS) {
    if (file.startsWith(root)) {
      const name = file.slice(root.length).split('/')[0];

      return name ? `${root}${name}` : null;
    }
  }

  return null;
}

function selectTasks() {
  if (!changedOnly) {
    return tasks;
  }

  const files = stagedFiles();

  if (files === null) {
    console.log('[typecheck] could not read staged files — running the FULL check');

    return tasks;
  }

  if (files.length === 0) {
    console.log('[typecheck] no staged files — running the FULL check');

    return tasks;
  }

  if (files.some((file) => RUN_ALL_TRIGGERS.some((trigger) => matchesTrigger(file, trigger)))) {
    console.log('[typecheck] a shared config/manifest changed — running the FULL check');

    return tasks;
  }

  const selected = [];

  for (const task of tasks) {
    if (task.name === 'workspace packages') {
      // Scope to just the changed workspace package dirs (e.g. ./services/api).
      // A bare `infra/` change with no per-package typecheck is a no-op via --if-present.
      const dirs = [...new Set(files.map(workspaceDirOf).filter((dir) => dir && !WORKSPACE_ROOTS.includes(`${dir}/`)))];

      if (dirs.length > 0) {
        selected.push({
          name: `workspace packages (${dirs.join(', ')})`,
          command: 'pnpm',
          args: ['--if-present', ...dirs.flatMap((dir) => ['--filter', `./${dir}`]), 'run', 'typecheck'],
        });
      }

      continue;
    }

    if (task.triggers.some((trigger) => files.some((file) => matchesTrigger(file, trigger)))) {
      selected.push(task);
    }
  }

  return selected;
}

const selected = selectTasks();

if (changedOnly) {
  const names = selected.map((task) => task.name);
  console.log(`[typecheck] changed-only mode → ${names.length ? names.join(', ') : 'nothing to type-check'}`);
}

try {
  for (const task of selected) {
    await runTask(task);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[typecheck] ${message}`);
  process.exitCode = 1;
}

async function runTask(task) {
  const startedAt = Date.now();
  console.log(`[typecheck] ${task.name}`);

  await new Promise((resolveTask, rejectTask) => {
    const child = spawn(task.command, task.args, {
      detached: process.platform !== 'win32',
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });

    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      stopProcess(child);
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      rejectTask(error);
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);

      const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

      if (timedOut) {
        rejectTask(new Error(`${task.name} timed out after ${durationSeconds}s`));
        return;
      }

      if (code === 0) {
        console.log(`[typecheck] ${task.name} passed in ${durationSeconds}s`);
        resolveTask();

        return;
      }

      rejectTask(new Error(`${task.name} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

function stopProcess(child) {
  if (child.pid === undefined) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      child.kill('SIGTERM');
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    child.kill('SIGTERM');
  }

  setTimeout(() => {
    if (child.exitCode !== null || child.pid === undefined) {
      return;
    }

    try {
      if (process.platform === 'win32') {
        child.kill('SIGKILL');
      } else {
        process.kill(-child.pid, 'SIGKILL');
      }
    } catch {
      child.kill('SIGKILL');
    }
  }, 5000).unref();
}
