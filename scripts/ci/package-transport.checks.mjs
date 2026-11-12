import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';
import ts from 'typescript';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { loadPackageTestModule } from './package-test-loader.mjs';

const { packageAgentHop } = loadPackageTestModule('services/api/src/package-agent-hop.ts');
const { dedicatedPackageInstall } = loadPackageTestModule('services/api/src/dedicated-package-install.ts');
const { packageInstallResult } = loadPackageTestModule('services/api/src/package-install-result.ts');
const body = { packageManager: 'npm', packages: ['is-odd'], dev: false, timeoutMs: 300000 };

async function server(handler) {
  const instance = createServer(handler);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${instance.address().port}`,
    async close() {
      instance.closeAllConnections();
      await new Promise((resolve) => instance.close(resolve));
    },
  };
}

async function harness({ stalled, status, malformed, lost = false } = {}) {
  const calls = [];

  const fixture = await server((request, response) => {
    const path = request.url;
    calls.push({ path, method: request.method, authorization: request.headers.authorization });
    response.setHeader('content-type', 'application/json');

    if (path === stalled) {
      response.writeHead(200);
      response.flushHeaders();
      response.write('{');

      return;
    }

    if (path.endsWith('/agent-token')) {
      response.end(JSON.stringify({ token: 'fixture-agent-token' }));
      return;
    }

    if (status) {
      response.writeHead(status).end('{}');
      return;
    }

    if (path === '/packages/v1/capabilities') {
      response.end(JSON.stringify({ version: 1, maxBudgetMs: 300000, validatedSpecs: 1 }));
      return;
    }

    if (lost) {
      request.socket.destroy();
      return;
    }

    let requestBody = '';
    request.on('data', (chunk) => {
      requestBody += chunk;
    });
    request.on('end', () => {
      calls.at(-1).body = JSON.parse(requestBody);
      response.end(malformed ?? JSON.stringify({ code: 0, signal: null, cancelled: false, timedOut: false }));
    });
  });

  const target = {
    workspaceId: 'fixture',
    agentUrl: fixture.url,
    managerUrl: fixture.url,
    managerSecret: 'fixture-manager-secret',
  };

  return { ...fixture, calls, target };
}

test('actual transport authenticates token and agent hops and dispatches exactly one POST', async () => {
  const h = await harness();

  try {
    const result = await dedicatedPackageInstall((...args) => packageAgentHop(h.target, ...args), body);
    assert.equal(packageInstallResult(result).success, true);
    assert.deepEqual(
      h.calls.map((call) => call.path),
      [
        '/workspaces/fixture/agent-token',
        '/packages/v1/capabilities',
        '/workspaces/fixture/agent-token',
        '/packages/v1/install',
      ],
    );
    assert.equal(h.calls.filter((call) => call.method === 'POST').length, 1);

    for (const call of h.calls) {
      assert.equal(
        call.authorization,
        call.path.endsWith('agent-token') ? 'Bearer fixture-manager-secret' : 'Bearer fixture-agent-token',
      );
    }
  } finally {
    await h.close();
  }
});

for (const stalled of ['/workspaces/fixture/agent-token', '/packages/v1/capabilities', '/packages/v1/install']) {
  test(`actual HTTP body at ${stalled} remains bounded after headers`, async () => {
    const h = await harness({ stalled });

    try {
      const start = performance.now();
      const install = stalled.endsWith('/install');
      await assert.rejects(
        packageAgentHop(
          h.target,
          install ? '/packages/v1/install' : '/packages/v1/capabilities',
          {
            method: install ? 'POST' : 'GET',
            signal: AbortSignal.timeout(60),
            ...(install ? { body: JSON.stringify(body) } : {}),
          },
          1,
          5000,
        ),
        { code: 'STREAM_ABORTED', statusCode: 499 },
      );
      assert.ok(performance.now() - start < 1500);
      assert.ok(h.calls.filter((call) => call.method === 'POST').length <= 1);
    } finally {
      await h.close();
    }
  });
}

for (const status of [401, 403, 404, 405, 429, 503]) {
  test(`actual HTTP capability status ${status} refuses mutation`, async () => {
    const h = await harness({ status });

    try {
      await assert.rejects(
        dedicatedPackageInstall((...args) => packageAgentHop(h.target, ...args), body),
        {
          statusCode: [404, 405].includes(status) ? 409 : [429, 503].includes(status) ? 502 : status,
        },
      );
      assert.equal(h.calls.filter((call) => call.method === 'POST').length, 0);
    } finally {
      await h.close();
    }
  });
}

for (const malformed of ['null', '', 'not-json', '[]']) {
  test(`actual HTTP malformed result ${JSON.stringify(malformed)} cannot become success`, async () => {
    const h = await harness({ malformed });

    try {
      await assert.rejects(
        dedicatedPackageInstall((...args) => packageAgentHop(h.target, ...args), body),
        { code: 'WORKSPACE_RUNTIME_BAD_RESPONSE' },
      );
      assert.equal(h.calls.filter((call) => call.method === 'POST').length, 1);
    } finally {
      await h.close();
    }
  });
}

test('lost response after actual HTTP POST is never replayed or replaced', async () => {
  const h = await harness({ lost: true });

  try {
    await assert.rejects(
      dedicatedPackageInstall((...args) => packageAgentHop(h.target, ...args), body),
      { code: 'WORKSPACE_AGENT_REQUEST_FAILED' },
    );
    assert.equal(h.calls.filter((call) => call.method === 'POST').length, 1);
    assert.equal(h.calls.length, 4);
  } finally {
    await h.close();
  }
});

for (const oldAgent of [false, true]) {
  test(`real API integration fixture ${oldAgent ? 'old' : 'compatible'} uses strict package protocol`, async () => {
    const source = readFileSync('services/api/src/tests/api.spec.ts', 'utf8');
    const ast = ts.createSourceFile('api.spec.ts', source, ts.ScriptTarget.Latest, true);

    const declaration = ast.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'startRuntimeServices',
    );
    assert.ok(declaration);

    const compiled = ts.transpileModule(declaration.getText(ast), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;

    const env = {};

    const start = new Function(
      'createServer',
      'WebSocketServer',
      'process',
      `${compiled}\nreturn startRuntimeServices;`,
    )(createServer, WebSocketServer, { env });

    const fixture = await start({ packageCapabilityMissing: oldAgent });

    try {
      const target = {
        workspaceId: 'fixture',
        agentUrl: env.WORKSPACE_AGENT_URL_TEMPLATE,
        managerUrl: env.WORKSPACE_MANAGER_URL,
      };

      const pending = dedicatedPackageInstall((...args) => packageAgentHop(target, ...args), body);

      if (oldAgent) {
        await assert.rejects(pending, { code: 'PACKAGE_INSTALL_CAPABILITY_REQUIRED' });
        assert.deepEqual(fixture.calls, ['GET /packages/v1/capabilities']);
        assert.deepEqual(fixture.packageInstallBodies, []);
      } else {
        assert.equal((await pending).code, 0);
        assert.deepEqual(fixture.calls, ['GET /packages/v1/capabilities', 'POST /packages/v1/install']);
        assert.deepEqual(fixture.packageInstallBodies, [body]);
      }

      assert.deepEqual(fixture.commandBodies, []);
    } finally {
      await fixture.close();
    }
  });
}

for (const [input, expected] of [
  [{ code: null }, { exitCode: -1, success: false, termination: 'unknown' }],
  [
    { code: 0, signal: 'SIGTERM' },
    { exitCode: -1, success: false, termination: 'interrupted' },
  ],
  [
    { code: 0, cancelled: true },
    { exitCode: 0, success: false, termination: 'interrupted' },
  ],
  [
    { code: 0, timedOut: true },
    { exitCode: 0, success: false, termination: 'timeout' },
  ],
  [
    { code: 0, signal: null },
    { exitCode: 0, success: true, termination: null },
  ],
]) {
  test(`observed package result ${JSON.stringify(input)} is classified without inventing exit`, () => {
    assert.deepEqual(packageInstallResult(input), expected);
  });
}

const agentSource = readFileSync('services/workspace-agent/src/app.ts', 'utf8');

const compile = (source) =>
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
    .outputText;
test('actual agent hook authenticates capability and install with workspace binding', async () => {
  const begin = agentSource.lastIndexOf("  app.addHook('onRequest'", agentSource.indexOf("\n  app.get('/health'"));
  const end = agentSource.indexOf("\n  app.get('/health'", begin);
  assert.ok(begin >= 0 && end > begin);

  for (const url of ['/packages/v1/capabilities', '/packages/v1/install']) {
    for (const [workspaceId, token, expected] of [
      ['workspace-a', '', 401],
      ['workspace-a', 'workspace-b', 401],
      ['', 'workspace-a', 503],
      ['workspace-a', 'workspace-a', undefined],
    ]) {
      let hook, verifiedWorkspace;

      const deps = {
        app: {
          addHook: (_name, callback) => {
            hook = callback;
          },
        },
        workspaceId,
        process: { env: { NODE_ENV: 'production' } },
        tokenSecret: 'fixture-key',
        workspaceAgentLocaleFromHeader: () => 'en',
        workspaceAgentMessage: (key) => key,
        readBearerToken: () => token,
        verifyAgentToken: (value, _secret, boundWorkspace) => {
          verifiedWorkspace = boundWorkspace;
          return value === boundWorkspace;
        },
      };
      new Function(...Object.keys(deps), compile(agentSource.slice(begin, end)))(...Object.values(deps));

      const reply = {
        code(value) {
          this.statusCode = value;
          return this;
        },
        send(value) {
          this.body = value;
          return this;
        },
      };
      await hook({ url, headers: {} }, reply);
      assert.equal(reply.statusCode, expected);

      if (workspaceId && token) {
        assert.equal(verifiedWorkspace, workspaceId);
      }
    }
  }
});

test('real API schema defaults dev false and HTTP preserves false/true while rejecting malformed values', async () => {
  const source = readFileSync('services/api/src/app.ts', 'utf8');
  const ast = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);

  const declaration = ast.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((item) => item.name.getText(ast) === 'packagesInstallSchema'),
  );
  assert.ok(declaration);

  const compiled = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const schema = new Function('z', compiled + '\nreturn packagesInstallSchema;')(z);

  for (const [input, expected] of [
    [{}, false],
    [{ dev: false }, false],
    [{ dev: true }, true],
  ]) {
    const parsed = schema.parse({ packageManager: 'npm', packages: ['is-odd'], timeoutMs: 300000, ...input });
    assert.equal(parsed.dev, expected);

    const h = await harness();

    try {
      await dedicatedPackageInstall((...args) => packageAgentHop(h.target, ...args), parsed);
      assert.equal(h.calls.filter((call) => call.method === 'POST').length, 1);
      assert.deepEqual(h.calls.at(-1).body, { ...body, dev: expected });
    } finally {
      await h.close();
    }
  }

  for (const dev of [null, 'false', 'true', 0, 1, {}, []]) {
    assert.equal(schema.safeParse({ ...body, dev }).success, false);
    assert.throws(() =>
      loadPackageTestModule('services/workspace-agent/src/package-install-contract.ts').packageInstallPlan({
        ...body,
        dev,
      }),
    );
  }
});
