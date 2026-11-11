import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import test from 'node:test';
import ts from 'typescript';
import { loadPackageTestModule } from './package-test-loader.mjs';

const compile = (text) =>
  ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
    .outputText;

const helper = loadPackageTestModule;

const { packageInstallPlan, PACKAGE_INSTALL_CAPABILITY } = helper(
  'services/workspace-agent/src/package-install-contract.ts',
);

const { dedicatedPackageInstall } = helper('services/api/src/dedicated-package-install.ts');
const agent = readFileSync('services/workspace-agent/src/app.ts', 'utf8');
const api = readFileSync('services/api/src/app.ts', 'utf8');
const body = { packageManager: 'npm', packages: ['is-odd'], timeoutMs: 300000 };

for (const manager of ['npm', 'pnpm', 'yarn', 'bun']) {
  test(`valid registry install ${manager} keeps argv boundaries and exact budget`, () => {
    const p = packageInstallPlan({
      ...body,
      packageManager: manager,
      packages: ['@scope/name@^1.2.3', 'is-odd@latest'],
      dev: true,
    });
    assert.equal(p.command, manager);
    assert.equal(p.timeoutMs, 300000);
    assert.equal(p.args.length, 4);
    assert.equal(p.args.at(-1), 'is-odd@latest');
    assert.deepEqual(packageInstallPlan({ ...body, packageManager: manager, packages: [] }).args, ['install']);
  });
}

for (const spec of [
  '--ignore-scripts',
  '-D',
  'foo;id',
  'git+ssh://host/x',
  '../x',
  'foo\nbar',
  'foo$(id)',
  'foo@1 --flag',
]) {
  test(`reject unsafe spec ${JSON.stringify(spec)}`, () =>
    assert.throws(() => packageInstallPlan({ ...body, packages: [spec] })));
}
test('strict dedicated schema cannot carry arbitrary execution or larger budget', () => {
  for (const key of ['command', 'args', 'cwd', 'env', 'background', 'operationId']) {
    assert.throws(() => packageInstallPlan({ ...body, [key]: 'injected' }));
  }

  for (const timeoutMs of [null, 0, -1, 300001, 600000, Infinity, NaN, '300000', 1.5]) {
    assert.throws(() => packageInstallPlan({ ...body, timeoutMs }));
  }
  assert.throws(() => packageInstallPlan({ ...body, packages: Array(51).fill('x') }));
  assert.throws(() => packageInstallPlan({ ...body, dev: 'true' }));
  assert.throws(() => packageInstallPlan({ ...body, packageManager: 'sh' }));
  assert.equal(packageInstallPlan({ ...body, timeoutMs: 1 }).timeoutMs, 1);
});
test('old or mismatched capability never dispatches an install', async () => {
  for (const capability of [
    null,
    {},
    { version: 1 },
    { version: 2, maxBudgetMs: 300000, validatedSpecs: 1 },
    { version: 1, maxBudgetMs: 1800000, validatedSpecs: 1 },
  ]) {
    const calls = [];
    await assert.rejects(
      dedicatedPackageInstall(async (...x) => {
        calls.push(x);
        return capability;
      }, body),
      { code: 'PACKAGE_INSTALL_CAPABILITY_REQUIRED' },
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].method, 'GET');
  }

  for (const statusCode of [404, 405]) {
    let n = 0;
    await assert.rejects(
      dedicatedPackageInstall(async () => {
        n++;
        throw { statusCode };
      }, body),
      { code: 'PACKAGE_INSTALL_CAPABILITY_REQUIRED' },
    );
    assert.equal(n, 1);
  }
});
test('capability then exactly one install; shared abort signal and330s ceiling', async () => {
  const calls = [];

  const result = await dedicatedPackageInstall(async (...x) => {
    calls.push(x);
    return x[1].method === 'GET' ? PACKAGE_INSTALL_CAPABILITY : { code: 0 };
  }, body);
  assert.equal(result.code, 0);
  assert.deepEqual(
    calls.map((x) => [x[0], x[2], x[3]]),
    [
      ['/packages/v1/capabilities', 1, 10000],
      ['/packages/v1/install', 1, calls[1][3]],
    ],
  );
  assert.ok(calls[1][3] <= 330000 && calls[1][3] > 329000);
  assert.ok(calls.every((x) => x[1].signal instanceof AbortSignal));
  assert.deepEqual(JSON.parse(calls[1][1].body), body);
});
test('lost POST response stays unknown with no fallback, retry or generic dispatch', async () => {
  const calls = [];
  const lost = new Error('lost');
  await assert.rejects(
    dedicatedPackageInstall(async (...x) => {
      calls.push(x);

      if (x[1].method === 'GET') {
        return PACKAGE_INSTALL_CAPABILITY;
      }

      throw lost;
    }, body),
    (e) => e === lost,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls.filter((x) => x[1].method === 'POST').length, 1);
});

function runner({ limit = 10, occupied = 0, abuse = false, reportCancellation = true } = {}) {
  const timers = [],
    kills = [],
    children = [],
    processes = new Map(Array.from({ length: occupied }, (_, i) => ['' + i, {}]));
  const deps = {
    normalizeShellCommandArgs: (_c, a) => a,
    detectCommandAbuse: () => (abuse ? { type: 'blocked' } : null),
    pinViteDevArgs: (_cwd, _c, a) => a,
    killStalePinnedDevServers: async () => null,
    createHash,
    randomUUID: () => String(children.length),
    spawn: () => {
      const c = Object.assign(new EventEmitter(), {
        pid: 123,
        exitCode: null,
        signalCode: null,
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
      });
      children.push(c);

      return c;
    },
    sanitizedChildEnv: () => ({}),
    process: { env: {}, kill: (pid, sig) => kills.push([pid, sig]) },
    setTimeout: (fn, ms) => {
      const t = { fn, ms, unref() {} };
      timers.push(t);

      return t;
    },
    clearTimeout: () => {},
    StringDecoder,
    workspaceAgentError: (_key, details) => Object.assign(new Error('rejected'), details),
    observePackageInstall: () => ({ stop() {}, snapshot() {} }),
    commandExecutionDiagnostic: (x) => x,
  };
  const start = agent.indexOf('async function runCommand('),
    end = agent.indexOf('async function runCommandStream(', start);
  const run = new Function(...Object.keys(deps), compile(agent.slice(start, end)) + '\nreturn runCommand;')(
    ...Object.values(deps),
  );

  return {
    timers,
    kills,
    children,
    processes,
    start: () =>
      run('/root', 'npm', ['install', 'is-odd'], {
        rememberTerminal() {},
        timeoutMs: 300000,
        forceStopAfterMs: 5000,
        stopConfirmationMs: 10000,
        ...(reportCancellation ? { reportCancellation: true } : {}),
        maxOutputBytes: 1024,
        maxProcesses: limit,
        processes,
      }),
    deps,
  };
}
test('real runner keeps installation lifecycle execution under300s then group KILL5s later', async () => {
  const h = runner();
  const result = h.start();
  await Promise.resolve();

  const child = h.children[0];
  assert.deepEqual(
    h.timers.map((t) => t.ms),
    [300000, 305000],
  );
  h.timers[0].fn();
  h.timers[1].fn();
  assert.deepEqual(h.kills, [
    [-123, 'SIGTERM'],
    [-123, 'SIGKILL'],
  ]);
  child.emit('close', null, 'SIGKILL');

  const r = await result;
  assert.equal(r.timedOut, true);
  assert.equal(r.signal, 'SIGKILL');
});
test('real runner process quota and abuse checks still reject before spawn', async () => {
  for (const cfg of [{ limit: 1, occupied: 1 }, { abuse: true }]) {
    const h = runner(cfg);
    await assert.rejects(h.start());
    assert.equal(h.children.length, 0);
  }
});
test('dedicated cancellation escalates after5s and does not falsely report success', async () => {
  const h = runner();
  const result = h.start();
  await Promise.resolve();

  const record = [...h.processes.values()][0];
  assert.equal(record.forceStopAfterMs, 5000);

  const start = agent.indexOf('export async function stopTrackedProcess('),
    end = agent.indexOf('async function runCommand(', start);
  const stop = new Function(
    'process',
    'setTimeout',
    'clearTimeout',
    compile(agent.slice(start, end).replace('export async', 'async')) + '\nreturn stopTrackedProcess;',
  )(h.deps.process, h.deps.setTimeout, () => {});

  const stopping = stop(record, 'id');
  const escalation = h.timers.find((t) => t.ms === 5000);
  assert.ok(escalation);
  assert.ok(h.timers.some((t) => t.ms === 10000));
  escalation.fn();
  h.children[0].emit('close', null, 'SIGKILL');
  assert.equal((await stopping).killed, true);
  await result;
});
test('wire contracts preserve auth, generic cap, public access guards and no shell/lifecycle bypass', () => {
  assert.match(agent, /Math.min\(body.timeoutMs \?\? commandTimeoutMs, commandTimeoutMs\)/);
  assert.match(agent, /WORKSPACE_COMMAND_TIMEOUT_MS, 30_000/);

  const route = agent.slice(
    agent.indexOf("app.post('/packages/v1/install'"),
    agent.indexOf("app.post('/commands/run'"),
  );
  assert.match(route, /packageInstallPlan\(request.body\)/);
  assert.match(route, /runCommand\(root, plan.command, plan.args/);
  assert.match(route, /maxProcesses/);
  assert.doesNotMatch(route, /background|streamTimeoutMs|shell/);

  const auth = agent.slice(agent.indexOf("if (request.url === '/health'"), agent.indexOf("app.get('/health'"));
  assert.match(auth, /verifyAgentToken/);
  assert.doesNotMatch(auth, /packages/);

  const install = api.slice(
    api.indexOf("app.post('/projects/:projectId/packages/install'"),
    api.indexOf("app.get('/projects/:projectId/homepage-preview.svg'"),
  );

  for (const x of [
    'projects:write',
    'workspaces:write',
    'WORKSPACE_PROJECT_MISMATCH',
    'isTerminalAccessRevoked',
    'detectCommandAbuse',
  ]) {
    assert.ok(install.includes(x));
  }
  assert.doesNotMatch(install, /runLocalRuntimeCommand|\/commands\/run/);
  assert.doesNotMatch(
    readFileSync('services/workspace-agent/src/package-install-contract.ts', 'utf8'),
    /--ignore-scripts|--no-audit/,
  );
});

test('previously supported alias/source selectors remain single argv values', () => {
  for (const name of ['foo@https://host/x', 'foo@file:../x', 'foo@npm:other', '@scope/name@~1.2.3']) {
    assert.equal(packageInstallPlan({ ...body, packages: [name] }).args[1], name);
  }
});

test('actual generic command handler ignores install-shaped inputs and clamps300s to30s', async () => {
  const start = agent.indexOf('  const executeCommand = async');
  const end = agent.indexOf('  // Same token/workspace auth hook', start);
  const calls = [];

  const deps = {
    commandSchema: { parse: (x) => x },
    root: '/root',
    resolveWorkspacePath: () => '/root',
    pendingLaunches: new Map(),
    processes: new Map(),
    terminalResult: () => undefined,
    rememberTerminal() {},
    streamTimeoutMs: 1800000,
    commandTimeoutMs: 30000,
    maxOutputBytes: 1024,
    maxProcesses: 3,
    runCommand: async (...args) => {
      calls.push(args);
      return { code: 0 };
    },
  };
  const run = new Function(...Object.keys(deps), compile(agent.slice(start, end)) + '\nreturn executeCommand;')(
    ...Object.values(deps),
  );
  await run({
    body: {
      command: 'npm',
      args: ['install'],
      timeoutMs: 300000,
      forceStopAfterMs: 5000,
      stopConfirmationMs: 10000,
      packageManager: 'npm',
    },
  });
  assert.equal(calls[0][3].timeoutMs, 30000);
  assert.equal(calls[0][3].forceStopAfterMs, undefined);
  assert.equal(calls[0][3].stopConfirmationMs, undefined);
});

test('ordinary stop stays5s with no new forced kill', async () => {
  const h = runner();
  const child = Object.assign(new EventEmitter(), { pid: 456, exitCode: null, signalCode: null });

  const start = agent.indexOf('export async function stopTrackedProcess('),
    end = agent.indexOf('async function runCommand(', start);
  const stop = new Function(
    'process',
    'setTimeout',
    'clearTimeout',
    compile(agent.slice(start, end).replace('export async', 'async')) + '\nreturn stopTrackedProcess;',
  )(h.deps.process, h.deps.setTimeout, () => {});

  const stopping = stop({ process: child }, 'generic');
  assert.deepEqual(
    h.timers.map((t) => t.ms),
    [5000],
  );
  h.timers[0].fn();
  assert.equal((await stopping).killed, false);
  assert.deepEqual(h.kills, [[-456, 'SIGTERM']]);
});

test('bad dedicated budget fails before any capability or command call', async () => {
  for (const timeoutMs of [0, 300001, Infinity]) {
    await assert.rejects(
      dedicatedPackageInstall(
        () => {
          assert.fail('must not dispatch');
        },
        { ...body, timeoutMs },
      ),
      { code: 'INVALID_PACKAGE_INSTALL_BUDGET' },
    );
  }
});

test('actual timeout composition keeps caller deadline alive after headers are received', () => {
  const start = api.indexOf('  const withRequestTimeout =');
  const end = api.indexOf('\n  const managerRequest', start);
  const timers = [];

  const wrap = new Function(
    'RUNTIME_PROXY_TIMEOUT_MS',
    'setTimeout',
    'clearTimeout',
    compile(api.slice(start, end)) + '\nreturn withRequestTimeout;',
  )(
    15000,
    (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);

      return t;
    },
    () => {},
  );

  const parent = new AbortController();
  const wrapped = wrap({ signal: parent.signal }, 330000);
  wrapped.done();
  assert.equal(wrapped.init.signal.aborted, false);
  parent.abort();
  assert.equal(wrapped.init.signal.aborted, true);
});

test('dedicated capability/write each receive explicit total-hop signals, including body lifetime', async () => {
  const signals = [];

  const exports = loadPackageTestModule('services/api/src/dedicated-package-install.ts', {
    AbortSignal: {
      any: (signals) => globalThis.AbortSignal.any(signals),
      timeout(ms) {
        const c = new AbortController();
        signals.push({ ms, c });

        return c.signal;
      },
    },
  });

  let calls = 0;

  const result = exports.dedicatedPackageInstall(async (_path, init) => {
    calls++;

    if (init.method === 'GET') {
      return PACKAGE_INSTALL_CAPABILITY;
    }

    return await new Promise((_resolve, reject) =>
      init.signal.addEventListener('abort', () => reject(new Error('body deadline')), { once: true }),
    );
  }, body);
  await Promise.resolve();
  assert.deepEqual(
    signals.map((x) => x.ms),
    [330000, 10000],
  );
  signals[0].c.abort();
  await assert.rejects(result, /body deadline/);
  assert.equal(calls, 2);
});

test('actual panel360s signal survives API helper and lost response remains explicitly unknown', async () => {
  const web = readFileSync('app/routes/api.projects.$projectId.ide-panel.$panel.ts', 'utf8');
  const start = web.indexOf('async function runPackageInstall(');
  const end = web.indexOf('\nasync function ', start + 1);

  for (const error of [
    new Response('', { status: 502 }),
    new Response('', { status: 499 }),
    new Error('connection lost'),
  ]) {
    let calls = 0;

    const deps = {
      apiRequest: async (_r, _p, init) => {
        calls++;
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(JSON.parse(init.body).timeoutMs, 300000);
        throw error;
      },
      randomUUID: () => 'fixture',
      getApiRuntimeRoutesCopy: () => ({ 'apiRuntime.panel.packageRunOutcomeUnknown': 'unknown' }),
      panelErrorMessage: () => 'known error',
      console: { error() {} },
    };
    const run = new Function(...Object.keys(deps), compile(web.slice(start, end)) + '\nreturn runPackageInstall;')(
      ...Object.values(deps),
    );
    const result = await run({}, 'project', {
      packageManager: 'npm',
      packages: ['is-odd'],
      dev: false,
      name: 'install',
      startedAt: 'fixture',
    });
    assert.equal(calls, 1);
    assert.equal(result.outcomeUnknown, true);
    assert.equal(result.exitCode, -1);
  }
  assert.match(web.slice(start, end), /AbortSignal.timeout\(360_000\)/);

  const proxy = readFileSync('app/lib/enterprise-api.server.ts', 'utf8');
  assert.match(proxy, /signal: fetchInit.signal \?\? AbortSignal.timeout\(30_000\)/);
  assert.match(proxy, /await response.text\(\)/);
});

test('explicit null is not an omitted package list', () => {
  assert.throws(() => packageInstallPlan({ ...body, packages: null }));
});

test('capability time is deducted from the total330s transport budget before POST', async () => {
  let now = 100;

  const exports = loadPackageTestModule('services/api/src/dedicated-package-install.ts', {
    performance: { now: () => now },
  });

  const calls = [];
  await exports.dedicatedPackageInstall(async (...args) => {
    calls.push(args);

    if (args[1].method === 'GET') {
      now += 7000;
      return PACKAGE_INSTALL_CAPABILITY;
    }

    return { code: 0 };
  }, body);
  assert.equal(calls[1][3], 323000);
  now = 100;

  let writes = 0;
  await assert.rejects(
    exports.dedicatedPackageInstall(async (_path, init) => {
      if (init.method === 'GET') {
        now += 330001;
        return PACKAGE_INSTALL_CAPABILITY;
      }

      writes++;

      return undefined;
    }, body),
    { code: 'PACKAGE_INSTALL_DEADLINE' },
  );
  assert.equal(writes, 0);
});

test('concurrent real runner launches cannot both consume the last process slot', async () => {
  const h = runner({ limit: 1 });
  const first = h.start();
  const second = h.start();
  const rejected = assert.rejects(second, { code: 'PROCESS_LIMIT_REACHED' });
  await Promise.resolve();
  assert.equal(h.children.length, 1);
  assert.equal(h.processes.size, 1);
  h.children[0].emit('close', 0, null);
  await first;
  await rejected;
});

test('explicit cancellation followed by graceful zero exit is not success', async () => {
  const h = runner();
  const pending = h.start();
  await Promise.resolve();

  const record = [...h.processes.values()][0];

  const start = agent.indexOf('export async function stopTrackedProcess('),
    end = agent.indexOf('async function runCommand(', start);
  const stop = new Function(
    'process',
    'setTimeout',
    'clearTimeout',
    compile(agent.slice(start, end).replace('export async', 'async')) + '\nreturn stopTrackedProcess;',
  )(h.deps.process, h.deps.setTimeout, () => {});

  const stopping = stop(record, 'fixture');
  assert.equal(record.stopRequested, true);
  h.children[0].emit('close', 0, null);
  assert.equal((await stopping).killed, true);

  const outcome = helper('services/api/src/package-install-result.ts').packageInstallResult(await pending);
  assert.equal(outcome.success, false, 'cancelled package install must not become success after graceful exit');
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.termination, 'interrupted');
});

test('ordinary runner does not gain a cancellation result field', async () => {
  const h = runner({ reportCancellation: false });
  const pending = h.start();
  await Promise.resolve();
  [...h.processes.values()][0].stopRequested = true;
  h.children[0].emit('close', 0, null);

  const result = await pending;
  assert.equal(Object.hasOwn(result, 'cancelled'), false);
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
});
