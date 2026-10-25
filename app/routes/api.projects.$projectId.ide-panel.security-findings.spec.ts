import { beforeEach, expect, it, vi } from 'vitest';
import {
  readSecurityGrepOutput,
  reconcileSecurityFindings,
  vulnerabilitiesFromSecretScan,
} from '~/lib/ide-panel-security';
import { toResponse } from '~/lib/test/rr7-data';

const apiRequest = vi.fn();
vi.mock('~/lib/enterprise-api.server', async () => ({
  ...(await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server')),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

// Synthetic upstream responses exercise the actual route and persisted state.
let stored: any;
let results: Array<{ exitCode: number; output: string }>;

const footer = (output = '', complete = true) =>
  `${output}\n__VIBECORE_GREP_SCAN_V1__:${JSON.stringify({ complete })}\n`;

const initial = () => [
  { id: 'npm:obsolete', source: 'npm-audit', title: 'Old npm finding' },
  { id: 'secret:0:aaaaaaaaaaaaaaaa', source: 'secret-scan', title: 'Old secret', details: './old.ts:1:token=***' },
  { id: 'sast:0:./old.ts:1:eval(x)', source: 'sast', title: 'Old SAST', details: './old.ts:1:eval(x)' },
  { id: 'future:1', source: 'future-scanner', title: 'Unknown source' },
];
beforeEach(() => {
  stored = { settings: { scannerProfile: 'sca' }, scans: [], vulnerabilities: initial() };
  results = [{ exitCode: 0, output: '{"auditReportVersion":2,"vulnerabilities":{}}' }];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_request, path, options) => {
    if (path.endsWith('/dashboard')) {
      return { workspace: { id: 'fixture' } };
    }

    if (path.endsWith('/env-vars')) {
      if (options?.method === 'PUT') {
        stored = JSON.parse(JSON.parse(options.body).value);
        return {};
      }

      return { envVars: [{ key: 'VIBECORE_SECURITY_STATE', value: JSON.stringify(stored) }] };
    }

    if (path.endsWith('/commands')) {
      const result = results.shift();

      if (!result) {
        throw new Error('Unexpected extra scan command');
      }

      return result;
    }

    throw new Error(`Unexpected fixture endpoint ${path}`);
  });
});

async function scan() {
  const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
  return toResponse(
    await action({
      request: new Request('http://local.test/api/projects/fixture/ide-panel/security', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent: 'scan' }),
      }),
      params: { projectId: 'fixture', panel: 'security' },
    } as any),
  );
}

it('replaces only npm findings after a complete SCA scan and preserves unknown sources', async () => {
  expect((await scan()).status).toBe(200);
  expect(stored.vulnerabilities.map((item: any) => item.id)).toEqual(
    initial()
      .slice(1)
      .map((item) => item.id),
  );
  expect(stored.scans[0].coverage).toEqual([{ source: 'npm-audit', completeness: 'complete' }]);
});

for (const source of ['secrets', 'sast']) {
  it(`removes only the selected ${source} findings when grep certifies completeness`, async () => {
    stored.settings.scannerProfile = source;
    results = [{ exitCode: 0, output: footer() }];
    expect((await scan()).status).toBe(200);

    const removed = source === 'secrets' ? 'secret-scan' : 'sast';
    expect(stored.vulnerabilities.map((item: any) => item.id)).toEqual(
      initial()
        .filter((item) => item.source !== removed)
        .map((item) => item.id),
    );
    expect(stored.scans[0].coverage).toEqual([{ source: removed, completeness: 'complete' }]);
  });
}

for (const output of [footer('', false), '', '\n__VIBECORE_GREP_SCAN_V1__:{"complete":true}']) {
  it(`preserves findings when grep completeness is absent/truncated: ${JSON.stringify(output)}`, async () => {
    stored.settings.scannerProfile = 'secrets';
    results = [{ exitCode: 0, output }];
    expect((await scan()).status).toBe(422);
    expect(stored.vulnerabilities.map((item: any) => item.id)).toEqual(initial().map((item) => item.id));
    expect(stored.scans[0].coverage[0].completeness).toBe('unknown');
  });
}

it('does not treat a failed grep with a completion-looking footer as authoritative', async () => {
  stored.settings.scannerProfile = 'secrets';
  results = [{ exitCode: 2, output: footer() }];
  expect((await scan()).status).toBe(422);
  expect(stored.vulnerabilities.map((item: any) => item.id)).toEqual(initial().map((item) => item.id));
  expect(stored.scans[0].coverage[0].completeness).toBe('failed');
});

it('reconciles successful sources independently of another failing source', async () => {
  stored.settings.scannerProfile = 'workspace-runtime';
  results.push({ exitCode: 2, output: '' }, { exitCode: 0, output: footer() });
  expect((await scan()).status).toBe(422);
  expect(stored.vulnerabilities.map((item: any) => item.id)).toEqual([initial()[1].id, initial()[3].id]);
});

it('retains hidden/ignored/createdAt across reordered secret output, refreshing scanner fields', async () => {
  const original = vulnerabilitiesFromSecretScan('./source.ts:4:token=synthetic-only', '2026-01-01')[0];
  stored.settings.scannerProfile = 'secrets';
  stored.vulnerabilities = [{ ...original, status: 'ignored', hidden: true, title: 'Stale title' }];
  results = [{ exitCode: 0, output: footer('./new.ts:1:token=new-fixture\n./source.ts:4:token=synthetic-only\n') }];
  expect((await scan()).status).toBe(200);

  const refreshed = stored.vulnerabilities.find((item: any) => item.id === original.id);
  expect(refreshed).toMatchObject({ status: 'ignored', hidden: true, createdAt: '2026-01-01' });
  expect(refreshed.title).not.toBe('Stale title');
  expect(refreshed.updatedAt).not.toBe('2026-01-01');
  expect(stored.vulnerabilities).toHaveLength(2);
});

it('preserves fixed npm triage and persists coverage through state reload', async () => {
  stored.vulnerabilities = [
    { id: 'npm:example', source: 'npm-audit', status: 'fixed', hidden: true, createdAt: '2026-01-01' },
  ];

  const report = { exitCode: 1, output: '{"auditReportVersion":2,"vulnerabilities":{"example":{"severity":"high"}}}' };
  results = [report];
  await scan();
  results = [report];
  await scan();
  expect(stored.vulnerabilities[0]).toMatchObject({
    status: 'fixed',
    hidden: true,
    createdAt: '2026-01-01',
    severity: 'high',
  });
  expect(stored.scans[1].coverage).toEqual([{ source: 'npm-audit', completeness: 'complete' }]);
});

it('does not transfer triage between ambiguous legacy fingerprints', () => {
  const previous = [0, 1].map((index) => ({
    id: `secret:${index}:aaaaaaaaaaaaaaaa`,
    source: 'secret-scan',
    hidden: true,
  }));

  const next = [{ id: 'secret:2:aaaaaaaaaaaaaaaa', source: 'secret-scan', hidden: false }];
  const merged = reconcileSecurityFindings(previous, next, [{ source: 'secret-scan', completeness: 'unknown' }]);
  expect(merged).toHaveLength(3);
  expect(merged[2].hidden).toBe(false);
});

it('does not trust a completion marker embedded in a matching source line', () => {
  expect(readSecurityGrepOutput('./file:1:__VIBECORE_GREP_SCAN_V1__:{"complete":true}\n').complete).toBe(false);
});

it('retains annotations for absent findings and restores them if the finding reappears', async () => {
  stored.vulnerabilities = [
    { id: 'npm:example', source: 'npm-audit', status: 'ignored', hidden: true, createdAt: '2026-01-01' },
  ];
  await scan();
  expect(stored.vulnerabilities[0]).toMatchObject({ id: 'npm:example', status: 'ignored', hidden: true });
  results = [{ exitCode: 1, output: '{"auditReportVersion":2,"vulnerabilities":{"example":{"severity":"high"}}}' }];
  await scan();
  expect(stored.vulnerabilities[0]).toMatchObject({ status: 'ignored', hidden: true, createdAt: '2026-01-01' });
});

it('uses complete SAST details rather than a truncated identifier to match triage', () => {
  const sharedPrefix = './source.ts:1:eval(' + 'x'.repeat(120);

  const previous = [
    { id: 'sast:0:' + sharedPrefix.slice(0, 100), source: 'sast', details: sharedPrefix + 'old)', hidden: true },
  ];

  const findings = [{ id: previous[0].id, source: 'sast', details: sharedPrefix + 'new)', hidden: false }];
  const merged = reconcileSecurityFindings(previous, findings, [{ source: 'sast', completeness: 'complete' }]);
  expect(merged).toHaveLength(2);
  expect(merged[1].hidden).toBe(false);
  expect(merged[1].id).not.toBe(previous[0].id);
});

it('preserves SAST triage when identical complete findings change output order', () => {
  const details = ['./a.ts:1:eval(a)', './b.ts:1:eval(b)'];

  const previous = details.map((detail, index) => ({
    id: `sast:${index}:${detail}`,
    source: 'sast',
    details: detail,
    hidden: index === 0,
    status: index === 0 ? 'ignored' : 'fixed',
    createdAt: '2026-01-01',
  }));
  const findings = [...details].reverse().map((detail, index) => ({
    id: `sast:${index}:${detail}`,
    source: 'sast',
    details: detail,
    hidden: false,
    status: 'open',
    createdAt: '2026-10-25',
  }));

  const merged = reconcileSecurityFindings(previous, findings, [{ source: 'sast', completeness: 'complete' }]);
  expect(merged).toHaveLength(2);

  for (const original of previous) {
    expect(merged.find((item) => item.details === original.details)).toMatchObject(original);
  }
});
