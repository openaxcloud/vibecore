import { signAgentToken } from '@vibecore/workspace-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildWorkspaceAgentApp } from './app.js';

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

  it('detects preview ports from running command output', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, tokenSecret, workspaceId, commandTimeoutMs: 2_000 });
    const headers = { authorization: `Bearer ${token}` };
    const runningCommand = app.inject({
      method: 'POST',
      url: '/commands/run',
      headers,
      payload: {
        command: process.execPath,
        args: ['-e', 'console.log("Local: http://localhost:4173"); setTimeout(() => {}, 1500)'],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 250));

    const response = await app.inject({ method: 'GET', url: '/ports', headers });
    expect(response.json()).toEqual({ ports: [expect.objectContaining({ port: 4173 })] });

    await runningCommand;
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
