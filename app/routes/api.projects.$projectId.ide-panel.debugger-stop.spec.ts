import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toResponse } from '~/lib/test/rr7-data';

const apiRequest = vi.fn();
vi.mock('~/lib/enterprise-api.server', async () => ({
  ...(await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server')),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

let state: any;
let outcome: unknown;
let saved: any;
let persistCount: number;
let failPersistAt: number;
beforeEach(() => {
  apiRequest.mockReset();
  saved = undefined;
  persistCount = 0;
  failPersistAt = 0;
  outcome = { killed: true, terminated: true, status: 'stopped', id: 'opaque-process' };
  state = {
    sessions: [
      {
        id: 'session',
        adapter: 'tracked-runtime-command',
        workspaceId: 'workspace-a',
        processId: 'opaque-process',
        status: 'running',
      },
    ],
  };
  apiRequest.mockImplementation(async (_request, path, options) => {
    if (path.endsWith('/dashboard')) {
      return { workspace: { id: 'workspace-b' } };
    }

    if (path.endsWith('/workspaces')) {
      return {
        workspaces: [
          { id: 'workspace-b', createdAt: '2020' },
          { id: 'workspace-a', createdAt: '2021' },
        ],
      };
    }

    if (path.endsWith('/env-vars')) {
      if (options?.method === 'PUT') {
        if (++persistCount === failPersistAt) {
          throw new Error('Synthetic persistence failure');
        }

        saved = JSON.parse(JSON.parse(options.body).value);
        state = structuredClone(saved);

        return {};
      }

      return { envVars: [{ key: 'VIBECORE_DEBUGGER_STATE', value: JSON.stringify(state) }] };
    }

    if (path.endsWith('/kill')) {
      if (outcome instanceof Error) {
        throw outcome;
      }

      return outcome === 'auto'
        ? { killed: true, terminated: true, id: path.split('/').at(-2), status: 'stopped' }
        : outcome;
    }

    if (path.endsWith('/commands')) {
      return { processId: JSON.parse(options.body).operationId, status: 'running', expiresAt: '2026-10-23T18:00:00Z' };
    }

    if (path.includes('/processes/')) {
      return { id: path.split('/').at(-1), status: 'stopped', terminated: true };
    }

    throw new Error('Unexpected synthetic endpoint');
  });
});

async function execute(body: Record<string, string>) {
  const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

  const args = {
    request: new Request('http://local.test/api/projects/project/ide-panel/debugger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: { projectId: 'project', panel: 'debugger' },
  };

  let result;

  try {
    result = await action(args as any);
  } catch (error) {
    result = error;
  }

  return toResponse(result);
}

describe('Debugger BFF — controlled upstream, no commands executed', () => {
  it('persists stopped only after confirmation from the session workspace', async () => {
    const response = await execute({ intent: 'stop-session', sessionId: 'session' });
    expect(response.status).toBe(200);
    expect(saved.sessions[0].status).toBe('stopped');
    expect(apiRequest.mock.calls.find((call) => call[1].endsWith('/kill'))?.[1]).toBe(
      '/api/runtime/workspaces/workspace-a/processes/opaque-process/kill',
    );
  });

  for (const scenario of ['error', 'false', 'missing-pid', 'foreign-workspace', 'legacy-pid', 'wrong-confirmation']) {
    it(`does not persist success for ${scenario}`, async () => {
      if (scenario === 'error') {
        outcome = new Error('Synthetic unavailable');
      }

      if (scenario === 'false') {
        outcome = { killed: false, id: 'opaque-process' };
      }

      if (scenario === 'missing-pid') {
        delete state.sessions[0].processId;
      }

      if (scenario === 'foreign-workspace') {
        state.sessions[0].workspaceId = 'foreign';
      }

      if (scenario === 'legacy-pid') {
        state.sessions[0].adapter = 'runtime-command';
      }

      if (scenario === 'wrong-confirmation') {
        outcome = { killed: true, id: 'someone-else' };
      }

      const response = await execute({ intent: 'stop-session', sessionId: 'session' });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(saved).toBeUndefined();
      expect(state.sessions[0].status).toBe('running');

      if (['missing-pid', 'foreign-workspace', 'legacy-pid'].includes(scenario)) {
        expect(apiRequest.mock.calls.some((call) => call[1].endsWith('/kill'))).toBe(false);
      }
    });
  }
  it('records the opaque launch identity without a detached shell or inspector service', async () => {
    state.launchConfigs = [{ id: 'config', name: 'Synthetic', type: 'node', program: 'fixture.js' }];

    const response = await execute({ intent: 'start-session', configId: 'config', workspaceId: 'workspace-a' });
    expect(response.status).toBe(200);
    expect(saved.sessions[0]).toMatchObject({
      processId: expect.any(String),
      workspaceId: 'workspace-a',
      adapter: 'tracked-runtime-command',
      status: 'running',
    });

    const command = JSON.parse(apiRequest.mock.calls.find((call) => call[1].endsWith('/commands'))![2].body);
    expect(command.background).toBe(true);
    expect(command.args[1]).not.toMatch(/nohup|echo \$!|--inspect|debugpy/);
  });
  it('rejects a foreign launch workspace before executing', async () => {
    const response = await execute({ intent: 'start-session', workspaceId: 'foreign' });
    expect(response.status).toBe(409);
    expect(apiRequest.mock.calls.some((call) => call[1].endsWith('/commands'))).toBe(false);
  });
  it('rejects unimplemented stepping rather than returning ok', async () => {
    const response = await execute({ intent: 'step-over', sessionId: 'session' });
    expect(response.status).toBe(400);
    expect(saved).toBeUndefined();
  });
});

describe('Debugger persistence failures — controlled faults', () => {
  it('does not launch before the identity has been saved', async () => {
    failPersistAt = 1;

    const response = await execute({ intent: 'start-session' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(apiRequest.mock.calls.some((call) => call[1].endsWith('/commands'))).toBe(false);
  });
  it('compensates a failed launch-state save using the previously persisted identity', async () => {
    failPersistAt = 2;
    outcome = 'auto';

    const response = await execute({ intent: 'start-session' });
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe('DEBUG_PERSIST_FAILED_COMPENSATED');
    expect(saved.sessions[0].status).toBe('starting');
    expect(apiRequest.mock.calls.find((call) => call[1].endsWith('/kill'))?.[1]).toContain(saved.sessions[0].processId);
  });
  it('reports reconciliation required when compensation cannot confirm termination', async () => {
    failPersistAt = 2;
    outcome = { killed: false };

    const response = await execute({ intent: 'start-session' });
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe('DEBUG_PERSIST_RECONCILIATION_REQUIRED');
    expect(saved.sessions[0].status).toBe('starting');
  });
  it('can persist the authoritative terminal result after a failed Stop save without stopping again', async () => {
    failPersistAt = 1;

    const stopped = await execute({ intent: 'stop-session', sessionId: 'session' });
    expect(stopped.status).toBe(502);
    expect(state.sessions[0].status).toBe('running');
    failPersistAt = 0;

    const reconciled = await execute({ intent: 'reconcile-session', sessionId: 'session' });
    expect(reconciled.status).toBe(200);
    expect(saved.sessions[0].status).toBe('stopped');
    expect(apiRequest.mock.calls.filter((call) => call[1].endsWith('/kill'))).toHaveLength(1);
  });
});
