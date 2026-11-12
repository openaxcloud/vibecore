import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertDependencyScope, classifyDependencyLog, collectDependencyEvidence } from './dependencies.mjs';

const env = {
  GITHUB_REPOSITORY: 'openaxcloud/vibecore',
  GITHUB_ACTIONS: 'true',
  RUNNER_ENVIRONMENT: 'github-hosted',
  VIBECORE_CI_EPHEMERAL_RUNTIME: '1',
  GITHUB_REF: 'refs/heads/test/packages-main-runtime-20261112',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  COMPOSE_PROJECT_NAME: 'packages-main-123-1',
  PRODUCT_DIR: '/product',
  RUNNER_TEMP: '/private',
  EVIDENCE_DIR: '/evidence',
  DEPENDENCY_COMPOSE_EXIT: '17',
};

const id = 'a'.repeat(64);

const good = (service) => ({
  project: env.COMPOSE_PROJECT_NAME,
  service,
  state: 'running',
  health: 'healthy',
  exitCode: 0,
});

const cleanLog = async () => classifyDependencyLog('');

function commands({ ids = id, value = good, throwLookup = false, throwInspect = false } = {}) {
  const calls = [];

  let service;

  return {
    calls,
    command: async (program, args, options) => {
      calls.push({ program, args, options });
      assert.equal(program, 'docker');
      assert.equal(options.timeout, 5000);
      assert.equal(options.maxBuffer, 4096);

      if (args[0] === 'compose') {
        if (throwLookup) {
          throw new Error('PRIVATE_SECRET');
        }

        service = args.at(-1);
        assert(['postgres', 'redis', 'mailpit'].includes(service));

        return { stdout: ids };
      }

      if (throwInspect) {
        throw new Error('PRIVATE_SECRET');
      }

      assert.equal(args[0], 'inspect');
      assert.equal(args.at(-1), id);

      return { stdout: typeof value === 'function' ? JSON.stringify(value(service)) : value };
    },
  };
}

test('only three run-scoped Compose services and projected state are inspected', async () => {
  const c = commands();
  const result = await collectDependencyEvidence({ env, command: c.command, logSignals: cleanLog });
  assert.equal(result.composeExit, 17);
  assert.equal(result.observationComplete, true);
  assert.equal(c.calls.length, 6);

  for (const call of c.calls.filter((x) => x.args[0] === 'compose')) {
    assert.deepEqual(call.args, [
      'compose',
      '--project-name',
      env.COMPOSE_PROJECT_NAME,
      '--env-file',
      '/private/packages-main-private/empty.env',
      '-f',
      '/product/docker-compose.dev.yml',
      'ps',
      '--all',
      '--quiet',
      call.args.at(-1),
    ]);
  }

  for (const call of c.calls.filter((x) => x.args[0] === 'inspect')) {
    assert.deepEqual(call.args.slice(0, 4), ['inspect', '--type', 'container', '--format']);
    assert.doesNotMatch(call.args[4], /\.Env|\.State\.Error|\.Health\.Log|json \.}}/);
  }
  assert.deepEqual(Object.keys(result.services), ['postgres', 'redis', 'mailpit']);
  assert.deepEqual(result.services.postgres, {
    presence: 'present',
    state: 'running',
    health: 'healthy',
    exitCode: 0,
    inspection: 'complete',
  });
  assert.doesNotMatch(JSON.stringify(result), /packages-main-123|PRIVATE_SECRET|aaaaaaaa/);
});

for (const key of [
  'GITHUB_REPOSITORY',
  'GITHUB_ACTIONS',
  'RUNNER_ENVIRONMENT',
  'VIBECORE_CI_EPHEMERAL_RUNTIME',
  'GITHUB_REF',
  'GITHUB_RUN_ID',
  'GITHUB_RUN_ATTEMPT',
  'COMPOSE_PROJECT_NAME',
  'PRODUCT_DIR',
  'RUNNER_TEMP',
  'EVIDENCE_DIR',
]) {
  test(`scope guard rejects invalid ${key} before any command`, async () => {
    const c = commands();
    await assert.rejects(
      collectDependencyEvidence({ env: { ...env, [key]: '' }, command: c.command, logSignals: cleanLog }),
    );
    assert.equal(c.calls.length, 0);
  });
}

test('foreign project and nonnumeric run identity are refused', () => {
  assert.throws(() => assertDependencyScope({ ...env, COMPOSE_PROJECT_NAME: 'other-project' }));
  assert.throws(() => assertDependencyScope({ ...env, GITHUB_RUN_ID: '../other' }));
});

test('absent services are explicit, not falsely healthy, and never inspected', async () => {
  const c = commands({ ids: '' });
  const result = await collectDependencyEvidence({ env, command: c.command, logSignals: cleanLog });
  assert.equal(c.calls.length, 3);
  assert.equal(result.services.postgres.presence, 'absent');
  assert.equal(result.services.postgres.health, 'unknown');
  assert.equal(result.services.postgres.exitCode, null);
});

for (const ids of ['PRIVATE_SECRET', `${id}\n${id}`, '../../other', 'a'.repeat(12)]) {
  test('ambiguous or malformed selection never reaches inspect', async () => {
    const c = commands({ ids });
    const result = await collectDependencyEvidence({ env, command: c.command, logSignals: cleanLog });
    assert.equal(c.calls.length, 3);
    assert.equal(result.observationComplete, false);
    assert.equal(result.services.postgres.inspection, 'ambiguous-selection');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SECRET|\.\.\/other/);
  });
}

for (const value of [
  (service) => ({ ...good(service), project: 'PRIVATE_SECRET' }),
  () => ({ ...good('other-service') }),
  (service) => ({
    ...good(service),
    state: 'PRIVATE_SECRET',
    health: 'PRIVATE_SECRET',
    exitCode: 'PRIVATE_SECRET',
    Env: 'PRIVATE_SECRET',
  }),
  (service) => ({ ...good(service), exitCode: 999999 }),
  'PRIVATE_SECRET',
  'null',
]) {
  test('malformed projections, scope mismatches and arbitrary fields fail closed without leakage', async () => {
    const c = commands({ value });
    const result = await collectDependencyEvidence({ env, command: c.command, logSignals: cleanLog });
    assert.equal(result.observationComplete, false);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SECRET|other-service|999999|Env/);
  });
}

for (const option of ['throwLookup', 'throwInspect']) {
  test(`${option} retains only fixed inspection category`, async () => {
    const c = commands({ [option]: true });
    const result = await collectDependencyEvidence({ env, command: c.command, logSignals: cleanLog });
    assert.equal(result.observationComplete, false);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SECRET/);
    assert.equal(result.services.postgres.inspection, option === 'throwLookup' ? 'lookup-failed' : 'inspect-failed');
  });
}

test('health absence and process exit code remain bounded data', async () => {
  const c = commands({ value: (service) => ({ ...good(service), state: 'exited', health: null, exitCode: 137 }) });
  const result = await collectDependencyEvidence({ env, command: c.command, logSignals: cleanLog });
  assert.equal(result.services.postgres.health, 'none');
  assert.equal(result.services.postgres.exitCode, 137);
});

test('log categories are boolean signatures, not excerpts or root-cause claims', () => {
  const result = classifyDependencyLog(
    'PRIVATE_SECRET toomanyrequests pull access denied manifest unknown TLS handshake timeout no space left on device unhealthy',
  );
  assert(Object.values(result).every((v) => v === true));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SECRET/);
  assert(Object.values(classifyDependencyLog('unrecognized PRIVATE_SECRET')).every((v) => v === false));
  assert.equal(classifyDependencyLog(`toomanyrequests${'x'.repeat(65536)}`).pullRateLimited, false);
});

test('unknown/interrupted exit and log-read failure cannot invent a successful observation', async () => {
  const c = commands();

  const result = await collectDependencyEvidence({
    env: { ...env, DEPENDENCY_COMPOSE_EXIT: '' },
    command: c.command,
    logSignals: async () => {
      throw new Error('PRIVATE_SECRET');
    },
  });
  assert.equal(result.composeExit, null);
  assert.equal(result.logInspection, 'unavailable');
  assert.equal(result.observationComplete, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SECRET/);
});

const source = readFileSync(new URL('./run.sh', import.meta.url), 'utf8');
const cleanup = readFileSync(new URL('./cleanup.sh', import.meta.url), 'utf8');
test('observation runs before cleanup, keeps180s startup and is itself CI-tested before builds', () => {
  const tests = source.split('\n').find((line) => line.startsWith('node --test "$HARNESS_DIR/invariants.checks.mjs"'));
  assert(tests?.includes('"$HARNESS_DIR/dependencies.checks.mjs"'));
  assert(source.indexOf(tests) < source.indexOf('docker build --label'));
  assert.match(source, /up -d --wait --wait-timeout 180 postgres redis mailpit/);
  assert.equal((source.match(/up -d --wait --wait-timeout/g) ?? []).length, 1);

  const body = source.slice(source.indexOf('cleanup() {'), source.indexOf('trap cleanup EXIT'));
  assert(body.indexOf('then observe_dependencies; fi') >= 0);
  assert(body.indexOf('then observe_dependencies; fi') < body.indexOf('docker rm'));
  assert.match(source, /if \[\[ \$dependencies_status != 0 \]\]; then exit "\$dependencies_status"; fi/);
  assert(cleanup.indexOf('"$HARNESS_DIR/dependencies.mjs"') >= 0);
  assert(cleanup.indexOf('"$HARNESS_DIR/dependencies.mjs"') < cleanup.indexOf(' down -v'));
});

for (const [exit, observerFailure] of [
  [0, false],
  [17, false],
  [17, true],
  [0, true],
]) {
  test(`real shell wiring records dependency exit${exit} with observer failure=${observerFailure} before cleanup and preserves it`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'dependency-observer-'));

    try {
      mkdirSync(join(dir, 'packages-main-private'));
      mkdirSync(join(dir, 'evidence'));
      mkdirSync(join(dir, 'bin'));

      const trace = join(dir, 'trace');

      const docker =
        '#!/bin/sh\ncase "$*" in\n*" up "*) echo up >> "$TRACE"; exit "$UP_EXIT";;\n*" ps "*) echo observe >> "$TRACE"; if [ "$OBS_FAIL" = true ]; then exit 83; fi; exit 0;;\nesac\nexit 90\n';
      writeFileSync(join(dir, 'bin/docker'), docker, { mode: 0o755 });

      const observerFunction = source.slice(source.indexOf('observe_dependencies() {'), source.indexOf('cleanup() {'));
      const dependencyBlock = source.slice(source.indexOf('phase=dependencies'), source.indexOf('phase=database'));
      const script = `set -euo pipefail\n${observerFunction}\ntrap 'result=$?; echo cleanup >> "$TRACE"; exit "$result"' EXIT\n${dependencyBlock}\n`;

      let code = 0;

      try {
        execFileSync('bash', ['-c', script], {
          env: {
            ...process.env,
            ...env,
            UP_EXIT: String(exit),
            OBS_FAIL: String(observerFailure),
            TRACE: trace,
            PATH: `${dir}/bin:${process.env.PATH}`,
            RUNNER_TEMP: dir,
            EVIDENCE_DIR: `${dir}/evidence`,
            HARNESS_DIR: dirname(fileURLToPath(import.meta.url)),
          },
          timeout: 10000,
          stdio: 'pipe',
        });
      } catch (error) {
        code = error.status;
      }
      assert.equal(code, exit || (observerFailure ? 1 : 0));

      const events = readFileSync(trace, 'utf8').trim().split('\n');
      assert.deepEqual(events, ['up', 'observe', 'observe', 'observe', 'cleanup']);

      const evidence = JSON.parse(readFileSync(join(dir, 'evidence/dependencies.json'), 'utf8'));
      assert.equal(evidence.composeExit, exit);
      assert.equal(evidence.services.postgres.presence, observerFailure ? 'unknown' : 'absent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('actual cleanup prefix captures interrupted startup before teardown with unknown Compose exit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dependency-interrupted-'));

  try {
    mkdirSync(join(dir, 'packages-main-private'));
    mkdirSync(join(dir, 'evidence'));
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'packages-main-private/dependencies.log'), 'PRIVATE_SECRET');

    const trace = join(dir, 'trace');
    writeFileSync(join(dir, 'bin/docker'), '#!/bin/sh\necho observe >> "$TRACE"\nexit 0\n', { mode: 0o755 });

    const observerFunction = source.slice(source.indexOf('observe_dependencies() {'), source.indexOf('cleanup() {'));
    const cleanupPrefix = source.slice(source.indexOf('cleanup() {'), source.indexOf('  browser_status=0'));
    const script = `set -euo pipefail\ndependencies_started=true\ndependencies_status=''\ndependency_observation_attempted=false\ndependency_observation_status=0\n${observerFunction}\n${cleanupPrefix}\necho teardown >> "$TRACE"\nexit "$result"\n}\ntrap cleanup EXIT\nexit 143\n`;

    let code = 0;

    try {
      execFileSync('bash', ['-c', script], {
        env: {
          ...process.env,
          ...env,
          TRACE: trace,
          PATH: `${dir}/bin:${process.env.PATH}`,
          RUNNER_TEMP: dir,
          EVIDENCE_DIR: `${dir}/evidence`,
          HARNESS_DIR: dirname(fileURLToPath(import.meta.url)),
        },
        timeout: 10000,
        stdio: 'pipe',
      });
    } catch (error) {
      code = error.status;
    }
    assert.equal(code, 143);
    assert.deepEqual(readFileSync(trace, 'utf8').trim().split('\n'), ['observe', 'observe', 'observe', 'teardown']);

    const evidence = JSON.parse(readFileSync(join(dir, 'evidence/dependencies.json'), 'utf8'));
    assert.equal(evidence.composeExit, null);
    assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_SECRET/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const [termination, expected] of [
  ['exit 17', 17],
  ['kill -TERM "$$"', 143],
  ['kill -INT "$$"', 130],
  ['exit 0', 1],
]) {
  test(`actual cleanup preserves ${termination} while recording teardown failure`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'dependency-real-cleanup-'));

    try {
      for (const sub of ['packages-main-private', 'evidence', 'bin', 'vibecore-runtime/evidence']) {
        mkdirSync(join(dir, sub), { recursive: true });
      }
      writeFileSync(join(dir, 'packages-main-private/dependencies.log'), 'PRIVATE_SECRET');
      writeFileSync(join(dir, 'packages-main-private/empty.env'), '');
      writeFileSync(join(dir, 'kubeconfig'), 'fixture');

      const trace = join(dir, 'trace');

      const binaries = {
        docker:
          '#!/bin/sh\ncase "$*" in\n*" ps "*) echo observe >> "$TRACE"; exit 0;;\n*" down "*) echo compose-down >> "$TRACE"; exit 7;;\n"rm "*) echo docker-rm >> "$TRACE"; exit 0;;\nesac\nexit 91\n',
        timeout: '#!/bin/sh\ncase "$1" in --kill-after=*) shift;; esac\nshift\nexec "$@"\n',
        kubectl: '#!/bin/sh\necho namespace-delete >> "$TRACE"\nexit 0\n',
        sudo: '#!/bin/sh\necho runtime-stop >> "$TRACE"\nexit 0\n',
        bash: '#!/bin/sh\ncase "$1" in */verify-product.sh) echo source-verify >> "$TRACE"; exit 0;; esac\nexit 92\n',
      };

      for (const [name, content] of Object.entries(binaries)) {
        writeFileSync(join(dir, 'bin', name), content, { mode: 0o755 });
      }

      const observerFunction = source.slice(source.indexOf('observe_dependencies() {'), source.indexOf('cleanup() {'));
      const cleanupFunction = source.slice(source.indexOf('cleanup() {'), source.indexOf('trap cleanup EXIT'));
      const script = `set -euo pipefail\npids=()\nbrowser_attempted=false\nphase=dependencies\ndependencies_started=true\ndependencies_status=''\ndependency_observation_attempted=false\ndependency_observation_status=0\n${observerFunction}\n${cleanupFunction}\ntrap cleanup EXIT\ntrap 'exit 130' INT\ntrap 'exit 143' TERM\n${termination}\n`;

      let code = 0;

      try {
        execFileSync('/bin/bash', ['-c', script], {
          env: {
            ...process.env,
            ...env,
            TRACE: trace,
            PATH: `${dir}/bin:${process.env.PATH}`,
            RUNNER_TEMP: dir,
            EVIDENCE_DIR: `${dir}/evidence`,
            KUBECONFIG: `${dir}/kubeconfig`,
            HARNESS_DIR: dirname(fileURLToPath(import.meta.url)),
          },
          timeout: 10000,
          stdio: 'pipe',
        });
      } catch (error) {
        code = error.status;
      }
      assert.equal(code, expected);
      assert.deepEqual(readFileSync(trace, 'utf8').trim().split('\n'), [
        'observe',
        'observe',
        'observe',
        'docker-rm',
        'namespace-delete',
        'compose-down',
        'runtime-stop',
        'source-verify',
      ]);

      const cleanupResult = JSON.parse(readFileSync(join(dir, 'evidence/cleanup.json'), 'utf8'));
      assert.equal(cleanupResult.composeDownExit, 7);
      assert.equal(cleanupResult.runExit, termination === 'exit 0' ? 0 : expected);
      assert.equal(cleanupResult.dependencyObservationExit, 0);

      const observation = JSON.parse(readFileSync(join(dir, 'evidence/dependencies.json'), 'utf8'));
      assert.equal(observation.composeExit, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
