import { afterEach, describe, expect, it, vi } from 'vitest';
import { action } from './import-github';

/*
 * Regression: the GitHub-import action called apiRequest with no try/catch.
 * apiRequest throws a real `Response` (jsonResponse) on every non-ok status
 * (except a redirected 401/MFA). So a real import failure — invalid / private /
 * missing repo (400/404), quota exceeded (402), or upstream 500 — bubbled out
 * of the action and was rendered by the route error boundary as a generic crash
 * page, never reaching the inline `{actionData?.error}` slot in the form.
 *
 * The action must now surface stable, localizable error codes inline without
 * leaking upstream text, and only re-throw re-auth responses so the framework
 * follows them.
 *
 * These tests drive the real action with a stubbed global fetch (a standard
 * test double, no module mocks): the first call resolves the user's org via
 * /orgs, the second is the import call whose response we control.
 */

const ORG = { id: 'org-1', name: 'Acme', slug: 'acme' };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function importRequest(repositoryUrl: string | undefined = 'https://github.com/org/repo') {
  const form = new URLSearchParams();

  if (repositoryUrl !== undefined) {
    form.set('repositoryUrl', repositoryUrl);
  }

  return new Request('https://app.example.com/import-github', {
    method: 'POST',
    headers: {
      cookie: 'ecode_session=test-token',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
}

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

/**
 * Build a global fetch double: first /orgs lookup, then the import POST whose
 * Response is `importResponse`.
 */
function stubFetch(importResponse: Response) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/orgs')) {
      return jsonResponse(200, { organizations: [ORG] });
    }

    if (url.includes('/projects/import/github')) {
      return importResponse;
    }

    throw new Error(`unexpected fetch to ${url}`);
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('import-github action error handling', () => {
  it('commits a successful import once and redirects before workspace cold-start work begins', async () => {
    const fetchSpy = stubFetch(
      jsonResponse(201, { project: { id: 'project-imported', slug: 'repo-imported' }, files: [] }),
    );
    globalThis.fetch = fetchSpy;

    const result = await action({ request: importRequest() } as never);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('location')).toBe('/@acme/repo-imported');

    const imported = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/projects/import/github'));
    expect(imported).toHaveLength(1);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/api/runtime/workspaces'))).toBe(false);
  });

  it('returns an inline error (not a thrown Response) when the repo is invalid (400)', async () => {
    globalThis.fetch = stubFetch(jsonResponse(400, { ok: false, error: 'Repository URL is not a valid GitHub repo.' }));

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'inaccessible' });
    expect(JSON.stringify(readData(result))).not.toContain('not a valid GitHub repo');
  });

  it('returns an inline error when the repo is missing/private (404)', async () => {
    globalThis.fetch = stubFetch(jsonResponse(404, { ok: false, error: 'Repository not found or is private.' }));

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'inaccessible' });
    expect(JSON.stringify(readData(result))).not.toContain('not found or is private');
  });

  it('returns an inline error when the project quota is exceeded (402)', async () => {
    globalThis.fetch = stubFetch(jsonResponse(402, { ok: false, error: 'Project limit reached for this plan.' }));

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'quota' });
    expect(JSON.stringify(readData(result))).not.toContain('Project limit reached');
  });

  it('returns a safe inline code on an upstream 500', async () => {
    globalThis.fetch = stubFetch(new Response('upstream boom', { status: 500 }));

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'importFailed' });
    expect(JSON.stringify(readData(result))).not.toContain('upstream boom');
  });

  it('surfaces a confirmed cold start without replaying the import mutation', async () => {
    const fetchSpy = stubFetch(jsonResponse(425, { ok: false, code: 'WORKSPACE_STARTING' }));
    globalThis.fetch = fetchSpy;

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'workspaceStarting' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('/projects/import/github'))).toHaveLength(1);
  });

  it.each([502, 503, 504])('surfaces service unavailability for HTTP %s without an automatic retry', async (status) => {
    const fetchSpy = stubFetch(jsonResponse(status, { ok: false, code: 'IMPORT_SERVICE_UNAVAILABLE' }));
    globalThis.fetch = fetchSpy;

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'serviceUnavailable' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('/projects/import/github'))).toHaveLength(1);
  });

  it('re-throws a 3xx re-auth redirect so the framework follows it', async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fimport-github' },
    });
    globalThis.fetch = stubFetch(redirectResponse);

    await expect(action({ request: importRequest() } as never)).rejects.toMatchObject({ status: 302 });
  });

  it('still validates the empty-URL case inline without hitting the API', async () => {
    const fetchSpy = stubFetch(jsonResponse(200, { project: { id: 'p1' } }));
    globalThis.fetch = fetchSpy;

    const result = await action({ request: importRequest('') } as never);

    expect(readData(result)).toEqual({ errorCode: 'urlRequired' });

    // Validation runs before either the organization lookup or import request.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/projects/import/github'))).toBe(false);
  });
});
