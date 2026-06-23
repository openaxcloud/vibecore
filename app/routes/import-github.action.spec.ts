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
 * The action must now surface those API failures inline and only re-throw 3xx
 * re-auth (login / MFA) redirects so the framework follows them.
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
  it('returns an inline error (not a thrown Response) when the repo is invalid (400)', async () => {
    globalThis.fetch = stubFetch(jsonResponse(400, { ok: false, error: 'Repository URL is not a valid GitHub repo.' }));

    const result = await action({ request: importRequest() } as never);

    expect(result).toEqual({ error: 'Repository URL is not a valid GitHub repo.' });
  });

  it('returns an inline error when the repo is missing/private (404)', async () => {
    globalThis.fetch = stubFetch(jsonResponse(404, { ok: false, error: 'Repository not found or is private.' }));

    const result = await action({ request: importRequest() } as never);

    expect(result).toEqual({ error: 'Repository not found or is private.' });
  });

  it('returns an inline error when the project quota is exceeded (402)', async () => {
    globalThis.fetch = stubFetch(jsonResponse(402, { ok: false, error: 'Project limit reached for this plan.' }));

    const result = await action({ request: importRequest() } as never);

    expect(result).toEqual({ error: 'Project limit reached for this plan.' });
  });

  it('returns an inline error (with fallback message) on an upstream 500', async () => {
    globalThis.fetch = stubFetch(new Response('upstream boom', { status: 500 }));

    const result = await action({ request: importRequest() } as never);

    expect(result).toEqual({ error: 'upstream boom' });
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

    expect(result).toEqual({ error: 'Repository URL is required.' });

    // /orgs is still fetched (firstOrganization), but the import POST is not.
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/projects/import/github'))).toBe(false);
  });
});
