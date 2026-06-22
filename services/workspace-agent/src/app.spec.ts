import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signAgentToken } from '@vibecore/workspace-sdk';
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
    expect(read.json()).toMatchObject({ content: 'export const ok = true;', encoding: 'utf8' });
  });

  it('reads a binary file back as lossless base64 (no utf8 corruption)', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x01]);
    const pngBase64 = pngBytes.toString('base64');

    const write = await app.inject({
      method: 'POST',
      url: '/files/write',
      headers,
      payload: { path: 'assets/logo.png', content: pngBase64, encoding: 'base64' },
    });
    expect(write.statusCode).toBe(200);

    const read = await app.inject({ method: 'GET', url: '/files/read?path=assets/logo.png', headers });
    const body = read.json();
    expect(body.encoding).toBe('base64');
    expect(Array.from(Buffer.from(body.content, 'base64'))).toEqual(Array.from(pngBytes));
  });

  it('returns 404 (not 500) when reading a missing file', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };

    const read = await app.inject({ method: 'GET', url: '/files/read?path=does/not/exist.ts', headers });
    expect(read.statusCode).toBe(404);
    expect(read.json()).toMatchObject({ code: 'ENOENT' });
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

  it('sizes base64 writes by decoded bytes, not the encoded string length', async () => {
    /*
     * Regression: assertContentSize used Buffer.byteLength of the base64 STRING,
     * which is ~4/3 the decoded bytes actually written. A binary file well under
     * the limit was false-rejected with 413 once its base64 payload crossed it.
     */
    const maxFileBytes = 1_200;
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId, maxFileBytes });
    const headers = { authorization: `Bearer ${token}` };

    // 1000 decoded bytes -> ~1336 base64 chars: under the byte cap, over the string cap.
    const bytes = Buffer.alloc(1_000, 0xab);
    const base64 = bytes.toString('base64');
    expect(Buffer.byteLength(base64)).toBeGreaterThan(maxFileBytes);

    const ok = await app.inject({
      method: 'POST',
      url: '/files/write',
      headers,
      payload: { path: 'assets/blob.bin', content: base64, encoding: 'base64' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ bytes: 1_000 });

    // A payload whose DECODED size exceeds the cap is still rejected.
    const tooBig = Buffer.alloc(maxFileBytes + 1, 0xcd).toString('base64');

    const rejected = await app.inject({
      method: 'POST',
      url: '/files/write',
      headers,
      payload: { path: 'assets/big.bin', content: tooBig, encoding: 'base64' },
    });
    expect(rejected.statusCode).toBe(413);
    expect(rejected.json()).toMatchObject({ code: 'FILE_TOO_LARGE' });
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

    const fromUrl = detectPortsFromOutput(
      new Map([['a', record('a', 'node server.js', 'Local: http://localhost:4173')]]),
    );
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

  it('preserves multibyte UTF-8 split across chunk boundaries in /commands/stream', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId, commandTimeoutMs: 5_000 });
    await app.listen({ host: '127.0.0.1', port: 0 });

    const address = app.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Workspace agent did not bind to a TCP port');
    }

    /*
     * Emit a string rich in multibyte UTF-8 (emoji, CJK, accents, box-drawing —
     * the glyphs that pervade npm/Vite/build logs) one BYTE at a time so every
     * multibyte sequence is guaranteed to straddle a stdout chunk boundary. With
     * chunk.toString('utf8') this mangled into U+FFFD; the StringDecoder buffers
     * the incomplete tail and reassembles it intact.
     */
    const marker = '✓ 安装 café ▓▓ 🚀';

    const program = [
      'const s = Buffer.from(process.argv[1], "utf8");',
      'let i = 0;',
      'const tick = () => {',
      '  if (i >= s.length) { process.exit(0); return; }',
      '  process.stdout.write(Buffer.from([s[i++]]), () => setTimeout(tick, 1));',
      '};',
      'tick();',
    ].join('');

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/commands/stream?token=${encodeURIComponent(token)}`);
    const stdout: string[] = [];

    try {
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('command-stream WebSocket failed to open')), {
          once: true,
        });
      });

      socket.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data)) as { type?: string; data?: string };

        if (frame.type === 'stdout' && typeof frame.data === 'string') {
          stdout.push(frame.data);
        }
      });

      socket.send(
        JSON.stringify({ type: 'hello', payload: { command: process.execPath, args: ['-e', program, marker] } }),
      );

      await expect.poll(() => stdout.join(''), { timeout: 8_000 }).toContain(marker);
      expect(stdout.join('')).not.toContain('�');
    } finally {
      socket.close();
      await app.close();
    }
  });
});
