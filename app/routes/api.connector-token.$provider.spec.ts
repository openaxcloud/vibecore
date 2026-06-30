import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The owner-scoping lives in the API service (resolveConnectorToken forwards the
 * session cookie); here we mock it to test the route's provider whitelist + proxy.
 */
const resolveMock = vi.fn();
vi.mock('~/lib/connectors/connector-token.server', () => ({
  resolveConnectorToken: (...args: unknown[]) => resolveMock(...args),
}));

import { loader } from './api.connector-token.$provider';

function call(provider: string) {
  return loader({
    request: new Request(`http://localhost/api/connector-token/${provider}`),
    params: { provider },
    context: {} as never,
  }) as Promise<Response>;
}

describe('api.connector-token loader (cross-device hydration source)', () => {
  beforeEach(() => resolveMock.mockReset());

  it('returns the server (UserConnection) token for an allowed deploy connector', async () => {
    resolveMock.mockResolvedValue('server-token');

    const res = await call('netlify');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: 'netlify', token: 'server-token' });
    expect(resolveMock).toHaveBeenCalledTimes(1);
  });

  it('returns token:null when the user has no active connection', async () => {
    resolveMock.mockResolvedValue(null);

    const res = await call('supabase');
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBeNull();
  });

  it('refuses a non-deploy / git provider (github) with 400 and never reads a token', async () => {
    const res = await call('github');
    expect(res.status).toBe(400);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
