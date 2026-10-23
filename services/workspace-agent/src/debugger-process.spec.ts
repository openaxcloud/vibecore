import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { describe, expect, it, vi } from 'vitest';
import { buildWorkspaceAgentApp, stopTrackedProcess, type ProcessRecord } from './app.js';

const secret = 'synthetic-test-secret';
const workspace = 'synthetic-debugger';
const headers = {
  authorization: `Bearer ${signAgentToken({ workspaceId: workspace, expiresAt: Date.now() + 60_000, secret })}`,
};

describe('tracked debugger process — real isolated agent', () => {
  it('starts a registered child, rejects a foreign workspace token, and confirms termination', async () => {
    const root = await mkdtemp(join(tmpdir(), 'debugger-process-'));
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
      expect(stopped.json()).toEqual({ killed: true, id });
      expect(() => process.kill(child.pid, 0)).toThrow();
      const after = (await app.inject({ method: 'GET', url: '/processes', headers })).json().processes;
      expect(after.find((p: { id: string }) => p.id === id)).toBeUndefined();
      const again = await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      expect(again.json().killed).toBe(false);
    } finally {
      if (id) await app.inject({ method: 'POST', url: `/processes/${id}/kill`, headers });
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports spawn failure and absent process instead of success', async () => {
    const app = buildWorkspaceAgentApp({ workspaceId: workspace, tokenSecret: secret });
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
      expect(stopped.json()).toEqual({ killed: false, id: 'missing', reason: 'PROCESS_NOT_FOUND' });
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
        reason: 'PROCESS_SIGNAL_FAILED',
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
      expect(await pending).toEqual({ killed: false, id: 'fixture', reason: 'PROCESS_STOP_TIMEOUT' });
    } finally {
      signal.mockRestore();
      vi.useRealTimers();
    }
  });
});
