import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  guard,
  monitorProjection,
  phaseReport,
  sentinelPayload,
  sampleModule,
  recordEvent,
  serializeReport,
  cycles,
  MAX_BYTES,
  LIMITS,
  settleSampling,
  recordCycleBoundary,
} from './runtime-network-sentinel.mjs';

const env = {
  GITHUB_ACTIONS: 'true',
  RUNNER_ENVIRONMENT: 'github-hosted',
  VIBECORE_CI_EPHEMERAL_RUNTIME: '1',
  RUNNER_TEMP: '/tmp/runner',
  KUBECONFIG: '/tmp/runner/vibecore-runtime/kubeconfig',
  WORKSPACE_AGENT_IMAGE: `vibecore/workspace-agent:ci-${'a'.repeat(40)}`,
};
test('requires disposable hosted runner, explicit kubeconfig and existing CI image', () => {
  assert.doesNotThrow(() => guard(env));

  for (const key of Object.keys(env)) {
    assert.throws(() => guard({ ...env, [key]: '' }), /sentinel_guard/);
  }
  assert.throws(() => guard({ ...env, KUBECONFIG: '/production/config' }), /sentinel_guard/);
  assert.throws(() => guard({ ...env, WORKSPACE_AGENT_IMAGE: 'unknown:latest' }), /sentinel_guard/);
});
test('projects chunked ip lines immediately without interface names or addresses', () => {
  const report = phaseReport();
  const accept = monitorProjection((type) => recordEvent(report, type, 123));
  accept('8: PRIVATE_INTERFACE inet 192.0.');
  accept('2.99/24\nDeleted 8: PRIVATE_INTERFACE: <UP>\n');
  accept(`${'PRIVATE_SECRET'.repeat(1000)}\n`);
  accept('9: PRIVATE_INTERFACE inet6 fe80::1234/64\n');

  const text = serializeReport(report);
  assert.equal(report.network.address, 2);
  assert.equal(report.network.link, 1);
  assert.doesNotMatch(text, /PRIVATE|192\.0|fe80|inet/);
  assert.deepEqual(report.events[0], { time: 123, type: 'address', count: 1 });
});
test('bounds events and serialized evidence, redacting generated credentials', () => {
  const report = phaseReport();

  for (let i = 0; i < 10000; i++) {
    recordEvent(report, 'link', 1794162000000 + i);
  }
  recordEvent(report, 'PRIVATE_SECRET', 1);
  assert.equal(report.events.length, 128);
  assert.equal(report.omittedEvents, 9872);
  assert.ok(
    Buffer.byteLength(serializeReport({ phases: { baseline: report, mutation: report, recovery: report } })) <
      MAX_BYTES,
    LIMITS,
    settleSampling,
    recordCycleBoundary,
  );
  assert.doesNotMatch(serializeReport({ status: 'secret-value' }, ['secret-value']), /secret-value/);
  assert.throws(() => serializeReport({ value: 'x'.repeat(MAX_BYTES) }), /sentinel_output_limit/);
});
test('runs exactly three cycles with cleanup and stops after a failed creation', async () => {
  const calls = [];
  const controller = new AbortController();
  assert.equal(
    await cycles(
      async (i) => calls.push(`create${i}`),
      async (i) => calls.push(`delete${i}`),
      controller.signal,
    ),
    3,
  );
  assert.deepEqual(calls, ['create0', 'delete0', 'create1', 'delete1', 'create2', 'delete2']);
  calls.length = 0;
  await assert.rejects(
    cycles(
      async () => {
        calls.push('create');
        throw new Error('synthetic');
      },
      async () => calls.push('delete'),
      controller.signal,
    ),
  );
  assert.deepEqual(calls, ['create', 'delete']);
  controller.abort();
  calls.length = 0;
  await assert.rejects(
    cycles(
      async () => calls.push('create'),
      async () => calls.push('delete'),
      controller.signal,
    ),
  );
  assert.deepEqual(calls, []);
});

test('a stalled sampling promise rejects within a bounded interval and cannot start another phase', async () => {
  let nextPhase = false;

  const start = Date.now();
  await assert.rejects(async () => {
    await settleSampling(new Promise(() => {}), 20);
    nextPhase = true;
  }, /sentinel_sampling_timeout/);
  assert.equal(nextPhase, false);
  assert.ok(Date.now() - start < 1000);
  assert.equal(LIMITS.podHold, 5000);
  assert.ok(LIMITS.main + LIMITS.settle + 2 * LIMITS.close + LIMITS.cleanup < 180000);
});

test('workflow keeps sentinel after the unchanged runtime suite and audit within the existing artifact budget', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');
  const validation = workflow.indexOf('name: Validate runtime harness');
  const suite = workflow.indexOf('name: Playwright @runtime suite');
  const audit = workflow.indexOf('name: IDE panel live audit');
  const sentinel = workflow.indexOf('name: Diagnose runner network notifications');
  const collection = workflow.indexOf('name: Collect bounded diagnostics');
  assert.ok(validation < suite && suite < audit && audit < sentinel && sentinel < collection);
  assert.match(workflow.slice(validation, suite), /node --test scripts\/ci\/runtime-network-sentinel\.checks\.mjs/);
  assert.match(
    workflow.slice(suite, audit),
    /pnpm exec playwright test tests\/e2e --project=chromium --grep @runtime --retries=0 --max-failures=0/,
  );
  assert.match(workflow.slice(audit, sentinel), /timeout 12m pnpm run ide:panel-audit/);
  assert.match(workflow.slice(sentinel, collection), /timeout-minutes: 3/);

  const collector = readFileSync(new URL('./collect-runtime-evidence.mjs', import.meta.url), 'utf8');
  assert.match(collector, /const maxTotal = 10 \* 1024 \* 1024/);
  assert.match(collector, /'tmp\/runtime-network-sentinel.json'/);
});

test('cycle boundaries retain only three numeric indexes and fixed timestamp fields', () => {
  const records = [];

  for (let cycle = 0; cycle < 1000; cycle++) {
    recordCycleBoundary(records, cycle, 'createStart', 10);
    recordCycleBoundary(records, cycle, 'ready', 20);
    recordCycleBoundary(records, cycle, 'deleteComplete', 30);
    recordCycleBoundary(records, cycle, 'PRIVATE_POD_NAME', 40);
  }
  recordCycleBoundary(records, 'PRIVATE_POD_NAME', 'ready', 40);
  recordCycleBoundary(records, 0, 'ready', 'PRIVATE_TIMESTAMP');
  recordCycleBoundary(records, 0, 'ready', Infinity);
  assert.deepEqual(
    records,
    [0, 1, 2].map((cycle) => ({ cycle, createStart: 10, ready: 20, deleteComplete: 30 })),
  );
  assert.doesNotMatch(serializeReport({ cycleBoundaries: records }), /PRIVATE/);

  const phase = phaseReport();

  for (let i = 0; i < 1000; i++) {
    recordEvent(phase, 'link', Date.now());
  }
  assert.ok(
    Buffer.byteLength(
      serializeReport({ cycleBoundaries: records, phases: { baseline: phase, mutation: phase, recovery: phase } }),
    ) < MAX_BYTES,
  );
});

test('module sampling uses fixed same-origin content and retains original bounded lifecycle', () => {
  assert.deepEqual(sentinelPayload('/sentinel-module/12.mjs'), {
    type: 'text/javascript',
    body: 'export const sentinel = "sentinel";',
  });
  assert.doesNotMatch(JSON.stringify(sentinelPayload('/PRIVATE?secret=PRIVATE')), /PRIVATE/);
  assert.deepEqual(phaseReport().chromiumModule, { attempted: 0, succeeded: 0, failed: 0, networkChanged: 0 });

  const source = readFileSync(new URL('./runtime-network-sentinel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setHeader\('connection', 'close'\)/);
  assert.match(source, /server.listen\(0, '127.0.0.1'\)/);
  assert.match(source, /const modulePath = `\/sentinel-module\/\$\{moduleSequence\+\+\}\.mjs`/);
  assert.match(source, /module\.sentinel === 'sentinel'/);
});

test('module timeouts and late responses never become successes or fetch network failures', async () => {
  assert.equal(await sampleModule('/fixed', async () => ({ sentinel: 'sentinel' })), true);
  assert.equal(await sampleModule('/fixed', async () => ({ sentinel: 'wrong' })), false);

  let resolve;

  const pending = new Promise((done) => {
    resolve = done;
  });

  const started = Date.now();
  const result = await sampleModule('/fixed', () => pending, 20);
  assert.equal(result, false);
  assert.ok(Date.now() - started < 1000);
  resolve({ sentinel: 'sentinel' });
  await Promise.resolve();
  assert.equal(result, false);

  const phase = phaseReport();
  recordEvent(phase, 'moduleNetworkChanged', 1794162000123);
  assert.equal(phase.chromium.networkChanged, 0);
  assert.equal(phase.chromiumModule.networkChanged, 1);
  recordEvent(phase, 'networkChanged', 1794162000124);
  assert.equal(phase.chromium.networkChanged, 1);
});
