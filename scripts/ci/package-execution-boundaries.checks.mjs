import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import test from 'node:test';
import ts from 'typescript';
import { loadPackageTestModule } from './package-test-loader.mjs';

const api = ts.createSourceFile(
  'app.ts',
  readFileSync(process.env.PACKAGE_BOUNDARY_API_SOURCE ?? 'services/api/src/app.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const agent = ts.createSourceFile(
  'app.ts',
  readFileSync('services/workspace-agent/src/app.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;

function find(source, predicate) {
  let found;

  const visit = (node) => {
    if (predicate(node)) {
      found = node;
    } else if (!found) {
      ts.forEachChild(node, visit);
    }
  };
  visit(source);
  assert.ok(found, 'Expected source declaration must exist');

  return found;
}

function declaration(source, name, dependencies = {}) {
  const node = find(
    source,
    (entry) =>
      (ts.isVariableDeclaration(entry) || ts.isFunctionDeclaration(entry)) && entry.name?.getText(source) === name,
  );

  const code = `${ts.isVariableDeclaration(node) ? 'const ' : ''}${node.getText(source)};`;

  return new Function(...Object.keys(dependencies), `${compile(code)}\nreturn ${name};`)(
    ...Object.values(dependencies),
  );
}

function route(path, dependencies) {
  const node = find(
    api,
    (entry) =>
      ts.isCallExpression(entry) &&
      entry.expression.getText(api) === 'app.post' &&
      ts.isStringLiteral(entry.arguments[0]) &&
      entry.arguments[0].text === path,
  );

  const code = compile(`const handler = ${node.arguments[1].getText(api)};`);

  return new Function(...Object.keys(dependencies), `${code}\nreturn handler;`)(...Object.values(dependencies));
}

function helper(path, name) {
  return loadPackageTestModule(path)[name];
}

const commandExecutionDiagnostic = helper(
  'services/workspace-agent/src/command-execution-diagnostic.ts',
  'commandExecutionDiagnostic',
);
const packageExecutionDiagnostic = helper(
  'services/api/src/package-execution-diagnostic.ts',
  'packageExecutionDiagnostic',
);

const packageInstallResult = helper('services/api/src/package-install-result.ts', 'packageInstallResult');
const redactAiValue = declaration(api, 'redactAiValue', { redactSecretString: (value) => value });
const project = { id: 'project', organizationId: 'organization' };
const authorized = { workspaceId: 'workspace', projectId: project.id, organizationId: project.organizationId };

const request = (body = {}) => ({
  params: { projectId: project.id, workspaceId: 'workspace', toolName: 'run_command' },
  body,
  currentUser: { id: 'user' },
});
const reply = () => ({
  code(value) {
    this.statusCode = value;
    return this;
  },
  send(value) {
    return value;
  },
});

async function agentResult(background = false) {
  const child = Object.assign(new EventEmitter(), { pid: 123, stdout: new EventEmitter(), stderr: new EventEmitter() });
  const terminalResults = new Map();

  const run = declaration(agent, 'runCommand', {
    commandExecutionDiagnostic,
    observePackageInstall: () => ({
      stop() {},
      snapshot() {
        return {
          lockfile: 'present',
          nodeModules: 'absent',
          dependencyCount: 7,
          devDependencyCount: 0,
          processActivity: 'sleeping',
          leaderCpuMs: 23,
          activitySampleAgeMs: 40,
        };
      },
    }),
    normalizeShellCommandArgs: (_command, args) => args,
    detectCommandAbuse: () => null,
    pinViteDevArgs: (_cwd, _command, args) => args,
    killStalePinnedDevServers: async () => null,
    createHash,
    randomUUID: () => 'fixture',
    spawn: () => child,
    sanitizedChildEnv: () => ({}),
    process: { env: {}, kill() {} },
    setTimeout: () => ({}),
    clearTimeout() {},
    StringDecoder,
    workspaceAgentError: () => new Error('fixture'),
  });
  const pending = run('/fixture', 'npm', ['install'], {
    background,
    timeoutMs: 30_000,
    maxOutputBytes: 1024,
    maxProcesses: 10,
    processes: new Map(),
    rememberTerminal: declaration(agent, 'rememberTerminal', { terminalResults }),
  });
  await Promise.resolve();
  child.stdout.emit('data', Buffer.from('ordinary stdout'));
  child.stderr.emit('data', Buffer.from('ordinary stderr'));
  child.emit('spawn');
  child.emit('close', 0, null);

  return { result: await pending, terminal: [...terminalResults.values()][0] };
}

function aiExecutor(commandResult, calls, overrides = {}) {
  return declaration(api, 'executeAiTool', {
    resolveProjectWorkspaceId: async () => 'workspace',
    store: {},
    requireProject: async () => project,
    requireOrganizationNotSuspended: async () => {},
    ensureQuota: async () => {},
    isTerminalAccessRevoked: async () => false,
    detectCommandAbuse: () => null,
    appPublicEnglish: (code) => code,
    ensureAiCommandAllowed() {},
    agentRequest: async (...args) => {
      calls.push(args);
      return commandResult;
    },
    recordUsage: async () => {},
    redactAiValue,
    ...overrides,
  });
}

const runtimeDependencies = (result, calls) => ({
  parse: (_schema, value) => value,
  workspaceParams: {},
  runtimeCommandSchema: {},
  authorizeRuntimeWorkspace: async () => authorized,
  isTerminalAccessRevoked: async () => false,
  detectCommandAbuse: () => null,
  agentRequest: async (...args) => {
    calls.push(args);
    return args[1] === '/sessions/capabilities' ? { trackedSessions: 1 } : result;
  },
});

test('actual shared-runner result loses only internal metadata before AI response and persistence', async () => {
  const { result } = await agentResult();
  assert.equal(result.executionDiagnostic.effectiveBudgetMs, 30_000);
  result.compatibilityField = { executionDiagnostic: 'existing nested user data', value: 123 };

  const original = structuredClone(result);
  const { executionDiagnostic: _internal, ...expected } = original;
  const calls = [];

  let saved;

  const executeAiTool = aiExecutor(result, calls);

  const handler = route('/projects/:projectId/ai/tools/:toolName', {
    parse: (_schema, value) => value,
    aiToolParams: {},
    aiToolSchema: {},
    requireProject: async () => project,
    store: {
      getAiConversation: async () => ({ projectId: project.id, userId: 'user' }),
      createAiMessage: async () => ({ id: 'message' }),
      listAiMessages: async () => [],
      createAiToolCall: async (value) => {
        saved = value;
        return value;
      },
    },
    executeAiTool,
    redactAiValue,
    audit: async () => {},
  });
  const response = await handler(
    request({ command: 'npm', args: ['install'], conversationId: 'conversation' }),
    reply(),
  );
  assert.deepEqual(response.output, expected);
  assert.deepEqual(response.toolCall.output, expected);
  assert.deepEqual(saved.output, expected);
  assert.deepEqual(result, original, 'Boundary filtering must not mutate the internal agent response');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], '/commands/run');
  assert.deepEqual(JSON.parse(calls[0][2].body), { command: 'npm', args: ['install'], timeoutMs: 120_000 });
});

test('AI boundary preserves legacy objects, arrays and non-object results', async () => {
  for (const result of [
    { code: 0, stdout: 'legacy', timedOut: false },
    { code: null, signal: 'SIGTERM', timedOut: true, stdout: '', stderr: 'interrupted' },
    { code: 7, signal: null, timedOut: false, stdout: '', stderr: 'failed' },
    [],
    ['legacy'],
    null,
    0,
    false,
    'legacy',
  ]) {
    const output = await aiExecutor(result, [])(request(), project, 'run_command', { command: 'echo', args: [] });
    assert.deepEqual(output.output, result);
  }
});

test('AI authorization and command-policy failures still prevent dispatch', async () => {
  const blocked = new Error('command policy fixture');

  for (const [overrides, expected] of [
    [{ isTerminalAccessRevoked: async () => true }, (error) => error.code === 'TERMINAL_ACCESS_DENIED'],
    [
      {
        ensureAiCommandAllowed() {
          throw blocked;
        },
      },
      (error) => error === blocked,
    ],
  ]) {
    const calls = [];
    await assert.rejects(
      aiExecutor({}, calls, overrides)(request(), project, 'run_command', { command: 'echo', args: [] }),
      expected,
    );
    assert.equal(calls.length, 0);
  }
});

test('generic synchronous dispatch has three reviewed consumers and Packages one dedicated consumer', () => {
  const calls = [];

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(api) === 'agentRequest' &&
      node.arguments[1]?.getText(api).includes("'/commands/run'")
    ) {
      calls.push(node);
    }

    ts.forEachChild(node, visit);
  };
  visit(api);
  assert.equal(calls.length, 3, 'Review public projection before adding or changing a command-response consumer');
  assert.equal((api.text.match(/dedicatedPackageInstall<PackageInstallResponse>/g) ?? []).length, 1);
  assert.match(readFileSync('services/api/src/dedicated-package-install.ts', 'utf8'), /'\/packages\/v1\/install'/);
});

test('AI transport failure still propagates without adding retries or a fallback', async () => {
  const failure = new Error('transport fixture');

  let calls = 0;

  const result = {
    then(_resolve, reject) {
      calls++;
      reject(failure);
    },
  };
  await assert.rejects(
    aiExecutor(result, [])(request(), project, 'run_command', { command: 'echo', args: [] }),
    (error) => error === failure,
  );
  assert.equal(calls, 1);
});

test('generic runtime command response remains its existing explicit projection', async () => {
  const { result } = await agentResult();
  const calls = [];
  const run = declaration(api, 'runRuntimeCommand', runtimeDependencies(result, calls));
  const response = await run(request({ command: 'npm', args: ['install'] }));
  assert.deepEqual(Object.keys(response).sort(), ['events', 'exitCode', 'localRuntime', 'output']);
  assert.equal(response.exitCode, 0);
  assert.equal(response.output, 'ordinary stdoutordinary stderr');
  assert.equal(response.localRuntime, false);
  assert.equal(response.events.length, 3);
  assert.equal(calls.length, 1);
});

test('scheduled workspace execution still returns only exit code and output', async () => {
  const { result } = await agentResult();
  const calls = [];

  const run = declaration(api, 'scheduledAgentExec', {
    scheduledTaskProjectWorkspace: async () => ({ id: 'workspace' }),
    ensureWorkspaceReachable: async () => {},
    SCHEDULED_COLD_START_BUDGET_MS: 1000,
    agentRequest: async (...args) => {
      calls.push(args);
      return result;
    },
  });
  const response = await run({
    projectId: project.id,
    organizationId: project.organizationId,
    command: 'npm install',
    timeoutMs: 30_000,
  });
  assert.deepEqual(response, { exitCode: 0, output: 'ordinary stdoutordinary stderr' });
  assert.equal(calls.length, 1);
});

test('background launch and reconciled terminal records never acquire execution diagnostics', async () => {
  const { result, terminal } = await agentResult(true);
  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'id', 'status']);
  assert.deepEqual(Object.keys(terminal).sort(), ['exitCode', 'expiresAt', 'finishedAt', 'id', 'signal', 'status']);

  const run = declaration(api, 'runRuntimeCommand', runtimeDependencies(result, []));
  assert.deepEqual(await run(request({ command: 'node', args: [], background: true })), {
    processId: result.id,
    status: 'running',
    expiresAt: result.expiresAt,
  });
});

test('Packages keeps its internal event but omits metadata from the public response', async () => {
  const { result } = await agentResult();
  const events = [];
  const calls = [];

  const handler = route('/projects/:projectId/packages/install', {
    ...runtimeDependencies(result, calls),
    agentRequest: async (...args) => {
      calls.push(args);
      return args[1] === '/packages/v1/capabilities' ? { version: 1, maxBudgetMs: 300000, validatedSpecs: 1 } : result;
    },
    projectParams: {},
    packagesInstallSchema: {},
    requireProject: async () => project,
    store: {},
    projectStorage: {},
    listProjectFilesIncludingIdeState: async () => [],
    flattenRuntimeFiles: () => [],
    summarizeProjectPackages: () => ({ manifests: [] }),
    buildInstallCommand: () => ({ command: 'npm', args: ['install'] }),
    packageExecutionDiagnostic,
    dedicatedPackageInstall: helper('services/api/src/dedicated-package-install.ts', 'dedicatedPackageInstall'),
    packageInstallResult,
    app: { log: { info: (event) => events.push(event) } },
  });

  const response = await handler(request({ packageManager: 'npm', timeoutMs: 300_000 }), reply());
  assert.equal(Object.hasOwn(response, 'executionDiagnostic'), false);
  assert.equal(response.success, true);
  assert.equal(response.output, 'ordinary stdoutordinary stderr');
  assert.equal(events.length, 1);
  assert.equal(events[0].effectiveBudgetMs, 30_000);

  const dispatches = calls.filter((call) => call[1] === '/packages/v1/install');
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0][4], 1);
  assert.ok(dispatches[0][5] <= 330_000 && dispatches[0][5] > 329_000);
});

test('Packages permission, quota, workspace mismatch and terminal revocation reject before capability or mutation', async () => {
  const denied = Object.assign(new Error('denied'), { code: 'DENIED' });

  for (const overrides of [
    {
      requireProject: async () => {
        throw denied;
      },
    },
    {
      authorizeRuntimeWorkspace: async () => {
        throw denied;
      },
    },
    { authorizeRuntimeWorkspace: async () => ({ ...authorized, projectId: 'other-project' }) },
    { isTerminalAccessRevoked: async () => true },
  ]) {
    const calls = [];

    const handler = route('/projects/:projectId/packages/install', {
      ...runtimeDependencies({}, calls),
      projectParams: {},
      packagesInstallSchema: {},
      store: {},
      requireProject: async () => project,
      appPublicEnglish: (key) => key,
      ...overrides,
    });
    await assert.rejects(handler(request({ packageManager: 'npm', timeoutMs: 300000 }), reply()));
    assert.equal(calls.length, 0);
  }
});
