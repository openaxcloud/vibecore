import assert from 'node:assert/strict';
import { constants, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { summarizeRuntimeApi } from './runtime-api-evidence.mjs';

const require = createRequire(import.meta.url);

const compile = (path) =>
  ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

const source = compile('services/workspace-agent/src/package-install-observation.ts');

const statLine = (identity = '42', state = 'R', pid = 123) =>
  `${pid} (PRIVATE COMMAND) ${state} ${Array.from({ length: 49 }, (_, i) => (i === 18 ? identity : '1')).join(' ')}\n`;

const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(options = {}) {
  const files = options.files ?? {};
  const calls = [];
  const timers = [];

  let reads = 0;
  let closes = 0;
  let now = 100;

  const fs = {
    async lstat(path) {
      calls.push(['lstat', path]);

      if (options.lstat) {
        return options.lstat(path);
      }

      if (!(path in files)) {
        throw { code: 'ENOENT' };
      }

      return { isFile: () => !path.endsWith('node_modules'), isDirectory: () => path.endsWith('node_modules') };
    },
    async open(path, flags) {
      calls.push(['open', path, flags]);

      if (options.open) {
        return options.open(path, flags);
      }

      if (!(path in files)) {
        throw { code: 'ENOENT' };
      }

      const content = files[path];

      return {
        async stat() {
          return { isFile: () => true, size: path.startsWith('/proc/') ? 0 : Buffer.byteLength(content) };
        },
        async read(buffer, offset, length, position) {
          reads++;

          const text = options.read ? options.read(path, content, reads) : content;
          const bytesRead = buffer.write(text.slice(position), offset, length);

          return { bytesRead };
        },
        async close() {
          closes++;
        },
      };
    },
  };

  const exports = {};
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', 'performance', source)(
    (name) =>
      name === 'node:fs/promises'
        ? options.realFs
          ? require(name)
          : fs
        : name === 'node:fs' && options.flags
          ? { constants: options.flags }
          : require(name),
    exports,
    (fn, delay) => {
      const t = { fn, delay, unref() {}, cleared: false };
      timers.push(t);

      return t;
    },
    (t) => {
      t.cleared = true;
    },
    { now: () => now },
  );

  return {
    ...exports,
    calls,
    timers,
    get reads() {
      return reads;
    },
    get closes() {
      return closes;
    },
    advance(ms) {
      now += ms;
    },
  };
}

function project(value) {
  const e = {};
  new Function('exports', compile('services/api/src/package-execution-diagnostic.ts'))(e);

  return e.packageExecutionDiagnostic(300000, { executionDiagnostic: { installObservation: value } });
}

test('review: truncated schedstat cannot become observed CPU', () => {
  const h = harness();

  for (const input of ['2000000', '2000000 0', '2000000 0 x\n', '2000000 0 0\nTRAILING']) {
    assert.equal(h.processSample(statLine(), input).leaderCpuMs, null, input);
  }
});
test('review: truncated stat cannot become observed process state', () => {
  const h = harness();

  for (const input of [
    '123 (PRIVATE) S 1 2',
    statLine().trimEnd(),
    statLine().split(' ').slice(0, -1).join(' ') + '\n',
  ]) {
    assert.deepEqual(h.processSample(input, '2000000 0 0\n'), { processActivity: 'unknown', leaderCpuMs: null });
  }
});
test('review: manifest short read with a valid JSON prefix is unknown', async () => {
  const h = harness({
    files: { '/safe/package.json': '{} INVALID TRAILING DATA' },
    read: (_p, text) => text.slice(0, 2),
  });

  const o = h.observePackageInstall('/safe', 'npm', ['install'], undefined);
  await flush();
  assert.equal(o.snapshot().dependencyCount, null);
  assert.equal(h.closes, 1);
  o.stop();
});
test('review: unsupported nofollow/nonblock fail closed without opening manifest', async () => {
  for (const flags of [
    { O_RDONLY: 0, O_NONBLOCK: constants.O_NONBLOCK },
    { O_RDONLY: 0, O_NOFOLLOW: constants.O_NOFOLLOW },
  ]) {
    const h = harness({ files: { '/safe/package.json': '{}' }, flags });
    const o = h.observePackageInstall('/safe', 'npm', ['install']);
    await flush();
    assert.equal(o.snapshot().dependencyCount, null);
    assert.equal(h.calls.filter((c) => c[0] === 'open').length, 0);
    o.stop();
  }
});
test('review: changed identity between stat and CPU reads invalidates whole sample', async () => {
  let stats = 0;

  const h = harness({
    files: { '/proc/123/stat': statLine(), '/proc/123/schedstat': '9000000 0 0\n' },
    read: (path, text) => (path.endsWith('/stat') ? statLine(++stats === 1 ? '42' : '43') : text),
  });

  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
  h.timers[0].fn();
  await flush();
  assert.equal(o.snapshot().leaderCpuMs, null);
  assert.equal(o.snapshot().processActivity, 'unknown');
  o.stop();
});
test('review: pid mismatch never contributes state or CPU', async () => {
  const h = harness({ files: { '/proc/123/stat': statLine('42', 'R', 999), '/proc/123/schedstat': '9000000 0 0\n' } });
  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
  h.timers[0].fn();
  await flush();
  assert.equal(o.snapshot().leaderCpuMs, null);
  assert.equal(o.snapshot().processActivity, 'unknown');
  o.stop();
});
test('review: state and reliable CPU units remain leader-only and bounded', () => {
  const h = harness();

  for (const [state, expected] of [
    ['R', 'running'],
    ['S', 'sleeping'],
    ['D', 'uninterruptible'],
    ['Z', 'zombie'],
    ['T', 'unknown'],
  ]) {
    assert.deepEqual(h.processSample(statLine('42', state), '123456789 123 2\n'), {
      processActivity: expected,
      leaderCpuMs: 123,
    });
  }
  assert.equal(h.processSample(statLine(), '86400001000000 0 0\n').leaderCpuMs, 86400000);
  assert.equal(h.processSample(statLine(), '9999999999999999999 0 0\n').leaderCpuMs, null);
});
test('review: sample age starts before delayed reads, not on completion', async () => {
  const h = harness({
    files: { '/proc/123/stat': statLine(), '/proc/123/schedstat': '2000000 0 0\n' },
    read: (_path, text) => {
      h.advance(200);
      return text;
    },
  });

  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
  h.timers[0].fn();
  await flush();
  assert.equal(o.snapshot().activitySampleAgeMs, 600);
  o.stop();
});
test('review: denied and missing proc access stay unknown without retry/overlap', async () => {
  for (const code of ['ENOENT', 'EACCES', 'EPERM', 'ENOSYS']) {
    const h = harness({
      open: async () => {
        throw { code };
      },
    });

    const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
    h.timers[0].fn();
    await flush();
    assert.equal(o.snapshot().leaderCpuMs, null);
    assert.equal(o.snapshot().processActivity, 'unknown');
    o.stop();
  }
});
test('review: stopped pending reads never publish or add timers', async () => {
  let resolve;

  const h = harness({
    open: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });

  const o = h.observePackageInstall('/safe', 'npm', ['install'], 123);
  h.timers[0].fn();
  o.stop(true);
  resolve({
    async stat() {
      return { isFile: () => true, size: 0 };
    },
    async read(buffer) {
      return { bytesRead: buffer.write(statLine()) };
    },
    async close() {},
  });
  await flush();
  assert.equal(o.snapshot().processActivity, 'exited');
  assert.equal(o.snapshot().leaderCpuMs, null);
  assert.equal(h.timers.length, 6);
  assert.ok(h.timers.every((t) => t.cleared));
});

async function waitUntil(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(predicate(), 'bounded real-filesystem observation did not complete');
}
test('review: final-component symlinks and giant manifests are not followed/read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'package-observation-review-'));

  try {
    const outside = join(dir, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'package.json'), '{"dependencies":{"PRIVATE":"SECRET"}}');
    await mkdir(join(outside, 'node_modules'));

    const cwd = join(dir, 'cwd');
    await mkdir(cwd);
    await symlink(join(outside, 'package.json'), join(cwd, 'package.json'));
    await symlink(join(outside, 'package.json'), join(cwd, 'package-lock.json'));
    await mkdir(join(cwd, 'node_modules'));

    const h = harness({ realFs: true });
    const o = h.observePackageInstall(cwd, 'npm', ['install']);
    await waitUntil(() => o.snapshot().nodeModules === 'present');
    assert.equal(o.snapshot().dependencyCount, null);
    assert.equal(o.snapshot().lockfile, 'unknown');
    o.stop();
    await rm(join(cwd, 'package.json'));
    await writeFile(join(cwd, 'package.json'), '{}');
    await rm(join(cwd, 'node_modules'), { recursive: true });
    await symlink(join(outside, 'node_modules'), join(cwd, 'node_modules'));

    const modules = h.observePackageInstall(cwd, 'npm', ['install']);
    await waitUntil(() => modules.snapshot().dependencyCount === 0);
    assert.equal(modules.snapshot().nodeModules, 'unknown');
    modules.stop();
    await writeFile(join(cwd, 'package.json'), Buffer.alloc(65537, 32));
    await writeFile(join(cwd, 'yarn.lock'), '');

    const oversized = h.observePackageInstall(cwd, 'npm', ['install']);
    await waitUntil(() => oversized.snapshot().lockfile === 'present');
    assert.equal(oversized.snapshot().dependencyCount, null);
    oversized.stop();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test(
  'review: current Linux procfs supplies complete leader records with reliable CPU units',
  { skip: process.platform !== 'linux' },
  async () => {
    const h = harness({ realFs: true });
    const o = h.observePackageInstall('/nonexistent-observation-fixture', 'npm', ['install'], process.pid);

    try {
      h.timers[0].fn();
      await waitUntil(() => o.snapshot().activitySampleAgeMs !== null);
      assert.ok(['running', 'sleeping'].includes(o.snapshot().processActivity));
      assert.ok(Number.isInteger(o.snapshot().leaderCpuMs));
      assert.ok(o.snapshot().leaderCpuMs >= 0);
    } finally {
      o.stop();
    }
  },
);
test('review: every projected field rejects injection independently on both boundaries', () => {
  const keys = [
    'lockfile',
    'nodeModules',
    'dependencyCount',
    'devDependencyCount',
    'processActivity',
    'leaderCpuMs',
    'activitySampleAgeMs',
  ];

  for (const field of keys) {
    for (const malicious of [
      'SECRET https://private/path?token=secret',
      { argv: 'PRIVATE' },
      ['PRIVATE'],
      -1,
      1.25,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      9007199254740992,
    ]) {
      const raw = { [field]: malicious, command: 'PRIVATE', env: { KEY: 'SECRET' }, pid: 123, path: '/PRIVATE' };
      const a = project(raw);
      const b = summarizeRuntimeApi(JSON.stringify({ event: 'package.install.execution', installObservation: raw }));

      for (const value of [a.installObservation, b.packageExecutions[0].installObservation]) {
        assert.deepEqual(Object.keys(value), keys);
        assert.doesNotMatch(JSON.stringify(value), /SECRET|PRIVATE|https|command|argv|pid|path/);
      }
    }
  }
});
test('review: array, null and primitive observations are absent at both boundaries', () => {
  for (const raw of [null, [], 1, 'SECRET', false]) {
    assert.equal(project(raw).installObservation, undefined);
    assert.equal(
      summarizeRuntimeApi(JSON.stringify({ event: 'package.install.execution', installObservation: raw }))
        .packageExecutions[0].installObservation,
      undefined,
    );
  }
});
test('review: no hidden command, network, proc environment or descendant observation source', () => {
  const raw = readFileSync('services/workspace-agent/src/package-install-observation.ts', 'utf8');
  assert.doesNotMatch(raw, /\b(fetch|spawn|execFile|execSync|readFile|readFileSync|readdir)\s*\(/);
  assert.doesNotMatch(raw, /\/environ|\/cmdline|\/task\//);
  assert.doesNotMatch(raw, /node:https|node:http|node:net|node:child_process/);
});
