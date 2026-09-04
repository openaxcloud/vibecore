import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
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
  ensureViteEntryScript,
  htmlReferencesAppEntry,
  injectPreviewHmrShim,
  injectViteDevArgs,
  isProductionBuildCommand,
  isTransientPackageCommand,
  pinnedDevServerPort,
  sanitizedChildEnv,
  type ProcessRecord,
} from './app.js';

function fakeProcess(id: string, command: string): ProcessRecord {
  return { id, command, startedAt: new Date().toISOString(), process: { pid: 1234 } } as unknown as ProcessRecord;
}

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

describe('isTransientPackageCommand', () => {
  it('flags package installs / adds / ci for every known manager', () => {
    expect(isTransientPackageCommand('npm install')).toBe(true);
    expect(isTransientPackageCommand('npm install express')).toBe(true);
    expect(isTransientPackageCommand('npm ci')).toBe(true);
    expect(isTransientPackageCommand('npm i')).toBe(true);
    expect(isTransientPackageCommand('pnpm install')).toBe(true);
    expect(isTransientPackageCommand('pnpm i')).toBe(true);
    expect(isTransientPackageCommand('pnpm add react')).toBe(true);
    expect(isTransientPackageCommand('yarn')).toBe(true);
    expect(isTransientPackageCommand('yarn install')).toBe(true);
    expect(isTransientPackageCommand('yarn add lodash')).toBe(true);
    expect(isTransientPackageCommand('bun install')).toBe(true);

    // Tolerates an absolute path to the manager binary.
    expect(isTransientPackageCommand('/usr/local/bin/pnpm install')).toBe(true);
  });

  it('does NOT flag dev servers, scripts, or REPLs', () => {
    expect(isTransientPackageCommand('npm run dev')).toBe(false);
    expect(isTransientPackageCommand('pnpm dev')).toBe(false);
    expect(isTransientPackageCommand('pnpm start')).toBe(false);
    expect(isTransientPackageCommand('npm run preview')).toBe(false);
    expect(isTransientPackageCommand('vite')).toBe(false);
    expect(isTransientPackageCommand('next dev')).toBe(false);
    expect(isTransientPackageCommand('node server.js')).toBe(false);
    expect(isTransientPackageCommand('yarn dev')).toBe(false);
    expect(isTransientPackageCommand('')).toBe(false);
  });
});

describe('GET /busy', () => {
  it('reports busy when a transient install or a production build is running', async () => {
    const install = buildWorkspaceAgentApp({
      tokenSecret,
      workspaceId,
      processes: new Map([['p1', fakeProcess('p1', 'npm install')]]),
    });

    const installBody = (await install.inject({ method: 'GET', url: '/busy' })).json();
    expect(installBody).toEqual({ busy: true, buildCount: 1 });

    const build = buildWorkspaceAgentApp({
      tokenSecret,
      workspaceId,
      processes: new Map([['p1', fakeProcess('p1', 'vite build')]]),
    });
    expect((await build.inject({ method: 'GET', url: '/busy' })).json()).toEqual({ busy: true, buildCount: 1 });
  });

  it('is NOT busy for a long-lived dev server or when nothing is running', async () => {
    const devServer = buildWorkspaceAgentApp({
      tokenSecret,
      workspaceId,
      processes: new Map([['p1', fakeProcess('p1', 'vite')]]),
    });
    expect((await devServer.inject({ method: 'GET', url: '/busy' })).json()).toEqual({ busy: false, buildCount: 0 });

    const idle = buildWorkspaceAgentApp({ tokenSecret, workspaceId, processes: new Map() });
    expect((await idle.inject({ method: 'GET', url: '/busy' })).json()).toEqual({ busy: false, buildCount: 0 });
  });

  it('counts multiple concurrent build/install processes and never leaks command strings', async () => {
    const app = buildWorkspaceAgentApp({
      tokenSecret,
      workspaceId,
      processes: new Map([
        ['p1', fakeProcess('p1', 'npm install')],
        ['p2', fakeProcess('p2', 'vite build')],
        ['p3', fakeProcess('p3', 'vite')], // dev server — not counted
      ]),
    });

    const body = (await app.inject({ method: 'GET', url: '/busy' })).json();
    expect(body).toEqual({ busy: true, buildCount: 2 });

    // Response exposes only counts + a boolean, never the tenant command lines.
    expect(JSON.stringify(body)).not.toContain('npm');
  });
});

describe('pinnedDevServerPort', () => {
  it('returns the pinned port for a strictPort vite dev launch', () => {
    expect(pinnedDevServerPort(['--port', '5173', '--strictPort', '--host'])).toBe(5173);
    expect(pinnedDevServerPort(['vite', '--port', '4321', '--strictPort'])).toBe(4321);
  });

  it('returns null when not a pinned launch (no strictPort, or no port)', () => {
    expect(pinnedDevServerPort(['--port', '5173'])).toBeNull(); // no --strictPort
    expect(pinnedDevServerPort(['--strictPort', '--host'])).toBeNull(); // no --port value
    expect(pinnedDevServerPort(['build'])).toBeNull();
    expect(pinnedDevServerPort([])).toBeNull();
  });

  it('rejects a non-numeric or out-of-range port', () => {
    expect(pinnedDevServerPort(['--port', 'abc', '--strictPort'])).toBeNull();
    expect(pinnedDevServerPort(['--port', '99999', '--strictPort'])).toBeNull();
    expect(pinnedDevServerPort(['--port', '0', '--strictPort'])).toBeNull();
  });
});

describe('injectViteDevArgs', () => {
  const preview = { previewEnv: true } as const;
  const viteDev = { previewEnv: true, readScript: (name: string) => (name === 'dev' ? 'vite' : undefined) };
  const nextDev = { previewEnv: true, readScript: (name: string) => (name === 'dev' ? 'next dev' : undefined) };

  it('pins 5173 for a DIRECT vite dev command in the preview env', () => {
    expect(injectViteDevArgs('vite', [], preview)).toEqual(['--port', '5173', '--strictPort', '--host']);
    expect(injectViteDevArgs('npx', ['--yes', 'vite'], preview)).toEqual([
      '--yes',
      'vite',
      '--port',
      '5173',
      '--strictPort',
      '--host',
    ]);
    expect(injectViteDevArgs('pnpm', ['exec', 'vite'], preview)).toEqual([
      'exec',
      'vite',
      '--port',
      '5173',
      '--strictPort',
      '--host',
    ]);
  });

  it('pins 5173 for `npm run dev` when the dev script is a vite dev server (flags passed via `--`)', () => {
    expect(injectViteDevArgs('npm', ['run', 'dev'], viteDev)).toEqual([
      'run',
      'dev',
      '--',
      '--port',
      '5173',
      '--strictPort',
      '--host',
    ]);

    // `pnpm dev` shorthand resolves the same script.
    expect(injectViteDevArgs('pnpm', ['dev'], viteDev)).toEqual([
      'dev',
      '--',
      '--port',
      '5173',
      '--strictPort',
      '--host',
    ]);

    // An existing `--` passthrough is reused rather than doubled.
    expect(injectViteDevArgs('npm', ['run', 'dev', '--', '--host', '0.0.0.0'], viteDev)).toEqual([
      'run',
      'dev',
      '--',
      '--host',
      '0.0.0.0',
      '--port',
      '5173',
      '--strictPort',
      '--host',
    ]);
  });

  it('does NOT touch a `next dev` app (proxy targets 3000, would choke on --strictPort)', () => {
    expect(injectViteDevArgs('next', ['dev'], preview)).toEqual(['dev']);

    // `npm run dev` whose script is `next dev` is left alone.
    expect(injectViteDevArgs('npm', ['run', 'dev'], nextDev)).toEqual(['run', 'dev']);
  });

  it('does NOT touch other non-Vite runtimes or a vite BUILD', () => {
    expect(injectViteDevArgs('astro', ['dev'], preview)).toEqual(['dev']);
    expect(injectViteDevArgs('remix', ['dev'], preview)).toEqual(['dev']);
    expect(injectViteDevArgs('node', ['server.js'], preview)).toEqual(['server.js']);
    expect(injectViteDevArgs('vite', ['build'], preview)).toEqual(['build']);
    expect(injectViteDevArgs('vite', ['preview'], preview)).toEqual(['preview']);

    // An unknown `dev` script (not vite) is not assumed to be vite.
    expect(injectViteDevArgs('npm', ['run', 'dev'], preview)).toEqual(['run', 'dev']);
  });

  it('is a no-op outside the preview env, and idempotent when a port is already set', () => {
    expect(injectViteDevArgs('vite', [], { previewEnv: false })).toEqual([]);
    expect(injectViteDevArgs('vite', ['--port', '5173', '--strictPort', '--host'], preview)).toEqual([
      '--port',
      '5173',
      '--strictPort',
      '--host',
    ]);

    // A user-chosen explicit port is respected.
    expect(injectViteDevArgs('vite', ['--port', '4321'], preview)).toEqual(['--port', '4321']);
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

  it('rejects symlinks in no-follow trees and rejects final or ancestor symlinks on reads', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId });
    const headers = { authorization: `Bearer ${token}` };
    const skillRoot = join(root, '.agents', 'skills', 'safe-review');
    const realSkillRoot = join(root, 'real-skill');
    await mkdir(join(skillRoot, 'references'), { recursive: true });
    await mkdir(realSkillRoot, { recursive: true });
    await writeFile(join(skillRoot, 'SKILL.md'), '---\nname: safe-review\ndescription: Safe review.\n---\n');
    await writeFile(join(root, '.env'), 'TOP_SECRET=must-not-leak');
    await writeFile(join(realSkillRoot, 'resource.md'), 'safe resource');
    const tree = await app.inject({
      method: 'GET',
      url: '/files/tree?path=.agents%2Fskills&noFollow=1',
      headers,
    });
    expect(tree.statusCode).toBe(200);
    expect(JSON.stringify(tree.json())).toContain('.agents/skills/safe-review/SKILL.md');

    const regular = await app.inject({
      method: 'GET',
      url: '/files/read?path=.agents%2Fskills%2Fsafe-review%2FSKILL.md&noFollow=1',
      headers,
    });
    expect(regular.statusCode).toBe(200);
    expect(regular.json().content).toContain('name: safe-review');

    await symlink(join(root, '.env'), join(skillRoot, 'references', 'secret.md'));
    await symlink(realSkillRoot, join(root, 'linked-skill'));

    const linkedTree = await app.inject({
      method: 'GET',
      url: '/files/tree?path=.agents%2Fskills&noFollow=1',
      headers,
    });
    expect(linkedTree.statusCode).toBe(400);
    expect(linkedTree.json()).toMatchObject({ code: 'SYMLINK_DISALLOWED' });
    expect(linkedTree.body).not.toContain('must-not-leak');

    const finalSymlink = await app.inject({
      method: 'GET',
      url: '/files/read?path=.agents%2Fskills%2Fsafe-review%2Freferences%2Fsecret.md&noFollow=1',
      headers,
    });
    expect(finalSymlink.statusCode).toBe(400);
    expect(finalSymlink.json()).toMatchObject({ code: 'SYMLINK_DISALLOWED' });
    expect(finalSymlink.body).not.toContain('must-not-leak');

    const ancestorSymlink = await app.inject({
      method: 'GET',
      url: '/files/read?path=linked-skill%2Fresource.md&noFollow=1',
      headers,
    });
    expect(ancestorSymlink.statusCode).toBe(400);
    expect(ancestorSymlink.json()).toMatchObject({ code: 'SYMLINK_DISALLOWED' });
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

    /*
     * A dev server on a non-default port whose socket-inode -> pid mapping is missing
     * (gVisor) must STILL be surfaced — else detection falls back to the 5173 guess.
     */
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

  it('htmlReferencesAppEntry: true only for a project-source module script, not Vite internals', () => {
    expect(htmlReferencesAppEntry('<script type="module" src="/src/main.tsx"></script>')).toBe(true);
    expect(htmlReferencesAppEntry('<script type="module" src="./src/index.jsx"></script>')).toBe(true);
    expect(htmlReferencesAppEntry('<script type="module" src="src/main.ts"></script>')).toBe(true);

    // Vite's own injected scripts are NOT the app entry.
    expect(htmlReferencesAppEntry('<script type="module" src="/@vite/client"></script>')).toBe(false);
    expect(htmlReferencesAppEntry('<script type="module" src="/@react-refresh"></script>')).toBe(false);
    expect(htmlReferencesAppEntry('<div id="root"></div>')).toBe(false);
  });

  it('ensureViteEntryScript: repairs a generated index.html that dropped its entry <script>', () => {
    // The exact broken shape from prod: #root but no app entry.
    const broken = [
      '<!DOCTYPE html>',
      '<html lang="en"><head><title>Unit Converter</title></head>',
      '<body><div id="root"></div></body></html>',
    ].join('\n');

    const exists = (p: string) => p.endsWith('/src/main.tsx');
    const out = ensureViteEntryScript(broken, '/workspace', exists);

    expect(out).toContain('<script type="module" src="/src/main.tsx" data-ecode-entry-shim></script>');

    // Injected before </body>, and the original document is preserved (ADD, not replace).
    expect(out.indexOf('data-ecode-entry-shim')).toBeLessThan(out.indexOf('</body>'));
    expect(out).toContain('<div id="root"></div>');

    // Idempotent — a second pass does not double-inject.
    expect(ensureViteEntryScript(out, '/workspace', exists)).toBe(out);
  });

  it('ensureViteEntryScript: no-op when an entry is already present, no mount point, or no entry file on disk', () => {
    const withEntry = '<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>';
    expect(ensureViteEntryScript(withEntry, '/workspace', () => true)).toBe(withEntry);

    // No SPA mount point → leave a static/multi-page document alone.
    const staticHtml = '<body><h1>Hello</h1></body>';
    expect(ensureViteEntryScript(staticHtml, '/workspace', () => true)).toBe(staticHtml);

    // Mount point but NO entry file exists on disk → do not fabricate a 404 script.
    const noEntryFile = '<body><div id="root"></div></body>';
    expect(ensureViteEntryScript(noEntryFile, '/workspace', () => false)).toBe(noEntryFile);

    expect(ensureViteEntryScript('', '/workspace', () => true)).toBe('');
  });

  it('REGRESSION: the served HTML pipeline always keeps the app entry AND adds our injections (never strips the entry)', () => {
    const root = '/workspace';
    const exists = (p: string) => p.endsWith('/src/main.tsx');

    // Case A — generated index.html MISSING the entry: pipeline repairs it AND adds the HMR shim.
    const broken = '<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"></div></body></html>';
    const servedA = injectPreviewHmrShim(ensureViteEntryScript(broken, root, exists));
    expect(servedA).toContain('src="/src/main.tsx"'); // entry present
    expect(servedA).toContain('data-ecode-hmr-shim'); // our injection present
    expect(servedA).toContain('<div id="root">'); // mount preserved

    // Case B — index.html that ALREADY has the entry: the entry SURVIVES and is not duplicated.
    const withEntry =
      '<!DOCTYPE html><html><head><title>App</title></head>' +
      '<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';

    const servedB = injectPreviewHmrShim(ensureViteEntryScript(withEntry, root, exists));
    expect(servedB).toContain('data-ecode-hmr-shim'); // our injection added
    // Exactly ONE entry script — never stripped, never duplicated.
    expect(servedB.match(/src="\/src\/main\.tsx"/g)?.length).toBe(1);
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

  it('streams native create, content update, binary and delete events while excluding generated trees', async () => {
    const app = buildWorkspaceAgentApp({
      workspaceRoot: root,
      tokenSecret,
      workspaceId,
      fileWatchEnabled: true,

      /*
       * CI can run alongside several watcher-heavy suites and exhaust the host's
       * per-process fs-watch handles. Exercise the same chokidar event contract
       * through its supported polling backend deterministically.
       */
      fileWatchUsePolling: true,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });

    const address = app.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Workspace agent did not bind to a TCP port');
    }

    const frames: Array<{
      eventId?: string;
      sessionId?: string;
      path?: string;
      type?: string;
      content?: string;
      binary?: boolean;
    }> = [];

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/files/watch?token=${encodeURIComponent(token)}`);
    socket.addEventListener('message', (event) => frames.push(JSON.parse(String(event.data))));

    try {
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('file-watch WebSocket failed to open')), {
          once: true,
        });
      });

      /*
       * `ready` proves chokidar completed its initial scan; mutations after this
       * point cannot be mistaken for ignored initial entries.
       */
      await expect
        .poll(() => frames.find((frame) => frame.path === '.'), { timeout: 5_000 })
        .toMatchObject({
          type: 'update',
          eventId: expect.any(String),
          sessionId: expect.any(String),
        });

      const watcherSessionId = frames.find((frame) => frame.path === '.')?.sessionId;

      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'watch.ts'), 'export const value = 1;\n');

      await expect
        .poll(
          () => frames.find((frame) => frame.path === 'src/watch.ts' && frame.content === 'export const value = 1;\n'),
          { timeout: 5_000 },
        )
        .toMatchObject({
          type: 'create',
          binary: false,
          eventId: expect.any(String),
          sessionId: watcherSessionId,
        });

      await writeFile(join(root, 'src', 'watch.ts'), 'export const value = 2;\n');

      await expect
        .poll(
          () => frames.find((frame) => frame.path === 'src/watch.ts' && frame.content === 'export const value = 2;\n'),
          { timeout: 5_000 },
        )
        .toMatchObject({ type: 'update', binary: false });

      const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x01]);
      await writeFile(join(root, 'src', 'asset.bin'), binary);

      await expect
        .poll(() => frames.find((frame) => frame.path === 'src/asset.bin'), { timeout: 5_000 })
        .toMatchObject({ type: 'create', binary: true, content: binary.toString('base64') });

      const beforeIgnoredWrite = frames.length;
      await mkdir(join(root, 'node_modules', 'ignored'), { recursive: true });
      await writeFile(join(root, 'node_modules', 'ignored', 'index.js'), 'must not stream');
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(frames.slice(beforeIgnoredWrite).some((frame) => frame.path?.includes('node_modules'))).toBe(false);

      await rm(join(root, 'src', 'watch.ts'));
      await expect
        .poll(() => frames.find((frame) => frame.path === 'src/watch.ts' && frame.type === 'delete'), {
          timeout: 5_000,
        })
        .toMatchObject({ eventId: expect.any(String), sessionId: watcherSessionId });
    } finally {
      socket.close();
      await app.close();
    }
  }, 15_000);

  it('resynchronizes bounded current contents after a disconnect so offline terminal writes are not lost', async () => {
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'offline.ts'), 'export const state = "before";\n');

    const app = buildWorkspaceAgentApp({
      workspaceRoot: root,
      tokenSecret,
      workspaceId,
      fileWatchEnabled: true,
      fileWatchUsePolling: true,
      fileWatchInitialMaxFiles: 10,
      fileWatchInitialMaxBytes: 1024,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });

    const address = app.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Workspace agent did not bind to a TCP port');
    }

    const connect = async () => {
      const frames: Array<{
        eventId?: string;
        sessionId?: string;
        sequence?: number;
        path?: string;
        content?: string;
        initial?: boolean;
        reconciliation?: boolean;
        replay?: boolean;
        snapshot?: { files?: number; bytes?: number; truncated?: boolean };
      }> = [];

      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/files/watch?token=${encodeURIComponent(token)}`);
      socket.addEventListener('message', (event) => frames.push(JSON.parse(String(event.data))));

      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('file-watch WebSocket failed to open')), {
          once: true,
        });
      });

      return { frames, socket };
    };

    let activeSocket: WebSocket | undefined;

    try {
      const first = await connect();
      activeSocket = first.socket;

      await expect
        .poll(() => first.frames.find((frame) => frame.path === 'src/offline.ts'), { timeout: 5_000 })
        .toMatchObject({ content: 'export const state = "before";\n', initial: true });
      await expect
        .poll(() => first.frames.find((frame) => frame.path === '.')?.snapshot, { timeout: 5_000 })
        .toMatchObject({ files: 1, truncated: false });

      const firstClosed = new Promise<void>((resolve) =>
        first.socket.addEventListener('close', () => resolve(), { once: true }),
      );
      first.socket.close();
      await firstClosed;
      activeSocket = undefined;

      /*
       * Both writes happen with no watch socket attached. The global agent
       * watcher must retain the intermediate A value, not merely reconcile B.
       * Leave enough time for awaitWriteFinish to emit each stable mutation.
       */
      await writeFile(join(root, 'src', 'offline.ts'), 'A');
      await new Promise((resolve) => setTimeout(resolve, 600));
      await writeFile(join(root, 'src', 'offline.ts'), 'B');
      await new Promise((resolve) => setTimeout(resolve, 600));

      const reconnected = await connect();
      activeSocket = reconnected.socket;

      await expect
        .poll(
          () =>
            reconnected.frames
              .filter((frame) => frame.path === 'src/offline.ts' && frame.replay)
              .map((frame) => frame.content),
          { timeout: 5_000 },
        )
        .toEqual(['A', 'B']);
      await expect
        .poll(
          () =>
            reconnected.frames.find(
              (frame) => frame.path === 'src/offline.ts' && frame.initial && frame.reconciliation,
            ),
          { timeout: 5_000 },
        )
        .toMatchObject({ content: 'B' });

      const firstReplay = reconnected.frames.filter((frame) => frame.path === 'src/offline.ts' && frame.replay);
      const stableIdentities = firstReplay.map((frame) => ({ eventId: frame.eventId, sequence: frame.sequence }));

      const secondClosed = new Promise<void>((resolve) =>
        reconnected.socket.addEventListener('close', () => resolve(), { once: true }),
      );
      reconnected.socket.close();
      await secondClosed;
      activeSocket = undefined;

      const replayedAgain = await connect();
      activeSocket = replayedAgain.socket;

      await expect
        .poll(() => replayedAgain.frames.filter((frame) => frame.path === 'src/offline.ts' && frame.replay).length, {
          timeout: 5_000,
        })
        .toBe(2);
      expect(
        replayedAgain.frames
          .filter((frame) => frame.path === 'src/offline.ts' && frame.replay)
          .map((frame) => ({ eventId: frame.eventId, sequence: frame.sequence })),
      ).toEqual(stableIdentities);
      expect(
        new Set([...first.frames, ...reconnected.frames, ...replayedAgain.frames].map((frame) => frame.sessionId)),
      ).toEqual(new Set([first.frames.find((frame) => frame.path === '.')?.sessionId]));
    } finally {
      activeSocket?.close();
      await app.close();
    }
  }, 15_000);

  it('marks an initial reconnect snapshot truncated when its configured file bound is reached', async () => {
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'a.ts'), 'a');
    await writeFile(join(root, 'src', 'b.ts'), 'b');

    const app = buildWorkspaceAgentApp({
      workspaceRoot: root,
      tokenSecret,
      workspaceId,
      fileWatchEnabled: true,
      fileWatchUsePolling: true,
      fileWatchInitialMaxFiles: 1,
      fileWatchInitialMaxBytes: 1024,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });

    const address = app.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Workspace agent did not bind to a TCP port');
    }

    const frames: Array<{
      path?: string;
      initial?: boolean;
      snapshot?: { files?: number; bytes?: number; truncated?: boolean };
    }> = [];

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/files/watch?token=${encodeURIComponent(token)}`);
    socket.addEventListener('message', (event) => frames.push(JSON.parse(String(event.data))));

    try {
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('file-watch WebSocket failed to open')), {
          once: true,
        });
      });

      await expect
        .poll(() => frames.find((frame) => frame.path === '.')?.snapshot, { timeout: 5_000 })
        .toMatchObject({ files: 1, bytes: 1, truncated: true });
      expect(frames.filter((frame) => frame.path?.endsWith('.ts') && frame.initial)).toHaveLength(1);
    } finally {
      socket.close();
      await app.close();
    }
  });

  it('bounds the offline journal and signals truncation while reconciling the latest file state', async () => {
    await mkdir(join(root, 'src'), { recursive: true });

    const app = buildWorkspaceAgentApp({
      workspaceRoot: root,
      tokenSecret,
      workspaceId,
      fileWatchEnabled: true,
      fileWatchUsePolling: true,
      fileWatchInitialMaxFiles: 10,
      fileWatchInitialMaxBytes: 1024,
      fileWatchJournalMaxEvents: 1,
      fileWatchJournalMaxBytes: 1024,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });

    const address = app.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Workspace agent did not bind to a TCP port');
    }

    /* No browser has connected: both writes are observed by the agent-global watcher. */
    await writeFile(join(root, 'src', 'journal-a.ts'), 'A');
    await new Promise((resolve) => setTimeout(resolve, 600));
    await writeFile(join(root, 'src', 'journal-b.ts'), 'B');
    await new Promise((resolve) => setTimeout(resolve, 600));

    const frames: Array<{
      path?: string;
      content?: string;
      replay?: boolean;
      initial?: boolean;
      reconciliation?: boolean;
      journal?: {
        truncated?: boolean;
        droppedEvents?: number;
        oldestSequence?: number;
        latestSequence?: number;
        connectionTruncated?: boolean;
      };
    }> = [];

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/files/watch?token=${encodeURIComponent(token)}`);
    socket.addEventListener('message', (event) => frames.push(JSON.parse(String(event.data))));

    try {
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('file-watch WebSocket failed to open')), {
          once: true,
        });
      });

      await expect
        .poll(() => frames.find((frame) => frame.path === '.')?.journal, { timeout: 5_000 })
        .toMatchObject({
          truncated: true,
          droppedEvents: 1,
          oldestSequence: 2,
          latestSequence: 2,
          connectionTruncated: false,
        });
      expect(
        frames.filter((frame) => frame.path === 'src/journal-b.ts' && frame.replay).map((frame) => frame.content),
      ).toEqual(['B']);
      expect(
        frames.find((frame) => frame.path === 'src/journal-b.ts' && frame.initial && frame.reconciliation)?.content,
      ).toBe('B');
    } finally {
      socket.close();
      await app.close();
    }
  }, 15_000);

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
