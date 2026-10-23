import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspaceAgentApp, stopTrackedProcess, type ProcessRecord } from './app.js';

const secret = 'synthetic-test-secret';
const workspace = 'synthetic-debugger';
// Never inherit /workspace from the developer machine: hosted CI need not have
// that directory. Every real child gets its own existing, isolated cwd.
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'debugger-process-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const headers = {
  authorization: `Bearer ${signAgentToken({ workspaceId: workspace, expiresAt: Date.now() + 60_000, secret })}`,
};

describe('tracked debugger process — real isolated agent', () => {
  it('starts a registered child, rejects a foreign workspace token, and confirms termination', async () => {
    const app = buildWorkspaceAgentApp({
      workspaceRoot: root,
      workspaceId: workspace,
      tokenSecret: secret,
      commandTimeoutMs: 15_000,
    });
    let id: string | undefined;
    try {
      const start = await app.inject({
        method: 'POST',
        url: '/commands/run',
        headers,
        payload: { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], background: true },
      });
      expect(start.statusCode).toBe(200);
      expect(start.json().status).toBe('running');
      id = start.json().id;
      const list = (await app.inject({ method: 'GET', url: '/processes', headers })).json().processes;
      const child = list.find((p: { id: string }) => p.id === id);
      expect(child).toBeDefined();
      expect(String(child.pid)).not.toBe(id);
      const rawPid = await app.inject({ method: 'POST', url: `/processes/${child.pid}/kill`, headers });
      expect(rawPid.json().killed).toBe(false);
      expect(() => process.kill(child.pid, 0)).not.toThrow();
      const other = signAgentToken({ workspaceId: 'other-workspace', expiresAt: Date.now() + 60_000, secret });
      const denied = await app.inject({
        method: 'POST',
        url: `/processes/${id}/kill`,
        headers: { authorization: `Bearer ${other}` },
      });
      expect(denied.statusCode).toBe(401);
      expect(() => process.kill(child.pid, 0)).not.toThrow();
      const stopped = await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      expect(stopped.json()).toMatchObject({ killed: true, terminated: true, status: 'stopped', id });
      expect(() => process.kill(child.pid, 0)).toThrow();
      const after = (await app.inject({ method: 'GET', url: '/processes', headers })).json().processes;
      expect(after.find((p: { id: string }) => p.id === id)).toBeUndefined();
      const again = await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      expect(again.json()).toEqual(stopped.json());
    } finally {
      if (id) await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      await app.close();
    }
  });

  it('reports spawn failure and absent process instead of success', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId: workspace, tokenSecret: secret });
    try {
      const start = await app.inject({
        method: 'POST',
        url: '/commands/run',
        headers,
        payload: { command: '/nonexistent/synthetic-debugger-command', background: true },
      });
      expect(start.json().status).not.toBe('running');
      expect(start.json().code).toBe(1);
      const stopped = await app.inject({ method: 'POST', url: '/processes/missing/kill', headers });
      expect(stopped.json()).toEqual({ killed: false, id: 'missing', code: 'PROCESS_NOT_FOUND' });
    } finally {
      await app.close();
    }
  });
});

describe('stop failure — controlled child', () => {
  it('preserves failure if signaling throws', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 123456, exitCode: null, signalCode: null });
    const signal = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('synthetic EPERM');
    });
    try {
      expect(await stopTrackedProcess({ process: child } as unknown as ProcessRecord, 'fixture')).toEqual({
        killed: false,
        id: 'fixture',
        code: 'PROCESS_SIGNAL_FAILED',
      });
    } finally {
      signal.mockRestore();
    }
  });

  it('does not equate a sent signal with termination', async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), { pid: 123456, exitCode: null, signalCode: null });
    const signal = vi.spyOn(process, 'kill').mockReturnValue(true);
    try {
      const pending = stopTrackedProcess({ process: child } as unknown as ProcessRecord, 'fixture');
      await vi.advanceTimersByTimeAsync(5000);
      expect(await pending).toEqual({ killed: false, id: 'fixture', code: 'PROCESS_STOP_TIMEOUT' });
    } finally {
      signal.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('session lifecycle and shared kill — real children', () => {
  it('uses the existing interactive policy, and makes repeated launches/stops idempotent', async () => {
    const { randomUUID } = await import('node:crypto');
    const id = randomUUID();
    const app = buildWorkspaceAgentApp({
      workspaceRoot: root,
      workspaceId: workspace,
      tokenSecret: secret,
      commandTimeoutMs: 20,
    });
    try {
      const payload = {
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        background: true,
        operationId: id,
      };
      const [one, two] = await Promise.all([
        app.inject({ method: 'POST', url: '/commands/run', headers, payload }),
        app.inject({ method: 'POST', url: '/commands/run', headers, payload }),
      ]);
      expect(one.json()).toEqual(two.json());
      expect(Date.parse(one.json().expiresAt) - Date.now()).toBeGreaterThan(1_790_000);
      expect((await app.inject({ method: 'GET', url: '/processes', headers })).json().processes).toHaveLength(1);
      const [stopOne, stopTwo] = await Promise.all([
        app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers }),
        app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers }),
      ]);
      expect(stopOne.json()).toEqual(stopTwo.json());
      expect(stopOne.json()).toMatchObject({ terminated: true, status: 'stopped' });
    } finally {
      await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      await app.close();
    }
  });

  it('observes natural exit during Stop without relabelling it stopped', async () => {
    const processes = new Map<string, ProcessRecord>();
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId: workspace, tokenSecret: secret, processes });
    let id: string | undefined;
    try {
      const script = `require('node:child_process').spawn(process.execPath,['-e','setTimeout(() => {}, 800)'],{stdio:['ignore',1,2]}); process.exit(0)`;
      const start = await app.inject({
        method: 'POST',
        url: '/commands/run',
        headers,
        payload: { command: process.execPath, args: ['-e', script], background: true },
      });
      id = start.json().id;
      const child = processes.get(id!)!.process;
      await expect.poll(() => child.exitCode).toBe(0);
      const stop = await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      expect(stop.json()).toMatchObject({ terminated: true, killed: false, status: 'exited', exitCode: 0 });
    } finally {
      if (id) await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      await app.close();
    }
  });

  it('keeps a signal-ignoring child registered after the real 5s stop bound', async () => {
    const processes = new Map<string, ProcessRecord>();
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId: workspace, tokenSecret: secret, processes });
    let child: ProcessRecord['process'] | undefined;
    try {
      const start = await app.inject({
        method: 'POST',
        url: '/commands/run',
        headers,
        payload: {
          command: process.execPath,
          args: ['-e', "process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)"],
          background: true,
        },
      });
      const id = start.json().id;
      child = processes.get(id)!.process;
      await expect.poll(() => processes.get(id)?.output).toContain('ready');
      const before = Date.now();
      const stop = await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      expect(Date.now() - before).toBeGreaterThanOrEqual(4_900);
      expect(stop.json()).toEqual({ killed: false, id, code: 'PROCESS_STOP_TIMEOUT' });
      expect(processes.has(id)).toBe(true);
      expect(child.exitCode).toBeNull();
    } finally {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        const { once } = await import('node:events');
        const closed = once(child, 'close');
        process.kill(-child.pid, 'SIGKILL');
        await closed;
      }
      await app.close();
    }
  }, 10_000);

  it('keeps synchronous commands bounded and permits confirmed Stop while they await exit', async () => {
    const processes = new Map<string, ProcessRecord>();
    const app = buildWorkspaceAgentApp({
      workspaceRoot: root,
      workspaceId: workspace,
      tokenSecret: secret,
      processes,
      commandTimeoutMs: 1_000,
    });
    try {
      const command = app
        .inject({
          method: 'POST',
          url: '/commands/run',
          headers,
          payload: { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
        })
        .then((response) => response.json());
      await expect.poll(() => processes.size).toBe(1);
      const id = [...processes.keys()][0];
      const stopped = await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      expect(stopped.json()).toMatchObject({ terminated: true, status: 'stopped' });
      expect(await command).toMatchObject({ code: null, signal: 'SIGTERM' });
    } finally {
      await app.close();
    }
  });
});

describe('interactive bound and streamed stop regressions', () => {
  it('applies the configured interactive deadline and keeps synchronous timeout separate', async () => {
    const original = process.env.WORKSPACE_STREAM_TIMEOUT_MS;
    process.env.WORKSPACE_STREAM_TIMEOUT_MS = '200';
    const app = buildWorkspaceAgentApp({
      workspaceRoot: root,
      workspaceId: workspace,
      tokenSecret: secret,
      commandTimeoutMs: 80,
    });
    try {
      const start = await app.inject({
        method: 'POST',
        url: '/commands/run',
        headers,
        payload: { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], background: true },
      });
      const id = start.json().id;
      await expect
        .poll(async () => (await app.inject({ method: 'GET', url: `/processes/${id}`, headers })).json().status)
        .toBe('timeout');
      const sync = await app.inject({
        method: 'POST',
        url: '/commands/run',
        headers,
        payload: { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
      });
      expect(sync.json()).toMatchObject({ code: null, signal: 'SIGTERM' });
      const terminal = await app.inject({ method: 'GET', url: `/processes/${sync.json().id}`, headers });
      expect(terminal.json().status).toBe('timeout');
    } finally {
      await app.close();
      if (original === undefined) delete process.env.WORKSPACE_STREAM_TIMEOUT_MS;
      else process.env.WORKSPACE_STREAM_TIMEOUT_MS = original;
    }
  });

  it('confirms HTTP Stop for a real streamed command and preserves the exit event', async () => {
    const { default: WebSocket } = await import('ws');
    const { once } = await import('node:events');
    const processes = new Map<string, ProcessRecord>();
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId: workspace, tokenSecret: secret, processes });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const token = signAgentToken({ workspaceId: workspace, expiresAt: Date.now() + 60_000, secret });
    const socket = new WebSocket(
      `ws://127.0.0.1:${(app.server.address() as any).port}/commands/stream?token=${encodeURIComponent(token)}`,
    );
    const frames: any[] = [];
    let id: string | undefined;
    try {
      socket.on('message', (message) => frames.push(JSON.parse(message.toString())));
      await once(socket, 'open');
      socket.send(
        JSON.stringify({
          type: 'hello',
          payload: { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
        }),
      );
      await expect.poll(() => processes.size).toBe(1);
      id = [...processes.keys()][0];
      const stopped = await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      expect(stopped.json()).toMatchObject({ terminated: true, status: 'stopped' });
      await expect
        .poll(() => frames.find((frame) => frame.type === 'exit'))
        .toMatchObject({ exitCode: null, signal: 'SIGTERM' });
      expect(processes.size).toBe(0);
    } finally {
      if (id) await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      const closed = once(socket, 'close');
      socket.close();
      await closed;
      await app.close();
    }
  });
});

describe('authenticated versioned session protocol', () => {
  it('does not expose session capabilities without an agent token', async () => {
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId: workspace, tokenSecret: secret });
    try {
      expect((await app.inject({ method: 'GET', url: '/sessions/capabilities' })).statusCode).toBe(401);
      const authorized = await app.inject({ method: 'GET', url: '/sessions/capabilities', headers });
      expect(authorized.statusCode).toBe(200);
      expect(authorized.json()).toEqual({ trackedSessions: 1 });
    } finally {
      await app.close();
    }
  });
  it('rejects a missing operation identity on the versioned launch without spawning', async () => {
    const processes = new Map<string, ProcessRecord>();
    const app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId: workspace, tokenSecret: secret, processes });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions/v1/start',
        headers,
        payload: { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], background: true },
      });
      expect(response.statusCode).toBe(400);
      expect(processes.size).toBe(0);
    } finally {
      await app.close();
    }
  });
});
