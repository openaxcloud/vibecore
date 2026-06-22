import { signAgentToken } from '@vibecore/workspace-sdk';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildWorkspaceAgentApp, detectPortsFromOutput, type ProcessRecord } from './app.js';

const tokenSecret = 'test-secret';
const workspaceId = 'workspace_1';

describe('workspace-agent', () => {
  let root: string;
  let token: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'workspace-agent-'));
    token = signAgentToken({ workspaceId, expiresAt: Date.now() + 60_000, secret: tokenSecret });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('requires a signed agent token', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const response = await app.inject({ method: 'GET', url: '/files/tree' });
    expect(response.statusCode).toBe(401);
  });

  it('writes and reads files inside the workspace root', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };

    const write = await app.inject({
      method: 'POST',
      url: '/files/write',
      headers,
      payload: { path: 'src/index.ts', content: 'export const ok = true;' },
    });
    expect(write.statusCode).toBe(200);

    const read = await app.inject({ method: 'GET', url: '/files/read?path=src/index.ts', headers });
    expect(read.json()).toMatchObject({ content: 'export const ok = true;' });
  });

  it('returns 404 (not 500) when reading a missing file', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };

    const read = await app.inject({ method: 'GET', url: '/files/read?path=does/not/exist.ts', headers });
    expect(read.statusCode).toBe(404);
    expect(read.json()).toMatchObject({ code: 'ENOENT' });
  });

  it('exports and re-imports the whole workspace as a streamed tar archive', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };

    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'index.js'), 'console.log(1)\n');
    await writeFile(join(root, 'src/app.ts'), 'export const x = 1\n');

    const exported = await app.inject({ method: 'GET', url: '/snapshots/archive', headers });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('application/gzip');
    const archive = exported.rawPayload;
    expect(archive.length).toBeGreaterThan(0);

    // Restore into a fresh, independent workspace (new root + its own identity).
    const root2 = await mkdtemp(join(tmpdir(), 'workspace-agent-restore-'));
    const ws2 = 'workspace_2';
    const token2 = signAgentToken({ workspaceId: ws2, expiresAt: Date.now() + 60_000, secret: tokenSecret });
    const app2 = buildWorkspaceAgentApp({ workspaceRoot: root2, tokenSecret, workspaceId: ws2 });

    try {
      const imported = await app2.inject({
        method: 'POST',
        url: '/snapshots/archive',
        headers: { authorization: `Bearer ${token2}`, 'content-type': 'application/gzip' },
        payload: archive,
      });
      expect(imported.statusCode).toBe(200);
      expect(imported.json()).toEqual({ imported: true });

      expect(await readFile(join(root2, 'index.js'), 'utf8')).toBe('console.log(1)\n');
      expect(await readFile(join(root2, 'src/app.ts'), 'utf8')).toBe('export const x = 1\n');
    } finally {
      await rm(root2, { recursive: true, force: true });
    }
  });

  it('rejects an archive import that is not a stream', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    // application/json body is buffered (not a stream) → 415 from the handler.
    const response = await app.inject({
      method: 'POST',
      url: '/snapshots/archive',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { not: 'a-stream' },
    });
    expect(response.statusCode).toBe(415);
  });

  it('blocks path traversal', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const response = await app.inject({
      method: 'POST',
      url: '/files/write',
      headers: { authorization: `Bearer ${token}` },
      payload: { path: '../escape.txt', content: 'nope' },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('runs commands with bounded output', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId, maxOutputBytes: 128 });
    const response = await app.inject({
      method: 'POST',
      url: '/commands/run',
      headers: { authorization: `Bearer ${token}` },
      payload: { command: process.execPath, args: ['-e', 'console.log("ok")'] },
    });
    expect(response.json()).toMatchObject({ code: 0, stdout: 'ok\n' });
  });

  it('normalizes shell pipeline shorthand before spawning workspace commands', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId, commandTimeoutMs: 2_000 });
    const headers = { authorization: `Bearer ${token}` };
    const runningCommand = app.inject({
      method: 'POST',
      url: '/commands/run',
      headers,
      payload: { command: 'sh', args: ['-lc', 'printf "ok\\n" | head -20; sleep 1'] },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const processes = await app.inject({ method: 'GET', url: '/processes', headers });
    expect(processes.json()).toEqual({
      processes: [expect.objectContaining({ command: expect.stringContaining('head -n 20') })],
    });

    const result = await runningCommand;
    expect(result.json()).toMatchObject({ code: 0, stdout: 'ok\n' });
  });

  it('detects preview ports from running command output', () => {
    /*
     * Unit-tests the output-parsing path directly. The live /ports endpoint
     * prefers /proc-based detection on Linux, which on a shared CI runner
     * surfaces unrelated listening sockets — so the heuristic scrape can only be
     * exercised deterministically (and cross-platform) by calling it in
     * isolation. The endpoint contract itself is covered by the smoke test below.
     */
    const record = (id: string, command: string, output?: string): ProcessRecord =>
      ({ id, command, output, startedAt: new Date(0).toISOString(), process: {} as never }) satisfies ProcessRecord;

    const fromUrl = detectPortsFromOutput(new Map([['a', record('a', 'node server.js', 'Local: http://localhost:4173')]]));
    expect(fromUrl).toEqual([{ port: 4173, processId: 'a' }]);

    const fromFlag = detectPortsFromOutput(new Map([['b', record('b', 'serve --port 8080')]]));
    expect(fromFlag).toEqual([{ port: 8080, processId: 'b' }]);

    // Known dev servers fall back to their conventional port when output has none yet.
    const viteDefault = detectPortsFromOutput(new Map([['c', record('c', 'vite dev')]]));
    expect(viteDefault).toEqual([{ port: 5173, processId: 'c' }]);

    const nextDefault = detectPortsFromOutput(new Map([['d', record('d', 'next dev')]]));
    expect(nextDefault).toEqual([{ port: 3000, processId: 'd' }]);

    // Plain commands with no port signal yield nothing.
    expect(detectPortsFromOutput(new Map([['e', record('e', 'echo hi', 'hi')]]))).toEqual([]);
  });

  it('exposes the /ports endpoint with a well-formed port list', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId, commandTimeoutMs: 2_000 });
    const response = await app.inject({
      method: 'GET',
      url: '/ports',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as { ports: Array<{ port: number; processId: string }> };
    expect(Array.isArray(body.ports)).toBe(true);

    for (const entry of body.ports) {
      expect(typeof entry.port).toBe('number');
      expect(typeof entry.processId).toBe('string');
    }
  });

  it('blocks abuse command patterns before execution', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const response = await app.inject({
      method: 'POST',
      url: '/commands/run',
      headers: { authorization: `Bearer ${token}` },
      payload: { command: 'nmap', args: ['127.0.0.1'] },
    });
    expect(response.statusCode).toBe(409);
  });

  it('exposes Prometheus-compatible workspace metrics', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('active_workspaces');
    expect(response.body).toContain('terminal_sessions');
  });

  it('streams terminal WebSocket input and command output', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId, commandTimeoutMs: 2_000 });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Workspace agent did not bind to a TCP port');
    }

    const messages: string[] = [];
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/terminal?token=${encodeURIComponent(token)}`);

    try {
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('Terminal WebSocket failed to open')), { once: true });
      });

      socket.addEventListener('message', (event) => messages.push(String(event.data)));
      socket.send(`${process.execPath} -e "console.log('terminal-critical-path')"\n`);

      await expect.poll(() => messages.join(''), { timeout: 5_000 }).toContain('terminal-critical-path');
    } finally {
      socket.close();
      await app.close();
    }
  });
});
