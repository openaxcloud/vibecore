import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { packageDiagnosticCommand, packageDiagnosticSucceeded } from '~/lib/ide/package-diagnostics';
import { toResponse } from '~/lib/test/rr7-data';

const apiRequest = vi.fn();
vi.mock('~/lib/enterprise-api.server', async () => ({
  ...(await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server')),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

let result: { exitCode?: number; output: string };
let stored: any;
let manager: 'npm' | 'pnpm' | 'yarn' | 'bun';
beforeEach(() => {
  manager = 'npm';
  stored = undefined;
  result = { exitCode: 0, output: '{}' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_request, path, options) => {
    if (path.endsWith('/packages')) {
      return { packageManager: manager, workspace: { id: 'fixture' } };
    }

    if (path.endsWith('/env-vars')) {
      if (options?.method === 'PUT') {
        stored = JSON.parse(JSON.parse(options.body).value);
      }

      return { envVars: [] };
    }

    if (path.endsWith('/commands') || path.endsWith('/packages/install')) {
      return result;
    }

    throw new Error(`Unexpected fixture endpoint: ${path}`);
  });
});

// Real route with controlled upstream responses; no package registry contacted.
async function execute(intent: string) {
  const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
  return toResponse(
    await action({
      request: new Request('http://local.test/api/projects/fixture/ide-panel/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent }),
      }),
      params: { projectId: 'fixture', panel: 'packages' },
    } as any),
  );
}

for (const [intent, report] of [
  ['audit', { auditReportVersion: 2, vulnerabilities: { fixture: { severity: 'high' } } }],
  ['outdated', { fixture: { wanted: '1.0.0', latest: '2.0.0' } }],
  [
    'outdated',
    {
      fixture: [
        { wanted: '1.0.0', latest: '2.0.0' },
        { current: '0.9.0', wanted: '1.0.0', latest: '2.0.0' },
      ],
    },
  ],
] as const) {
  it(`keeps npm ${intent} findings exit 1 while reporting successful diagnostics: ${JSON.stringify(report)}`, async () => {
    result = { exitCode: 1, output: JSON.stringify(report) };
    expect((await execute(intent)).status).toBe(200);
    expect(stored.runs[0]).toMatchObject({ exitCode: 1, status: 'succeeded' });
  });
}

for (const intent of ['audit', 'outdated']) {
  for (const response of [
    { exitCode: 1, output: '{}' },
    { exitCode: 1, output: '{"error":{"code":"E404"}}' },
    { exitCode: 0, output: 'registry unavailable' },
    { exitCode: 1, output: '{"fixture":' },
    { exitCode: 127, output: '{}' },
    { output: '{}' },
  ]) {
    it(`persists and rejects ${intent} failure ${JSON.stringify(response)}`, async () => {
      result = response;
      await expect(execute(intent)).rejects.toMatchObject({ init: { status: 422 } });
      expect(stored.runs[0].status).toBe('failed');
    });
  }
}

it('does not reinterpret install failure as findings', async () => {
  result = { exitCode: 1, output: '{"auditReportVersion":2,"vulnerabilities":{}}' };
  await expect(execute('install-all')).rejects.toMatchObject({ init: { status: 422 } });
  expect(stored.runs[0]).toMatchObject({ exitCode: 1, status: 'failed' });
});

it('accepts empty npm outdated results with exit zero', async () => {
  expect((await execute('outdated')).status).toBe(200);
});

for (const candidate of ['npm', 'pnpm', 'yarn', 'bun'] as const) {
  for (const intent of ['audit', 'outdated'] as const) {
    it(`${candidate} ${intent} does not hide process failures`, () => {
      expect(packageDiagnosticCommand(candidate, intent)).not.toContain('|| true');
      expect(packageDiagnosticSucceeded(candidate, intent, { exitCode: 127, output: '{}' })).toBe(false);
    });
  }
}

for (const candidate of ['pnpm', 'yarn', 'bun'] as const) {
  it(`preserves unknown ${candidate} finding/error codes until its report contract is validated`, async () => {
    manager = candidate;
    result = { exitCode: 1, output: 'unclassified report' };
    await expect(execute('audit')).rejects.toMatchObject({ init: { status: 422 } });
    expect(stored.runs[0]).toMatchObject({ exitCode: 1, status: 'failed' });
  });
}

// Real shell dispatch with a synthetic executable, not a real Yarn audit.
for (const [version, expected] of [
  ['1.22.22', 'audit --json'],
  ['4.5.0', 'npm audit --json'],
]) {
  it(`selects Yarn ${version} before audit and never retries after exit 1`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'package-dispatch-'));

    try {
      writeFileSync(
        join(directory, 'yarn'),
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo ${version}; exit 0; fi
printf '%s\\n' "$*" >> "$DIAGNOSTIC_CALLS"
exit 1
`,
        { mode: 0o700 },
      );

      const calls = join(directory, 'calls');

      const execution = spawnSync('sh', ['-c', packageDiagnosticCommand('yarn', 'audit')], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, DIAGNOSTIC_CALLS: calls },
      });
      expect(execution.status).toBe(1);
      expect(readFileSync(calls, 'utf8').trim().split('\n')).toEqual([expected]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
