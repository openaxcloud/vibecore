import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { projectRequestFailure, createBrowserNetworkEvidence } from './browser-network-evidence.mjs';

const request = (url, errorText = 'net::ERR_NETWORK_CHANGED', kind = 'script') => ({
  url: () => url,
  failure: () => ({ errorText }),
  resourceType: () => kind,
});
test('retains only fixed classifications and timestamps for actual failed requests', () => {
  const output = projectRequestFailure(request('http://127.0.0.1:5173/assets/PRIVATE.js?token=PRIVATE_TOKEN'), 123);
  assert.deepEqual(output, {
    time: 123,
    error: 'networkChanged',
    resource: 'script',
    origin: 'app',
    route: 'builtScript',
  });
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|http|token/);
  assert.equal(
    projectRequestFailure(request('http://PRIVATE-5173.localhost:3020/secret', 'net::ERR_ABORTED', 'fetch')).error,
    'aborted',
  );
  assert.equal(projectRequestFailure(request('http://ws-example-5173.localhost:3020/secret')).origin, 'preview');
  assert.equal(
    projectRequestFailure(request('http://127.0.0.1:3001/api/runtime/workspaces/PRIVATE/files')).route,
    'runtimeApi',
  );
  assert.equal(
    projectRequestFailure(request('http://127.0.0.1:5173/api/projects/PRIVATE/ide-state')).route,
    'ideState',
  );
});
test('arbitrary errors, URLs, resource kinds and malformed data never escape', () => {
  for (const url of ['PRIVATE_URL', 'https://PRIVATE_USER:PRIVATE_PASSWORD@example.invalid/PRIVATE?PRIVATE_TOKEN']) {
    const output = projectRequestFailure(request(url, 'PRIVATE_ERROR', 'PRIVATE_RESOURCE'), NaN);
    assert.doesNotMatch(JSON.stringify(output), /PRIVATE|example|PASSWORD/);
    assert.equal(output.time, null);
    assert.equal(output.error, 'other');
  }
});
test('failure evidence keeps bounded first and last records with no effect on the request', () => {
  const evidence = createBrowserNetworkEvidence();

  for (let index = 0; index < 10000; index++) {
    evidence.capture(request(`http://127.0.0.1:5173/assets/PRIVATE${index}.js`));
  }

  const snapshot = evidence.snapshot();
  assert.equal(snapshot.total, 10000);
  assert.equal(snapshot.events.length, 128);
  assert.equal(snapshot.omitted, 9872);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 24 * 1024);
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE/);
});

test('passive IP timeline coalesces seconds and remains bounded without raw lines', async () => {
  const { createNetworkTimeline } = await import('./runtime-network-observer.mjs');
  const timeline = createNetworkTimeline();
  timeline.capture('PRIVATE_INTERFACE', 1);

  for (let i = 0; i < 10000; i++) {
    timeline.capture('address', i * 1000);
    timeline.capture('link', i * 1000);
  }

  const result = timeline.snapshot();
  assert.deepEqual(result.counts, { address: 10000, link: 10000 });
  assert.equal(result.events.length, 384);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 28 * 1024);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

test('passive observer surrounds the actual suite and audit without changing either verdict', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');
  const start = workflow.indexOf('name: Observe runner network events read-only');
  const suite = workflow.indexOf('name: Playwright @runtime suite');
  const audit = workflow.indexOf('name: IDE panel live audit');
  const stop = workflow.indexOf('name: Stop passive network observer');
  assert.ok(start > 0 && start < suite && suite < audit && audit < stop);
  assert.match(workflow.slice(suite, audit), /--grep @runtime --retries=0 --max-failures=0/);

  const auditSource = readFileSync(new URL('../audit-ide-panels.mjs', import.meta.url), 'utf8');
  assert.equal(
    auditSource.match(/page.on\('requestfailed', \(request\) => browserNetworkDiagnostics.capture\(request\)\)/g)
      ?.length,
    4,
  );
  assert.match(auditSource, /browserNetworkDiagnostics: browserNetworkDiagnostics.snapshot\(\)/);
});

test('observer shutdown exits cleanly once and forcibly bounds a blocked final write', async () => {
  const { boundedObserverStop } = await import('./runtime-network-observer.mjs');
  const calls = [];

  const normal = boundedObserverStop(
    {
      clear: () => calls.push('clear'),
      kill: () => calls.push('kill'),
      save: async () => calls.push('save'),
      exit: (code) => calls.push(code),
    },
    20,
  );
  await normal();
  await normal();
  assert.deepEqual(calls, ['clear', 'kill', 'save', 0]);

  let finish;

  const exited = new Promise((resolve) => {
    finish = resolve;
  });

  const blocked = boundedObserverStop(
    {
      clear: () => {},
      kill: () => {},
      save: () => new Promise(() => {}),
      exit: finish,
    },
    20,
  );

  const started = Date.now();
  void blocked();
  assert.equal(await exited, 1);
  assert.ok(Date.now() - started < 1000);
});
