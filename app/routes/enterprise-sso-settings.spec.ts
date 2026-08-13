import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * apiRequest is mocked at the module boundary so the route action can be exercised without a
 * live enterprise backend. firstOrganizationOrNull is unused by the action, so only apiRequest
 * needs a double. jsonResponse / redirect Responses are the real implementations from the
 * actual module, matching what apiRequest throws in production.
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

  return new Request('https://app.test/enterprise-sso-settings', { method: 'POST', body: form });
}

/** Mirrors the real Response apiRequest throws on a non-2xx upstream status (see enterprise-api.server). */
function apiErrorResponse(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ ok: false, error, code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('enterprise SSO settings action', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  /* react-router's data()/json() wrapper carries the payload in .data and the http status in .init. */
  type ActionResult = { data: { status?: string; error?: string }; init?: { status?: number } };

  it('rejects a missing org id inline without calling the backend', async () => {
    const { action } = await import('./enterprise-sso-settings');

    const result = (await action({ request: formRequest({ type: 'oidc' }) } as any)) as ActionResult;

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.init?.status).toBe(400);
    expect(result.data.error).toBe('Your organization is unavailable. Reload the page and try again.');
  });

  it('saves a SAML config and returns a success status', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { action } = await import('./enterprise-sso-settings');

    const result = (await action({
      request: formRequest({
        orgId: 'org-1',
        type: 'saml',
        entityId: 'urn:e',
        ssoUrl: 'https://idp.test/sso',
        x509Certificate: 'CERT',
        enabled: 'true',
      }),
    } as any)) as ActionResult;

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][1]).toBe('/orgs/org-1/sso/saml');
    expect(result.data.status).toBe('SSO settings saved.');
    expect(result.data.error).toBeUndefined();
  });

  it('surfaces a 400 validation error inline instead of throwing a raw Response', async () => {
    apiRequest.mockRejectedValueOnce(apiErrorResponse(400, 'Invalid X.509 certificate.'));

    const { action } = await import('./enterprise-sso-settings');

    // Must resolve to an inline json() result, not reject with a thrown Response.
    const result = (await action({
      request: formRequest({ orgId: 'org-1', type: 'saml', entityId: 'urn:e', x509Certificate: 'bad' }),
    } as any)) as ActionResult;

    expect(result.data.error).toBe('Invalid X.509 certificate.');
    expect(result.data.status).toBeUndefined();
  });

  it('surfaces a 403 plan/authorization error inline', async () => {
    apiRequest.mockRejectedValueOnce(apiErrorResponse(403, 'Enterprise plan required.'));

    const { action } = await import('./enterprise-sso-settings');

    const result = (await action({
      request: formRequest({ orgId: 'org-1', type: 'oidc', issuer: 'https://idp.test' }),
    } as any)) as ActionResult;

    expect(result.data.error).toBe('Enterprise plan required.');
  });

  it('re-throws a 5xx server error to the route error boundary', async () => {
    const serverError = apiErrorResponse(500, 'Upstream failure.');
    apiRequest.mockRejectedValueOnce(serverError);

    const { action } = await import('./enterprise-sso-settings');

    await expect(
      action({ request: formRequest({ orgId: 'org-1', type: 'oidc', issuer: 'https://idp.test' }) } as any),
    ).rejects.toBe(serverError);
  });

  it('re-throws a re-auth redirect (3xx) so the browser follows it', async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: '/login' } });
    apiRequest.mockRejectedValueOnce(redirectResponse);

    const { action } = await import('./enterprise-sso-settings');

    await expect(
      action({ request: formRequest({ orgId: 'org-1', type: 'oidc', issuer: 'https://idp.test' }) } as any),
    ).rejects.toBe(redirectResponse);
  });
});
