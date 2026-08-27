import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireWebSession } from './require-session';

async function rejectedResponse(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);

    return error as Response;
  }

  throw new Error('Expected requireWebSession to reject');
}

describe('requireWebSession locale-safe errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a French 401 with locale headers when the session is missing', async () => {
    const response = await rejectedResponse(
      requireWebSession(new Request('https://e-code.ai/api/llmcall', { headers: { 'Accept-Language': 'fr-FR' } })),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(response.headers.get('Vary')).toBe('Cookie, Accept-Language');
    await expect(response.json()).resolves.toEqual({ error: 'Vous devez vous authentifier.' });
  });

  it('returns a French 503 without exposing the transport error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNRESET upstream-secret'));

    const response = await rejectedResponse(
      requireWebSession(
        new Request('https://e-code.ai/api/llmcall?lang=fr', { headers: { Cookie: 'vc_session=valid-token' } }),
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Language')).toBe('fr');

    const payload = (await response.json()) as { error: string };

    expect(payload.error).toContain('authentification');
    expect(payload.error).not.toContain('upstream-secret');
  });

  it('gives a manual English cookie precedence over a French browser locale', async () => {
    const response = await rejectedResponse(
      requireWebSession(
        new Request('https://e-code.ai/api/llmcall', {
          headers: { Cookie: 'vibecore-lang=en', 'Accept-Language': 'fr-FR' },
        }),
      ),
    );

    expect(response.headers.get('Content-Language')).toBe('en');
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' });
  });
});
