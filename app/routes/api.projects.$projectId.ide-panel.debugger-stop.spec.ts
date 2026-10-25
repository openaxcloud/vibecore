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
let persistError: Error | Response;
beforeEach(() => {
  apiRequest.mockReset();
  saved = undefined;
  persistCount = 0;
  failPersistAt = 0;
  persistError = new Error('Synthetic persistence failure');
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
    if (path === '/projects/project') {
      return { project: { id: 'project' } };
    }

    if (path.endsWith('/activity')) {
      return { activity: [] };
    }

    if (path.endsWith('/debugger/v1/opaque-process')) {
      return outcome;
    }

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

    if (path.endsWith('/env-vars') || path.endsWith('/debugger-state/v1')) {
      if (options?.method === 'PUT') {
        if (++persistCount === failPersistAt) {
          throw persistError;
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

    if (path.endsWith('/debugger/v1/start')) {
      return {
        id: JSON.parse(options.body).operationId,
        status: 'paused',
        expiresAt: '2026-10-23T18:00:00Z',
        variables: [{ name: 'private', value: 'must-not-persist' }],
      };
    }

    if (path.endsWith('/control')) {
      if (outcome instanceof Error) {
        throw outcome;
      }

      return { id: 'opaque-process', status: 'paused', variables: [{ name: 'private', value: 'must-not-persist' }] };
    }

    if (path.endsWith('/sessions/v1/start')) {
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
  it('keeps command launches on the tracked process adapter', async () => {
    state.launchConfigs = [{ id: 'config', name: 'Synthetic', type: 'shell', command: 'node fixture.js' }];

    const response = await execute({ intent: 'start-session', configId: 'config', workspaceId: 'workspace-a' });
    expect(response.status).toBe(200);
    expect(saved.sessions[0]).toMatchObject({
      processId: expect.any(String),
      workspaceId: 'workspace-a',
      adapter: 'tracked-runtime-command',
      status: 'running',
    });

    const command = JSON.parse(apiRequest.mock.calls.find((call) => call[1].endsWith('/sessions/v1/start'))![2].body);
    expect(command.background).toBe(true);
    expect(command.args[1]).not.toMatch(/nohup|echo \$!|--inspect|debugpy/);
  });
  it('rejects a foreign launch workspace before executing', async () => {
    const response = await execute({ intent: 'start-session', workspaceId: 'foreign' });
    expect(response.status).toBe(409);
    expect(apiRequest.mock.calls.some((call) => call[1].endsWith('/sessions/v1/start'))).toBe(false);
  });
  it('rejects stepping for a non-debug command session', async () => {
    const response = await execute({ intent: 'step-over', sessionId: 'session' });
    expect(response.status).toBe(409);
    expect(saved).toBeUndefined();
  });
});

describe('Debugger persistence failures — controlled faults', () => {
  it('does not launch before the identity has been saved', async () => {
    failPersistAt = 1;

    const response = await execute({ intent: 'start-session' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(apiRequest.mock.calls.some((call) => call[1].endsWith('/sessions/v1/start'))).toBe(false);
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

describe('Debugger conditional persistence — controlled conflicts', () => {
  it('returns an explicit conflict without acknowledging a saved configuration', async () => {
    failPersistAt = 1;
    persistError = Response.json({ code: 'DEBUG_STATE_CONFLICT' }, { status: 409 });

    const response = await execute({
      intent: 'save-config',
      configId: 'conflict',
      name: 'Synthetic',
      type: 'shell',
      command: 'exit 0',
    });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('DEBUG_STATE_CONFLICT');
    expect(saved).toBeUndefined();
  });
  it('advances the precondition only after its own successful identity write', async () => {
    const original = JSON.stringify(state);
    expect((await execute({ intent: 'start-session' })).status).toBe(200);

    const writes = apiRequest.mock.calls
      .filter((call) => call[1].endsWith('/debugger-state/v1'))
      .map((call) => JSON.parse(call[2].body));
    expect(writes).toHaveLength(2);
    expect(writes[0].expectedValue).toBe(original);
    expect(writes[1].expectedValue).toBe(writes[0].value);
    expect(JSON.parse(writes[0].value).sessions[0].status).toBe('starting');
    expect(JSON.parse(writes[1].value).sessions[0].status).toBe('running');
  });
  it('never launches a process when the initial identity write conflicts', async () => {
    failPersistAt = 1;
    persistError = Response.json({ code: 'DEBUG_STATE_CONFLICT' }, { status: 409 });

    const response = await execute({ intent: 'start-session' });
    expect(response.status).toBe(409);
    expect(apiRequest.mock.calls.some((call) => call[1].endsWith('/sessions/v1/start'))).toBe(false);
  });
  it('compensates a launch whose final write conflicts without retrying a stale blob', async () => {
    failPersistAt = 2;
    persistError = Response.json({ code: 'DEBUG_STATE_CONFLICT' }, { status: 409 });
    outcome = 'auto';

    const response = await execute({ intent: 'start-session' });
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe('DEBUG_PERSIST_FAILED_COMPENSATED');
    expect(saved.sessions[0].status).toBe('starting');
    expect(persistCount).toBe(2);
    expect(apiRequest.mock.calls.filter((call) => call[1].endsWith('/kill'))).toHaveLength(1);
  });
});

describe('Node debugger routing — synthetic upstream', () => {
  it('persists identity before starting a real adapter with breakpoints and watches', async () => {
    state.launchConfigs = [{ id: 'node', type: 'node', program: 'fixture.js', stopOnEntry: true }];
    state.breakpoints = [{ id: 'bp', filePath: 'fixture.js', line: 3 }];
    state.watches = [{ id: 'watch', expression: 'answer' }];
    expect((await execute({ intent: 'start-session', configId: 'node', workspaceId: 'workspace-a' })).status).toBe(200);

    const calls = apiRequest.mock.calls;
    const startIndex = calls.findIndex((call) => call[1].endsWith('/debugger/v1/start'));
    const initialSaveIndex = calls.findIndex((call) => call[1].endsWith('/debugger-state/v1'));
    expect(initialSaveIndex).toBeLessThan(startIndex);
    expect(JSON.parse(calls[startIndex][2].body)).toMatchObject({
      program: 'fixture.js',
      stopOnEntry: true,
      breakpoints: [{ file: 'fixture.js', line: 3 }],
      watches: ['answer'],
    });
    expect(saved.sessions[0]).toMatchObject({ adapter: 'node-inspector', status: 'paused', variables: [] });
    expect(JSON.stringify(saved)).not.toContain('must-not-persist');
  });
  it('routes a single step to the stored workspace and never persists inspected variables', async () => {
    state.sessions[0].adapter = 'node-inspector';
    state.sessions[0].status = 'paused';
    expect((await execute({ intent: 'step-over', sessionId: 'session' })).status).toBe(200);

    const calls = apiRequest.mock.calls.filter((call) => call[1].endsWith('/control'));
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe('/api/runtime/workspaces/workspace-a/debugger/v1/opaque-process/control');
    expect(JSON.parse(calls[0][2].body)).toEqual({ action: 'step-over' });
    expect(JSON.stringify(saved)).not.toContain('must-not-persist');
  });
  it('reports uncertain control without replay or stale save', async () => {
    state.sessions[0].adapter = 'node-inspector';
    outcome = new Error('Synthetic reply lost');

    const response = await execute({ intent: 'step-over', sessionId: 'session' });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: 'DEBUG_CONTROL_RECONCILIATION_REQUIRED',
      session: { persistencePending: true },
    });
    expect(apiRequest.mock.calls.filter((call) => call[1].endsWith('/control'))).toHaveLength(1);
    expect(saved).toBeUndefined();
  });
  it('stops a paused node session with the existing confirmed process termination path', async () => {
    state.sessions[0].adapter = 'node-inspector';
    state.sessions[0].status = 'paused';
    expect((await execute({ intent: 'stop-session', sessionId: 'session' })).status).toBe(200);
    expect(saved.sessions[0].status).toBe('stopped');
  });
  it('rejects unsupported breakpoint conditions before launching', async () => {
    state.launchConfigs = [{ id: 'node', type: 'node', program: 'fixture.js' }];
    state.breakpoints = [{ filePath: 'fixture.js', line: 3, condition: 'answer > 1' }];
    expect((await execute({ intent: 'start-session', configId: 'node' })).status).toBe(400);
    expect(apiRequest.mock.calls.some((call) => call[1].endsWith('/start'))).toBe(false);
    expect(saved).toBeUndefined();
  });
  it('preserves explicit conflict after a confirmed step without replay', async () => {
    state.sessions[0].adapter = 'node-inspector';
    failPersistAt = 1;
    persistError = Response.json({ code: 'DEBUG_STATE_CONFLICT' }, { status: 409 });

    const response = await execute({ intent: 'step-over', sessionId: 'session' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'DEBUG_STATE_CONFLICT',
      session: { status: 'paused', persistencePending: true },
    });
    expect(apiRequest.mock.calls.filter((call) => call[1].endsWith('/control'))).toHaveLength(1);
  });
});

describe('Node uncertain runtime state — synthetic upstream', () => {
  it('loads unknown without reviving the persisted paused status or stale frames', async () => {
    state.sessions[0] = {
      ...state.sessions[0],
      adapter: 'node-inspector',
      status: 'paused',
      callStack: [{ name: 'stale' }],
      variables: [{ name: 'stale' }],
    };
    outcome = {
      id: 'opaque-process',
      status: 'unknown',
      callStack: [{ name: 'stale' }],
      variables: [{ name: 'stale' }],
      watches: [{ expression: 'stale' }],
    };

    const { loader } = await import('./api.projects.$projectId.ide-panel.$panel');

    const response = toResponse(
      await loader({
        request: new Request('http://local.test/api/projects/project/ide-panel/debugger'),
        params: { projectId: 'project', panel: 'debugger' },
      } as any),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.debuggerState.sessions[0]).toMatchObject({
      status: 'unknown',
      callStack: [],
      variables: [],
      watchValues: [],
      persistencePending: true,
    });
    expect(saved).toBeUndefined();
  });
  it('can reconcile unknown Node status without claiming successful control', async () => {
    state.sessions[0].adapter = 'node-inspector';
    state.sessions[0].status = 'paused';
    outcome = { id: 'opaque-process', status: 'unknown' };
    expect((await execute({ intent: 'reconcile-session', sessionId: 'session' })).status).toBe(200);
    expect(saved.sessions[0].status).toBe('unknown');
    expect(apiRequest.mock.calls.some((call) => call[1].endsWith('/control'))).toBe(false);
  });
});
