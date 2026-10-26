import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { afterEach, beforeEach, expect, test } from 'vitest';
import WebSocket from 'ws';
import { z } from 'zod';
import { buildWorkspaceAgentApp, type ProcessRecord } from './app.js';

/*
 * Real HTTP/WebSocket transports and child processes, exclusively temporary
 * synthetic files. Package installation uses an empty environment, local file:
 * dependency, offline npm, empty config files and a dedicated temporary cache.
 */
let root: string;
let app: ReturnType<typeof buildWorkspaceAgentApp>;
let baseUrl: string;
let headers: Record<string, string>;
let processes: Map<string, ProcessRecord>;
let environmentBeforeTest: NodeJS.ProcessEnv;

const sockets = new Set<WebSocket>();

beforeEach(async () => {
  environmentBeforeTest = { ...process.env };
  root = await mkdtemp(join(tmpdir(), 'runtime-shell-install-proof-'));
  await Promise.all([mkdir(join(root, 'home')), mkdir(join(root, 'tmp'))]);

  /*
   * The terminal sources HOME/.bashrc. Isolate that path and temporary shell
   * startup files, and do not pass parent credentials/configuration to children.
   */
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, {
    PATH: environmentBeforeTest.PATH ?? '/usr/bin:/bin',
    HOME: join(root, 'home'),
    TMPDIR: join(root, 'tmp'),
    SHELL: '/bin/bash',
    LANG: 'C.UTF-8',
    NODE_ENV: 'test',
  });
  processes = new Map();

  const secret = 'synthetic-test-secret';
  const workspaceId = `synthetic-shell-${randomUUID()}`;
  headers = {
    authorization: `Bearer ${signAgentToken({ workspaceId, expiresAt: Date.now() + 60_000, secret })}`,
    'content-type': 'application/json',
  };
  app = buildWorkspaceAgentApp({
    workspaceRoot: root,
    workspaceId,
    tokenSecret: secret,
    processes,
    commandTimeoutMs: 15_000,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Synthetic agent did not bind');
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  try {
    for (const socket of sockets) {
      socket.terminate();
    }
    sockets.clear();

    // A failed assertion must not leave a synthetic background child behind.
    for (const record of processes?.values() ?? []) {
      if (record.process.pid && record.process.exitCode === null && record.process.signalCode === null) {
        const closed = once(record.process, 'close');

        try {
          process.kill(-record.process.pid, 'SIGKILL');
        } catch {
          /* already exited */
        }
        await closed;
      }
    }
  } finally {
    try {
      await app?.close();
    } finally {
      try {
        if (root) {
          await rm(root, { recursive: true, force: true });
        }
      } finally {
        // Restore missing keys as absent, never the literal string "undefined".
        for (const key of Object.keys(process.env)) {
          delete process.env[key];
        }

        for (const [key, value] of Object.entries(environmentBeforeTest ?? {})) {
          if (value !== undefined) {
            process.env[key] = value;
          }
        }
      }
    }
  }
});

async function http(path: string, payload?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });

  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);

  return z
    .object({
      id: z.string(),
      status: z.string().optional(),
      code: z.number().nullable().optional(),
      stdout: z.string().optional(),
      stderr: z.string().optional(),
    })
    .passthrough()
    .parse(body);
}

async function terminal(sessionId: string) {
  const frames: Array<{ type: string; data?: string; exitCode?: number }> = [];
  const socket = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/terminal?sessionId=${sessionId}`, { headers });
  sockets.add(socket);
  socket.on('message', (message) => frames.push(JSON.parse(message.toString())));
  await once(socket, 'open');

  return {
    socket,
    frames,
    output: () =>
      frames
        .filter((frame) => frame.type === 'stdout')
        .map((frame) => frame.data ?? '')
        .join(''),
  };
}

async function closeSocket(socket: WebSocket) {
  const closed = once(socket, 'close');
  socket.close();
  await closed;
  sockets.delete(socket);
}

test('real command preserves distinct stdout/stderr and nonzero exit in the HTTP result and registry', async () => {
  const result = await http('/commands/run', {
    command: process.execPath,
    args: ['-e', "process.stdout.write('sortie-été\\n'); process.stderr.write('erreur-été\\n'); process.exitCode = 7"],
  });
  expect(result).toMatchObject({
    code: 7,
    signal: null,
    stdout: 'sortie-été\n',
    stderr: 'erreur-été\n',
    truncated: false,
  });
  expect(await http(`/processes/${result.id}`)).toMatchObject({ status: 'failed', exitCode: 7 });
  expect(processes.size).toBe(0);
});

test('real shell runs in the selected project subdirectory, writes a file, pipes output and reports failure', async () => {
  await mkdir(join(root, 'nested'));

  const result = await http('/commands/run', {
    command: '/bin/bash',
    args: [
      '-c',
      "printf '%s\\n' 'synthetic shell value' > result.txt; cat result.txt | tr '[:lower:]' '[:upper:]'; printf '%s\\n' 'synthetic shell stderr' >&2; exit 9",
    ],
    cwd: 'nested',
  });
  expect(result).toMatchObject({ code: 9, stdout: 'SYNTHETIC SHELL VALUE\n', stderr: 'synthetic shell stderr\n' });
  expect(await readFile(join(root, 'nested', 'result.txt'), 'utf8')).toBe('synthetic shell value\n');
  expect(await http(`/processes/${result.id}`)).toMatchObject({ status: 'failed', exitCode: 9 });
});

test('real background command stays registered until HTTP Stop confirms the OS child exited', async () => {
  const result = await http('/commands/run', {
    command: process.execPath,
    args: ['-e', "console.log('synthetic-ready'); setInterval(() => {}, 1000)"],
    background: true,
  });
  expect(result.status).toBe('running');
  await expect.poll(() => processes.get(result.id)?.output).toContain('synthetic-ready');

  const pid = processes.get(result.id)!.process.pid!;
  expect(() => process.kill(pid, 0)).not.toThrow();
  expect(await http(`/processes/${result.id}/kill`, {})).toMatchObject({
    id: result.id,
    terminated: true,
    killed: true,
    status: 'stopped',
  });
  expect(() => process.kill(pid, 0)).toThrow();
  expect(processes.has(result.id)).toBe(false);
  expect(await http(`/processes/${result.id}/kill`, {})).toMatchObject({ terminated: true, status: 'stopped' });
});

test('real terminal retains cwd and exported state across WebSocket reconnection and reports shell exit', async () => {
  await mkdir(join(root, 'nested'));

  const sessionId = `synthetic-${randomUUID()}`;
  const first = await terminal(sessionId);
  first.socket.send('cd nested; export AUDIT_VALUE=retained; printf \'ready:%s\\n\' "$PWD"\n');
  await expect.poll(first.output, { timeout: 5000 }).toContain(`ready:${root}/nested`);
  await closeSocket(first.socket);

  const second = await terminal(sessionId);
  second.socket.send(
    'printf \'state:%s:%s\\n\' "$PWD" "$AUDIT_VALUE"; printf \'fault:%s\\n\' "$AUDIT_VALUE" >&2; false; printf \'failure:%s\\n\' "$?"\n',
  );
  await expect.poll(second.output, { timeout: 5000 }).toContain(`state:${root}/nested:retained`);
  await expect.poll(second.output).toContain('fault:retained');
  await expect.poll(second.output).toContain('failure:1');
  second.socket.send('exit 23\n');
  await expect
    .poll(() => second.frames.find((frame) => frame.type === 'exit'), { timeout: 5000 })
    .toMatchObject({ exitCode: 23 });
});

test('npm installs an offline local dependency and a fresh Node process imports and executes its real code', async () => {
  const dependency = join(root, 'fixture-dependency');
  const project = join(root, 'project');
  const home = join(root, 'npm-home');
  await Promise.all([mkdir(dependency), mkdir(project), mkdir(home)]);
  await writeFile(
    join(dependency, 'package.json'),
    JSON.stringify({ name: 'synthetic-offline-math', version: '1.0.0', type: 'module', exports: './index.js' }),
  );
  await writeFile(join(dependency, 'index.js'), 'export function add(a, b) { return a + b; }\n');
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'synthetic-consumer',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: { 'synthetic-offline-math': 'file:../fixture-dependency' },
    }),
  );

  const userConfig = join(root, 'empty-user.npmrc');
  const globalConfig = join(root, 'empty-global.npmrc');
  await Promise.all([writeFile(userConfig, ''), writeFile(globalConfig, '')]);

  const installed = await http('/commands/run', {
    command: '/usr/bin/env',
    args: [
      '-i',
      `PATH=${process.env.PATH ?? '/usr/bin:/bin'}`,
      `HOME=${home}`,
      'npm',
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--install-links',
      '--cache',
      join(root, 'npm-cache'),
      '--userconfig',
      userConfig,
      '--globalconfig',
      globalConfig,
    ],
    cwd: 'project',
  });
  expect(installed.code, installed.stderr).toBe(0);

  const lock = JSON.parse(await readFile(join(project, 'package-lock.json'), 'utf8'));
  expect(lock.packages['node_modules/synthetic-offline-math']).toMatchObject({
    version: '1.0.0',
    resolved: 'file:../fixture-dependency',
  });
  expect(await readFile(join(project, 'node_modules/synthetic-offline-math/index.js'), 'utf8')).toContain(
    'return a + b',
  );

  const imported = await http('/commands/run', {
    command: process.execPath,
    args: [
      '--input-type=module',
      '-e',
      "import { add } from 'synthetic-offline-math'; console.log(JSON.stringify({result:add(19,23)}));",
    ],
    cwd: 'project',
  });
  expect(imported).toMatchObject({ code: 0, stderr: '', stdout: '{"result":42}\n' });
}, 20000);
