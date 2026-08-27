import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The upgrade action POSTs to /orgs/:id/billing/checkout. When the session has
 * expired or the API returns 403 `code: 'MFA_REQUIRED'`, apiRequest throws a
 * framework `redirect()` — a 3xx Response with a Location header and an empty body.
 *
 * Regression: the action's catch block only had an `isApiResponse(error)` branch,
 * which (because a redirect is still `instanceof Response`) swallowed the redirect
 * into `json({ error }, { status: error.status })`. The redirect's Location was
 * discarded and the user got a bogus 3xx json error instead of reaching the
 * login / MFA page. The action must re-throw 3xx re-auth redirects first.
 */

const apiRequest = vi.fn();
const firstOrganizationOrNull = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  // Reuse the real response helpers; only stub the network calls.
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNull(...args),
  };
});

import { action } from './upgrade';

function buildRequest(fields: Record<string, string> = {}): Request {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  return new Request('http://localhost/upgrade', { method: 'POST', body: formData });
}

afterEach(() => {
  apiRequest.mockReset();
  firstOrganizationOrNull.mockReset();
  vi.restoreAllMocks();
});

describe('upgrade action — re-auth redirect handling', () => {
  it('re-throws a 302 MFA/login redirect instead of swallowing it inline', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org_1' });

    const reauthRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/mfa-setup' },
    });
    apiRequest.mockRejectedValueOnce(reauthRedirect);

    await expect(action({ request: buildRequest({ planKey: 'pro' }) } as never)).rejects.toBe(reauthRedirect);
  });

  it('still renders genuine API 4xx errors inline (does not re-throw)', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org_1' });
    apiRequest.mockRejectedValueOnce(new Response('{"error":"Plan unavailable."}', { status: 400 }));

    // The action returns RR7's `data()` sentinel: { type, data, init }, not a Response.
    const result = (await action({ request: buildRequest({ planKey: 'pro' }) } as never)) as {
      data: { error?: string };
      init?: { status?: number };
    };

    expect(result.init?.status).toBe(400);
    expect(result.data).toEqual({ error: 'Checkout is unavailable right now. Try again later.' });
    expect(result.data.error).not.toContain('Plan unavailable');
  });

  it('returns a friendly inline message when the API is unreachable (non-Response error)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org_1' });
    apiRequest.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = (await action({ request: buildRequest({ planKey: 'pro' }) } as never)) as {
      data: { error?: string };
      init?: { status?: number };
    };

    expect(result.data).toEqual({ error: 'Checkout is temporarily unavailable. Try again later.' });
  });
});
