import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  buildPreviewHosts,
  buildWorkspaceAgentApp,
  classifyListeningPort,
  detectPortsFromOutput,
  injectPreviewHmrShim,
  isProductionBuildCommand,
  sanitizedChildEnv,
  type ProcessRecord,
} from './app.js';

const tokenSecret = 'test-secret';
const workspaceId = 'workspace_1';

describe('isProductionBuildCommand', () => {
  it('recognizes production build invocations', () => {
    expect(isProductionBuildCommand('vite', ['build'])).toBe(true);
    expect(isProductionBuildCommand('npm', ['run', 'build'])).toBe(true);
    expect(isProductionBuildCommand('next', ['build'])).toBe(true);
    expect(isProductionBuildCommand('npx', ['react-scripts', 'build'])).toBe(true);
    expect(isProductionBuildCommand('pnpm', ['build'])).toBe(true);
  });

  it('does NOT flag dev servers / installs / REPLs', () => {
    expect(isProductionBuildCommand('vite', [])).toBe(false);
    expect(isProductionBuildCommand('npm', ['run', 'dev'])).toBe(false);
    expect(isProductionBuildCommand('next', ['dev'])).toBe(false);
    expect(isProductionBuildCommand('npm', ['install'])).toBe(false);
    expect(isProductionBuildCommand('node', ['server.js'])).toBe(false);
  });
});

describe('sanitizedChildEnv', () => {
  it('coerces a leaked NODE_ENV=production to development for a dev server (fixes the _jsxDEV blank)', () => {
    const env = sanitizedChildEnv({ NODE_ENV: 'production', PATH: '/usr/bin' }, { command: 'vite', args: [] });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PATH).toBe('/usr/bin');
  });

  it('coerces for an install and for a terminal (no command context)', () => {
    expect(sanitizedChildEnv({ NODE_ENV: 'production' }, { command: 'npm', args: ['install'] }).NODE_ENV).toBe(
      'development',
    );
    expect(sanitizedChildEnv({ NODE_ENV: 'production' }).NODE_ENV).toBe('development');
  });

  it('PRESERVES NODE_ENV=production for a real production build', () => {
    expect(sanitizedChildEnv({ NODE_ENV: 'production' }, { command: 'vite', args: ['build'] }).NODE_ENV).toBe(
      'production',
    );
    expect(sanitizedChildEnv({ NODE_ENV: 'production' }, { command: 'npm', args: ['run', 'build'] }).NODE_ENV).toBe(
      'production',
    );
  });

  it('leaves an already-development / test / unset NODE_ENV untouched', () => {
    expect(sanitizedChildEnv({ NODE_ENV: 'development' }, { command: 'vite', args: [] }).NODE_ENV).toBe('development');
    expect(sanitizedChildEnv({ NODE_ENV: 'test' }, { command: 'vite', args: [] }).NODE_ENV).toBe('test');
    expect(sanitizedChildEnv({}, { command: 'vite', args: [] }).NODE_ENV).toBeUndefined();
  });

  it('still strips the agent-private signing secret', () => {
    const env = sanitizedChildEnv(
      { WORKSPACE_AGENT_TOKEN_SECRET: 'super-secret', NODE_ENV: 'production' },
      { command: 'vite', args: [] },
    );
    expect(env.WORKSPACE_AGENT_TOKEN_SECRET).toBeUndefined();
    expect(env.NODE_ENV).toBe('development');
  });
});

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

  it('runs a command in the requested subdirectory cwd (monorepo / subfolder project)', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };

    // Materialise a subdirectory by writing a file into it.
    await app.inject({
      method: 'POST',
      url: '/files/write',
      headers,
      payload: { path: 'packages/app/package.json', content: '{"name":"app"}' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/commands/run',
      headers,
      payload: { command: process.execPath, args: ['-e', 'process.stdout.write(process.cwd())'], cwd: 'packages/app' },
    });

    const body = response.json() as { code: number; stdout: string };
    expect(body.code).toBe(0);
    expect(body.stdout.endsWith('packages/app')).toBe(true);
  });

  it('rejects a command cwd that escapes the workspace root', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });

    const response = await app.inject({
      method: 'POST',
      url: '/commands/run',
      headers: { authorization: `Bearer ${token}` },
      payload: { command: process.execPath, args: ['-e', 'console.log("x")'], cwd: '../../etc' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
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

  it('surfaces a real listening port even when /proc cannot attribute it to a pid (not just 5173)', () => {
    const selfPort = 8080;
    const agentPid = 1;

    // A dev server on a non-default port whose socket-inode -> pid mapping is missing
    // (gVisor) must STILL be surfaced — else detection falls back to the 5173 guess.
    expect(classifyListeningPort({ port: 3000, pid: undefined, selfPort, agentPid })).toEqual({
      include: true,
      fallbackId: 'port:3000',
    });

    // With a resolved (non-agent) pid, include it with a pid-scoped fallback id.
    expect(classifyListeningPort({ port: 5173, pid: 42, selfPort, agentPid })).toEqual({
      include: true,
      fallbackId: 'pid:42',
    });

    // The agent's own control port and the agent's own pid are never a preview.
    expect(classifyListeningPort({ port: 8080, pid: undefined, selfPort, agentPid }).include).toBe(false);
    expect(classifyListeningPort({ port: 9229, pid: agentPid, selfPort, agentPid }).include).toBe(false);
  });

  it('injects the HMR-safety shim into preview HTML before Vite module scripts (so a broken HMR config still mounts)', () => {
    const html = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <script type="module" src="/@vite/client"></script>',
      '  <title>App</title>',
      '</head>',
      '<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>',
      '</html>',
    ].join('\n');

    const out = injectPreviewHmrShim(html);

    // The shim is present and runs as a classic (non-module) script…
    expect(out).toContain('data-ecode-hmr-shim');
    expect(out).toContain('window.WebSocket');
    // …injected right after <head>, i.e. BEFORE Vite's deferred module scripts.
    expect(out.indexOf('data-ecode-hmr-shim')).toBeLessThan(out.indexOf('/@vite/client'));
    // The original document is preserved.
    expect(out).toContain('<div id="root"></div>');
    expect(out).toContain('/src/main.tsx');

    // Idempotent — a second pass does not double-inject.
    expect(injectPreviewHmrShim(out)).toBe(out);

    // No <head> → left untouched (never mangle a non-standard document).
    expect(injectPreviewHmrShim('<html><body>hi</body></html>')).toBe('<html><body>hi</body></html>');
    expect(injectPreviewHmrShim('')).toBe('');
  });

  it('builds preview hosts: loopback first, pod IPv4 next, [::1] last, no internal/IPv6 interface addrs', () => {
    const hosts = buildPreviewHosts({
      lo: [
        { family: 'IPv4', address: '127.0.0.1', internal: true } as never,
        { family: 'IPv6', address: '::1', internal: true } as never,
      ],
      eth0: [
        { family: 'IPv4', address: '10.20.0.10', internal: false } as never,
        { family: 'IPv6', address: 'fe80::1', internal: false } as never,
      ],
    });

    // 127.0.0.1 is the fast path and must be tried first.
    expect(hosts[0]).toBe('127.0.0.1');
    // The pod's routable IPv4 (Vite's `Network:` addr) reaches a `[::]` bind on gVisor.
    expect(hosts).toContain('10.20.0.10');
    // IPv6 loopback is the last resort (no-op on pods without IPv6 loopback).
    expect(hosts[hosts.length - 1]).toBe('[::1]');
    // Interface IPv6 addresses and internal loopbacks are never dialed directly.
    expect(hosts).not.toContain('::1');
    expect(hosts).not.toContain('fe80::1');
  });

  it('preview hosts stay de-duplicated when an interface repeats the loopback address', () => {
    const hosts = buildPreviewHosts({ lo: [{ family: 'IPv4', address: '127.0.0.1', internal: false } as never] });
    expect(hosts.filter((h) => h === '127.0.0.1')).toHaveLength(1);
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
