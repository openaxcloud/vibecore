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
    ageMs: null,
    phase: 'unknown',
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
    timeline.capture('address', 1794161000000 + i * 1000);
    timeline.capture('link', 1794161000000 + i * 1000);
  }

  const result = timeline.snapshot();
  assert.deepEqual(result.counts, { address: 10000, link: 10000 });
  assert.equal(result.events.length, 256);
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

test('preserves exact bucket boundaries and bounded age without arbitrary phase text', async () => {
  const { createNetworkTimeline } = await import('./runtime-network-observer.mjs');
  const timeline = createNetworkTimeline();
  timeline.capture('address', 1234);
  timeline.capture('address', 1999);
  timeline.capture('address', 1100);
  assert.deepEqual(timeline.snapshot().events, [
    { time: 1000, type: 'address', count: 3, firstAt: 1100, lastAt: 1999 },
  ]);

  const timed = {
    ...request('http://127.0.0.1:5173/api/private'),
    timing: () => ({ startTime: 100 }),
  };
  assert.equal(projectRequestFailure(timed, 1234, 'loaded').ageMs, 1134);
  assert.equal(projectRequestFailure(timed, 1e12, 'PRIVATE').ageMs, 4500000);
  assert.equal(projectRequestFailure(timed, 99).ageMs, null);
  assert.doesNotMatch(JSON.stringify(projectRequestFailure(timed, 200, 'PRIVATE')), /PRIVATE/);
});

test('tracks fixed page lifecycle and detaches without changing navigation', async () => {
  const { EventEmitter } = await import('node:events');
  const page = new EventEmitter();
  const frame = {};
  page.mainFrame = () => frame;

  const evidence = createBrowserNetworkEvidence();
  const stop = evidence.trackPage(page);

  const req = {
    ...request('http://localhost:5173/assets/private.js'),
    frame: () => frame,
    isNavigationRequest: () => true,
  };
  evidence.capture(req);
  page.emit('request', req);
  evidence.capture(req);
  page.emit('domcontentloaded');
  evidence.capture(req);
  page.emit('load');
  evidence.capture(req);
  stop();
  evidence.capture(req);
  assert.deepEqual(
    evidence.snapshot().events.map((e) => e.phase),
    ['initial', 'loading', 'interactive', 'loaded', 'closed'],
  );
  assert.equal(page.eventNames().length, 0);
});

test('HTTP evidence separates statuses, projects routes and retains no arbitrary data', async () => {
  const { projectHttpFailure } = await import('./browser-network-evidence.mjs');

  const response = (status, path) => ({
    status: () => status,
    request: () => ({
      url: () => 'http://127.0.0.1:3001' + path,
      method: () => 'GET',
      resourceType: () => 'fetch',
      failure: () => null,
      timing: () => ({ startTime: 1 }),
    }),
    body: () => {
      throw new Error('must not read');
    },
    headers: () => {
      throw new Error('must not read');
    },
  });
  const event = projectHttpFailure(
    response(502, '/api/runtime/workspaces/SECRET/files/read?token=SECRET'),
    1794214126475,
    'SECRET',
  );
  assert.equal(event.route, 'runtimeFileRead');
  assert.equal(event.scenario, 'other');
  assert.equal(event.status, 502);
  assert.equal(JSON.stringify(event).includes('SECRET'), false);
  assert.equal(projectHttpFailure(response(200, '/'), 1), null);
  assert.equal(
    projectHttpFailure({
      status() {
        throw new Error('SECRET');
      },
    }),
    null,
  );

  for (const [path, category] of [
    ['/api/runtime/workspaces', 'runtimeWorkspaceCreate'],
    ['/api/projects/private/ide-panel/packages', 'panel:packages'],
    ['/api/projects/private/ide-panel/SECRET', 'panel:other'],
    ['/projects/private/ide-state', 'projectIdeState'],
  ]) {
    assert.equal(projectHttpFailure(response(404, path)).route, category);
  }
});
test('HTTP evidence is bounded to 128 events and 32KiB with independent snapshots', async () => {
  const { createBrowserHttpEvidence } = await import('./browser-network-evidence.mjs');
  const evidence = createBrowserHttpEvidence();

  const response = {
    status: () => 502,
    request: () => ({
      url: () => 'http://127.0.0.1:3001/api/runtime/workspaces/private/files/read',
      method: () => 'GET',
      resourceType: () => 'fetch',
      failure: () => null,
    }),
  };

  for (let i = 0; i < 10000; i++) {
    evidence.capture(response, 'object-storage');
  }

  const report = evidence.snapshot();
  assert.equal(report.total, 10000);
  assert.equal(report.events.length, 128);
  assert.equal(report.omitted, 9872);
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= 32768);
  report.events[0].route = 'tampered';
  assert.equal(evidence.snapshot().events[0].route, 'runtimeFileRead');
});

test('HTTP missing-file evidence distinguishes fixed targets without exposing paths or identities', async () => {
  const { projectHttpFailure, classifyRuntimeFileTarget } = await import('./browser-network-evidence.mjs');

  for (const [query, expected] of [
    ['', 'omitted'],
    ['path=.', 'root'],
    ['path=%2F', 'root'],
    ['path=', 'root'],
    ['path=package.json', 'package-manifest'],
    ['path=.%2Fpackage.json', 'package-manifest'],
    ['path=pnpm-lock.yaml', 'package-lock'],
    ['path=node_modules', 'dependencies-directory'],
    ['path=PRIVATE', 'other'],
    ['path=package.json&path=PRIVATE', 'multiple'],
    ['path=%2FPRIVATE%2Fpackage.json', 'other'],
    ['path=..%2Fpackage.json', 'other'],
  ]) {
    assert.equal(classifyRuntimeFileTarget(new URLSearchParams(query)), expected);

    const response = {
      status: () => 404,
      request: () => ({
        url: () =>
          'http://127.0.0.1:3001/api/runtime/workspaces/ws-0123456789abcdef/files/read?' + query + '&token=PRIVATE',
        method: () => 'GET',
        resourceType: () => 'fetch',
        failure: () => null,
      }),
      headers: () => {
        throw new Error('No header reads');
      },
      body: () => {
        throw new Error('No body reads');
      },
    };

    const event = projectHttpFailure(response, 123, 'packages');
    assert.equal(event.fileTarget, expected);
    assert.equal(event.workspaceReference, 'canonical-shaped');
    assert.equal(event.status, 404);
    assert.doesNotMatch(JSON.stringify(event), /PRIVATE|0123456789abcdef|token/);
  }
});
