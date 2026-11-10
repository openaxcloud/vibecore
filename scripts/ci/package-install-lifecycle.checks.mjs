import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const api = readFileSync('services/api/src/app.ts', 'utf8');
const start = api.indexOf('  const agentRequest = async');
const end = api.indexOf('\n  /*', api.indexOf('\n  };', start));
const functionSource = api.slice(start, end);
const installStart = api.indexOf("app.post('/projects/:projectId/packages/install'");
const install = api.slice(installStart, api.indexOf('\n  app.', installStart + 1));

test('install dispatch uses one attempt and a command-specific deadline, never a fallback after uncertain dispatch', () => {
  assert.match(install.replace(/\/\/[^\n]*/g, ''), /undefined,\s*1,\s*commandBody.timeoutMs! \+ 30_000/);
  assert.match(install, /!localRuntimeFallbackEnabled\(\) \|\| !isRuntimeManagerUnavailable\(error\)/);
});

function harness(fetch) {
  const deadlines = [];

  const deps = {
    agentToken: async () => 'test-only',
    agentBaseUrl: () => 'https://fixture.invalid',
    AGENT_REQUEST_ATTEMPTS: 3,
    withRequestTimeout: (init, timeout = 15_000) => {
      deadlines.push(timeout);

      return { init, done() {} };
    },
    fetch,
    shouldRetryAgentHop: ({ attempt, maxAttempts }) => attempt < maxAttempts,
    agentSleep: async () => {},
    agentRetryDelay: () => 0,
    isWorkspaceDnsNotResolvedYet: () => false,
    appPublicEnglish: (key) => key,
    readJsonBody: (response) => response.json(),
  };
  const js = ts.transpileModule(`${functionSource}\nreturn agentRequest;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;

  return { deadlines, request: new Function(...Object.keys(deps), js)(...Object.values(deps)) };
}

test('actual agent hop honors install budget and leaves normal proxy deadline unchanged', async () => {
  const { deadlines, request } = harness(async () => Response.json({ code: 0 }));
  await request('workspace', '/commands/run', { method: 'POST' }, undefined, 1, 330_000);
  await request('workspace', '/files/tree');
  assert.deepEqual(deadlines, [330_000, 15_000]);
});

test('actual single-attempt command hop does not replay a possibly executed POST on transport loss', async () => {
  let calls = 0;

  const { request } = harness(async () => {
    calls++;
    throw new DOMException('response lost', 'TimeoutError');
  });
  await assert.rejects(request('workspace', '/commands/run', { method: 'POST' }, undefined, 1, 330_000));
  assert.equal(calls, 1);
});
