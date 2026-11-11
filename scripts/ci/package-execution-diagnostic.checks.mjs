import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { summarizeRuntimeApi } from './runtime-api-evidence.mjs';

function load(path) {
  const exports = {};

  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('exports', code)(exports);

  return exports;
}

const { commandExecutionDiagnostic } = load('services/workspace-agent/src/command-execution-diagnostic.ts');
const { packageExecutionDiagnostic } = load('services/api/src/package-execution-diagnostic.ts');
const { packageInstallResult } = load('services/api/src/package-install-result.ts');

const input = {
  effectiveBudgetMs: 30_000,
  elapsedMs: 30_004.7,
  stdoutBytes: 10,
  stderrBytes: 20,
  stdout: '',
  stderr: '',
};

test('records finite effective budget and elapsed duration without changing requested budget', () => {
  const diagnostic = commandExecutionDiagnostic(input);

  const projected = packageExecutionDiagnostic(300_000, {
    code: null,
    signal: 'SIGTERM',
    timedOut: true,
    executionDiagnostic: diagnostic,
  });
  assert.equal(projected.requestedBudgetMs, 300_000);
  assert.equal(projected.effectiveBudgetMs, 30_000);
  assert.equal(projected.elapsedMs, 30_004);
  assert.equal(projected.timedOut, true);
  assert.equal(projected.exitCode, null);
  assert.equal(projected.errorCode, 'unknown');
  assert.equal(projected.observedPhase, 'unknown');
});

test('only recognized output patterns become diagnostic hints; no arbitrary output survives', () => {
  const diagnostic = commandExecutionDiagnostic({
    ...input,
    stdout: 'npm http fetch GET https://PRIVATE.registry/SECRET',
    stderr: 'npm error code EAI_AGAIN PRIVATE_PACKAGE',
  });
  assert.equal(diagnostic.observedPhase, 'fetch');
  assert.equal(diagnostic.errorCode, 'EAI_AGAIN');
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE|SECRET|https|registry/);
  assert.equal(
    commandExecutionDiagnostic({ ...input, stderr: 'private text mentions EAI_AGAIN' }).errorCode,
    'unknown',
  );
  assert.equal(commandExecutionDiagnostic({ ...input, stderr: 'npm error code PRIVATE' }).errorCode, 'unknown');
});

test('bounded scan does not promote an error outside the retained tail', () => {
  assert.equal(
    commandExecutionDiagnostic({ ...input, stderr: 'npm error code ENOTFOUND\n' + 'x'.repeat(5000) }).errorCode,
    'unknown',
  );
});

test('projection has exact fixed keys and rejects arbitrary remote values', () => {
  const bad = {
    effectiveBudgetMs: Infinity,
    elapsedMs: -1,
    stdoutBytes: 1e30,
    stderrBytes: 'SECRET',
    observedPhase: 'PRIVATE',
    errorCode: 'PRIVATE',
    token: 'SECRET',
  };
  const result = packageExecutionDiagnostic('SECRET', {
    code: -1,
    signal: 'PRIVATE',
    timedOut: 'PRIVATE',
    executionDiagnostic: bad,
  });
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'event',
      'requestedBudgetMs',
      'effectiveBudgetMs',
      'elapsedMs',
      'stdoutBytes',
      'stderrBytes',
      'observedPhase',
      'errorCode',
      'timedOut',
      'signal',
      'exitCode',
    ].sort(),
  );
  assert.deepEqual(result, {
    event: 'package.install.execution',
    requestedBudgetMs: null,
    effectiveBudgetMs: null,
    elapsedMs: null,
    stdoutBytes: null,
    stderrBytes: null,
    observedPhase: 'unknown',
    errorCode: 'unknown',
    timedOut: null,
    signal: 'unknown',
    exitCode: null,
  });
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 512);
});

test('missing or legacy evidence remains unknown and does not change outcome classification', () => {
  for (const executionDiagnostic of [undefined, null, 'SECRET', 1, [], { errorCode: 'ETIMEDOUT' }]) {
    const result = { executionDiagnostic };
    const diagnostic = packageExecutionDiagnostic(300_000, result);
    assert.equal(diagnostic.timedOut, null);
    assert.equal(diagnostic.exitCode, null);
    assert.equal(diagnostic.effectiveBudgetMs, null);
    assert.deepEqual(packageInstallResult(result), { exitCode: -1, termination: 'unknown', success: false });
  }
});

test('agent numbers are saturated, invalid values unavailable and phase vocabulary bounded', () => {
  const value = commandExecutionDiagnostic({
    ...input,
    elapsedMs: Infinity,
    stdoutBytes: 1e30,
    stderrBytes: -1,
    stdout: 'npm info run PRIVATE',
  });
  assert.equal(value.elapsedMs, null);
  assert.equal(value.stdoutBytes, 1_073_741_824);
  assert.equal(value.stderrBytes, null);
  assert.equal(value.observedPhase, 'lifecycle');
  assert.equal(
    commandExecutionDiagnostic({ ...input, stdout: 'npm timing reify:unpack PRIVATE' }).observedPhase,
    'extract',
  );
});

test('diagnostic event stays out of public install response and no route policy is changed', () => {
  const api = readFileSync('services/api/src/app.ts', 'utf8');
  const start = api.indexOf("app.post('/projects/:projectId/packages/install'");
  const install = api.slice(start, api.indexOf('\n  app.', start + 1));
  assert.equal(
    (install.match(/app.log.info\(packageExecutionDiagnostic\(commandBody.timeoutMs, result\)\)/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(install.slice(install.indexOf('return reply.code(201)')), /executionDiagnostic/);
  assert.match(install.replace(/\/\/[^\n]*/g, ''), /undefined,\s*1,\s*commandBody.timeoutMs! \+ 30_000/);
  assert.match(install, /!localRuntimeFallbackEnabled\(\) \|\| !isRuntimeManagerUnavailable\(error\)/);

  const agent = readFileSync('services/workspace-agent/src/app.ts', 'utf8');
  assert.match(agent, /Math.min\(body.timeoutMs \?\? commandTimeoutMs, commandTimeoutMs\)/);
});

test('summary preserves safe package events without reqId before raw log tail truncation', () => {
  const event = packageExecutionDiagnostic(300_000, {
    code: null,
    timedOut: true,
    signal: 'SIGTERM',
    executionDiagnostic: commandExecutionDiagnostic(input),
  });
  const summary = summarizeRuntimeApi(
    JSON.stringify({ ...event, msg: 'PRIVATE', env: { SECRET: 'PRIVATE' } }) + '\n' + 'x'.repeat(300_000),
  );

  const { event: _, ...projection } = event;
  assert.deepEqual(summary.packageExecutions, [projection]);
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE|SECRET/);
});

test('summary independently rejects injected categories, oversized numbers and limits events', () => {
  const events = Array.from({ length: 100 }, () =>
    JSON.stringify({
      event: 'package.install.execution',
      requestedBudgetMs: 1e20,
      observedPhase: 'PRIVATE',
      signal: 'SECRET',
      exitCode: -1,
      output: 'PRIVATE',
    }),
  ).join('\n');

  const result = summarizeRuntimeApi(events);
  assert.equal(result.packageExecutions.length, 60);
  assert.equal(result.packageExecutions[0].requestedBudgetMs, null);
  assert.equal(result.packageExecutions[0].exitCode, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|SECRET/);
  assert.ok(Buffer.byteLength(JSON.stringify(result.packageExecutions)) < 30_000);
});

test('npm classification requires an error-code line and never treats timeout hint as observed timer expiry', () => {
  for (const stderr of [
    'URL=https://PRIVATE/npm error code ENOTFOUND',
    'npm error code\nENOTFOUND',
    'ERR_PNPM_META_FETCH_FAIL PRIVATE EAI_AGAIN',
  ]) {
    assert.equal(commandExecutionDiagnostic({ ...input, stderr }).errorCode, 'unknown');
  }

  const executionDiagnostic = commandExecutionDiagnostic({ ...input, stderr: 'npm error code ETIMEDOUT\nPRIVATE' });
  const result = { code: 1, timedOut: false, executionDiagnostic };
  assert.equal(packageExecutionDiagnostic(300_000, result).errorCode, 'ETIMEDOUT');
  assert.deepEqual(packageInstallResult(result), { exitCode: 1, termination: null, success: false });
});

test('real observed timeout plus exit one remains timeout, independent of diagnostic hint', () => {
  const result = { code: 1, timedOut: true, executionDiagnostic: { errorCode: 'ENOTFOUND' } };
  assert.deepEqual(packageInstallResult(result), { exitCode: 1, termination: 'timeout', success: false });
  assert.equal(packageExecutionDiagnostic(300_000, result).timedOut, true);
});
