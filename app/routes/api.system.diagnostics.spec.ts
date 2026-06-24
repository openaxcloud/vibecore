import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/*
 * The diagnostics loader makes outbound network calls (api.github.com/zen,
 * api.netlify.com) on every hit and echoes caller headers back. Left anonymous
 * it is a cheap DoS/amplification vector. It must require an authenticated web
 * session BEFORE any outbound probe — an anonymous caller must get the auth
 * Response (401/503) and never trigger a single fetch().
 *
 * We mock requireWebSession and global.fetch so the test stays pure (no real
 * network) and can assert the short-circuit ordering precisely.
 */
const requireWebSession = vi.fn<(request: Request) => Promise<string>>();

vi.mock('~/lib/.server/require-session', () => ({
  requireWebSession: (request: Request) => requireWebSession(request),
}));

import { loader } from './api.system.diagnostics';

const makeArgs = (method: string) => {
  const request = new Request('http://localhost/api/system/diagnostics', { method });

  return { request, params: {}, context: {} } as any;
};

describe('api.system.diagnostics route auth gate', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    requireWebSession.mockReset();
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('"diagnostic zen"', { status: 200, statusText: 'OK' }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the auth Response and never fires outbound probes for unauthenticated callers', async () => {
    const unauthorized = new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
    requireWebSession.mockRejectedValueOnce(unauthorized);

    const response = await loader(makeArgs('GET'));

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();

    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('Authentication required');
  });

  it('propagates a 503 when session verification is unavailable, without any outbound probe', async () => {
    const unavailable = new Response(JSON.stringify({ error: 'Authentication unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
    requireWebSession.mockRejectedValueOnce(unavailable);

    const response = await loader(makeArgs('GET'));

    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects disallowed HTTP methods before any auth or outbound work', async () => {
    const response = await loader(makeArgs('DELETE'));

    expect(response.status).toBe(405);
    expect(requireWebSession).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('runs the connectivity probes for an authenticated caller', async () => {
    requireWebSession.mockResolvedValueOnce('session-token');

    const response = await loader(makeArgs('GET'));

    expect(requireWebSession).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);

    // Both the GitHub and Netlify probes run only after the session check passes.
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const body = (await response.json()) as {
      status: string;
      externalApis: { github: { isReachable: boolean }; netlify: { isReachable: boolean } };
    };
    expect(body.status).toBe('success');
    expect(body.externalApis.github.isReachable).toBe(true);
    expect(body.externalApis.netlify.isReachable).toBe(true);
  });
});
