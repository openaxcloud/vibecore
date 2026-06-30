import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Mock the SaaS API client so the resolver exercises only its own preference
 * logic (server UserConnection token over the localStorage fallback).
 */
const apiRequestMock = vi.fn();
vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

import { preferredConnectorToken, resolveConnectorToken } from './connector-token.server';

describe('connector token resolver (cross-device)', () => {
  beforeEach(() => apiRequestMock.mockReset());

  it('reads the UserConnection token from the API service (owner-scoped endpoint)', async () => {
    apiRequestMock.mockResolvedValue({ token: 'server-token' });

    const req = new Request('https://app.e-code.ai/x');
    expect(await resolveConnectorToken(req, 'netlify')).toBe('server-token');
    expect(apiRequestMock).toHaveBeenCalledWith(req, '/api/integrations/netlify/token', { redirectOn401: false });
  });

  it('prefers the server (UserConnection) token over the localStorage fallback', async () => {
    apiRequestMock.mockResolvedValue({ token: 'server-token' });

    const used = await preferredConnectorToken(new Request('https://app.e-code.ai/x'), 'vercel', 'localStorage-token');
    expect(used).toBe('server-token');
  });

  it('falls back to the localStorage token when the server has no usable token', async () => {
    // API reachable but no active connection → server token null → use fallback.
    apiRequestMock.mockResolvedValue({ token: null });

    const used = await preferredConnectorToken(new Request('https://app.e-code.ai/x'), 'netlify', 'ls-token');
    expect(used).toBe('ls-token');
  });

  it('returns null when neither the server nor the fallback has a token', async () => {
    apiRequestMock.mockResolvedValue({ token: null });

    const used = await preferredConnectorToken(new Request('https://app.e-code.ai/x'), 'supabase', undefined);
    expect(used).toBeNull();
  });
});
