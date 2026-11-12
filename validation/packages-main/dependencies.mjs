import { execFile } from 'node:child_process';
import { open, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const services = ['postgres', 'redis', 'mailpit'];
const states = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'];
const healthStates = ['starting', 'healthy', 'unhealthy'];

const projection =
  '{"state":{{json .State.Status}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"exitCode":{{json .State.ExitCode}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}}}';

export function assertDependencyScope(env) {
  if (
    env.GITHUB_REPOSITORY !== 'openaxcloud/vibecore' ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    env.VIBECORE_CI_EPHEMERAL_RUNTIME !== '1' ||
    env.GITHUB_REF !== 'refs/heads/test/packages-main-runtime-20261112' ||
    !/^\d{1,20}$/.test(env.GITHUB_RUN_ID ?? '') ||
    !/^\d{1,5}$/.test(env.GITHUB_RUN_ATTEMPT ?? '') ||
    env.COMPOSE_PROJECT_NAME !== `packages-main-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}` ||
    !env.PRODUCT_DIR ||
    !env.RUNNER_TEMP ||
    !env.EVIDENCE_DIR
  ) {
    throw new Error('Dependency observation scope refused');
  }
}

export function classifyDependencyLog(text) {
  // Observed signatures only, never inferred root causes or raw log excerpts.
  const tail = typeof text === 'string' ? text.slice(-65536) : '';
  return {
    pullRateLimited: /toomanyrequests|pull rate limit/i.test(tail),
    pullAccessDenied: /pull access denied|denied: requested access|unauthorized: authentication required/i.test(tail),
    manifestMissing: /manifest unknown|manifest not found/i.test(tail),
    networkTimeout:
      /TLS handshake timeout|i\/o timeout|connection timed out|network is unreachable|temporary failure in name resolution/i.test(
        tail,
      ),
    diskFull: /no space left on device/i.test(tail),
    unhealthy: /unhealthy|didn't become healthy/i.test(tail),
  };
}

async function readSignals(path) {
  const file = await open(path, 'r');

  try {
    const stat = await file.stat();

    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 0) {
      throw new Error('Dependency log unavailable');
    }

    const { size } = stat;
    const buffer = Buffer.alloc(Math.min(size, 65536));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, Math.max(0, size - buffer.length));

    return classifyDependencyLog(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await file.close();
  }
}

const emptyService = () => ({
  presence: 'unknown',
  state: 'unknown',
  health: 'unknown',
  exitCode: null,
  inspection: 'lookup-failed',
});

export async function collectDependencyEvidence({
  env = process.env,
  command = execute,
  logSignals = readSignals,
} = {}) {
  assertDependencyScope(env);

  const composeExit =
    /^\d{1,3}$/.test(env.DEPENDENCY_COMPOSE_EXIT ?? '') && Number(env.DEPENDENCY_COMPOSE_EXIT) <= 255
      ? Number(env.DEPENDENCY_COMPOSE_EXIT)
      : null;
  const evidence = {
    schemaVersion: 1,
    composeExit,
    observationComplete: true,
    logInspection: 'unavailable',
    logSignals: classifyDependencyLog(''),
    services: {},
  };

  try {
    const signals = await logSignals(`${env.RUNNER_TEMP}/packages-main-private/dependencies.log`);

    for (const key of Object.keys(evidence.logSignals)) {
      evidence.logSignals[key] = signals?.[key] === true;
    }
    evidence.logInspection = 'complete';
  } catch {
    evidence.observationComplete = false;
  }

  for (const service of services) {
    const result = emptyService();
    evidence.services[service] = result;

    try {
      const { stdout } = await command(
        'docker',
        [
          'compose',
          '--project-name',
          env.COMPOSE_PROJECT_NAME,
          '--env-file',
          `${env.RUNNER_TEMP}/packages-main-private/empty.env`,
          '-f',
          `${env.PRODUCT_DIR}/docker-compose.dev.yml`,
          'ps',
          '--all',
          '--quiet',
          service,
        ],
        { timeout: 5000, maxBuffer: 4096, env },
      );

      const ids = stdout.trim().split(/\s+/).filter(Boolean);

      if (ids.length === 0) {
        Object.assign(result, { presence: 'absent', inspection: 'complete' });
        continue;
      }

      result.inspection = 'ambiguous-selection';

      if (ids.length !== 1 || !/^[a-f0-9]{64}$/.test(ids[0])) {
        evidence.observationComplete = false;
        continue;
      }

      result.inspection = 'inspect-failed';

      const inspected = await command('docker', ['inspect', '--type', 'container', '--format', projection, ids[0]], {
        timeout: 5000,
        maxBuffer: 4096,
        env,
      });
      result.inspection = 'invalid-projection';

      const value = JSON.parse(inspected.stdout);
      result.inspection = 'scope-mismatch';

      if (value?.project !== env.COMPOSE_PROJECT_NAME || value?.service !== service) {
        evidence.observationComplete = false;
        continue;
      }

      result.presence = 'present';
      result.state = states.includes(value.state) ? value.state : 'unknown';
      result.health = value.health === null ? 'none' : healthStates.includes(value.health) ? value.health : 'unknown';
      result.exitCode =
        Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255 ? value.exitCode : null;
      result.inspection =
        result.state === 'unknown' || result.health === 'unknown' || result.exitCode === null
          ? 'invalid-projection'
          : 'complete';

      if (result.inspection !== 'complete') {
        evidence.observationComplete = false;
      }
    } catch {
      evidence.observationComplete = false;
    }
  }

  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evidence = await collectDependencyEvidence();
    await writeFile(`${process.env.EVIDENCE_DIR}/dependencies.json`, JSON.stringify(evidence, null, 2));

    if (!evidence.observationComplete) {
      process.exitCode = 1;
    }
  } catch {
    // Do not publish native command errors, arguments, environment or arbitrary paths.
    process.exitCode = 1;
  }
}
