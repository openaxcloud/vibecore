import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { summarizeRuntimeApi } from './runtime-api-evidence.mjs';

const require = createRequire(import.meta.url);

function compile(path) {
  return ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function harness(files = {}, options = {}) {
  const calls = [];
  const timers = [];

  let closed = 0;

  const exports = {};

  const fs = {
    async lstat(path) {
      calls.push(path);

      if (!(path in files)) {
        throw { code: 'ENOENT' };
      }

      return { isFile: () => !path.endsWith('node_modules'), isDirectory: () => path.endsWith('node_modules') };
    },
    async open(path, flags) {
      calls.push(path);
      assert.ok(flags & require('node:fs').constants.O_NOFOLLOW);
      assert.ok(flags & require('node:fs').constants.O_NONBLOCK);

      if (options.pending) {
        return new Promise(() => {});
      }

      if (options.denied || !(path in files)) {
        throw { code: 'EACCES' };
      }

      const text = files[path];

      return {
        async stat() {
          return { size: options.oversized ? 999999 : Buffer.byteLength(text), isFile: () => true };
        },
        async read(buffer) {
          const n = buffer.write(text);
          return { bytesRead: n };
        },
        async close() {
          closed++;
        },
      };
    },
  };
  new Function(
    'require',
    'exports',
    'setTimeout',
    'clearTimeout',
    'performance',
    compile('services/workspace-agent/src/package-install-observation.ts'),
  )(
    (name) => (name === 'node:fs/promises' ? fs : require(name)),
    exports,
    (fn, delay) => {
      const timer = { fn, delay, unref() {}, cleared: false };
      timers.push(timer);

      return timer;
    },
    (t) => {
      t.cleared = true;
    },
    { now: () => 100 },
  );

  return { ...exports, calls, timers, closed: () => closed };
}

const procStat = (identity = 42, state = 'R') =>
  `123 (PRIVATE) ${state} ${Array.from({ length: 49 }, (_, i) => (i === 18 ? identity : 1)).join(' ')}\n`;

const flush = () => new Promise((resolve) => setImmediate(resolve));

function project(record) {
  const exports = {};
  new Function('exports', compile('services/api/src/package-execution-diagnostic.ts'))(exports);

  return exports.packageExecutionDiagnostic(300000, { executionDiagnostic: { installObservation: record } });
}

test('manifest projection bounds counts without retaining names or scripts', () => {
  const h = harness();
  const dependencies = Object.fromEntries(Array.from({ length: 1100 }, (_, i) => ['PRIVATE' + i, 'SECRET']));
  assert.deepEqual(h.manifestCounts(JSON.stringify({ dependencies, scripts: { install: 'SECRET' } })), {
    dependencyCount: 1000,
    devDependencyCount: 0,
  });

  for (const x of [undefined, 'bad', 'null', '[]']) {
    assert.deepEqual(h.manifestCounts(x), { dependencyCount: null, devDependencyCount: null });
  }
  assert.equal(h.manifestCounts('{"dependencies":[]}').dependencyCount, null);
});
test('leader process parser emits only fixed state and bounded CPU duration', () => {
  const h = harness();
  assert.deepEqual(h.processSample(procStat(42, 'S'), '123456789 0 0\n'), {
    processActivity: 'sleeping',
    leaderCpuMs: 123,
  });
  assert.deepEqual(h.processSample(undefined, 'Infinity'), { processActivity: 'unknown', leaderCpuMs: null });
});
test('recognized install observes only fixed paths and six samples without commands or network', async () => {
  const h = harness({
    '/safe/package.json': '{"dependencies":{"SECRET":"PRIVATE"}}',
    '/safe/node_modules': '',
    '/safe/package-lock.json': '',
    '/proc/123/stat': procStat(),
    '/proc/123/schedstat': '2000000 0 0\n',
  });

  const o = h.observePackageInstall('/safe', 'npm', ['install', 'PRIVATE'], 123);
  assert.equal(h.timers.length, 6);
  assert.deepEqual(
    h.timers.map((t) => t.delay),
    [0, 5000, 10000, 15000, 20000, 25000],
  );
  h.timers[0].fn();
  await flush();

  const x = o.snapshot();
  assert.equal(x.lockfile, 'present');
  assert.equal(x.nodeModules, 'present');
  assert.equal(x.dependencyCount, 1);
  assert.equal(x.leaderCpuMs, 2);
  assert.doesNotMatch(JSON.stringify(x), /PRIVATE|SECRET|\/safe|123/);
  assert.ok(h.calls.length <= 11);
  o.stop();
  assert.ok(h.timers.every((t) => t.cleared));
});
test('unrecognized command collects nothing', () => {
  const h = harness();
  const o = h.observePackageInstall('/safe', 'node', ['PRIVATE'], 1);
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.length, 0);
  o.stop();
});
test('denial or oversized manifest leaves counts unknown and closes open handles', async () => {
  for (const options of [{ denied: true }, { oversized: true }]) {
    const h = harness({ '/safe/package.json': '{}' }, options);
    const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
    await flush();
    assert.equal(o.snapshot().dependencyCount, null);
    o.stop();

    if (options.oversized) {
      assert.equal(h.closed(), 1);
    }
  }
});
test('pending reads cannot block stop/snapshot and cannot overwrite stopped result', async () => {
  const h = harness({}, { pending: true });
  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
  o.stop();
  assert.equal(o.snapshot().dependencyCount, null);
  await flush();
  assert.equal(o.snapshot().lockfile, 'unknown');
});
test('API and collector independently reject malicious fields and nonfinite numbers', () => {
  const bad = {
    lockfile: 'SECRET',
    nodeModules: 'PRIVATE',
    dependencyCount: 1001,
    devDependencyCount: -1,
    processActivity: 'URL',
    leaderCpuMs: Infinity,
    activitySampleAgeMs: NaN,
    argv: 'SECRET',
    env: 'PRIVATE',
  };

  const a = project(bad);

  const expected = {
    lockfile: 'unknown',
    nodeModules: 'unknown',
    dependencyCount: null,
    devDependencyCount: null,
    processActivity: 'unknown',
    leaderCpuMs: null,
    activitySampleAgeMs: null,
  };
  assert.deepEqual(a.installObservation, expected);

  const b = summarizeRuntimeApi(JSON.stringify({ ...a, installObservation: bad }));
  assert.deepEqual(b.packageExecutions[0].installObservation, expected);
  assert.doesNotMatch(JSON.stringify(b), /PRIVATE|SECRET|URL/);
});
test('missing observation remains absent and context cannot manufacture execution success', () => {
  assert.equal(project(undefined).installObservation, undefined);

  const a = project({ processActivity: 'running', leaderCpuMs: 3 });
  assert.equal(a.exitCode, null);
  assert.equal(a.timedOut, null);
  assert.equal(a.effectiveBudgetMs, null);
});

test('changed PID start identity cannot contribute CPU from a reused process', async () => {
  const files = { '/proc/123/stat': procStat(), '/proc/123/schedstat': '2000000 0 0\n' };
  const h = harness(files);
  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
  h.timers[0].fn();
  await flush();
  assert.equal(o.snapshot().leaderCpuMs, 2);
  files['/proc/123/stat'] = procStat(43);
  files['/proc/123/schedstat'] = '9000000 0 0\n';
  h.timers[1].fn();
  await flush();
  assert.equal(o.snapshot().leaderCpuMs, null);
  assert.equal(o.snapshot().processActivity, 'unknown');
  o.stop();
});

test('overlapping samples are skipped while a read is pending', async () => {
  const h = harness({}, { pending: true });
  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);

  for (const t of h.timers) {
    t.fn();
  }
  await flush();
  assert.equal(h.calls.filter((x) => x === '/proc/123/stat').length, 1);
  o.stop();
});

test('observed leader exit is categorical and clears CPU rather than relabeling a stale sample', () => {
  const h = harness();
  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
  o.stop(true);
  assert.equal(o.snapshot().processActivity, 'exited');
  assert.equal(o.snapshot().leaderCpuMs, null);
  assert.equal(o.snapshot().activitySampleAgeMs, 0);
});
