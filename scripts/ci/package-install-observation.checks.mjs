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

      await options.beforeOpen?.(path);

      if (options.denied || !(path in files)) {
        throw { code: options.denied ? 'EACCES' : 'ENOENT' };
      }

      const entry = typeof files[path] === 'string' ? { text: files[path] } : files[path];
      const text = entry.text ?? '';

      if (entry.error) {
        throw { code: entry.error };
      }

      return {
        async stat() {
          return {
            size: options.oversized ? 999999 : (entry.size ?? Buffer.byteLength(text)),
            isFile: () => entry.isFile ?? true,
          };
        },
        async read(buffer) {
          await entry.beforeRead?.();

          if (entry.readError) {
            throw { code: entry.readError };
          }

          const n = buffer.write(entry.readText ?? text);

          return { bytesRead: n };
        },
        async close() {
          closed++;

          if (entry.closeError) {
            throw { code: entry.closeError };
          }
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

const statPath = '/proc/123/stat';
const schedPath = '/proc/123/schedstat';

function assertActivity(o, processActivity, age = 0) {
  const snapshot = o.snapshot();
  assert.equal(snapshot.processActivity, processActivity);
  assert.equal(snapshot.leaderCpuMs, null);
  assert.equal(snapshot.activitySampleAgeMs, age);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'activitySampleAgeMs',
    'dependencyCount',
    'devDependencyCount',
    'leaderCpuMs',
    'lockfile',
    'nodeModules',
    'processActivity',
  ]);
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE|SECRET|\/proc|123|ENOENT|EACCES|EIO|ELOOP/);
}

for (const code of ['ENOENT', 'EACCES', 'ELOOP']) {
  test(`optional schedstat ${code} preserves validated state without inventing CPU`, async () => {
    const files = { [statPath]: procStat(42, 'S') };

    if (code !== 'ENOENT') {
      files[schedPath] = { error: code };
    }

    const h = harness(files);
    const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
    h.timers[0].fn();
    await flush();
    assertActivity(o, 'sleeping');
    assert.deepEqual(
      h.calls.filter((path) => path.startsWith('/proc/')),
      [statPath, schedPath, statPath],
    );
    assert.equal(h.closed(), 2);
    o.stop();
  });
}

for (const [label, entry] of [
  ['read error', { text: '2000000 0 0\n', readError: 'EIO' }],
  ['close error', { text: '2000000 0 0\n', closeError: 'EIO' }],
  ['short regular file read', { text: '2000000 0 0\n', readText: '2000000 0\n' }],
  ['truncated proc record', { text: '2000000 0', size: 0 }],
  ['oversized proc record', { text: '1'.repeat(1025), size: 0 }],
  ['oversized declared file', { text: '2000000 0 0\n', size: 1025 }],
  ['nonregular file', { text: '2000000 0 0\n', isFile: false }],
]) {
  test(`optional schedstat ${label} preserves state and closes its handle`, async () => {
    const h = harness({ [statPath]: procStat(42, 'S'), [schedPath]: entry });
    const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
    h.timers[0].fn();
    await flush();
    assertActivity(o, 'sleeping');
    assert.equal(h.closed(), 3);
    o.stop();
  });
}

test('missing schedstat never retains CPU from an earlier valid sample', async () => {
  const files = { [statPath]: procStat(), [schedPath]: '2000000 0 0\n' };
  const h = harness(files);
  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
  h.timers[0].fn();
  await flush();
  assert.equal(o.snapshot().leaderCpuMs, 2);
  delete files[schedPath];
  files[statPath] = procStat(42, 'S');
  h.timers[1].fn();
  await flush();
  assertActivity(o, 'sleeping');
  o.stop();
});

test('missing schedstat does not bypass PID identity protection between samples', async () => {
  const files = { [statPath]: procStat(42, 'S') };
  const h = harness(files);
  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
  h.timers[0].fn();
  await flush();
  assertActivity(o, 'sleeping');
  files[statPath] = procStat(43, 'R');
  h.timers[1].fn();
  await flush();
  assertActivity(o, 'unknown', null);
  assert.equal(h.calls.filter((path) => path === schedPath).length, 1);
  o.stop();
});

for (const [label, replacement] of [
  ['changed start time', procStat(43, 'R')],
  ['mismatched PID', procStat().replace('123 (', '124 (')],
  ['truncated stat', { text: procStat().slice(0, -1), size: 0 }],
  ['denied stat', { error: 'EACCES' }],
  ['exited process', undefined],
]) {
  test(`optional schedstat cannot bypass revalidation after ${label} during the read`, async () => {
    const files = { [statPath]: procStat(42, 'S') };

    const h = harness(files, {
      beforeOpen(path) {
        if (path === schedPath) {
          if (replacement === undefined) {
            delete files[statPath];
          } else {
            files[statPath] = replacement;
          }
        }
      },
    });

    const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
    h.timers[0].fn();
    await flush();
    assertActivity(o, 'unknown', null);
    assert.deepEqual(
      h.calls.filter((path) => path.startsWith('/proc/')),
      [statPath, schedPath, statPath],
    );
    o.stop();
  });
}

for (const stage of ['schedstat', 'revalidation']) {
  for (const exited of [false, true]) {
    for (const reject of [false, true]) {
      test(`stop(${exited}) survives late ${stage} ${reject ? 'rejection' : 'completion'}`, async () => {
        let settle;
        let statOpens = 0;

        const pending = new Promise((resolve, rejectRead) => {
          settle = () => (reject ? rejectRead(new Error('PRIVATE')) : resolve());
        });

        const files = { [statPath]: procStat(42, 'S'), [schedPath]: '2000000 0 0\n' };

        const h = harness(files, {
          async beforeOpen(path) {
            if (path === statPath) {
              statOpens++;
            }

            if (
              (stage === 'schedstat' && path === schedPath) ||
              (stage === 'revalidation' && path === statPath && statOpens === 2)
            ) {
              await pending;
            }
          },
        });

        const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
        h.timers[0].fn();
        await flush();
        assert.equal(statOpens, stage === 'schedstat' ? 1 : 2);
        o.stop(exited);

        const stopped = o.snapshot();
        assertActivity(o, exited ? 'exited' : 'unknown', exited ? 0 : null);
        assert.ok(h.timers.every((timer) => timer.cleared));

        const callsAtStop = h.calls.length;
        settle();
        await flush();

        for (const timer of h.timers) {
          timer.fn();
        }
        await flush();
        assert.deepEqual(o.snapshot(), stopped);
        assert.equal(h.calls.length, callsAtStop);
        assert.equal(h.closed(), (stage === 'schedstat' ? 1 : 2) + (reject ? 0 : 1));
      });
    }
  }
}
