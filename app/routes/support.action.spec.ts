import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The support action POSTs to /orgs/:id/support/tickets. When the backend fails
 * with anything other than a 403, the catch block previously only handled the
 * forbidden case and then unconditionally `throw error`, bubbling a 500/502/404,
 * AbortSignal.timeout, or hung-pod network error up to the root error boundary —
 * taking down the whole Support page even though the JSX already renders an inline
 * `actionData.error` banner.
 *
 * Regression guard: genuine API errors must surface inline (with their status),
 * non-Response failures must degrade to a friendly inline message, and 3xx
 * re-auth redirects must still be re-thrown so the framework navigates to login/MFA.
 */

const apiRequest = vi.fn();
const firstOrganizationOrNull = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  // Reuse the real `json`/`redirect`/`apiErrorMessage`/`isApiResponse` helpers; only stub the network calls.
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNull(...args),
  };
});

import { action } from './support';

function buildRequest(fields: Record<string, string> = {}): Request {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  return new Request('http://localhost/support', { method: 'POST', body: formData });
}

type ActionResult = { data: { error?: string }; init?: { status?: number } };

afterEach(() => {
  apiRequest.mockReset();
  firstOrganizationOrNull.mockReset();
});

describe('support action — failure handling', () => {
  it('re-throws a 302 MFA/login redirect instead of swallowing it inline', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org_1' });

    const reauthRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/mfa-setup' },
    });
    apiRequest.mockRejectedValueOnce(reauthRedirect);

    await expect(action({ request: buildRequest({ subject: 'help' }) } as never)).rejects.toBe(reauthRedirect);
  });

  it('still surfaces a 403 forbidden error inline', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org_1' });
    apiRequest.mockRejectedValueOnce(new Response('{"error":"Not allowed."}', { status: 403 }));

    const result = (await action({ request: buildRequest({ subject: 'help' }) } as never)) as ActionResult;

    expect(result.init?.status).toBe(403);
    expect(result.data).toEqual({ error: 'Not allowed.' });
  });

  it('surfaces a backend 500 inline instead of crashing the page', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org_1' });
    apiRequest.mockRejectedValueOnce(new Response('{"error":"Ticket service down."}', { status: 500 }));

    const result = (await action({ request: buildRequest({ subject: 'help' }) } as never)) as ActionResult;

    expect(result.init?.status).toBe(500);
    expect(result.data).toEqual({ error: 'Ticket service down.' });
  });

  it('returns a friendly inline message when the API is unreachable (non-Response error)', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org_1' });
    apiRequest.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = (await action({ request: buildRequest({ subject: 'help' }) } as never)) as ActionResult;

    expect(result.data).toEqual({ error: 'Support is temporarily unavailable. Please try again later.' });
  });
});
