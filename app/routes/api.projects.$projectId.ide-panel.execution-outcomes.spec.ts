import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toResponse } from '~/lib/test/rr7-data';

const apiRequest = vi.fn();
vi.mock('~/lib/enterprise-api.server', async () => ({
  ...(await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server')),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

// Contract tests with a controlled upstream. No shell command is executed here.
const workflow = {
  id: 42,
  name: 'Fixture',
  enabled: true,
  executionMode: 'sequential',
  tasks: [{ id: 1, orderIndex: 0, taskType: 'shell', command: 'fixture-only' }],
};

let stored: Record<string, any>;
let result: { exitCode: number; output: string } | Error;
let commandIndex: number;
let failureIndex: number;
beforeEach(() => {
  apiRequest.mockReset();
  commandIndex = 0;
  failureIndex = 0;
  result = { exitCode: 0, output: '{}' };
  stored = {
    VIBECORE_WORKFLOWS_STATE: { workflows: [workflow], runs: [] },
    VIBECORE_SECURITY_STATE: {
      settings: {},
      scans: [],
      vulnerabilities: [{ id: 'existing', title: 'Existing finding', severity: 'high' }],
    },
  };
  apiRequest.mockImplementation(async (_request, path, options) => {
    if (path.endsWith('/dashboard')) {
      return { workspace: { id: 'fixture-workspace' } };
    }

    if (path.endsWith('/env-vars')) {
      if (options?.method === 'PUT') {
        const body = JSON.parse(options.body);
        stored[body.key] = JSON.parse(body.value);

        return {};
      }

      return { envVars: Object.entries(stored).map(([key, value]) => ({ key, value: JSON.stringify(value) })) };
    }

    if (path.endsWith('/commands')) {
      const index = commandIndex++;

      if (failureIndex >= 0 && index !== failureIndex) {
        return { exitCode: 0, output: '{}' };
      }

      if (result instanceof Error) {
        throw result;
      }

      return result;
    }

    throw new Error(`Unexpected fixture endpoint: ${path}`);
  });
});

async function execute(panel: string) {
  const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

  const response = toResponse(
    await action({
      request: new Request(`http://local.test/api/projects/fixture/ide-panel/${panel}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: panel === 'terminal' ? 'run-script' : panel === 'workflows' ? 'run-workflow' : 'scan',
          script: 'fixture-only',
          workflowId: '42',
        }),
      }),
      params: { projectId: 'fixture', panel },
    } as any),
  );

  return { status: response.status, body: await response.json() };
}

for (const panel of ['terminal', 'workflows', 'security']) {
  describe(`${panel} execution response`, () => {
    it('returns the successful persisted execution', async () => {
      const { status, body } = await execute(panel);
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect((body.run ?? body.scan).status).toBe(panel === 'security' ? 'completed' : 'succeeded');
    });

    for (const failure of ['exit', 'timeout'] as const) {
      it(`does not report success after ${failure}`, async () => {
        result =
          failure === 'exit'
            ? { exitCode: 7, output: 'fixture execution error' }
            : new Error('fixture upstream timeout');

        const { status, body } = await execute(panel);

        const record =
          panel === 'terminal'
            ? stored.VIBECORE_TERMINAL_STATE.scriptRuns[0]
            : panel === 'workflows'
              ? stored.VIBECORE_WORKFLOWS_STATE.runs[0]
              : stored.VIBECORE_SECURITY_STATE.scans[0];
        expect(record.status).toBe('failed');
        expect(body.ok).toBe(false);
        expect(status).toBe(422);
        expect((body.run ?? body.scan).id).toBe(record.id);

        if (panel === 'terminal') {
          expect(record.output).toBeTruthy();
        }

        if (panel === 'workflows') {
          expect(record.logs.some((entry: any) => entry.level === 'error')).toBe(true);
        }
      });
    }
  });
}

for (const index of [1, 2]) {
  it(`marks the scan failed when enabled subscan ${index} fails and preserves previous findings`, async () => {
    failureIndex = index;
    result = { exitCode: 7, output: 'fixture subscan error' };

    const { status, body } = await execute('security');
    expect(body.ok).toBe(false);
    expect(status).toBe(422);
    expect(stored.VIBECORE_SECURITY_STATE.scans[0].status).toBe('failed');
    expect(stored.VIBECORE_SECURITY_STATE.vulnerabilities.some((item: any) => item.id === 'existing')).toBe(true);
  });
}
