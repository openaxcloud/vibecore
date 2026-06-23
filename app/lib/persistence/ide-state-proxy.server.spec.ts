import { afterEach, describe, expect, it, vi } from 'vitest';
import { forwardIdeStatePut } from './ide-state-proxy.server';

/*
 * Mock the api-base/session helpers at the module boundary so the proxy can be
 * exercised without a live backend. `fetch` is stubbed per-test to return the
 * upstream response we want to assert is forwarded verbatim.
 */
vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiBaseUrl: () => 'http://api.test',
    readSessionToken: (request: Request) =>
      request.headers.get('cookie')?.includes('vc_session=tok') ? 'tok' : undefined,
  };
});

function putRequest(init?: { ifMatch?: string; cookie?: string; body?: string }): Request {
  const headers = new Headers();

  if (init?.ifMatch) {
    headers.set('if-match', init.ifMatch);
  }

  if (init?.cookie) {
    headers.set('cookie', init.cookie);
  }

  return new Request('https://app.test/api/projects/p1/ide-state', {
    method: 'PUT',
    headers,
    body: init?.body ?? JSON.stringify({ state: { ui: { panel: 'left' } } }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('forwardIdeStatePut', () => {
  it('preserves the 412 status, the full ideState body, and the etag header (optimistic concurrency)', async () => {
    const upstreamBody = JSON.stringify({
      error: 'IDE state was modified by another session',
      code: 'IDE_STATE_PRECONDITION_FAILED',
      ideState: { version: 7, state: { ui: { panel: 'right' } } },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(upstreamBody, {
            status: 412,
            headers: { 'content-type': 'application/json', etag: '"7"' },
          }),
      ),
    );

    const response = await forwardIdeStatePut(putRequest({ ifMatch: '"3"' }), '/projects/p1/ide-state');

    expect(response.status).toBe(412);
    expect(response.headers.get('etag')).toBe('"7"');

    const body = (await response.json()) as { code?: string; ideState?: { version?: number; state?: unknown } };
    expect(body.code).toBe('IDE_STATE_PRECONDITION_FAILED');
    expect(body.ideState?.version).toBe(7);
    expect(body.ideState?.state).toEqual({ ui: { panel: 'right' } });
  });

  it('forwards the If-Match header and the bearer token to the upstream API', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ ideState: { version: 4 } }), {
          status: 200,
          headers: { 'content-type': 'application/json', etag: '"4"' },
        }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const response = await forwardIdeStatePut(
      putRequest({ ifMatch: '"3"', cookie: 'vc_session=tok' }),
      '/projects/p1/ide-state',
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/projects/p1/ide-state');
    expect(init.method).toBe('PUT');

    const sentHeaders = new Headers(init.headers);
    expect(sentHeaders.get('if-match')).toBe('"3"');
    expect(sentHeaders.get('authorization')).toBe('Bearer tok');

    // success etag is forwarded so the client can track the bumped version
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"4"');
  });

  it('omits If-Match when the client did not send one', async () => {
    const fetchSpy = vi.fn(
      async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await forwardIdeStatePut(putRequest({}), '/projects/p1/ide-state');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has('if-match')).toBe(false);
  });
});
