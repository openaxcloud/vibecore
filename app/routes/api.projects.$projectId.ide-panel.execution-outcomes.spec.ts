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
let result: { exitCode?: number; output: string } | Error;
let commandIndex: number;
let failureIndex: number;
beforeEach(() => {
  apiRequest.mockReset();
  commandIndex = 0;
  failureIndex = 0;
  result = { exitCode: 0, output: '{"auditReportVersion":2,"vulnerabilities":{}}' };
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

    if (path.endsWith('/packages')) {
      return { packageManager: 'npm', workspace: { id: 'fixture-workspace' } };
    }

    if (path.endsWith('/commands') || path.endsWith('/packages/install')) {
      const index = commandIndex++;

      if (failureIndex >= 0 && index !== failureIndex) {
        return { exitCode: 0, output: '{"auditReportVersion":2,"vulnerabilities":{}}' };
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
          intent:
            panel === 'terminal'
              ? 'run-script'
              : panel === 'workflows'
                ? 'run-workflow'
                : panel === 'packages'
                  ? 'install-all'
                  : 'scan',
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

    for (const failure of ['exit', 'timeout', 'missing-exit'] as const) {
      it(`does not report success after ${failure}`, async () => {
        result =
          failure === 'exit'
            ? { exitCode: 7, output: 'fixture execution error' }
            : failure === 'missing-exit'
              ? { output: '{"auditReportVersion":2,"vulnerabilities":{}}' }
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

it('accepts npm findings exit 1 only with a valid audit report', async () => {
  result = {
    exitCode: 1,
    output: JSON.stringify({ auditReportVersion: 2, vulnerabilities: { example: { severity: 'high', via: [] } } }),
  };

  const { status, body } = await execute('security');
  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  expect(stored.VIBECORE_SECURITY_STATE.vulnerabilities[0].id).toBe('npm:example');
});

for (const output of ['{}', '', 'registry unavailable', '{"error":{"code":"ENOAUDIT"}}']) {
  it(`rejects an unusable npm audit report: ${output}`, async () => {
    result = { exitCode: 0, output };

    const { status } = await execute('security');
    expect(status).toBe(422);
    expect(stored.VIBECORE_SECURITY_STATE.vulnerabilities.some((item: any) => item.id === 'existing')).toBe(true);
  });
}

it('does not claim package install success without its exit status', async () => {
  result = { output: 'fixture incomplete response' };
  await expect(execute('packages')).rejects.toMatchObject({
    init: { status: 422 },
    data: { code: 'PACKAGE_RUN_FAILED', run: { status: 'failed', exitCode: -1 } },
  });
  expect(stored.VIBECORE_PACKAGES_STATE.runs[0].status).toBe('failed');
  expect(stored.VIBECORE_PACKAGES_STATE.runs[0].exitCode).toBe(-1);
});

it('rejects a scan with no enabled scanner without deleting prior findings', async () => {
  stored.VIBECORE_SECURITY_STATE.settings = { scannerProfile: 'sca', dependencyAuditEnabled: false };

  const { status, body } = await execute('security');
  expect(status).toBe(422);
  expect(body.ok).toBe(false);
  expect(commandIndex).toBe(0);
  expect(stored.VIBECORE_SECURITY_STATE.vulnerabilities[0].id).toBe('existing');
});

it('rejects a package response explicitly marked unsuccessful even with exit zero', async () => {
  result = { exitCode: 0, output: 'fixture unsuccessful', success: false } as typeof result;
  await expect(execute('packages')).rejects.toMatchObject({ init: { status: 422 } });
  expect(stored.VIBECORE_PACKAGES_STATE.runs[0].status).toBe('failed');
});

for (const panel of ['terminal', 'workflows', 'security', 'packages']) {
  it(`rejects null exit status for ${panel}`, async () => {
    result = { exitCode: null, output: '{"auditReportVersion":2,"vulnerabilities":{}}' } as unknown as typeof result;

    if (panel === 'packages') {
      await expect(execute(panel)).rejects.toMatchObject({ init: { status: 422 } });
    } else {
      expect((await execute(panel)).status).toBe(422);
    }
  });
}
