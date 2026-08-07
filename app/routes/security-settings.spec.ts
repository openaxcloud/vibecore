import { redirect } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),

  /*
   * The real `json` is React Router's `data`; for assertions we only need to
   * read back the payload the loader serialised.
   */
  json: (value: unknown) => value,
}));

import { loader } from './security-settings';

function makeRequest(language = 'en') {
  return new Request('https://app.e-code.ai/security-settings', {
    headers: { Cookie: `vibecore-lang=${language}` },
  });
}

describe('security-settings loader', () => {
  it('reports MFA as enabled when /auth/me says so', async () => {
    apiRequest.mockResolvedValueOnce({ user: { mfaEnabled: true } });

    const result = await loader({ request: makeRequest() } as never);

    expect(result).toEqual({ mfaEnabled: true, mfaUnavailable: false, language: 'en' });
  });

  it('reports MFA as disabled when /auth/me reports no MFA', async () => {
    apiRequest.mockResolvedValueOnce({ user: { mfaEnabled: false } });

    const result = await loader({ request: makeRequest() } as never);

    expect(result).toEqual({ mfaEnabled: false, mfaUnavailable: false, language: 'en' });
  });

  it('re-throws a login redirect when the session has expired instead of stranding the user', async () => {
    const reauthRedirect = redirect('/login?returnTo=/security-settings');
    apiRequest.mockRejectedValueOnce(reauthRedirect);

    await expect(loader({ request: makeRequest() } as never)).rejects.toBe(reauthRedirect);
  });

  it('re-throws an MFA-setup redirect (403 MFA_REQUIRED) rather than swallowing it', async () => {
    const mfaRedirect = redirect('/mfa-setup');
    apiRequest.mockRejectedValueOnce(mfaRedirect);

    await expect(loader({ request: makeRequest() } as never)).rejects.toBe(mfaRedirect);
  });

  it('marks MFA status unavailable for non-redirect failures instead of claiming it is off', async () => {
    const rawError = 'network down on private authentication host';
    apiRequest.mockRejectedValueOnce(new Error(rawError));

    const result = await loader({ request: makeRequest('fr') } as never);

    expect(result).toEqual({ mfaEnabled: false, mfaUnavailable: true, language: 'fr' });
    expect(JSON.stringify(result)).not.toContain(rawError);
  });
});
