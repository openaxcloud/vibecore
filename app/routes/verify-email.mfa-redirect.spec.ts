import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The verify-email action submits via `<Form method="post">` (a real page navigation),
 * so an API 403 `code: 'MFA_REQUIRED'` makes apiRequest throw a framework
 * `redirect('/mfa-setup')` — a 302 Response with a Location header and an empty body.
 *
 * Regression: the action's catch block treated EVERY thrown Response as an API error,
 * calling `error.json()` on the empty redirect body (which rejects) and returning
 * `json({ error: 'Verification failed.' }, { status: 302 })` instead of letting the
 * framework perform the redirect. The action must re-throw 3xx re-auth redirects first.
 */

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  // Reuse the real `json`/`formObject` helpers; only stub the network call.
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

import { action } from './verify-email';

function buildRequest(fields: Record<string, string>): Request {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  // FormData on a Request is read back by the action via request.formData().
  return new Request('http://localhost/verify-email', { method: 'POST', body: formData });
}

afterEach(() => {
  apiRequest.mockReset();
});

describe('verify-email action — MFA-required redirect handling', () => {
  it('re-throws the 302 /mfa-setup redirect on verify instead of swallowing it inline', async () => {
    const mfaRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/mfa-setup' },
    });
    apiRequest.mockRejectedValueOnce(mfaRedirect);

    await expect(action({ request: buildRequest({ token: 'verify_abc1234567890123' }) } as never)).rejects.toBe(
      mfaRedirect,
    );
  });

  it('re-throws the 302 /mfa-setup redirect on resend instead of swallowing it inline', async () => {
    const mfaRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/mfa-setup' },
    });
    apiRequest.mockRejectedValueOnce(mfaRedirect);

    await expect(action({ request: buildRequest({ intent: 'resend' }) } as never)).rejects.toBe(mfaRedirect);
  });

  it('still renders genuine API 4xx errors inline (does not re-throw)', async () => {
    apiRequest.mockRejectedValueOnce(new Response('{"error":"Token expired."}', { status: 400 }));

    // The action returns RR7's `data()` sentinel: { type, data, init }, not a Response.
    const result = (await action({ request: buildRequest({ token: 'verify_abc1234567890123' }) } as never)) as {
      data: { error?: string };
      init?: { status?: number };
    };

    expect(result.init?.status).toBe(400);
    expect(result.data).toEqual({ error: 'Token expired.' });
  });

  it('returns a 503 inline message when the API is unreachable (non-Response error)', async () => {
    apiRequest.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = (await action({ request: buildRequest({ token: 'verify_abc1234567890123' }) } as never)) as {
      data: { error?: string };
      init?: { status?: number };
    };

    expect(result.init?.status).toBe(503);
    expect(result.data).toEqual({
      error: 'Verification service is not reachable. Please try again in a moment.',
    });
  });
});
