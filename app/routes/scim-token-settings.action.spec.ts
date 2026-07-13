/**
 * @vitest-environment node
 *
 * Regression guard for the SCIM-token action error handling. The action used to
 * call `apiRequest` with no try/catch, so a thrown `Response` (403 missing
 * `scim:manage`, 400 duplicate name, 5xx api down) bubbled past the route to the
 * root error boundary — full-paging the user off the form — while the inline
 * `error={actionData?.error}` path could never fire because the action never
 * returned `{ error }`. These tests assert the action now catches the throw and
 * returns a JSON `{ error }` body (with the upstream status) the form can render.
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

import { action } from './scim-token-settings';

function formRequest(fields: Record<string, string>): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('http://localhost/scim-token-settings', { method: 'POST', body: form });
}

/*
 * The route's `json` is React Router 7's `data()` helper, which returns a
 * `{ data, init }` wrapper (not a Fetch `Response`). Unwrap both here so the
 * assertions read the body and the HTTP status the framework would emit.
 */
async function runAction(fields: Record<string, string>) {
  const result = (await action({ request: formRequest(fields) } as never)) as {
    data: { error?: string; status?: string; token?: string };
    init?: { status?: number } | number | null;
  };

  const init = typeof result.init === 'number' ? { status: result.init } : result.init;

  return { status: init?.status ?? 200, body: result.data };
}

describe('scim-token-settings action error handling', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('returns an inline 403 error (not a thrown Response) when the api forbids the request', async () => {
    apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'You lack the scim:manage permission.' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { status, body } = await runAction({ orgId: 'org_1', name: 'idp-token' });

    expect(status).toBe(403);
    expect(body.error).toBe('You lack the scim:manage permission.');
    expect(body.token).toBeUndefined();
  });

  it('propagates a 400 duplicate-name error inline with its message', async () => {
    apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'A token with that name already exists.' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { status, body } = await runAction({ orgId: 'org_1', name: 'dupe' });

    expect(status).toBe(400);
    expect(body.error).toBe('A token with that name already exists.');
  });

  it('falls back to a generic message when the api response has no error body', async () => {
    apiRequest.mockRejectedValueOnce(new Response('', { status: 500 }));

    const { status, body } = await runAction({ orgId: 'org_1', name: 'x' });

    expect(status).toBe(500);
    expect(body.error).toBe('Failed to create SCIM token.');
  });

  it('returns a 200 unavailable error for a non-Response throw (network/timeout)', async () => {
    apiRequest.mockRejectedValueOnce(new Error('fetch failed'));

    const { body } = await runAction({ orgId: 'org_1', name: 'x' });

    expect(body.error).toContain('temporarily unavailable');
    expect(body.token).toBeUndefined();
  });

  it('still validates a missing orgId before touching the api', async () => {
    const { status, body } = await runAction({ name: 'x' });

    expect(status).toBe(400);
    expect(body.error).toBe('Your organization is unavailable. Reload the page and try again.');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('returns the created token on success', async () => {
    apiRequest.mockResolvedValueOnce({ token: 'scim_secret_value' });

    const { body } = await runAction({ orgId: 'org_1', name: 'good' });

    expect(body.token).toBe('scim_secret_value');
    expect(body.error).toBeUndefined();
    expect(body.status).toContain('SCIM token created');
  });

  it('re-throws a 401 login re-auth (3xx) redirect so the framework performs the redirect', async () => {
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fscim-token-settings' },
    });
    apiRequest.mockRejectedValueOnce(loginRedirect);

    await expect(action({ request: formRequest({ orgId: 'org_1', name: 'x' }) } as never)).rejects.toBe(loginRedirect);
  });

  it('re-throws an MFA_REQUIRED redirect to /mfa-setup instead of swallowing it inline', async () => {
    const mfaRedirect = new Response(null, { status: 303, headers: { Location: '/mfa-setup' } });
    apiRequest.mockRejectedValueOnce(mfaRedirect);

    await expect(action({ request: formRequest({ orgId: 'org_1', name: 'x' }) } as never)).rejects.toBe(mfaRedirect);
  });
});
