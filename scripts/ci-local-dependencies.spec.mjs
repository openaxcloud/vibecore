import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseMapping, waitForTcp } from './ci-local-dependencies.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directories = [];

let listeners = [];
let ports = [];

const targets = [
  ['.github/workflows/i18n-live-audit.yml', 'live-audit'],
  ['.github/actions/preparer-pile-e2e/action.yml', null],
  ['.github/workflows/e2e-runtime.yml', 'e2e-runtime'],
];

function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'vibecore-ci-ports-test-'));
  directories.push(directory);

  const docker = join(directory, 'docker');
  const log = join(directory, 'docker.jsonl');
  const githubEnv = join(directory, 'github.env');
  writeFileSync(githubEnv, '');
  writeFileSync(
    docker,
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKER_TEST_LOG, JSON.stringify({args, ports: ['POSTGRES_PORT','REDIS_PORT','SMTP_PORT','MAILPIT_UI_PORT'].map(k => process.env[k])})+'\\n');
if (process.env.DOCKER_TEST_EXISTING && args[0] === 'ps') console.log('existing-foreign-resource');
if (args.includes('up') && process.env.POSTGRES_PORT !== '127.0.0.1:0') {
  console.error('failed to bind host port 0.0.0.0:55432: address already in use');
  process.exit(1);
}
const starts = fs.readFileSync(process.env.DOCKER_TEST_LOG,'utf8').trim().split('\\n').map(JSON.parse).filter(c => c.args.includes('up')).length;
if (args.includes('up') && (process.env.DOCKER_TEST_FAIL_UP === 'always' || (process.env.DOCKER_TEST_FAIL_UP === 'once' && starts === 1))) {
  console.error('instrumented health failure'); process.exit(42);
}
if (args.includes('down') && process.env.DOCKER_TEST_FAIL_DOWN) { console.error('instrumented teardown failure'); process.exit(43); }
if (args.includes('port')) {
  const mapping = Object.fromEntries(['5432','6379','1025','8025'].map((target,index) => [target, JSON.parse(process.env.DOCKER_TEST_PORTS)[index]]));
  console.log(process.env.DOCKER_TEST_MAPPING || '127.0.0.1:'+mapping[args.at(-1)]);
}

`,
    { mode: 0o755 },
  );

  return {
    directory,
    log,
    githubEnv,
    ports,
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      RUNNER_TEMP: directory,
      GITHUB_ENV: githubEnv,
      DOCKER_TEST_LOG: log,
      DOCKER_TEST_PORTS: JSON.stringify(ports),
      VIBECORE_CI_DEPENDENCIES_STATE: '',
    },
  };
}

function invoke(test, command, extra = {}) {
  return execFileSync(process.execPath, [join(root, 'scripts/ci-local-dependencies.mjs'), command], {
    cwd: root,
    env: { ...test.env, ...extra },
    timeout: 15000,
    stdio: 'pipe',
  });
}

function calls(test) {
  return readFileSync(test.log, 'utf8').trim().split('\n').map(JSON.parse);
}

function environment(test) {
  return Object.fromEntries(
    readFileSync(test.githubEnv, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const split = line.indexOf('=');
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
}

beforeEach(async () => {
  listeners = Array.from({ length: 4 }, () => createServer((socket) => socket.end()));
  await Promise.all(
    listeners.map(
      (server) =>
        new Promise((resolveListen, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolveListen);
        }),
    ),
  );
  ports = listeners.map((server) => server.address().port);
});

afterEach(async () => {
  await Promise.all(listeners.map((server) => new Promise((resolveClose) => server.close(resolveClose))));

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('bounded startup and ownership', () => {
  it('waits for the published TCP endpoint and rejects an unavailable one', async () => {
    await waitForTcp(ports[0], 100);
    await new Promise((resolveClose) => listeners[0].close(resolveClose));
    await expect(waitForTcp(ports[0], 25)).rejects.toThrow('Timed out waiting');
  });

  it('does not overwrite a live scope handle on accidental repeated startup', () => {
    const test = harness();
    invoke(test, 'start');

    const previous = environment(test);
    expect(() => invoke(test, 'start', previous)).toThrow();
    expect(environment(test)).toEqual(previous);
    expect(calls(test).filter((call) => call.args.includes('up'))).toHaveLength(1);
  });
  it('waits for health on both attempts and resets only its own project', () => {
    const test = harness();
    invoke(test, 'start', { DOCKER_TEST_FAIL_UP: 'once' });

    const mutations = calls(test).filter((call) => call.args.includes('up') || call.args.includes('down'));
    expect(mutations.map((call) => (call.args.includes('up') ? 'up' : 'down'))).toEqual(['up', 'down', 'up']);
    expect(new Set(mutations.map((call) => call.args[call.args.indexOf('-p') + 1])).size).toBe(1);

    for (const call of mutations.filter((entry) => entry.args.includes('up'))) {
      expect(call.args.slice(call.args.indexOf('up'), call.args.indexOf('up') + 5)).toEqual([
        'up',
        '-d',
        '--wait',
        '--wait-timeout',
        '180',
      ]);
    }
  });

  it('fails the job after the second failure without exporting usable client URLs', () => {
    const test = harness();
    expect(() => invoke(test, 'start', { DOCKER_TEST_FAIL_UP: 'always' })).toThrow();
    expect(calls(test).filter((call) => call.args.includes('up'))).toHaveLength(2);
    expect(environment(test).DATABASE_URL).toBeUndefined();
    expect(environment(test).VIBECORE_CI_DEPENDENCIES_STATE).toBeTruthy();
    invoke(test, 'cleanup', environment(test));
    expect(calls(test).filter((call) => call.args.includes('down'))).toHaveLength(2);
  });

  it('does not retry after an uncertain teardown', () => {
    const test = harness();
    expect(() => invoke(test, 'start', { DOCKER_TEST_FAIL_UP: 'once', DOCKER_TEST_FAIL_DOWN: '1' })).toThrow();
    expect(calls(test).filter((call) => call.args.includes('up'))).toHaveLength(1);
    expect(environment(test).DATABASE_URL).toBeUndefined();
  });

  it('refuses to adopt or delete an existing project', () => {
    const test = harness();
    expect(() => invoke(test, 'start', { DOCKER_TEST_EXISTING: '1' })).toThrow();
    invoke(test, 'cleanup', environment(test));
    expect(calls(test).some((call) => call.args.includes('up') || call.args.includes('down'))).toBe(false);
  });

  it('keeps Compose publication stable after exporting client ports, then cleans only once', () => {
    const test = harness();
    invoke(test, 'start');

    const exported = environment(test);
    const project = calls(test).find((call) => call.args.includes('up')).args[2];
    invoke(test, 'diagnostics', exported);
    invoke(test, 'cleanup', exported);
    invoke(test, 'cleanup', exported);

    const composed = calls(test).filter((call) => call.args[0] === 'compose');
    expect(composed.every((call) => call.args[2] === project)).toBe(true);
    expect(composed.every((call) => call.ports.every((port) => port === '127.0.0.1:0'))).toBe(true);
    expect(composed.filter((call) => call.args.includes('down'))).toHaveLength(1);
    expect(calls(test).some((call) => call.args.includes('prune') || call.args.includes('rm'))).toBe(false);
  });

  it('uses distinct projects for identical job metadata', () => {
    const first = harness();
    const second = harness();
    invoke(first, 'start');
    invoke(second, 'start');
    expect(environment(first).VIBECORE_CI_DEPENDENCIES_STATE).not.toBe(
      environment(second).VIBECORE_CI_DEPENDENCIES_STATE,
    );
  });

  it('refuses malformed ownership before running Docker', () => {
    const test = harness();
    const state = join(test.directory, 'foreign.json');
    writeFileSync(state, JSON.stringify({ version: 1, token: 'a'.repeat(32), project: 'vibecore', stateFile: state }));
    expect(() => invoke(test, 'cleanup', { VIBECORE_CI_DEPENDENCIES_STATE: state })).toThrow();
    expect(() => readFileSync(test.log)).toThrow();
  });

  it('does nothing when startup never created a scope', () => {
    const test = harness();
    invoke(test, 'cleanup');
    expect(() => readFileSync(test.log)).toThrow();
  });

  it('fails discovery without falling back to a fixed client port', () => {
    const test = harness();
    expect(() => invoke(test, 'start', { DOCKER_TEST_MAPPING: '0.0.0.0:55432' })).toThrow();
    expect(environment(test).DATABASE_URL).toBeUndefined();
  });

  it.each(['', '127.0.0.1:0', '127.0.0.1:65536', '127.0.0.1:abc', '0.0.0.0:32001', '127.0.0.1:1\n127.0.0.1:2'])(
    'rejects invalid mapping %j',
    (mapping) => {
      expect(() => parseMapping(mapping)).toThrow();
    },
  );
});

describe('every consumer retains the job scope until cleanup', () => {
  it.each([
    ['i18n-live-audit.yml', 'live-audit'],
    ['e2e-runtime.yml', 'e2e-runtime'],
    ['e2e.yml', 'e2e'],
    ['e2e.yml', 'canari-ios'],
  ])('%s/%s propagates dynamic URLs and cleans on failure', (file, name) => {
    const job = parse(readFileSync(join(root, '.github/workflows', file), 'utf8')).jobs[name];
    expect(job.env.DATABASE_URL).toBeUndefined();
    expect(job.env.REDIS_URL).toBeUndefined();

    const cleanup = job.steps.filter((step) => step.run?.includes('ci-local-dependencies.mjs cleanup'));
    expect(cleanup).toHaveLength(1);
    expect(cleanup[0].if).toContain('always()');
    expect(cleanup[0].if).toContain('VIBECORE_CI_DEPENDENCIES_STATE');
    expect(job.steps.some((step) => /tcp:127\.0\.0\.1:(55432|56379|8025)|docker compose/.test(step.run ?? ''))).toBe(
      false,
    );
  });
});

describe('CI dependencies use the assigned ports, even when 55432 is occupied', () => {
  it.each(targets)('%s executes the shared startup and exports its real endpoints', (path, jobName) => {
    const document = parse(readFileSync(resolve(root, path), 'utf8'));
    const job = jobName ? document.jobs[jobName] : document.runs;
    expect(job, `job missing in ${path}`).toBeDefined();

    const step = job.steps.find((entry) => entry.name === 'Start local dependencies');
    expect(step?.run).toBeTruthy();

    const test = harness();
    execFileSync('bash', ['-e', '-c', step.run], {
      cwd: root,
      env: { ...test.env, POSTGRES_PORT: '55432', REDIS_PORT: '56379' },
      timeout: 15000,
      stdio: 'pipe',
    });

    const exported = readFileSync(test.githubEnv, 'utf8');
    expect(exported).toContain(`DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:${test.ports[0]}/vibecore`);
    expect(exported).toContain(`REDIS_URL=redis://127.0.0.1:${test.ports[1]}`);
    expect(exported).toContain(`SMTP_PORT=${test.ports[2]}`);
    expect(exported).toContain(`MAILPIT_UI_PORT=${test.ports[3]}`);

    const calls = readFileSync(test.log, 'utf8').trim().split('\n').map(JSON.parse);
    const start = calls.find((call) => call.args.includes('up'));
    expect(start.args).toContain('--wait');
    expect(start.args).toContain('--wait-timeout');
    expect(start.ports).toEqual(Array(4).fill('127.0.0.1:0'));
    expect(start.args[start.args.indexOf('-p') + 1]).toMatch(/^vibecore-ci-[a-f0-9]{32}$/);
  });
});
