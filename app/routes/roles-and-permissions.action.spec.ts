import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * apiRequest is mocked at the module boundary so the route action can be exercised
 * without a live backend. The rest of enterprise-api.server (json/redirect/isApiResponse/
 * apiErrorMessage/isForbiddenApiResponse) keeps its real implementation so the action's
 * catch-branch wiring is exercised for real.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function formRequest(fields: Record<string, string>): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('https://app.test/roles-and-permissions', { method: 'POST', body: form });
}

/* react-router's json() returns a data() wrapper carrying the payload in .data and http status in .init. */
type ActionResult = { data: { error?: string; status?: string }; init?: { status?: number } };

const baseFields = { orgId: 'org1', key: 'editor', name: 'Editor', permissions: 'projects:read,usage:read' };

describe('roles-and-permissions route action', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('reports success inline when the role is created', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { action } = await import('./roles-and-permissions');

    const result = (await action({
      request: formRequest(baseFields),
      params: {},
      context: {},
    } as never)) as ActionResult;

    expect(result.data.status).toBe('Custom role created.');
  });

  it('surfaces a 403 forbidden inline rather than throwing', async () => {
    apiRequest.mockRejectedValueOnce(new Response('{"error":"nope"}', { status: 403 }));

    const { action } = await import('./roles-and-permissions');

    const result = (await action({
      request: formRequest(baseFields),
      params: {},
      context: {},
    } as never)) as ActionResult;

    expect(result.init?.status).toBe(403);
    expect(result.data.error).toBe('nope');
  });

  it('renders a 400 validation error inline instead of re-throwing to the root boundary', async () => {
    apiRequest.mockRejectedValueOnce(new Response('{"error":"duplicate role key"}', { status: 409 }));

    const { action } = await import('./roles-and-permissions');

    const result = (await action({
      request: formRequest(baseFields),
      params: {},
      context: {},
    } as never)) as ActionResult;

    expect(result.init?.status).toBe(409);
    expect(result.data.error).toBe('duplicate role key');
  });

  it('renders a 5xx api-down error inline instead of re-throwing', async () => {
    apiRequest.mockRejectedValueOnce(new Response('{"error":"boom"}', { status: 503 }));

    const { action } = await import('./roles-and-permissions');

    const result = (await action({
      request: formRequest(baseFields),
      params: {},
      context: {},
    } as never)) as ActionResult;

    expect(result.init?.status).toBe(503);
    expect(result.data.error).toBe('boom');
  });

  it('falls back to a generic message when the error body has no JSON payload', async () => {
    apiRequest.mockRejectedValueOnce(new Response('', { status: 500 }));

    const { action } = await import('./roles-and-permissions');

    const result = (await action({
      request: formRequest(baseFields),
      params: {},
      context: {},
    } as never)) as ActionResult;

    expect(result.init?.status).toBe(500);
    expect(typeof result.data.error).toBe('string');
    expect(result.data.error).not.toBe('');
  });

  it('re-throws a re-auth (3xx) redirect so the framework performs the login redirect', async () => {
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Froles-and-permissions' },
    });
    apiRequest.mockRejectedValueOnce(loginRedirect);

    const { action } = await import('./roles-and-permissions');

    await expect(action({ request: formRequest(baseFields), params: {}, context: {} } as never)).rejects.toBe(
      loginRedirect,
    );
  });

  it('re-throws non-Response errors (e.g. network failure) to the boundary', async () => {
    const networkError = new Error('fetch failed');
    apiRequest.mockRejectedValueOnce(networkError);

    const { action } = await import('./roles-and-permissions');

    await expect(action({ request: formRequest(baseFields), params: {}, context: {} } as never)).rejects.toBe(
      networkError,
    );
  });

  it('rejects a missing orgId with an inline 400 without calling the api', async () => {
    const { action } = await import('./roles-and-permissions');

    const result = (await action({
      request: formRequest({ ...baseFields, orgId: '' }),
      params: {},
      context: {},
    } as never)) as ActionResult;

    expect(result.init?.status).toBe(400);
    expect(result.data.error).toBe('Your organization is unavailable. Reload the page and try again.');
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
