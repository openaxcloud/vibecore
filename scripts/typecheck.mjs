import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { dependancesManquantes, messageInstallation } from './verifier-installation.mjs';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const timeoutMs = Number(process.env.TYPECHECK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
const tsc = resolve('node_modules/typescript/bin/tsc');

// Avant tsc, et pas après : une dépendance déclarée mais absente fait rendre à
// TypeScript « Cannot find module », qui envoie chercher un défaut de code là
// où il n'y en a pas. Le 2026-09-04, `esbuild` manquait sur `main` vierge et le
// pré-commit accusait un fichier inchangé depuis des semaines.
const manquantes = dependancesManquantes(JSON.parse(readFileSync('package.json', 'utf8')));
const alerte = messageInstallation(manquantes);

if (alerte) {
  console.error(alerte);
  process.exit(1);
}

const tasks = [
  {
    name: 'web app',
    command: process.execPath,
    args: [tsc, '--project', 'tsconfig.web.json', '--noEmit', '--pretty', 'false'],
  },
  {
    name: 'node scripts',
    command: process.execPath,
    args: [tsc, '--project', 'tsconfig.scripts.json', '--noEmit', '--pretty', 'false'],
  },
  {
    name: 'electron main',
    command: process.execPath,
    args: [tsc, '--project', 'electron/main/tsconfig.json', '--noEmit', '--pretty', 'false'],
  },
  {
    name: 'electron preload',
    command: process.execPath,
    args: [tsc, '--project', 'electron/preload/tsconfig.json', '--noEmit', '--pretty', 'false'],
  },
  {
    name: 'workspace packages',
    command: 'pnpm',
    args: ['--recursive', '--if-present', '--filter', '!@vibecore/web', 'run', 'typecheck'],
  },
];

try {
  for (const task of tasks) {
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
