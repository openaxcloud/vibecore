import type { ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { buildWorkspaceAgentApp, type ProcessRecord } from './app.js';

let root: string;
let app: ReturnType<typeof buildWorkspaceAgentApp>;
let processes: Map<string, ProcessRecord>;
const secret = 'synthetic-debugger-engine-secret';
const headers = {
  authorization: `Bearer ${signAgentToken({ workspaceId: 'synthetic', expiresAt: Date.now() + 120_000, secret })}`,
};
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'debugger-engine-'));
  processes = new Map();
  app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId: 'synthetic', tokenSecret: secret, processes });
});
afterEach(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
});
const request = (url: string, payload?: unknown, auth = headers) =>
  app.inject({
    method: payload === undefined ? 'GET' : 'POST',
    url,
    headers: auth,
    ...(payload === undefined ? {} : { payload }),
  });
const status = async (id: string) => (await request(`/debugger/v1/${id}`)).json();
const command = async (id: string, action: string) => {
  const response = await request(`/debugger/v1/${id}/control`, { action });
  expect(response.statusCode, response.body).toBe(200);
};

test('real Node pauses, steps into/over/out, reads locals/watches and exits without a debug listener', async () => {
  await writeFile(
    join(root, 'program.cjs'),
    [
      'let answer = 2;',
      'function twice(value) {',
      '  const doubled = value * 2;',
      '  return doubled;',
      '}',
      'answer = twice(answer);',
      'console.log("answer=" + answer);',
    ].join('\n'),
  );
  const baselinePorts = (await request('/ports')).json().ports;
  const id = randomUUID();
  const response = await request('/debugger/v1/start', {
    operationId: id,
    program: 'program.cjs',
    watches: ['answer'],
    breakpoints: [{ file: 'program.cjs', line: 6 }],
  });
  expect(response.statusCode, response.body).toBe(200);
  await expect.poll(async () => (await status(id)).status).toBe('paused');
  expect((await status(id)).callStack[0]).toMatchObject({ file: 'program.cjs', line: 1 });
  expect(processes.size).toBe(1);
  // Inspector uses only the inherited pipe, not --inspect or a bound TCP socket.
  expect(processes.get(id)!.process.spawnargs.join(' ')).not.toContain('--inspect');
  const ports = (await request('/ports')).json().ports;
  expect(ports).toEqual(baselinePorts);
  await command(id, 'continue');
  await expect.poll(async () => (await status(id)).callStack[0]?.line).toBe(6);
  await expect.poll(async () => (await status(id)).watches).toContainEqual({ expression: 'answer', value: '2' });
  await command(id, 'step-into');
  await expect.poll(async () => (await status(id)).callStack[0]?.name).toBe('twice');
  await command(id, 'step-over');
  await expect.poll(async () => (await status(id)).callStack[0]?.line).toBe(4);
  await expect
    .poll(async () => (await status(id)).variables)
    .toContainEqual({ name: 'doubled', value: '4', type: 'number' });
  await command(id, 'step-out');
  await expect.poll(async () => (await status(id)).callStack[0]?.line).toBe(7);
  await command(id, 'continue');
  await expect.poll(async () => (await status(id)).status).toBe('exited');
  expect((await status(id)).output).toContain('answer=4');
  expect(processes.size).toBe(0);
}, 15000);

test('authenticated launch is idempotent, rejects changed payload, and shared Stop confirms a paused child is gone', async () => {
  await writeFile(join(root, 'program.js'), 'setInterval(() => {}, 1000);');
  const payload = { operationId: randomUUID(), program: 'program.js' };
  expect((await request('/debugger/v1/start', payload, {})).statusCode).toBe(401);
  const [one, two] = await Promise.all([
    request('/debugger/v1/start', payload),
    request('/debugger/v1/start', payload),
  ]);
  expect(one.statusCode).toBe(200);
  expect(two.statusCode).toBe(200);
  expect(processes.size).toBe(1);
  expect((await request('/debugger/v1/start', { ...payload, args: ['changed'] })).statusCode).toBe(409);
  await expect.poll(async () => (await status(payload.operationId)).status).toBe('paused');
  const pid = processes.get(payload.operationId)!.process.pid!;
  const stopped = await request(`/processes/${payload.operationId}/kill`, {});
  expect(stopped.json()).toMatchObject({ terminated: true, status: 'stopped' });
  expect(() => process.kill(pid, 0)).toThrow();
  expect((await request(`/debugger/v1/${payload.operationId}/stop`, {})).json()).toMatchObject({
    terminated: true,
    status: 'stopped',
  });
  expect((await request(`/debugger/v1/${payload.operationId}/control`, { action: 'continue' })).statusCode).toBe(409);
});

test('rejects path escapes, symlinks, unsupported launch options and raw inspector commands before spawning', async () => {
  await writeFile(join(root, 'program.js'), 'console.log(1)');
  await symlink('/etc/passwd', join(root, 'outside.js'));
  for (const patch of [
    { program: '../outside.js' },
    { program: 'outside.js' },
    { program: '/etc/passwd' },
    { env: { NODE_OPTIONS: '--inspect=0.0.0.0:9229' } },
    { command: 'node' },
  ]) {
    expect(
      (await request('/debugger/v1/start', { operationId: randomUUID(), program: 'program.js', ...patch })).statusCode,
    ).toBe(400);
  }
  expect(processes.size).toBe(0);
  expect((await request('/debugger/v1/missing/control', { action: 'Runtime.evaluate' })).statusCode).toBe(400);
});

test('watch evaluation refuses side effects and a foreign workspace cannot inspect or stop', async () => {
  await writeFile(join(root, 'program.cjs'), 'let answer = 2;\nanswer += 1;\nconsole.log(answer);');
  const id = randomUUID();
  expect(
    (
      await request('/debugger/v1/start', {
        operationId: id,
        program: 'program.cjs',
        stopOnEntry: false,
        breakpoints: [{ file: 'program.cjs', line: 2 }],
        watches: ['answer = 100', 'answer'],
      })
    ).statusCode,
  ).toBe(200);
  await expect.poll(async () => (await status(id)).watches.length).toBe(2);
  expect((await status(id)).watches[0].error).toBe('DEBUGGER_WATCH_UNAVAILABLE');
  expect((await status(id)).watches[1]).toMatchObject({ value: '2' });
  const foreign = {
    authorization: `Bearer ${signAgentToken({ workspaceId: 'other', expiresAt: Date.now() + 60000, secret })}`,
  };
  expect((await request(`/debugger/v1/${id}`, undefined, foreign)).statusCode).toBe(401);
  expect((await request(`/debugger/v1/${id}/stop`, {}, foreign)).statusCode).toBe(401);
  await command(id, 'continue');
  await expect.poll(async () => (await status(id)).status).toBe('exited');
  expect((await status(id)).output.trim()).toBe('3');
});

for (const extension of ['cjs', 'mjs']) {
  test(`runs ${extension} as an actual entry point with program arguments`, async () => {
    const source =
      extension === 'cjs'
        ? 'if (require.main !== module) throw new Error("not main"); console.log(process.argv[2]);'
        : 'console.log(process.argv[2]);';
    await writeFile(join(root, `entry.${extension}`), source);
    const id = randomUUID();
    const result = await request('/debugger/v1/start', {
      operationId: id,
      program: `entry.${extension}`,
      args: ['synthetic-argument'],
      stopOnEntry: false,
    });
    expect(result.statusCode, result.body).toBe(200);
    await expect.poll(async () => (await status(id)).status).toBe('exited');
    expect((await status(id)).output.trim()).toBe('synthetic-argument');
  });
}

test('Stop escalates only debugger children that ignore SIGTERM and confirms close', async () => {
  await writeFile(join(root, 'program.cjs'), "process.on('SIGTERM', () => {});\nsetInterval(() => {}, 1000);\n");
  const id = randomUUID();
  expect(
    (
      await request('/debugger/v1/start', {
        operationId: id,
        program: 'program.cjs',
        stopOnEntry: false,
        breakpoints: [{ file: 'program.cjs', line: 2 }],
      })
    ).statusCode,
  ).toBe(200);
  await expect.poll(async () => (await status(id)).status).toBe('paused');
  const pid = processes.get(id)!.process.pid!;
  const stop = await request(`/processes/${id}/kill`, {});
  expect(stop.json()).toMatchObject({ status: 'stopped', terminated: true, signal: 'SIGKILL' });
  expect(() => process.kill(pid, 0)).toThrow();
  expect(processes.size).toBe(0);
});

test('interactive deadline terminates a paused debugger and does not label timeout as stopped', async () => {
  const original = process.env.WORKSPACE_STREAM_TIMEOUT_MS;
  process.env.WORKSPACE_STREAM_TIMEOUT_MS = '600';
  await app.close();
  app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId: 'synthetic', tokenSecret: secret, processes });
  if (original === undefined) delete process.env.WORKSPACE_STREAM_TIMEOUT_MS;
  else process.env.WORKSPACE_STREAM_TIMEOUT_MS = original;
  await writeFile(join(root, 'program.cjs'), 'setInterval(() => {}, 1000);');
  const id = randomUUID();
  expect((await request('/debugger/v1/start', { operationId: id, program: 'program.cjs' })).statusCode).toBe(200);
  await expect.poll(async () => (await status(id)).status).toBe('paused');
  const pid = processes.get(id)!.process.pid!;
  await expect.poll(async () => (await status(id)).status).toBe('timeout');
  expect(() => process.kill(pid, 0)).toThrow();
});

test('pauses a running process and rejects a duplicate invalid transition', async () => {
  await writeFile(join(root, 'program.cjs'), 'setInterval(() => { const tick = 1; }, 5);');
  const id = randomUUID();
  expect(
    (await request('/debugger/v1/start', { operationId: id, program: 'program.cjs', stopOnEntry: false })).statusCode,
  ).toBe(200);
  await command(id, 'pause');
  await expect.poll(async () => (await status(id)).status).toBe('paused');
  expect((await request(`/debugger/v1/${id}/control`, { action: 'pause' })).statusCode).toBe(409);
});

test('entry breakpoint is temporary when the first source line is a repeated function', async () => {
  await writeFile(
    join(root, 'entry.cjs'),
    'function twice(value) { return value * 2; }\nconsole.log(twice(2));\nconsole.log(twice(3));',
  );
  const id = randomUUID();
  expect((await request('/debugger/v1/start', { operationId: id, program: 'entry.cjs' })).statusCode).toBe(200);
  await expect.poll(async () => (await status(id)).status).toBe('paused');
  await command(id, 'continue');
  await expect.poll(async () => (await status(id)).status).toBe('exited');
  expect((await status(id)).output.trim()).toBe('4\n6');
});

test('an explicit user breakpoint on the entry line remains installed', async () => {
  await writeFile(
    join(root, 'entry.cjs'),
    'function twice(value) { return value * 2; }\nconsole.log(twice(2));\nconsole.log(twice(3));',
  );
  const id = randomUUID();
  expect(
    (
      await request('/debugger/v1/start', {
        operationId: id,
        program: 'entry.cjs',
        breakpoints: [{ file: 'entry.cjs', line: 1 }],
      })
    ).statusCode,
  ).toBe(200);
  await expect.poll(async () => (await status(id)).status).toBe('paused');
  await command(id, 'continue');
  await expect.poll(async () => (await status(id)).output).toContain('4');
  await expect.poll(async () => (await status(id)).status).toBe('paused');
  await command(id, 'continue');
  await expect.poll(async () => (await status(id)).status).toBe('exited');
});

test('resume acknowledgement never exposes the old paused frame for a second step', async () => {
  await writeFile(join(root, 'busy.cjs'), 'let count = 0;\nwhile (true) { count++; }');
  const id = randomUUID();
  expect((await request('/debugger/v1/start', { operationId: id, program: 'busy.cjs' })).statusCode).toBe(200);
  await expect.poll(async () => (await status(id)).status).toBe('paused');
  const resumed = await request(`/debugger/v1/${id}/control`, { action: 'continue' });
  expect(resumed.statusCode).toBe(200);
  expect(resumed.json()).toMatchObject({ status: 'running', callStack: [] });
  const duplicate = await request(`/debugger/v1/${id}/control`, { action: 'step-over' });
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json().code).toBe('DEBUGGER_STATE_CONFLICT');
});

test('a controlled lost response reports unknown and forbids another step until confirmed Stop', async () => {
  await writeFile(join(root, 'busy.cjs'), 'let count = 0;\nwhile (true) { count++; }');
  const id = randomUUID();
  expect((await request('/debugger/v1/start', { operationId: id, program: 'busy.cjs' })).statusCode).toBe(200);
  await expect.poll(async () => (await status(id)).status).toBe('paused');
  await expect.poll(async () => (await status(id)).variables.length).toBeGreaterThan(0);
  // Transport fault only: the actual Node child executes the real resume.
  const channel = (processes.get(id)!.process as ChildProcess).stdio[3]!;
  const listeners = channel.listeners('data');
  channel.removeAllListeners('data');
  try {
    const response = await request(`/debugger/v1/${id}/control`, { action: 'continue' });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('DEBUGGER_COMMAND_TIMEOUT');
    expect(await status(id)).toMatchObject({ status: 'unknown', callStack: [] });
    expect((await request(`/debugger/v1/${id}/control`, { action: 'step-over' })).statusCode).toBe(409);
  } finally {
    for (const listener of listeners) channel.on('data', listener as (...args: any[]) => void);
  }
  expect((await request(`/debugger/v1/${id}/stop`, {})).json()).toMatchObject({ status: 'stopped', terminated: true });
}, 10000);
