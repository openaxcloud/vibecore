import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { browserEndpoint, launchRuntimeChromium } from './runtime-browser-client.mjs';
import {
  containerArguments,
  IMAGE,
  PORTS,
  cleanupOwnedContainer,
  waitForBrowserServer,
  processIdentity,
  stopOwnedSupervisor,
  SUPERVISOR_STOP_PYTHON,
} from './runtime-browser-isolation.mjs';

const owner = '12345678-1234-1234-1234-123456789abc';

const env = {
  GITHUB_ACTIONS: 'true',
  RUNNER_ENVIRONMENT: 'github-hosted',
  VIBECORE_CI_EPHEMERAL_RUNTIME: '1',
  VIBECORE_CI_BROWSER_ISOLATION: '1',
  PW_TEST_CONNECT_WS_ENDPOINT: 'ws://127.0.0.1:18082/runtime-browser',
};

const source = () => readFileSync(new URL('./runtime-browser-isolation.mjs', import.meta.url), 'utf8');
test('remote transport is explicit, isolated-workflow-only and preserves launch settings', async () => {
  const calls = [];

  const chromium = {
    launch: async (options) => calls.push(['launch', options]),
    connect: async (...args) => calls.push(['connect', ...args]),
  };
  await launchRuntimeChromium(chromium, { headless: true, timeout: 10000 }, {});
  await launchRuntimeChromium(chromium, { headless: true, timeout: 10000 }, env);
  assert.deepEqual(calls[0], ['launch', { headless: true, timeout: 10000 }]);
  assert.deepEqual(calls[1], [
    'connect',
    env.PW_TEST_CONNECT_WS_ENDPOINT,
    { timeout: 10000, headers: { 'x-playwright-launch-options': '{"headless":true,"timeout":10000}' } },
  ]);
  await launchRuntimeChromium(chromium, { headless: true }, env);
  assert.equal(calls[2][2].timeout, 180000);

  for (const key of Object.keys(env).filter((key) => key !== 'PW_TEST_CONNECT_WS_ENDPOINT')) {
    assert.throws(() => browserEndpoint({ ...env, [key]: '' }), /guard/);
  }
  assert.throws(() => browserEndpoint({ ...env, PW_TEST_CONNECT_WS_ENDPOINT: 'ws://external.invalid' }), /guard/);
});
test('immutable official image and narrow mounts never expose host privileges or credentials', () => {
  const args = containerArguments('/tmp/runtime-browser', 1001, 1001, 'runtime-browser-123-1', owner);
  assert.match(IMAGE, /^mcr\.microsoft\.com\/playwright@sha256:[a-f0-9]{64}$/);
  assert.equal(args[args.indexOf('--network') + 1], 'bridge');
  assert.equal(args[args.indexOf('--user') + 1], '1001:1001');
  assert.ok(args.includes('--cap-drop=ALL'));
  assert.ok(args.includes('no-new-privileges'));
  assert.ok(args.includes('--read-only'));
  assert.equal(args.filter((arg) => arg === '--mount').length, 2);
  assert.doesNotMatch(
    args.join(' '),
    /--privileged|--publish|--network.?host|--ipc|docker.sock|kubeconfig|\.git|seccomp=unconfined|SYS_ADMIN/,
  );
  assert.deepEqual(PORTS, [3001, 3020, 5173, 5174, 18083, 18084]);
  assert.throws(() => containerArguments('/tmp/x', 0, 0, 'runtime-browser-1-1', owner));
});
test('official multi-client server and workflow preserve suite verdicts and cleanup', () => {
  const server = readFileSync(new URL('./runtime-browser-container.mjs', import.meta.url), 'utf8');
  assert.match(server, /'run-server'/);
  assert.doesNotMatch(server, /launchServer|chromiumSandbox|--no-sandbox/);

  const workflow = readFileSync(new URL('../../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');
  assert.match(
    workflow,
    /pnpm exec playwright test tests\/e2e --project=chromium --grep @runtime --retries=0 --max-failures=0/,
  );
  assert.ok(
    workflow.indexOf('Start isolated Chromium transport') < workflow.indexOf('Real static and Vite preview preflight'),
  );
  assert.ok(
    workflow.indexOf('Stop isolated Chromium transport') > workflow.indexOf('Diagnose runner network notifications'),
  );

  const smoke = readFileSync(new URL('./runtime-browser-lifecycle.checks.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /client < 2/);
  assert.match(smoke, /browser.close\(\)/);
});
test('cleanup requires locally recorded and inspected immutable container ownership', async () => {
  const id = 'a'.repeat(64);
  const calls = [];
  const read = async (path) => (path.endsWith('/owner') ? owner : id);

  const command = async (_, args) => {
    calls.push(args);
    return { stdout: owner };
  };
  assert.equal(await cleanupOwnedContainer('/tmp/ci', owner, command, read), 'removed');
  assert.deepEqual(calls[1], ['rm', '--force', id]);
  calls.length = 0;
  assert.equal(await cleanupOwnedContainer('/tmp/ci', owner, command, async () => ''), false);
  assert.equal(calls.length, 0);
  assert.equal(
    await cleanupOwnedContainer(
      '/tmp/ci',
      owner,
      async (_, args) => {
        calls.push(args);
        return { stdout: 'other' };
      },
      read,
    ),
    false,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'inspect');
  assert.equal(
    await cleanupOwnedContainer(
      '/tmp/ci',
      owner,
      async (_, args) => {
        if (args[0] === 'inspect') {
          throw new Error('missing');
        }

        assert.equal(args[0], 'ps');

        return { stdout: '' };
      },
      read,
    ),
    'absent',
  );
});
test('readiness traverses the server and fails within its own independent bound', async () => {
  let calls = 0;
  await waitForBrowserServer(async () => ++calls === 2, 500);
  assert.equal(calls, 2);
  await assert.rejects(
    waitForBrowserServer(async () => false, 20),
    /readiness/,
  );
  await assert.rejects(
    waitForBrowserServer(() => new Promise(() => {}), 20),
    /readiness/,
  );
  assert.ok(
    source().indexOf('await waitForBrowserServer(probeServer)') <
      source().indexOf("await writeFile(join(root, 'started')"),
  );
  assert.match(source(), /idleTimeoutMs: 90 \* 60_000/);
});
test('setup evidence projects only fixed categories and booleans within 4 KiB', async () => {
  const { createIsolationEvidence, saveIsolationEvidence } = await import('./runtime-browser-evidence.mjs');
  const evidence = createIsolationEvidence();

  for (let i = 0; i < 10000; i++) {
    evidence.record('readiness', 'started', 1794165000000 + i);
  }
  evidence.record('PRIVATE', 'PRIVATE');
  evidence.verify('PRIVATE');
  evidence.verify('clientVersion');
  assert.equal(evidence.snapshot().events.length, 16);
  assert.equal(evidence.snapshot().verified.clientVersion, true);
  assert.doesNotMatch(JSON.stringify(evidence.snapshot()), /PRIVATE/);
  assert.ok(Buffer.byteLength(JSON.stringify(evidence.snapshot())) < 4096);
  await assert.rejects(saveIsolationEvidence('/tmp', 'PRIVATE', evidence), /name/);
  await assert.rejects(
    saveIsolationEvidence('/tmp', 'runtime-browser-setup.json', evidence, () => new Promise(() => {})),
    /timeout/,
  );
});
test('transport lifetime and idle bounds cover the complete existing job budget', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');
  assert.match(workflow, /timeout-minutes: 90/);

  const container = readFileSync(new URL('./runtime-browser-container.mjs', import.meta.url), 'utf8');
  assert.match(source(), /deadline = setTimeout\(\(\) => void stop\(1\), 90 \* 60_000\)/);

  for (const text of [source(), container]) {
    assert.equal([...text.matchAll(/idleTimeoutMs: 90 \* 60_000/g)].length, 2);
    assert.doesNotMatch(text, /75 \* 60_000/);
  }
});
test('cleanup distinguishes no creation from missing, malformed or uncertain CID', async () => {
  const makeRead = (files) => async (path) => {
    const name = path.split('/').at(-1);

    if (Object.hasOwn(files, name)) {
      return files[name];
    }

    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  };

  const neverCommand = async () => assert.fail('must not contact Docker without owned CID');
  assert.equal(await cleanupOwnedContainer('/tmp/ci', owner, neverCommand, makeRead({ owner })), 'not_attempted');

  for (const files of [
    { owner, 'creation-attempted': 'attempted' },
    { owner, 'creation-attempted': '' },
    { owner, 'creation-attempted': 'attempted', 'container.id': '' },
    { owner, 'container.id': 'malformed' },
    { owner: 'other', 'container.id': 'a'.repeat(64) },
  ]) {
    assert.equal(await cleanupOwnedContainer('/tmp/ci', owner, neverCommand, makeRead(files)), false);
  }
  assert.equal(
    await cleanupOwnedContainer('/tmp/ci', owner, neverCommand, async (path) => {
      if (path.endsWith('/owner')) {
        return owner;
      }

      throw Object.assign(new Error('unreadable'), { code: 'EACCES' });
    }),
    false,
  );

  const calls = [];
  assert.equal(
    await cleanupOwnedContainer(
      '/tmp/ci',
      owner,
      async (_, args) => {
        calls.push(args[0]);
        throw new Error('daemon unavailable');
      },
      makeRead({ owner, 'container.id': 'a'.repeat(64) }),
    ),
    false,
  );
  assert.deepEqual(calls, ['inspect', 'ps']);
  assert.ok(
    source().indexOf("await writeFile(join(root, 'creation-attempted')") <
      source().indexOf("await exec('docker', containerArguments"),
  );
  assert.match(source(), /if \(!cleaned\) \{\s*throw new Error\('runtime_browser_cleanup_owner'\)/);
});
test('supervisor identity handles proc names and invokes pidfd only for its owner', async () => {
  const stat = `42 (node with ) spaces) S ${Array(18).fill('0').join(' ')} 12345 0`;
  assert.deepEqual(processIdentity(stat, 42), { pid: 42, start: '12345' });
  assert.throws(() => processIdentity(stat, 43), /identity/);

  const calls = [];
  const read = async (path) => (path.endsWith('/owner') ? owner : JSON.stringify({ pid: 42, start: '12345' }));
  await stopOwnedSupervisor('/tmp/ci', owner, async (...args) => calls.push(args), read);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'python3');
  assert.equal(calls[0][2].timeout, 21000);
  execFileSync('python3', ['-c', 'import ast,sys; ast.parse(sys.argv[1])', calls[0][1][1]], { timeout: 5000 });
  assert.match(calls[0][1][1], /pidfd_send_signal/);
  assert.doesNotMatch(calls[0][1][1], /os\.kill\(/);
  await assert.rejects(
    stopOwnedSupervisor(
      '/tmp/ci',
      owner,
      async () => assert.fail('must not signal'),
      async () => 'other',
    ),
    /owner/,
  );
});
test('pidfd shutdown never signals exited/replaced processes and fails closed', () => {
  const harness = `
class FakeOps:
    def __init__(self, polls, starts): self.polls, self.starts, self.signals, self.closed = list(polls), list(starts), [], False
    def open(self, pid): assert pid == 42; return 7
    def close(self, fd): assert fd == 7; self.closed = True
    def read_start(self, pid): return self.starts.pop(0)
    def exited(self, fd, timeout): assert fd == 7; return self.polls.pop(0)
    def signal(self, fd, sig): assert fd == 7; self.signals.append(sig)
RealOps = None
identity = {'pid': 42, 'start': '12345'}
for polls, starts, expected in [([True], [], []), ([False], ['different'], []), ([False, True], ['12345'], [signal.SIGTERM]), ([False, False, False], ['12345', 'different'], [signal.SIGTERM]), ([False, False, True], ['12345'], [signal.SIGTERM]), ([False, False, False, True], ['12345', '12345'], [signal.SIGTERM, signal.SIGKILL])]:
    ops = FakeOps(polls, starts)
    stop_supervisor(identity, ops)
    assert ops.signals == expected and ops.closed
class Unsupported(FakeOps):
    def open(self, pid): raise OSError('unsupported')
class Absent(FakeOps):
    def open(self, pid): raise AttributeError('pidfd_open')
class Denied(FakeOps):
    def open(self, pid): raise PermissionError('denied')
for kind in [Unsupported, Absent, Denied]:
    try: stop_supervisor(identity, kind([], []))
    except (OSError, AttributeError): pass
    else: raise AssertionError('must fail closed')
class Unreadable(FakeOps):
    def read_start(self, pid): raise PermissionError('unreadable')
ops = Unreadable([False], [])
try: stop_supervisor(identity, ops)
except PermissionError: pass
else: raise AssertionError('identity')
assert ops.closed and not ops.signals
class GoneOnSignal(FakeOps):
    def signal(self, fd, sig): raise ProcessLookupError('gone')
ops = GoneOnSignal([False], ['12345'])
stop_supervisor(identity, ops)
assert ops.closed and not ops.signals
ops = FakeOps([False, False, False, False], ['12345', '12345'])
try: stop_supervisor(identity, ops)
except RuntimeError: pass
else: raise AssertionError('deadline')
assert ops.closed and ops.signals == [signal.SIGTERM, signal.SIGKILL]
print('mock pidfd cases passed')
`;

  const output = execFileSync('python3', ['-c', SUPERVISOR_STOP_PYTHON + harness], { encoding: 'utf8', timeout: 5000 });
  assert.match(output, /mock pidfd cases passed/);

  const workflow = readFileSync(new URL('../../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');

  const cleanup = workflow.slice(
    workflow.indexOf('- name: Stop isolated Chromium transport'),
    workflow.indexOf('- name: Collect bounded diagnostics'),
  );
  assert.match(cleanup, /--stop-supervisor/);
  assert.doesNotMatch(cleanup, /kill(?: -KILL)? "/);
  assert.match(cleanup, /stop_status/);
  assert.match(cleanup, /cleanup_status/);
});
test('setup, supervisor stop and cleanup evidence have distinct fixed destinations', async () => {
  const { isolationEvidenceName, createIsolationEvidence } = await import('./runtime-browser-evidence.mjs');
  assert.deepEqual([undefined, '--stop-supervisor', '--cleanup'].map(isolationEvidenceName), [
    'runtime-browser-setup.json',
    'runtime-browser-stop.json',
    'runtime-browser-cleanup.json',
  ]);
  assert.throws(() => isolationEvidenceName('PRIVATE'), /mode/);

  const evidence = createIsolationEvidence();
  evidence.record('supervisor', 'started', 1794165000000);
  evidence.record('supervisor', 'succeeded', 1794165000001);
  assert.deepEqual(
    evidence.snapshot().events.map(({ phase, result }) => ({ phase, result })),
    [
      { phase: 'supervisor', result: 'started' },
      { phase: 'supervisor', result: 'succeeded' },
    ],
  );
  assert.ok(Buffer.byteLength(JSON.stringify(evidence.snapshot())) < 4096);
  assert.match(source(), /const evidenceName = isolationEvidenceName\(process.argv\[2\]\)/);
  assert.match(
    source(),
    /await begin\('supervisor'\);\s*await stopOwnedSupervisor\(root, owner\);\s*await record\('succeeded'\)/,
  );
});
