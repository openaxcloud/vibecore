import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationOrNullMock = vi.hoisted(() => vi.fn());

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNullMock(...args),
  };
});

import { action, consentFromForm, loader } from './import.preview.$importJobId';

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

afterEach(() => {
  apiRequestMock.mockReset();
  firstOrganizationOrNullMock.mockReset();
});

describe('durable archive import preview route', () => {
  it('loads only the staged manifest and redacted findings for explicit consent', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1', slug: 'acme' });
    apiRequestMock.mockResolvedValue({
      import: {
        id: 'job-1',
        state: 'AWAITING_USER_ACTION',
        provider: 'bolt',
        sourceRef: 'portable.zip',
        stagedFileCount: 1,
        stagedFiles: [{ path: '.env', sizeBytes: 28 }],
        findings: [{ path: '.env', line: 1, kind: 'env-secret', preview: 'TOKEN=[REDACTED]' }],
      },
    });

    const request = new Request('https://e-code.ai/import/preview/job-1', {
      headers: { 'accept-language': 'fr-FR' },
    });

    const result = await loader({ request, params: { importJobId: 'job-1' } } as never);
    const data = readData<{ preview: { stagedFiles: unknown[]; findings: Array<{ preview: string }> } }>(result);

    expect(apiRequestMock).toHaveBeenCalledWith(request, '/orgs/org-1/imports/job-1');
    expect(data.preview.stagedFiles).toEqual([{ path: '.env', sizeBytes: 28 }]);
    expect(data.preview.findings[0]?.preview).toBe('TOKEN=[REDACTED]');
    expect(JSON.stringify(data)).not.toContain('raw-secret-value');
  });

  it('forwards every keep/redact decision to commit and redirects only after success', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1', slug: 'acme' });
    apiRequestMock.mockResolvedValue({ project: { id: 'project-1', slug: 'portable' } });

    const request = new Request('https://e-code.ai/import/preview/job-1', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        intent: 'commit',
        'consent:.env:1': 'redact',
        'consent:config.ts:2': 'keep',
      }),
    });

    const result = (await action({ request, params: { importJobId: 'job-1' } } as never)) as Response;
    const [, path, init] = apiRequestMock.mock.calls[0] as [Request, string, RequestInit];

    expect(path).toBe('/orgs/org-1/imports/job-1/commit');
    expect(JSON.parse(String(init.body))).toEqual({
      consent: { '.env:1': 'redact', 'config.ts:2': 'keep' },
    });
    expect(result.status).toBe(302);
    expect(result.headers.get('Location')).toBe('/@acme/portable');
  });

  it('does not claim cancellation when the durable API rejects it', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1', slug: 'acme' });
    apiRequestMock.mockRejectedValue(new Response(null, { status: 409 }));

    const request = new Request('https://e-code.ai/import/preview/job-1', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ intent: 'cancel' }),
    });

    const result = await action({ request, params: { importJobId: 'job-1' } } as never);

    expect(readData(result)).toEqual({ errorCode: 'cancelFailed' });
    expect(consentFromForm({ 'consent:a:1': 'redact', ignored: 'keep' })).toEqual({ 'a:1': 'redact' });
  });
});
