import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTerminalWarningDiagnostics,
  projectTerminalFailure,
  TERMINAL_WARNING_LIMIT,
  TERMINAL_WARNING_READ_TIMEOUT_MS,
} from './terminal-warning-diagnostics.mjs';

const managed = 'Managed terminal shell could not be started';
const shell = 'Terminal shell could not be started';

function message(prefix, details, type = 'warning') {
  return {
    type: () => type,
    text: () => `${prefix} Object`,
    args: () => [prefix, details].map((value) => ({ evaluate: async (project) => project(value) })),
  };
}

test('retains only allowlisted structured name/code, never other fields or arbitrary strings', () => {
  assert.deepEqual(
    projectTerminalFailure({
      name: 'RuntimeError',
      code: 'WORKSPACE_NOT_STARTED',
      message: 'secret',
      stack: 'secret',
      token: 'secret',
    }),
    { name: 'RuntimeError', code: 'WORKSPACE_NOT_STARTED' },
  );

  for (const value of [
    null,
    undefined,
    'secret',
    [],
    { name: 'secret', code: 'sk-secret' },
    { name: 'Error'.repeat(10000), code: 'A'.repeat(10000) },
  ]) {
    assert.deepEqual(projectTerminalFailure(value), {});
  }

  const getter = Object.defineProperty({}, 'code', {
    get() {
      throw new Error('must not execute');
    },
  });
  assert.deepEqual(projectTerminalFailure(getter), {});
});

test('accepts exactly the two warning prefixes and preserves safe classifications', async () => {
  const collector = createTerminalWarningDiagnostics();
  collector.capture(message(managed, { name: 'RuntimeError', code: 'WORKSPACE_NOT_STARTED' }));
  collector.capture(message(shell, { name: 'TypeError', code: 'ECONNREFUSED' }));

  for (const type of ['error', 'log', 'info', 'debug']) {
    collector.capture(message(managed, {}, type));
  }
  collector.capture(message('Failed to kill terminal process:', { name: 'Error' }));
  collector.capture(message(`${managed} secret suffix`, { name: 'Error' }));
  await collector.flush();
  assert.deepEqual(collector.snapshot(), [
    { source: 'managed', name: 'RuntimeError', code: 'WORKSPACE_NOT_STARTED' },
    { source: 'shell', name: 'TypeError', code: 'ECONNREFUSED' },
  ]);
});

test('never serializes raw argument objects and rejects extra console arguments', async () => {
  const collector = createTerminalWarningDiagnostics();
  const details = { name: 'Error', code: 'REMOTE_RUNTIME_SOCKET_FAILED', token: 'top-secret', stack: 'secret' };
  const event = message(managed, details);
  event.args = () => [
    {
      evaluate: async (fn) => fn(managed),
      jsonValue() {
        throw new Error('raw read');
      },
    },
    {
      evaluate: async (fn) => fn(details),
      jsonValue() {
        throw new Error('raw read');
      },
    },
  ];
  collector.capture(event);
  collector.capture({ ...event, args: () => [...event.args(), {}] });
  await collector.flush();
  assert.equal(collector.snapshot().length, 1);
  assert.ok(!JSON.stringify(collector.snapshot()).includes('secret'));
});

test('bounds queued work and output even when a page floods matching warnings', async () => {
  const collector = createTerminalWarningDiagnostics();

  let reads = 0;

  const event = message(managed, { name: 'RuntimeError', code: 'REMOTE_RUNTIME_REQUEST_FAILED' });
  const args = event.args;

  event.args = () => {
    reads++;
    return args();
  };

  for (let i = 0; i < 10000; i++) {
    collector.capture(event);
  }
  await collector.flush();
  assert.equal(reads, TERMINAL_WARNING_LIMIT);
  assert.equal(collector.snapshot().length, TERMINAL_WARNING_LIMIT);
  assert.ok(Buffer.byteLength(JSON.stringify(collector.snapshot())) < 5000);

  const copy = collector.snapshot();
  copy[0].name = 'secret';
  assert.equal(collector.snapshot()[0].name, 'RuntimeError');
});

test('page closure and stalled reads cannot fail or indefinitely delay the audit', async () => {
  const collector = createTerminalWarningDiagnostics();
  collector.capture({
    ...message(managed, {}),
    args() {
      throw new Error('page closed');
    },
  });
  collector.capture({ ...message(managed, {}), args: () => [{ evaluate: () => new Promise(() => {}) }, {}] });

  const start = Date.now();
  await collector.flush();
  assert.ok(Date.now() - start < TERMINAL_WARNING_READ_TIMEOUT_MS + 2000);
  assert.deepEqual(collector.snapshot(), []);
});
