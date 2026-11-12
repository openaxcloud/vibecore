import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeRuntimeApi } from './runtime-api-evidence.mjs';

const line = (entry) => JSON.stringify(entry);

test('summarizes real log shapes without double-counting or retaining credentials', () => {
  const log = [
    'non-json startup message',
    line({
      reqId: 'a',
      req: { method: 'POST', url: '/api/runtime/workspaces?token=private', headers: { secret: 'private' } },
    }),
    line({ reqId: 'a', statusCode: 502, time: 1 }),
    line({ reqId: 'a', res: { statusCode: 502 }, time: 1 }),
    line({ reqId: 'b', req: { method: 'GET', url: '/auth/me' } }),
    line({ reqId: 'b', statusCode: 200 }),
    line({ reqId: 'c', req: { method: 'GET', url: '/api/runtime/workspaces/ws-a/files' } }),
    line({ reqId: 'c', res: { statusCode: 200 } }),
  ].join('\n');

  const result = summarizeRuntimeApi(log);
  assert.equal(result.completed, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.errors, [{ method: 'POST', path: '/api/runtime/workspaces', status: 502, time: 1 }]);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('retains bounded first and last failures rather than losing preflight evidence', () => {
  const log = Array.from({ length: 200 }, (_, index) => [
    line({ reqId: String(index), req: { method: 'GET', url: `/api/runtime/workspaces/ws-${index}/status` } }),
    line({ reqId: String(index), statusCode: 500, time: index }),
  ])
    .flat()
    .join('\n');

  const result = summarizeRuntimeApi(log);
  assert.equal(result.failed, 200);
  assert.equal(result.errors.length, 60);
  assert.equal(result.errors[0].time, 0);
  assert.equal(result.errors.at(-1).time, 199);
});

test('IDE failures expose only fixed categories and bounded metadata, never IDs or queries', () => {
  const lines = [];

  for (let index = 0; index < 100; index++) {
    lines.push(
      JSON.stringify({
        reqId: String(index),
        req: {
          method: 'PUT',
          url: '/workspaces/SECRET_WORKSPACE/ide-state?token=SECRET_TOKEN',
          headers: { authorization: 'SECRET_HEADER' },
          body: 'SECRET_BODY',
        },
      }),
    );
    lines.push(JSON.stringify({ reqId: String(index), statusCode: 412, time: index }));
  }

  const result = summarizeRuntimeApi(lines.join('\n'));
  assert.equal(result.ideStateFailures.length, 60);
  assert.deepEqual(result.ideStateFailures[0], {
    method: 'PUT',
    category: 'workspace-ide-state',
    status: 412,
    time: 40,
  });
  assert.doesNotMatch(JSON.stringify(result), /SECRET|token|headers|body/);
  assert.equal(result.completed, 0);
});

test('IDE metadata rejects arbitrary methods and timestamps and ignores unrelated routes', () => {
  const result = summarizeRuntimeApi(
    [
      { reqId: '1', req: { method: 'SECRET_METHOD', url: '/api/projects/SECRET_ID/ide-state' } },
      { reqId: '1', res: { statusCode: 412 }, time: 'SECRET_TIME' },
      { reqId: '2', req: { method: 'PUT', url: '/projects/SECRET_ID/other' } },
      { reqId: '2', statusCode: 500 },
    ]
      .map(JSON.stringify)
      .join('\n'),
  );
  assert.deepEqual(result.ideStateFailures, [
    { method: 'OTHER', category: 'project-ide-state', status: 412, time: null },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test('snapshot upstream category survives projection without arbitrary exception or identity fields', () => {
  const log = [
    { reqId: 'PRIVATE', req: { method: 'GET', url: '/api/runtime/workspaces/PRIVATE/logs/snapshot?token=PRIVATE' } },
    {
      reqId: 'PRIVATE',
      msg: 'request failed with server error',
      code: 'WORKSPACE_MANAGER_REQUEST_FAILED',
      err: { upstreamStatus: 404, managerStatus: 404, message: 'PRIVATE', stack: 'PRIVATE', code: 'PRIVATE' },
    },
    { reqId: 'PRIVATE', statusCode: 502, time: 123 },
    { reqId: 'PRIVATE', res: { statusCode: 502 }, time: 124 },
  ]
    .map(line)
    .join('\n');

  const result = summarizeRuntimeApi(log);
  assert.deepEqual(result.snapshotFailures, [
    { status: 502, time: 123, category: 'WORKSPACE_MANAGER_REQUEST_FAILED', upstreamStatus: 404, managerStatus: 404 },
  ]);
  assert.doesNotMatch(JSON.stringify(result.snapshotFailures), /PRIVATE|token|stack/);
  assert.equal(result.failed, 1);
});

test('snapshot failures preserve auth and server statuses; unknown errors never become missing workspace', () => {
  const entries = [];

  for (let i = 0; i < 100; i++) {
    entries.push({ reqId: String(i), req: { method: 'GET', url: '/api/runtime/workspaces/PRIVATE/logs/snapshot' } });
    entries.push({
      reqId: String(i),
      msg: 'request failed with server error',
      code: 'PRIVATE',
      err: { upstreamStatus: '404', managerStatus: 403 },
    });
    entries.push({ reqId: String(i), statusCode: 502, time: i });
  }

  const result = summarizeRuntimeApi(entries.map(line).join('\n'));
  assert.equal(result.snapshotFailures.length, 60);
  assert.equal(result.snapshotFailuresTotal, 100);
  assert.equal(result.snapshotFailuresOmitted, 40);
  assert.equal(result.snapshotFailures[0].time, 0);
  assert.equal(result.snapshotFailures.at(-1).time, 99);
  assert.equal(result.snapshotFailures[0].category, 'other');
  assert.equal(result.snapshotFailures[0].upstreamStatus, null);
  assert.equal(result.snapshotFailures[0].managerStatus, 403);
  assert.equal(result.failed, 100);
});

test('snapshot projection matches actual manager error construction and Fastify error logger', () => {
  const api = readFileSync(new URL('../../services/api/src/app.ts', import.meta.url), 'utf8');
  const manager = api.slice(api.indexOf('const managerRequest ='), api.indexOf('const workspaceAdmissions ='));
  assert.match(manager, /code: 'WORKSPACE_MANAGER_REQUEST_FAILED'/);
  assert.match(manager, /upstreamStatus: response.status/);
  assert.match(manager, /managerStatus: response.status/);
  assert.match(
    api,
    /request.log.error\(\s*\{ err: error, route: request.routeOptions.url \?\? request.url, code: error.code \?\? 'API_ERROR' \},\s*'request failed with server error'/,
  );
  assert.match(api, /app.get\('\/api\/runtime\/workspaces\/:workspaceId\/logs\/snapshot'/);
});

test('snapshot diagnosis rejects malformed statuses and unrelated suffix routes', () => {
  for (const [url, status] of [
    ['/api/runtime/workspaces/PRIVATE/logs/snapshot', 999],
    ['/api/runtime/PRIVATE/logs/snapshot', 502],
    ['/api/runtime/workspaces/PRIVATE/extra/logs/snapshot', 502],
  ]) {
    const result = summarizeRuntimeApi(
      [
        { reqId: 'PRIVATE', req: { method: 'GET', url } },
        { reqId: 'PRIVATE', statusCode: status },
      ]
        .map(line)
        .join('\n'),
    );
    assert.equal(result.snapshotFailuresTotal, 0);
  }
});
