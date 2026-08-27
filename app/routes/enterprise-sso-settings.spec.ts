import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * apiRequest is mocked at the module boundary so the route action can be exercised without a
 * live enterprise backend. jsonResponse / redirect Responses are the real implementations from
 * the actual module, matching what apiRequest throws in production.
 */
const apiRequest = vi.fn();
const firstOrganizationOrNull = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNull(...args),
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
    firstOrganizationOrNull.mockReset();
  });

  /* react-router's data()/json() wrapper carries the payload in .data and the http status in .init. */
  type ActionResult = {
    data: {
      statusCode?: string;
      errorCode?: string;
      test?: {
        type: 'oidc' | 'saml';
        ok: boolean;
        checks: Array<{ nameCode: string; detailCode: string; ok: boolean }>;
      };
    };
    init?: { status?: number };
  };

  it('rejects a missing org id inline without calling the backend', async () => {
    const { action } = await import('./enterprise-sso-settings');

    const result = (await action({ request: formRequest({ type: 'oidc' }) } as any)) as ActionResult;

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.init?.status).toBe(400);
    expect(result.data.errorCode).toBe('organizationUnavailable');
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
    expect(result.data.statusCode).toBe('settingsSaved');
    expect(result.data.errorCode).toBeUndefined();
  });

  it('maps a 400 validation failure to a safe code instead of exposing the raw API message', async () => {
    apiRequest.mockRejectedValueOnce(apiErrorResponse(400, 'Invalid X.509 certificate.'));

    const { action } = await import('./enterprise-sso-settings');

    // Must resolve to an inline json() result, not reject with a thrown Response.
    const result = (await action({
      request: formRequest({ orgId: 'org-1', type: 'saml', entityId: 'urn:e', x509Certificate: 'bad' }),
    } as any)) as ActionResult;

    expect(result.data.errorCode).toBe('invalidConfiguration');
    expect(result.data.errorCode).not.toContain('X.509');
    expect(result.data.statusCode).toBeUndefined();
  });

  it('maps a 403 plan/authorization error without exposing its raw API message', async () => {
    apiRequest.mockRejectedValueOnce(apiErrorResponse(403, 'Enterprise plan required.'));

    const { action } = await import('./enterprise-sso-settings');

    const result = (await action({
      request: formRequest({ orgId: 'org-1', type: 'oidc', issuer: 'https://idp.test' }),
    } as any)) as ActionResult;

    expect(result.data.errorCode).toBe('requestRejected');
    expect(JSON.stringify(result.data)).not.toContain('Enterprise plan required.');
  });

  it('normalizes connection checks before returning them to the rendered route', async () => {
    apiRequest.mockResolvedValueOnce({
      ok: false,
      checks: [
        {
          name: 'Unreviewed upstream English check',
          ok: false,
          detail: 'Raw provider diagnostic that must never render',
        },
      ],
    });

    const { action } = await import('./enterprise-sso-settings');

    const result = (await action({
      request: formRequest({ orgId: 'org-1', intent: 'test', type: 'oidc' }),
    } as any)) as ActionResult;

    expect(result.data.test).toEqual({
      type: 'oidc',
      ok: false,
      checks: [{ nameCode: 'unknown', detailCode: 'genericFailed', ok: false }],
    });
    expect(JSON.stringify(result.data)).not.toContain('Unreviewed upstream English check');
    expect(JSON.stringify(result.data)).not.toContain('Raw provider diagnostic');
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

describe('enterprise SSO settings loader', () => {
  afterEach(() => {
    apiRequest.mockReset();
    firstOrganizationOrNull.mockReset();
  });

  type LoaderResult = {
    data: {
      orgId: string;
      language: string;
      enforcement: Record<string, unknown> | null;
      enforcementUnavailable: boolean;
    };
  };

  it('resolves French from the request and returns the authoritative enforcement state', async () => {
    const enforcement = {
      enforced: true,
      enforcedAt: '2026-08-01T12:30:00.000Z',
      graceDays: 7,
      graceDeadline: '2026-08-08T12:30:00.000Z',
      active: false,
    };
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org-1' });
    apiRequest.mockResolvedValueOnce({ enforcement });

    const { loader } = await import('./enterprise-sso-settings');

    const result = (await loader({
      request: new Request('https://app.test/enterprise-sso-settings', {
        headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      }),
    } as any)) as LoaderResult;

    expect(result.data).toEqual({
      orgId: 'org-1',
      language: 'fr',
      enforcement,
      enforcementUnavailable: false,
    });
  });

  it('marks enforcement as unavailable instead of presenting an API failure as disabled', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org-1' });
    apiRequest.mockRejectedValueOnce(apiErrorResponse(403, 'Enterprise plan required.'));

    const { loader } = await import('./enterprise-sso-settings');

    const result = (await loader({
      request: new Request('https://app.test/enterprise-sso-settings', {
        headers: { Cookie: 'vibecore-lang=fr' },
      }),
    } as any)) as LoaderResult;

    expect(result.data.language).toBe('fr');
    expect(result.data.enforcement).toBeNull();
    expect(result.data.enforcementUnavailable).toBe(true);
  });
});
