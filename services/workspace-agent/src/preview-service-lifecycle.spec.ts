import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildWorkspaceAgentApp, type ProcessRecord } from './app.js';

const secret = 'preview-lifecycle-isolated-test';
const workspaceId = 'ws-preview-lifecycle-test';
const cleanup: Array<() => Promise<unknown>> = [];

let previousTimeout: string | undefined;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
beforeEach(() => {
  previousTimeout = process.env.WORKSPACE_STREAM_TIMEOUT_MS;
  process.env.WORKSPACE_STREAM_TIMEOUT_MS = '500';
});
afterEach(async () => {
  try {
    for (const close of cleanup.splice(0).reverse()) {
      await close();
    }
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.WORKSPACE_STREAM_TIMEOUT_MS;
    } else {
      process.env.WORKSPACE_STREAM_TIMEOUT_MS = previousTimeout;
    }
  }
});

async function fixture(lifecycle: boolean | string = true, naturalExit = false, ignoreTerm = false) {
  const root = await mkdtemp(join(tmpdir(), 'preview-lifecycle-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));

  const processes = new Map<string, ProcessRecord>();

  const app = buildWorkspaceAgentApp({
    workspaceRoot: root,
    workspaceId,
    tokenSecret: secret,
    processes,
    devServerGraceMs: 1200,
  });
  cleanup.push(() => app.close());
  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address();

  if (!address || typeof address === 'string') {
    throw new Error('missing agent listener');
  }

  const token = signAgentToken({ workspaceId, expiresAt: Date.now() + 60_000, secret });
  const headers = { authorization: `Bearer ${token}` };
  const ws = new WebSocket(`ws://127.0.0.1:${address.port}/commands/stream?token=${encodeURIComponent(token)}`);
  cleanup.push(async () => {
    if (ws.readyState === WebSocket.CLOSED) {
      return;
    }

    const closed = once(ws, 'close');
    ws.terminate();
    await closed;
  });

  const frames: Array<{ type?: string; data?: string }> = [];

  let serverPort: number | undefined;
  ws.on('message', (data) => {
    const frame = JSON.parse(data.toString());
    frames.push(frame);

    const match = frame.type === 'stdout' ? /PORT:(\d+)/.exec(frame.data ?? '') : null;

    if (match) {
      serverPort = Number(match[1]);
    }
  });
  await once(ws, 'open');
  ws.send(
    JSON.stringify({
      type: 'hello',
      payload: {
        command: process.execPath,
        args: [
          '-e',
          `${ignoreTerm ? "process.on('SIGTERM',()=>{});" : ''}const s=require('http').createServer((q,r)=>r.end('pid:'+process.pid));s.listen(0,'127.0.0.1',()=>{console.log('PORT:'+s.address().port);${naturalExit ? 'setTimeout(()=>s.close(),180);' : ''}});`,
        ],
        ...(lifecycle ? { lifecycle: typeof lifecycle === 'string' ? lifecycle : 'preview-service' } : {}),
      },
    }),
  );
  await expect.poll(() => processes.size, { timeout: 2000, interval: 20 }).toBe(1);

  const [id, record] = [...processes.entries()][0];
  cleanup.push(async () => {
    if (app.server.listening) {
      await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
    }

    if (record.process.exitCode === null && record.process.signalCode === null && record.process.pid) {
      try {
        process.kill(-record.process.pid, 'SIGKILL');
      } catch {
        /* already stopped */
      }
    }
  });
  await expect.poll(() => serverPort, { timeout: 2000, interval: 20 }).toBeTypeOf('number');

  const http = async () => {
    try {
      return await (await fetch(`http://127.0.0.1:${serverPort}`, { signal: AbortSignal.timeout(250) })).text();
    } catch {
      return null;
    }
  };

  const status = async () => (await app.inject({ method: 'GET', url: `/processes/${id}`, headers })).json();

  const ports = async () => {
    const response = await app.inject({ method: 'GET', url: '/ports', headers });
    expect(response.statusCode).toBe(200);

    return response;
  };

  return { app, ws, frames, id, pid: record.process.pid, http, status, ports, headers };
}

async function observeFor(milliseconds: number, observe: () => Promise<unknown>) {
  const until = Date.now() + milliseconds;

  while (Date.now() < until) {
    await observe();
    await delay(100);
  }
}
describe.sequential('real preview-service lifecycle', () => {
  it('survives the stream deadline and reattaches through authenticated ports with the same HTTP process', async () => {
    const f = await fixture();
    await observeFor(800, f.ports);
    expect(await f.http()).toBe(`pid:${f.pid}`);

    const closed = once(f.ws, 'close');
    f.ws.close();
    await closed;
    await observeFor(1500, f.ports);
    expect(await f.http()).toBe(`pid:${f.pid}`);
    expect((await f.status()).status).toBe('running');
    await expect.poll(f.http, { timeout: 3000, interval: 100 }).toBeNull();
    expect((await f.status()).status).toBe('timeout');
  }, 10_000);
  it('expires with an open WebSocket when only health probes continue', async () => {
    const f = await fixture();
    await observeFor(700, () => f.app.inject({ method: 'GET', url: '/health' }));
    expect(await f.http()).toBe(`pid:${f.pid}`);
    expect(f.ws.readyState).toBe(WebSocket.OPEN);
    await observeFor(900, () => f.app.inject({ method: 'GET', url: '/health' }));
    expect(await f.http()).toBeNull();
    expect((await f.status()).status).toBe('timeout');
    expect(f.frames.some((frame) => frame.type === 'exit')).toBe(true);
    expect(JSON.stringify(f.frames)).toContain('PREVIEW_SERVICE_IDLE_TIMEOUT');
  }, 5000);
  it('keeps the ordinary command deadline despite authenticated port polling', async () => {
    const f = await fixture(false);
    await observeFor(900, f.ports);
    expect(await f.http()).toBeNull();
    expect((await f.status()).status).toBe('timeout');
    expect(JSON.stringify(f.frames)).toContain('COMMAND_TIMEOUT');
  }, 5000);
  it('explicit stop terminates HTTP and remains stopped despite later port observations', async () => {
    const f = await fixture();
    const response = await f.app.inject({ method: 'POST', url: `/processes/${f.id}/kill`, headers: f.headers });
    expect(response.json()).toMatchObject({ terminated: true, status: 'stopped' });
    await expect.poll(f.http, { timeout: 2000, interval: 50 }).toBeNull();
    await observeFor(1300, f.ports);
    expect((await f.status()).status).toBe('stopped');
    expect(f.frames.filter((frame) => frame.type === 'exit')).toHaveLength(1);
  }, 5000);
  it('does not renew the lease for unauthenticated port observations', async () => {
    const f = await fixture();

    const invalidPorts = async () => {
      const response = await f.app.inject({
        method: 'GET',
        url: '/ports',
        headers: { authorization: 'Bearer invalid' },
      });
      expect(response.statusCode).toBe(401);
    };
    await observeFor(700, invalidPorts);
    expect(await f.http()).toBe(`pid:${f.pid}`);
    await observeFor(900, invalidPorts);
    expect(await f.http()).toBeNull();
    expect((await f.status()).status).toBe('timeout');
  }, 5000);
  it('preserves a natural successful exit after later port observations', async () => {
    const f = await fixture(true, true);
    await expect.poll(f.status, { timeout: 2000, interval: 50 }).toMatchObject({ status: 'exited' });
    await observeFor(1300, f.ports);
    expect((await f.status()).status).toBe('exited');
    expect(await f.http()).toBeNull();
    expect(f.frames.filter((frame) => frame.type === 'exit')).toHaveLength(1);
  }, 5000);
  it('force-stops a preview that ignores SIGTERM without reporting an unconfirmed stop', async () => {
    const f = await fixture(true, false, true);

    // Stop close to idle expiry: the explicit stop must own the terminal result.
    await delay(700);

    const response = await f.app.inject({ method: 'POST', url: `/processes/${f.id}/kill`, headers: f.headers });
    expect(response.json()).toMatchObject({ terminated: true, status: 'stopped' });
    expect(await f.http()).toBeNull();
    await expect
      .poll(() => f.frames.find((frame) => frame.type === 'exit'))
      .toMatchObject({ signal: 'SIGKILL', exitCode: null });
    await f.ports();
    expect((await f.status()).status).toBe('stopped');
  }, 5000);

  it('cannot revive an expired lease or cancel SIGKILL by observing ports during escalation', async () => {
    const f = await fixture(true, false, true);
    await expect
      .poll(() => JSON.stringify(f.frames), { timeout: 2500, interval: 50 })
      .toContain('PREVIEW_SERVICE_IDLE_TIMEOUT');
    expect(await f.http()).toBe(`pid:${f.pid}`);
    await observeFor(5300, f.ports);
    expect(await f.http()).toBeNull();
    expect((await f.status()).status).toBe('timeout');
    await expect
      .poll(() => f.frames.find((frame) => frame.type === 'exit'))
      .toMatchObject({ signal: 'SIGKILL', exitCode: null });
  }, 9000);

  it('keeps an unknown lifecycle bounded as an ordinary command', async () => {
    const f = await fixture('unbounded');
    await observeFor(900, f.ports);
    expect(await f.http()).toBeNull();
    expect((await f.status()).status).toBe('timeout');
    expect(JSON.stringify(f.frames)).toContain('COMMAND_TIMEOUT');
  }, 5000);

  it('agent shutdown stops a marked preview even when SIGTERM is ignored', async () => {
    const f = await fixture(true, false, true);
    await f.app.close();
    expect(await f.http()).toBeNull();
  }, 5000);
});
