import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildWorkspaceAgentApp, type ProcessRecord } from './app.js';

const workspaceId = 'synthetic-files-preview-proof';
const processSnapshotSchema = z.object({ id: z.string(), status: z.string() });
const stoppedProcessSchema = processSnapshotSchema.extend({ terminated: z.boolean() });
const fileSchema = z.object({ content: z.string(), encoding: z.enum(['utf8', 'base64']) });
const portsSchema = z.object({ ports: z.array(z.object({ port: z.number().int().positive().max(65535) })) });

let root: string;
let secret: string;
let token: string;
let app: ReturnType<typeof buildWorkspaceAgentApp>;
let baseUrl: string;
let processes: Map<string, ProcessRecord>;
let launchedRecords: Map<string, ProcessRecord>;

async function openAgent() {
  processes = new Map();
  app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId, tokenSecret: secret, processes });
  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Synthetic agent did not bind');
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function request(path: string, body?: unknown, auth = token) {
  return fetch(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json(path: string, body?: unknown) {
  const response = await request(path, body);
  const payload = await response.json();
  expect(response.ok, JSON.stringify(payload)).toBe(true);

  return payload;
}

async function write(path: string, content: string, encoding = 'utf8') {
  await json('/files/write', { path, content, encoding });
}

async function launch(program: string) {
  const operationId = randomUUID();

  const result = processSnapshotSchema.parse(
    await json('/sessions/v1/start', {
      operationId,
      command: process.execPath,
      args: [program],
      background: true,
    }),
  );

  const record = processes.get(operationId);

  if (record) {
    launchedRecords.set(operationId, record);
  }

  expect(result.id).toBe(operationId);

  return operationId;
}

async function stop(id: string) {
  const pid = processes.get(id)?.process.pid;
  const stopped = stoppedProcessSchema.parse(await json(`/processes/${id}/kill`, {}));
  expect(stopped.terminated).toBe(true);

  if (pid) {
    expect(() => process.kill(pid, 0)).toThrow();
  }

  expect(processes.has(id)).toBe(false);

  return stopped;
}
beforeEach(async () => {
  launchedRecords = new Map();
  root = await mkdtemp(join(tmpdir(), 'runtime-files-preview-proof-'));
  secret = randomUUID();
  token = signAgentToken({ workspaceId, expiresAt: Date.now() + 120_000, secret });
  await openAgent();
});
afterEach(async () => {
  try {
    // Keep child references even if a regressed Stop removes its registry entry.
    for (const [id, record] of new Map([...launchedRecords, ...(processes ?? [])])) {
      await fetch(`${baseUrl}/processes/${id}/kill`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      }).catch(() => undefined);

      const child = record.process;

      if (child.pid && child.exitCode === null && child.signalCode === null) {
        // Teardown only: the test's Stop assertions above must still fail normally.
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Synthetic child did not close after cleanup SIGKILL')),
            5000,
          );
          child.once('close', () => {
            clearTimeout(timer);
            resolve();
          });

          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        });
      }
    }
  } finally {
    try {
      await app?.close();
    } finally {
      if (root) {
        await rm(root, { recursive: true, force: true });
      }
    }
  }
});

const serverSource = [
  "const http = require('node:http');",
  "const fs = require('node:fs');",
  'const server = http.createServer((request, response) => {',
  "  if (request.url.startsWith('/health')) { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ ok: true, url: request.url })); return; }",
  "  if (request.url === '/asset.bin') { response.setHeader('content-type', 'application/octet-stream'); response.end(Buffer.from([0, 255, 17, 0, 42])); return; }",
  "  response.setHeader('content-type', 'text/html'); response.end('<!doctype html><html><body><h1>Synthetic preview is alive</h1></body></html>');",
  '});',
  "server.listen(0, '127.0.0.1', () => { const port = server.address().port; fs.writeFileSync('listening-port.txt', String(port)); console.log('Listening on http://127.0.0.1:' + port); });",
].join('\n');

async function serverPort() {
  let port = 0;
  await expect
    .poll(
      async () => {
        const response = await request('/files/read?path=listening-port.txt');

        if (!response.ok) {
          return false;
        }

        port = Number(fileSchema.parse(await response.json()).content);

        return port > 0;
      },
      { timeout: 5000 },
    )
    .toBe(true);

  return port;
}
describe('runtime files and HTTP preview — real loopback stack, synthetic files only', () => {
  it('retains UTF-8 edits, renamed files and binary bytes across agent close/reopen on the same root', async () => {
    await json('/files/create', { path: 'src/original.txt', content: 'État initial 🧪\n' });

    const conflict = await request('/files/create', { path: 'src/original.txt', content: 'must not overwrite' });
    expect(conflict.status).toBe(409);
    await write('src/original.txt', 'Modification persistée 🧪\n');
    await json('/files/rename', { from: 'src/original.txt', to: 'nested/renamed.txt' });

    const bytes = Buffer.from([0, 255, 17, 0, 42]);
    await write('assets/payload.bin', bytes.toString('base64'), 'base64');
    await json('/files/create', { path: 'removed.txt', content: 'temporary' });
    await json('/files/delete', { path: 'removed.txt' });
    await app.close();
    await openAgent();
    expect(await json('/files/read?path=nested/renamed.txt')).toMatchObject({
      content: 'Modification persistée 🧪\n',
      encoding: 'utf8',
    });

    const binary = fileSchema.parse(await json('/files/read?path=assets/payload.bin'));
    expect(binary.encoding).toBe('base64');
    expect(Buffer.from(binary.content, 'base64')).toEqual(bytes);
    expect((await request('/files/read?path=src/original.txt')).status).toBe(404);
    expect((await request('/files/read?path=removed.txt')).status).toBe(404);
    expect((await request('/files/read?path=nested/renamed.txt', undefined, '')).status).toBe(401);
  });
  it('discovers a real Node listener, proxies HTML/JSON/binary and refuses foreign authentication', async () => {
    await write('server.cjs', serverSource);

    const id = await launch('server.cjs');
    const port = await serverPort();
    await expect
      .poll(async () => portsSchema.parse(await json('/ports')).ports.some((entry) => entry.port === port), {
        timeout: 5000,
      })
      .toBe(true);

    const html = await request(`/preview/${port}/`);
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    expect(await html.text()).toContain('<h1>Synthetic preview is alive</h1>');
    expect(await json(`/preview/${port}/health?probe=real`)).toEqual({ ok: true, url: '/health?probe=real' });

    const binary = await request(`/preview/${port}/asset.bin`);
    expect(Buffer.from(await binary.arrayBuffer())).toEqual(Buffer.from([0, 255, 17, 0, 42]));

    const foreign = signAgentToken({ workspaceId: 'foreign-fixture', expiresAt: Date.now() + 60_000, secret });
    expect((await request(`/preview/${port}/`, undefined, foreign)).status).toBe(401);
    expect((await stop(id)).status).toBe('stopped');
    await expect
      .poll(async () => portsSchema.parse(await json('/ports')).ports.some((entry) => entry.port === port), {
        timeout: 5000,
      })
      .toBe(false);
  }, 15000);
  it('reports an actual server error then serves corrected code on a fresh tracked launch', async () => {
    await write('server.cjs', "throw new Error('synthetic startup failure');");

    const failedId = await launch('server.cjs');
    await expect
      .poll(async () => processSnapshotSchema.parse(await json(`/processes/${failedId}`)).status, { timeout: 5000 })
      .toBe('failed');
    expect(processes.has(failedId)).toBe(false);
    await write('server.cjs', serverSource);

    const recoveredId = await launch('server.cjs');
    const port = await serverPort();
    expect(await json(`/preview/${port}/health?recovered=1`)).toEqual({ ok: true, url: '/health?recovered=1' });
    expect((await stop(recoveredId)).status).toBe('stopped');
    expect(processSnapshotSchema.parse(await json(`/processes/${failedId}`)).status).toBe('failed');
    expect(processSnapshotSchema.parse(await json(`/processes/${recoveredId}`)).status).toBe('stopped');
  }, 15000);
});
