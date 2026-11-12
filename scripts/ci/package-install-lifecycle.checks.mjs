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
  assert.match(install, /dedicatedPackageInstall<PackageInstallResponse>/);
  assert.match(readFileSync('services/api/src/dedicated-package-install.ts', 'utf8'), /1,\s*remainingMs/);
  assert.doesNotMatch(install, /runLocalRuntimeCommand/);
});

function harness(fetch) {
  const deadlines = [];
  const managerCalls = [];

  let recoveryCalls = 0;

  const deps = {
    managerRequest: async (path) => {
      managerCalls.push(path);
      assert.equal(path, '/workspaces/workspace/agent-token');

      return { token: 'test-only' };
    },
    RUNTIME_PROXY_TIMEOUT_MS: 15_000,
    recoverStartingWorkspaceRead: () => {
      recoveryCalls++;
      assert.fail('read recovery must not run for these successful reads or POST commands');
    },
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

  return {
    deadlines,
    managerCalls,
    recoveryCalls: () => recoveryCalls,
    request: new Function(...Object.keys(deps), js)(...Object.values(deps)),
  };
}

test('actual agent hop honors install budget and leaves normal proxy deadline unchanged', async () => {
  const { deadlines, managerCalls, recoveryCalls, request } = harness(async () => Response.json({ code: 0 }));
  await request('workspace', '/commands/run', { method: 'POST' }, undefined, 1, 330_000);
  await request('workspace', '/files/tree');
  assert.deepEqual(deadlines, [330_000, 15_000]);
  assert.deepEqual(managerCalls, ['/workspaces/workspace/agent-token', '/workspaces/workspace/agent-token']);
  assert.equal(recoveryCalls(), 0);
});

test('actual single-attempt command hop does not replay a possibly executed POST on transport loss', async () => {
  let calls = 0;

  const { request, managerCalls, recoveryCalls } = harness(async () => {
    calls++;
    throw new DOMException('response lost', 'TimeoutError');
  });
  await assert.rejects(request('workspace', '/commands/run', { method: 'POST' }, undefined, 1, 330_000));
  assert.equal(calls, 1);
  assert.deepEqual(managerCalls, ['/workspaces/workspace/agent-token']);
  assert.equal(recoveryCalls(), 0);
});
