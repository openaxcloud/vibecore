import assert from 'node:assert/strict';
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
