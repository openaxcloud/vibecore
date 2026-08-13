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
 * re-auth redirects (so the framework performs the navigation) while still
 * rendering genuine 4xx/5xx API failures inline.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

import { action } from './session-security';

function formRequest(fields: Record<string, string>): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('http://localhost/session-security', { method: 'POST', body: form });
}

/*
 * The route's `json` is React Router 7's `data()` helper, which returns a
 * `{ data, init }` wrapper (not a Fetch `Response`). Unwrap both here so the
 * assertions read the body and the HTTP status the framework would emit.
 */
async function runAction(fields: Record<string, string>) {
  const result = (await action({ request: formRequest(fields) } as never)) as {
    data: { error?: string; status?: string };
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

  it('returns an inline 403 error (not a thrown Response) when the api forbids the request', async () => {
    apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'You lack permission to manage session policy.' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { status, body } = await runAction({ orgId: 'org_1' });

    expect(status).toBe(403);
    expect(body.error).toBe('You lack permission to manage session policy.');
  });

  it('falls back to a generic message when a 4xx api response has no error body', async () => {
    /*
     * 4xx client errors are rendered inline; a bodyless one falls back to the
     * generic apiErrorMessage default. (5xx/3xx are rethrown to the framework —
     * covered by the re-auth-redirect tests + route-reauth's shouldRethrowActionError.)
     */
    apiRequest.mockRejectedValueOnce(new Response('', { status: 409 }));

    const { status, body } = await runAction({ orgId: 'org_1' });

    expect(status).toBe(409);
    expect(body.error).toBe('Action failed. Please try again.');
  });

  it('rethrows a 5xx api response to the framework error boundary', async () => {
    const serverError = new Response('', { status: 500 });
    apiRequest.mockRejectedValueOnce(serverError);

    await expect(action({ request: formRequest({ orgId: 'org_1' }) } as never)).rejects.toBe(serverError);
  });

  it('returns an unavailable error for a non-Response throw (network/timeout)', async () => {
    apiRequest.mockRejectedValueOnce(new Error('fetch failed'));

    const { body } = await runAction({ orgId: 'org_1' });

    expect(body.error).toContain('temporarily unavailable');
  });

  it('still validates a missing orgId before touching the api', async () => {
    const { status, body } = await runAction({ sessionDurationMinutes: '60' });

    expect(status).toBe(400);
    expect(body.error).toBe('Your organization is unavailable. Reload the page and try again.');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('saves the policy on success', async () => {
    apiRequest.mockResolvedValueOnce(undefined);

    const { body } = await runAction({ orgId: 'org_1', sessionDurationMinutes: '120' });

    expect(body.status).toContain('saved');
    expect(body.error).toBeUndefined();
  });
});
