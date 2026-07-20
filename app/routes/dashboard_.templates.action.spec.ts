import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/dashboard/SaaSLayout', () => ({ AppShell: () => null, LinkButton: () => null }));
vi.mock('~/components/dashboard/TemplateGallery', () => ({ TemplateGallery: () => null }));
vi.mock('~/components/dashboard/ImportHub', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/components/dashboard/ImportHub')>();
  return { ...actual, ImportHub: () => null };
});

const apiRequest = vi.fn();
const firstOrganization = vi.fn();
const firstOrganizationOrNull = vi.fn();

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganization: (...args: unknown[]) => firstOrganization(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNull(...args),
  };
});

import { action, loader } from './dashboard_.templates';
import { json as jsonData } from '~/lib/json-response';

const apiApp = {
  id: 'demo:react-saas',
  slug: 'orbit-crm',
  name: 'Orbit CRM',
  description: 'A working CRM.',
  author: { handle: 'ecode', displayName: 'E-Code Studio' },
  artifactType: 'BUSINESS_APP',
  category: 'sales',
  technologies: ['React', 'TypeScript'],
  thumbnailUrl: '/gallery-apps/react-saas/thumbnail.png',
  previewUrl: '/gallery-apps/react-saas/preview/',
  moderationStatus: 'APPROVED',
  allowRemix: true,
  featured: true,
  remixCount: 42,
  reportCount: 0,
  publishedAt: '2026-07-10T09:00:00.000Z',
};

const apiFacets = {
  artifactTypes: ['BUSINESS_APP', 'GAME'],
  categories: ['sales', 'entertainment'],
  technologies: ['React', 'TypeScript', 'Canvas'],
};

function makeRequest(fields: Record<string, string | File>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request('https://app.example/dashboard/templates', { method: 'POST', body: form });
}

function apiError(status: number, message: string) {
  return jsonData({ error: message }, { status });
}

describe('Community Gallery route', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    firstOrganization.mockReset();
    firstOrganizationOrNull.mockReset();
    firstOrganization.mockResolvedValue({ id: 'org_1', slug: 'acme' });
  });

  it('loads only the browser-safe published application projection', async () => {
    firstOrganizationOrNull.mockResolvedValue({ id: 'org_1', slug: 'acme' });
    apiRequest.mockResolvedValue({ apps: [apiApp], facets: apiFacets });

    const result = (await loader({ request: new Request('https://app.example/dashboard/templates') } as never)) as {
      apps: Array<Record<string, unknown>>;
    };

    expect(apiRequest).toHaveBeenCalledWith(expect.any(Request), '/gallery/apps?limit=24&sort=FEATURED');
    expect(result.apps).toHaveLength(1);
    expect(result.apps[0]).toMatchObject({ name: 'Orbit CRM', remixAllowed: true, moderationStatus: 'approved' });
    expect(result.apps[0]).not.toHaveProperty('files');
    expect((result as { facets: unknown }).facets).toEqual({
      artifactTypes: ['business app', 'game'],
      categories: ['sales', 'entertainment'],
      technologies: ['React', 'TypeScript', 'Canvas'],
    });
  });

  it('forwards discovery filters and cursor pagination to the Gallery API', async () => {
    firstOrganizationOrNull.mockResolvedValue({ id: 'org_1', slug: 'acme' });
    apiRequest.mockResolvedValue({ apps: [apiApp], facets: apiFacets, nextCursor: 'next cursor' });
    const request = new Request(
      'https://app.example/dashboard/templates?q=CRM&category=Sales&type=business%20app&tech=TypeScript&sort=name&featured=true&cursor=current',
    );

    const result = (await loader({ request } as never)) as {
      firstPageHref: string | null;
      nextPageHref: string | null;
    };

    expect(apiRequest).toHaveBeenCalledWith(
      request,
      '/gallery/apps?limit=24&sort=NAME&query=CRM&category=sales&technology=typescript&artifactType=BUSINESS_APP&featured=true&cursor=current',
    );
    expect(result.firstPageHref).toBe(
      '/dashboard/templates?q=CRM&category=Sales&type=business+app&tech=TypeScript&sort=name&featured=true',
    );
    expect(result.nextPageHref).toBe(
      '/dashboard/templates?q=CRM&category=Sales&type=business+app&tech=TypeScript&sort=name&featured=true&cursor=next+cursor',
    );
  });

  it('remixes through the Gallery endpoint with an idempotency key and redirects to the IDE', async () => {
    apiRequest.mockResolvedValue({ projectId: 'project-remix-1' });
    const response = (await action({
      request: makeRequest({
        intent: 'remix',
        appId: apiApp.id,
        name: apiApp.name,
        idempotencyKey: 'gallery-remix-stable-1',
      }),
    } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('project-remix-1');
    expect(apiRequest.mock.calls[0][1]).toBe('/organizations/org_1/gallery/apps/demo%3Areact-saas/remix');
    expect(apiRequest.mock.calls[0][2]).toMatchObject({
      method: 'POST',
      headers: { 'Idempotency-Key': 'gallery-remix-stable-1' },
    });
    expect(JSON.parse(apiRequest.mock.calls[0][2].body)).toEqual({ name: 'Orbit CRM Remix' });
  });

  it('places a report in moderation instead of mutating the application', async () => {
    apiRequest.mockResolvedValue({ report: { id: 'report-1' } });
    const result = (await action({
      request: makeRequest({
        intent: 'report',
        appId: apiApp.id,
        submissionId: 'gallery-report-1',
        reason: 'SPAM',
        details: 'Misleading card',
      }),
    } as never)) as { data: { notice?: string } };

    expect(apiRequest.mock.calls[0][1]).toBe('/gallery/apps/demo%3Areact-saas/reports');
    expect(JSON.parse(apiRequest.mock.calls[0][2].body)).toEqual({ reason: 'SPAM', details: 'Misleading card' });
    expect(result.data.notice).toMatch(/moderation queue/i);
    expect(result.data).toMatchObject({ appId: apiApp.id, submissionId: 'gallery-report-1' });
  });

  it('rejects an incomplete OTHER report before it reaches moderation', async () => {
    const result = (await action({
      request: makeRequest({
        intent: 'report',
        appId: apiApp.id,
        submissionId: 'gallery-report-2',
        reason: 'OTHER',
      }),
    } as never)) as { data: { error?: string; submissionId?: string } };

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ submissionId: 'gallery-report-2' });
    expect(result.data.error).toMatch(/add details/i);
  });

  it('starts GitHub express-import preflight without rewriting it into a screenshot provider', async () => {
    apiRequest.mockResolvedValue({
      job: {
        id: 'job-1',
        source: 'github',
        status: 'READY',
        stage: 'ready',
        progress: 45,
        validation: {},
        runtimeDetection: { runtime: 'node', status: 'ready' },
        missingSecretNames: [],
        generatedConfig: [],
        preview: { fileCount: 8 },
        usesAgent: false,
        recoverable: false,
      },
    });
    const result = (await action({
      request: makeRequest({
        intent: 'import-preflight',
        source: 'github',
        projectName: 'Imported app',
        sourceUrl: 'https://replit.com/github.com/owner/repo',
        requestFingerprint: 'fingerprint-1',
        idempotencyKey: 'import-stable-key-1',
      }),
    } as never)) as { data: { operation?: { phase: string; validation?: { requestFingerprint: string } } } };

    expect(apiRequest.mock.calls[0][1]).toBe('/organizations/org_1/project-imports/preflight');
    expect(JSON.parse(apiRequest.mock.calls[0][2].body)).toEqual({
      source: 'github',
      input: { repositoryUrl: 'https://replit.com/github.com/owner/repo', name: 'Imported app' },
    });
    expect(result.data.operation).toMatchObject({
      phase: 'ready',
      validation: { requestFingerprint: 'fingerprint-1' },
    });
  });

  it('sends Empty as a true no-scaffold import input', async () => {
    apiRequest.mockResolvedValue({
      job: {
        id: 'job-empty',
        source: 'empty',
        status: 'READY',
        stage: 'ready',
        progress: 45,
        validation: {},
        runtimeDetection: { runtime: 'empty', status: 'ready' },
        missingSecretNames: [],
        generatedConfig: [],
        preview: { fileCount: 0 },
        usesAgent: false,
        recoverable: false,
      },
    });

    await action({
      request: makeRequest({
        intent: 'import-preflight',
        source: 'empty',
        projectName: 'Bare workspace',
        requestFingerprint: 'empty|Bare workspace||',
        idempotencyKey: 'empty-stable-key-1',
      }),
    } as never);

    expect(JSON.parse(apiRequest.mock.calls[0][2].body)).toEqual({
      source: 'empty',
      input: { name: 'Bare workspace' },
    });
  });

  it('hashes an uploaded ZIP and never sends raw multipart data to the API contract', async () => {
    apiRequest.mockResolvedValue({
      job: {
        id: 'job-zip',
        source: 'zip',
        status: 'READY',
        stage: 'ready',
        progress: 45,
        validation: {},
        runtimeDetection: { runtime: 'static', status: 'ready' },
        missingSecretNames: [],
        generatedConfig: [],
        preview: { fileCount: 1 },
        usesAgent: false,
        recoverable: false,
      },
    });
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'source.zip', { type: 'application/zip' });
    await action({
      request: makeRequest({
        intent: 'import-preflight',
        source: 'zip',
        projectName: 'ZIP app',
        requestFingerprint: 'zip-fingerprint',
        idempotencyKey: 'zip-stable-key-1',
        file,
      }),
    } as never);

    const body = JSON.parse(apiRequest.mock.calls[0][2].body);
    expect(body.input.file).toMatchObject({
      fileName: 'source.zip',
      contentBase64: 'UEsDBA==',
      sizeBytes: 4,
      sha256: '8dcc7e601606217f3b754766511182a916b17e9a26a94c9d887104eba92e9bb2',
    });
  });

  it('creates a validated import and redirects to its real IDE project', async () => {
    apiRequest.mockResolvedValue({ projectId: 'imported-project-1', job: { id: 'job-1' } });
    const response = (await action({
      request: makeRequest({
        intent: 'import-create',
        importJobId: 'job-1',
        source: 'github',
        projectName: 'Imported app',
        sourceUrl: 'https://github.com/owner/repo',
        requestFingerprint: 'fp',
      }),
    } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('imported-project-1');
    expect(apiRequest.mock.calls[0][1]).toBe('/organizations/org_1/project-imports/job-1/create');
  });

  it('preserves a recoverable failed preflight job so Retry can target the same import', async () => {
    apiRequest.mockRejectedValue(
      jsonData(
        {
          error: 'Source host timed out.',
          recoverable: true,
          job: {
            id: 'job-recoverable',
            source: 'github',
            status: 'FAILED',
            stage: 'validation.failed',
            progress: 20,
            validation: {},
            runtimeDetection: {},
            missingSecretNames: [],
            generatedConfig: [],
            preview: {},
            usesAgent: false,
            recoverable: true,
            errorCode: 'PROJECT_IMPORT_INSPECTION_FAILED',
            errorMessage: 'Source host timed out.',
          },
        },
        { status: 502 },
      ),
    );

    const result = (await action({
      request: makeRequest({
        intent: 'import-preflight',
        source: 'github',
        projectName: 'Recoverable import',
        sourceUrl: 'https://github.com/owner/repo',
        requestFingerprint: 'recoverable-fingerprint',
        idempotencyKey: 'recoverable-idempotency',
      }),
    } as never)) as {
      data: { importJobId?: string; operation?: { phase: string; error?: { recoverable: boolean } } };
    };

    expect(apiRequest.mock.calls[0][2]).toMatchObject({ includeProjectImportFailure: true });
    expect(result.data.importJobId).toBe('job-recoverable');
    expect(result.data.operation).toMatchObject({ phase: 'failed', error: { recoverable: true } });
  });

  it('shows routine 4xx failures inline but rethrows server failures', async () => {
    apiRequest.mockRejectedValueOnce(apiError(409, 'Remix is disabled.'));
    const inline = (await action({
      request: makeRequest({ intent: 'remix', appId: apiApp.id, name: apiApp.name }),
    } as never)) as { data: { error?: string }; init?: ResponseInit };
    expect(inline.data.error).toBe('Remix is disabled.');
    expect(inline.init?.status).toBe(409);

    apiRequest.mockRejectedValueOnce(apiError(503, 'Gallery unavailable.'));
    await expect(
      action({ request: makeRequest({ intent: 'remix', appId: apiApp.id, name: apiApp.name }) } as never),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('rethrows a mid-session login redirect', async () => {
    firstOrganization.mockRejectedValue(
      new Response(null, { status: 302, headers: { location: '/login?returnTo=%2Fdashboard%2Ftemplates' } }),
    );
    await expect(
      action({ request: makeRequest({ intent: 'remix', appId: apiApp.id, name: apiApp.name }) } as never),
    ).rejects.toMatchObject({ status: 302 });
  });
});
