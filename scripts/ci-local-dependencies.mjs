import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** @typedef {{version: number, token: string, project: string, composeFile: string, envFile: string, stateFile: string, selectedServices: string[], owned: boolean}} Scope */
const root = fileURLToPath(new URL('../', import.meta.url));
const services = ['postgres', 'redis', 'mailpit'];

const bindings = [
  ['postgres', '5432', 'POSTGRES_PORT'],
  ['redis', '6379', 'REDIS_PORT'],
  ['mailpit', '1025', 'SMTP_PORT'],
  ['mailpit', '8025', 'MAILPIT_UI_PORT'],
];

/**
 * New identity for every invocation, including matrix jobs and reruns.
 * @param {{temporaryDirectory?: string, composeFile?: string, selectedServices?: string[]}} [options]
 * @returns {Promise<Scope>}
 */
export async function createScope({
  temporaryDirectory = process.env.RUNNER_TEMP || tmpdir(),
  composeFile = join(root, 'docker-compose.dev.yml'),
  selectedServices = services,
} = {}) {
  if (!selectedServices.length || selectedServices.some((service) => !services.includes(service))) {
    throw new Error('Unsupported CI dependency service');
  }

  const token = randomUUID().replaceAll('-', '');
  const project = `vibecore-ci-${token}`;
  const directory = join(resolve(temporaryDirectory), project);
  await mkdir(directory, { mode: 0o700 });

  const scope = {
    version: 1,
    token,
    project,
    composeFile: resolve(composeFile),
    envFile: join(directory, 'compose.env'),
    stateFile: join(directory, 'scope.json'),
    selectedServices,
    owned: false,
  };
  await writeFile(scope.envFile, '', { mode: 0o600 });
  await saveScope(scope);

  return scope;
}

/** @param {Scope} scope */
async function saveScope(scope) {
  await writeFile(scope.stateFile, `${JSON.stringify(scope)}\n`, { mode: 0o600 });
}

/** @param {string} path @returns {Promise<Scope>} */
export async function loadScope(path) {
  /** @type {Scope} */
  const scope = JSON.parse(await readFile(path, 'utf8'));

  if (
    scope.version !== 1 ||
    !/^[a-f0-9]{32}$/.test(scope.token) ||
    scope.project !== `vibecore-ci-${scope.token}` ||
    resolve(path) !== scope.stateFile ||
    basename(dirname(scope.stateFile)) !== scope.project ||
    scope.envFile !== join(dirname(scope.stateFile), 'compose.env') ||
    !Array.isArray(scope.selectedServices) ||
    !scope.selectedServices.length ||
    scope.selectedServices.some((service) => !services.includes(service)) ||
    typeof scope.owned !== 'boolean'
  ) {
    throw new Error('Invalid CI dependency ownership record; refusing Docker operations');
  }

  return scope;
}

/** @param {Scope} scope @param {string[]} args @param {{capture?: boolean}} [options] */
export async function docker(scope, args, { capture = false } = {}) {
  // Client ports exported after startup must never change Compose's publication config.
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, COMPOSE_PROJECT_NAME: scope.project };

  for (const [, , variable] of bindings) {
    env[variable] = '127.0.0.1:0';
  }

  try {
    const result = await execute('docker', args, { env, maxBuffer: 20 * 1024 * 1024, timeout: 240000 });

    if (!capture && result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    return result.stdout;
  } catch (error) {
    const failure = /** @type {NodeJS.ErrnoException & {stdout?: string, stderr?: string}} */ (error);

    if (failure.stdout) {
      process.stdout.write(failure.stdout);
    }

    if (failure.stderr) {
      process.stderr.write(failure.stderr);
    }

    throw new Error(`Docker ${args[0]} failed (${failure.code ?? 'unknown exit'})`, { cause: error });
  }
}

/** @param {Scope} scope @param {string[]} args @param {{capture?: boolean}} [options] */
function compose(scope, args, options) {
  return docker(
    scope,
    ['compose', '-p', scope.project, '--env-file', scope.envFile, '-f', scope.composeFile, ...args],
    options,
  );
}

/** @param {Scope} scope */
export async function diagnostics(scope) {
  if (!scope.owned) {
    return;
  }

  // Read only this invocation's resources. A diagnostic failure is visible and does not replace the original failure.
  for (const args of [
    ['ps', '--all'],
    ['logs', '--no-color', '--tail=120', ...scope.selectedServices],
  ]) {
    try {
      await compose(scope, args);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}

/** @param {Scope} scope */
export async function cleanup(scope) {
  if (!scope.owned) {
    return;
  }

  await compose(scope, ['down', '-v']);
  scope.owned = false;
  await saveScope(scope);
}

/** @param {Scope} scope */
async function claim(scope) {
  // UUIDs avoid accidental reuse; this check also refuses a pre-existing project rather than adopting it.
  for (const args of [
    ['ps', '-aq'],
    ['volume', 'ls', '-q'],
    ['network', 'ls', '-q'],
  ]) {
    const existing = await docker(scope, [...args, '--filter', `label=com.docker.compose.project=${scope.project}`], {
      capture: true,
    });

    if (existing.trim()) {
      throw new Error('CI dependency project already exists; refusing to adopt or delete it');
    }
  }
  scope.owned = true;
  await saveScope(scope);
}

/** @param {string} output */
export function parseMapping(output) {
  const match = /^127\.0\.0\.1:([0-9]+)$/.exec(output.trim());
  const port = match ? Number(match[1]) : 0;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Missing or invalid loopback Docker port mapping');
  }

  return port;
}

/** @param {number} port @param {number} [timeoutMs] */
export async function waitForTcp(port, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;

  do {
    try {
      await new Promise((resolveConnection, reject) => {
        const socket = createConnection({ host: '127.0.0.1', port });
        socket.once('connect', () => {
          socket.destroy();
          resolveConnection(undefined);
        });
        socket.once('error', reject);
        socket.setTimeout(Math.min(1000, timeoutMs), () => socket.destroy(new Error('TCP connection timed out')));
      });
      return;
    } catch {
      if (Date.now() >= deadline) {
        break;
      }

      await delay(Math.min(1000, deadline - Date.now()));
    }
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for CI dependency on 127.0.0.1:${port}`);
}

/** @param {Scope} scope @returns {Promise<Record<string, string>>} */
export async function start(scope) {
  await claim(scope);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await compose(scope, ['up', '-d', '--wait', '--wait-timeout', '180', ...scope.selectedServices]);
      break;
    } catch (error) {
      await diagnostics(scope);

      if (attempt === 2) {
        throw error;
      }

      console.error("CI dependencies failed; retrying once with only this job's project.");

      // Failure to clean our own project is fatal; never proceed with an uncertain teardown.
      await compose(scope, ['down', '-v']);
    }
  }

  /** @type {Record<string, string>} */
  const environment = {};

  for (const [service, target, variable] of bindings) {
    if (scope.selectedServices.includes(service)) {
      const port = parseMapping(await compose(scope, ['port', service, target], { capture: true }));
      await waitForTcp(port);
      environment[variable] = String(port);
    }
  }

  if (environment.POSTGRES_PORT) {
    environment.DATABASE_URL = `postgresql://vibecore:vibecore@127.0.0.1:${environment.POSTGRES_PORT}/vibecore`;
  }

  if (environment.REDIS_PORT) {
    environment.REDIS_URL = `redis://127.0.0.1:${environment.REDIS_PORT}`;
  }

  if (environment.SMTP_PORT) {
    environment.SMTP_HOST = '127.0.0.1';
  }

  return environment;
}

/** @param {Record<string, string>} environment */
async function exportEnvironment(environment) {
  if (!process.env.GITHUB_ENV) {
    throw new Error('GITHUB_ENV is required for CI dependency startup');
  }

  await appendFile(
    process.env.GITHUB_ENV,
    Object.entries(environment)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
}

/** @param {string} command */
async function main(command) {
  if (command === 'start') {
    if (!process.env.GITHUB_ENV) {
      throw new Error('GITHUB_ENV is required for CI dependency startup');
    }

    if (process.env.VIBECORE_CI_DEPENDENCIES_STATE) {
      throw new Error('CI dependency scope already initialized; refusing to lose its cleanup handle');
    }

    const scope = await createScope();

    // Persist the handle before any Docker mutation, including failed startup.
    await exportEnvironment({ VIBECORE_CI_DEPENDENCIES_STATE: scope.stateFile });
    await exportEnvironment(await start(scope));
    console.log(`Healthy CI dependency project: ${scope.project}`);

    return;
  }

  if (!['diagnostics', 'cleanup'].includes(command)) {
    throw new Error('Usage: ci-local-dependencies.mjs start|diagnostics|cleanup');
  }

  const path = process.env.VIBECORE_CI_DEPENDENCIES_STATE;

  if (!path) {
    console.log('No CI dependency project was created by this job.');
    return;
  }

  const scope = await loadScope(path);
  await (command === 'cleanup' ? cleanup(scope) : diagnostics(scope));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
