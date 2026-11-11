import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import test from 'node:test';
import ts from 'typescript';

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;

const exports = {};
new Function('exports', compile(readFileSync('services/api/src/package-install-result.ts', 'utf8')))(exports);

const { packageInstallResult } = exports;
const diagnosticExports = {};
new Function('exports', compile(readFileSync('services/workspace-agent/src/command-execution-diagnostic.ts', 'utf8')))(
  diagnosticExports,
);

const agent =
  process.env.PACKAGE_TERMINATION_BASELINE === '1'
    ? execFileSync('git', ['show', 'HEAD:services/workspace-agent/src/app.ts'], { encoding: 'utf8' })
    : readFileSync('services/workspace-agent/src/app.ts', 'utf8');

const source = agent.slice(
  agent.indexOf('async function runCommand('),
  agent.indexOf('async function runCommandStream('),
);

async function command() {
  const timers = [];
  const killed = [];
  const child = Object.assign(new EventEmitter(), { pid: 123, stdout: new EventEmitter(), stderr: new EventEmitter() });

  const deps = {
    commandExecutionDiagnostic: diagnosticExports.commandExecutionDiagnostic,
    normalizeShellCommandArgs: (_command, args) => args,
    detectCommandAbuse: () => null,
    pinViteDevArgs: (_cwd, _command, args) => args,
    killStalePinnedDevServers: async () => null,
    createHash,
    randomUUID: () => 'fixture',
    spawn: () => child,
    sanitizedChildEnv: () => ({}),
    process: { env: {}, kill: (_pid, signal) => killed.push(signal) },
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);

      return timer;
    },
    clearTimeout: () => {},
    StringDecoder,
    workspaceAgentError: () => new Error('fixture'),
  };

  const run = new Function(...Object.keys(deps), compile(source) + '\nreturn runCommand;')(...Object.values(deps));

  const result = run('/fixture', 'npm', ['install'], {
    timeoutMs: 30_000,
    maxOutputBytes: 1024,
    maxProcesses: 10,
    processes: new Map(),
    rememberTerminal() {},
  });
  await Promise.resolve();

  return { child, result, timers, killed };
}

for (const scenario of [
  { name: 'success', code: 0, signal: null, timer: false, termination: null },
  { name: 'nonzero exit', code: 7, signal: null, timer: false, termination: null },
  { name: 'external interruption', code: null, signal: 'SIGKILL', timer: false, termination: 'interrupted' },
  { name: 'actual timeout', code: null, signal: 'SIGTERM', timer: true, termination: 'timeout' },
  { name: 'timeout with graceful zero exit', code: 0, signal: null, timer: true, termination: 'timeout' },
]) {
  test(`actual agent and API preserve ${scenario.name}`, async () => {
    const { child, result, timers, killed } = await command();

    if (scenario.timer) {
      timers.find((timer) => timer.delay === 30_000).callback();
    }

    child.emit('close', scenario.code, scenario.signal);

    const observed = await result;
    assert.equal(observed.timedOut, scenario.timer);
    assert.equal(observed.code, scenario.code);
    assert.equal(observed.signal, scenario.signal);
    assert.deepEqual(killed, scenario.timer ? ['SIGTERM'] : []);

    const api = packageInstallResult(observed);
    assert.equal(api.termination, scenario.termination);
    assert.equal(api.exitCode, scenario.code ?? -1);
    assert.equal(api.success, scenario.name === 'success');
  });
}

test('missing exit is unknown, not a synthetic failed exit 1 or success', () => {
  assert.deepEqual(packageInstallResult({}), { exitCode: -1, termination: 'unknown', success: false });
});

test('API Packages consumes the classifier and returns termination metadata', () => {
  const api = readFileSync('services/api/src/app.ts', 'utf8');
  const start = api.indexOf("app.post('/projects/:projectId/packages/install'");
  const install = api.slice(start, api.indexOf('\n  app.', start + 1));
  assert.match(install, /const outcome = packageInstallResult\(result\)/);
  assert.match(install, /termination: outcome.termination/);
  assert.match(install, /success: outcome.success/);
});

for (const scenario of [
  { code: 0, signal: null, timedOut: false, termination: null },
  { code: 7, signal: null, timedOut: false, termination: null },
  { code: null, signal: 'SIGTERM', timedOut: false, termination: 'interrupted' },
  { code: null, signal: 'SIGTERM', timedOut: true, termination: 'timeout' },
]) {
  test(`local fallback preserves metadata for ${JSON.stringify(scenario)}`, async () => {
    const api = readFileSync('services/api/src/app.ts', 'utf8');
    const start = api.indexOf('  const runLocalRuntimeCommand = async');
    const end = api.indexOf('\n  };', start) + '\n  };'.length;
    const callbacks = [];
    const killed = [];

    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: (signal) => killed.push(signal),
    });
    const deps = {
      ensureLocalRuntimeWorkspace: async () => '/fixture',
      createHash,
      spawn: () => child,
      process: { env: {} },
      localRuntimeProcessMap: () => new Map(),
      setTimeout: (callback) => {
        callbacks.push(callback);
        return 1;
      },
      clearTimeout: () => {},
    };

    const run = new Function(...Object.keys(deps), compile(api.slice(start, end)) + '\nreturn runLocalRuntimeCommand;')(
      ...Object.values(deps),
    );

    const pending = run({ workspaceId: 'fixture' }, { command: 'npm', args: ['install'], timeoutMs: 300_000 });
    await Promise.resolve();

    if (scenario.timedOut) {
      callbacks[0]();
    }

    child.emit('close', scenario.code, scenario.signal);

    const result = await pending;
    assert.equal(result.code, scenario.code ?? 1); // Preserve the shared legacy contract.
    assert.equal(result.timedOut, scenario.timedOut);
    assert.equal(result.signal, scenario.signal);
    assert.deepEqual(killed, scenario.timedOut ? ['SIGTERM'] : []);
    assert.equal(packageInstallResult(result).termination, scenario.termination);
    assert.equal(packageInstallResult(result).exitCode, scenario.signal ? -1 : scenario.code);
  });
}

test('legacy agent responses preserve real zero/nonzero exits and do not guess a timeout', () => {
  assert.deepEqual(packageInstallResult({ code: 0 }), { exitCode: 0, termination: null, success: true });
  assert.deepEqual(packageInstallResult({ code: 7 }), { exitCode: 7, termination: null, success: false });
  assert.deepEqual(packageInstallResult({ code: null }), { exitCode: -1, termination: 'unknown', success: false });
  assert.deepEqual(packageInstallResult({ code: null, signal: 'SIGTERM' }), {
    exitCode: -1,
    termination: 'interrupted',
    success: false,
  });
});

test('actual agent projects byte counts and effective budget, never output text', async () => {
  const { child, result } = await command();
  const stdout = Buffer.from('é npm http fetch GET https://PRIVATE.registry/SECRET');
  const stderr = Buffer.from('npm error code EAI_AGAIN PRIVATE_PACKAGE');
  child.stdout.emit('data', stdout);
  child.stderr.emit('data', stderr);
  child.emit('close', 1, null);

  const observed = await result;
  assert.equal(observed.executionDiagnostic.stdoutBytes, stdout.length);
  assert.equal(observed.executionDiagnostic.stderrBytes, stderr.length);
  assert.equal(observed.executionDiagnostic.effectiveBudgetMs, 30_000);
  assert.ok(observed.executionDiagnostic.elapsedMs >= 0);
  assert.equal(observed.executionDiagnostic.observedPhase, 'fetch');
  assert.equal(observed.executionDiagnostic.errorCode, 'EAI_AGAIN');
  assert.doesNotMatch(JSON.stringify(observed.executionDiagnostic), /PRIVATE|SECRET|https/);
});
