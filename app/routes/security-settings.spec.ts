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

function makeRequest() {
  return new Request('https://app.e-code.ai/security-settings');
}

describe('security-settings loader', () => {
  it('reports MFA as enabled when /auth/me says so', async () => {
    apiRequest.mockResolvedValueOnce({ user: { mfaEnabled: true } });

    const result = await loader({ request: makeRequest() } as never);

    expect(result).toEqual({ mfaEnabled: true, mfaUnavailable: false });
  });

  it('reports MFA as disabled when /auth/me reports no MFA', async () => {
    apiRequest.mockResolvedValueOnce({ user: { mfaEnabled: false } });

    const result = await loader({ request: makeRequest() } as never);

    expect(result).toEqual({ mfaEnabled: false, mfaUnavailable: false });
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
    apiRequest.mockRejectedValueOnce(new Error('network down'));

    const result = await loader({ request: makeRequest() } as never);

    expect(result).toEqual({ mfaEnabled: false, mfaUnavailable: true });
  });
});
