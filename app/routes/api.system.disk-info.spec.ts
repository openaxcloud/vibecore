import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * The route loader/action must require an authenticated web session BEFORE
 * touching getDiskInfo(), which forks a `df`/PowerShell subprocess and returns
 * the host/container filesystem topology. An anonymous caller must get the auth
 * Response (401/503) and never reach the subprocess.
 *
 * We mock the two server-only deps so the test stays pure (no real fetch, no
 * real `df`) and can assert the short-circuit ordering precisely.
 */
const requireWebSession = vi.fn<(request: Request) => Promise<string>>();
const getDiskInfo = vi.fn<() => Promise<unknown>>();

vi.mock('~/lib/.server/require-session', () => ({
  requireWebSession: (request: Request) => requireWebSession(request),
}));

vi.mock('~/lib/.server/disk-info', () => ({
  getDiskInfo: () => getDiskInfo(),
}));

import { loader, action } from './api.system.disk-info';

const makeArgs = (method: string) => {
  const request = new Request('http://localhost/api/system/disk-info', { method });

  return { request, params: {}, context: {} } as any;
};

describe('api.system.disk-info route auth gate', () => {
  beforeEach(() => {
    requireWebSession.mockReset();
    getDiskInfo.mockReset();
  });

  it('returns the auth Response and never spawns the disk subprocess for unauthenticated callers', async () => {
    const unauthorized = new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
    requireWebSession.mockRejectedValueOnce(unauthorized);

    const response = await loader(makeArgs('GET'));

    expect(response.status).toBe(401);
    expect(getDiskInfo).not.toHaveBeenCalled();

    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('Authentication required');
  });

  it('propagates a 503 when session verification is unavailable, without spawning the subprocess', async () => {
    const unavailable = new Response(JSON.stringify({ error: 'Authentication unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
    requireWebSession.mockRejectedValueOnce(unavailable);

    const response = await loader(makeArgs('GET'));

    expect(response.status).toBe(503);
    expect(getDiskInfo).not.toHaveBeenCalled();
  });

  it('returns disk info for an authenticated caller', async () => {
    requireWebSession.mockResolvedValueOnce('session-token');
    getDiskInfo.mockResolvedValueOnce([{ filesystem: '/dev/disk1s1', mountpoint: '/', size: 100 }]);

    const response = await loader(makeArgs('GET'));

    expect(requireWebSession).toHaveBeenCalledTimes(1);
    expect(getDiskInfo).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);

    const body = (await response.json()) as Array<{ filesystem: string }>;
    expect(body[0].filesystem).toBe('/dev/disk1s1');
  });

  it('rejects disallowed HTTP methods before any auth or disk work', async () => {
    const response = await loader(makeArgs('DELETE'));

    expect(response.status).toBe(405);
    expect(requireWebSession).not.toHaveBeenCalled();
    expect(getDiskInfo).not.toHaveBeenCalled();
  });

  it('action allows POST and gates on the session', async () => {
    requireWebSession.mockResolvedValueOnce('session-token');
    getDiskInfo.mockResolvedValueOnce([]);

    const response = await action(makeArgs('POST'));

    expect(response.status).toBe(200);
    expect(getDiskInfo).toHaveBeenCalledTimes(1);
  });
});
