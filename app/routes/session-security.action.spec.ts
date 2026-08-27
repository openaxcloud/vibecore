/**
 * @vitest-environment node
 *
 * Regression guard for the session-security Save action error handling. The
 * action wraps `apiRequest` in a try/catch whose first branch was
 * `isApiResponse(error)` — which is just `error instanceof Response` and so
 * matched the 3xx login / MFA re-auth redirect `apiRequest` throws on an expired
 * session. That swallowed the redirect into a 3xx-status JSON body with no
 * Location header, dead-ending the user on a page they can no longer
 * authenticate against. These tests assert the action now re-throws those
 * re-auth redirects (so the framework performs the navigation), re-throws 5xx
 * responses to the route boundary and maps safe 4xx failures to semantic codes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
const firstOrganizationOrNull = vi.fn();
const currentSessionTokenHash = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNull(...args),
    currentSessionTokenHash: (...args: unknown[]) => currentSessionTokenHash(...args),
  };
});

import { action, loader } from './session-security';

function formRequest(fields: Record<string, string>, language = 'en'): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('http://localhost/session-security', {
    method: 'POST',
    body: form,
    headers: { Cookie: `vibecore-lang=${language}` },
  });
}

function pageRequest(language = 'en'): Request {
  return new Request('http://localhost/session-security', {
    headers: { Cookie: `vibecore-lang=${language}` },
  });
}

/*
 * The route's `json` is React Router 7's `data()` helper, which returns a
 * `{ data, init }` wrapper (not a Fetch `Response`). Unwrap both here so the
 * assertions read the body and the HTTP status the framework would emit.
 */
async function runAction(fields: Record<string, string>) {
  const result = (await action({ request: formRequest(fields) } as never)) as {
    data: { errorCode?: string; statusCode?: string };
    init?: { status?: number } | number | null;
  };

  const init = typeof result.init === 'number' ? { status: result.init } : result.init;

  return { status: init?.status ?? 200, body: result.data };
}

describe('session-security action error handling', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('re-throws a login re-auth (3xx) redirect so the framework performs the redirect', async () => {
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fsecurity-settings' },
    });
    apiRequest.mockRejectedValueOnce(loginRedirect);

    await expect(
      action({ request: formRequest({ orgId: 'org_1', sessionDurationMinutes: '60' }) } as never),
    ).rejects.toBe(loginRedirect);
  });

  it('re-throws an MFA_REQUIRED redirect to /mfa-setup instead of swallowing it inline', async () => {
    const mfaRedirect = new Response(null, { status: 303, headers: { Location: '/mfa-setup' } });
    apiRequest.mockRejectedValueOnce(mfaRedirect);

    await expect(action({ request: formRequest({ orgId: 'org_1' }) } as never)).rejects.toBe(mfaRedirect);
  });

  it('returns a stable inline 403 code without exposing the raw API error', async () => {
    const rawApiError = 'You lack permission to manage session policy.';
    apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: rawApiError }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { status, body } = await runAction({ orgId: 'org_1' });

    expect(status).toBe(403);
    expect(body.errorCode).toBe('forbidden');
    expect(JSON.stringify(body)).not.toContain(rawApiError);
  });

  it('maps a bodyless conflict to a localizable code', async () => {
    /*
     * The response body is deliberately ignored: only the status-derived code
     * reaches the browser, while 5xx/3xx responses go to the framework.
     */
    apiRequest.mockRejectedValueOnce(new Response('', { status: 409 }));

    const { status, body } = await runAction({ orgId: 'org_1' });

    expect(status).toBe(409);
    expect(body.errorCode).toBe('conflict');
  });

  it('rethrows a 5xx api response to the framework error boundary', async () => {
    const serverError = new Response('', { status: 500 });
    apiRequest.mockRejectedValueOnce(serverError);

    await expect(action({ request: formRequest({ orgId: 'org_1' }) } as never)).rejects.toBe(serverError);
  });

  it('returns an unavailable error for a non-Response throw (network/timeout)', async () => {
    const rawNetworkError = 'fetch failed against private session host';
    apiRequest.mockRejectedValueOnce(new Error(rawNetworkError));

    const { body } = await runAction({ orgId: 'org_1' });

    expect(body.errorCode).toBe('unavailable');
    expect(JSON.stringify(body)).not.toContain(rawNetworkError);
  });

  it('still validates a missing orgId before touching the api', async () => {
    const { status, body } = await runAction({ sessionDurationMinutes: '60' });

    expect(status).toBe(400);
    expect(body.errorCode).toBe('organizationUnavailable');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('validates a missing session without exposing an implementation identifier', async () => {
    const { status, body } = await runAction({ intent: 'revoke' });

    expect(status).toBe(400);
    expect(body.errorCode).toBe('sessionRequired');
    expect(JSON.stringify(body)).not.toContain('session id');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('saves the policy on success', async () => {
    apiRequest.mockResolvedValueOnce(undefined);

    const { body } = await runAction({ orgId: 'org_1', sessionDurationMinutes: '120' });

    expect(body.statusCode).toBe('policySaved');
    expect(body.errorCode).toBeUndefined();
  });

  it('returns distinct success codes for one revoked session and all other sessions', async () => {
    apiRequest.mockResolvedValue(undefined);

    await expect(runAction({ intent: 'revoke', sessionId: 'session_2' })).resolves.toMatchObject({
      body: { statusCode: 'sessionRevoked' },
    });
    await expect(runAction({ intent: 'revoke-all' })).resolves.toMatchObject({
      body: { statusCode: 'otherSessionsRevoked' },
    });
  });
});

describe('session-security loader locale and recovery', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    firstOrganizationOrNull.mockReset();
    currentSessionTokenHash.mockReset();
    firstOrganizationOrNull.mockResolvedValue({ id: 'org_1' });
    currentSessionTokenHash.mockReturnValue('current-hash');
  });

  it('returns the manual French locale and localized device labels', async () => {
    apiRequest.mockResolvedValueOnce({
      sessions: [
        {
          id: 'session_1',
          tokenHash: 'current-hash',
          ipAddress: '203.0.113.10',
          userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/126.0',
          createdAt: '2026-06-02T14:05:00.000Z',
          expiresAt: '2026-07-02T14:05:00.000Z',
        },
      ],
    });

    const result = (await loader({ request: pageRequest('fr') } as never)) as {
      data: {
        language: string;
        sessionsUnavailable: boolean;
        sessions: Array<{ device: string; current: boolean; tokenHash?: string }>;
      };
    };

    expect(result.data.language).toBe('fr');
    expect(result.data.sessionsUnavailable).toBe(false);
    expect(result.data.sessions).toEqual([expect.objectContaining({ device: 'Chrome sur macOS', current: true })]);
    expect(result.data.sessions[0]).not.toHaveProperty('tokenHash');
  });

  it('uses English as the catalog fallback for an unsupported route locale', async () => {
    apiRequest.mockResolvedValueOnce({
      sessions: [
        {
          id: 'session_1',
          userAgent: undefined,
          createdAt: '2026-06-02T14:05:00.000Z',
          expiresAt: '2026-07-02T14:05:00.000Z',
        },
      ],
    });

    const request = new Request('http://localhost/session-security?lang=es');

    const result = (await loader({ request } as never)) as {
      data: { language: string; sessions: Array<{ device: string }> };
    };

    expect(result.data.language).toBe('en');
    expect(result.data.sessions[0]?.device).toBe('Unknown device');
  });

  it('turns a session-list failure into a recoverable state without serializing the raw error', async () => {
    const rawError = 'network down on private session database';
    apiRequest.mockRejectedValueOnce(new Error(rawError));

    const result = (await loader({ request: pageRequest('fr') } as never)) as {
      data: { language: string; sessionsUnavailable: boolean; sessions: unknown[] };
    };

    expect(result.data).toEqual({
      orgId: 'org_1',
      language: 'fr',
      sessions: [],
      sessionsUnavailable: true,
    });
    expect(JSON.stringify(result.data)).not.toContain(rawError);
  });

  it('rethrows authentication redirects from the sessions endpoint', async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/login' } });
    apiRequest.mockRejectedValueOnce(redirect);

    await expect(loader({ request: pageRequest('fr') } as never)).rejects.toBe(redirect);
  });
});
