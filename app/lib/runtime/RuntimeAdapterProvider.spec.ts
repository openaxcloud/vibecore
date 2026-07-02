/**
 * @vitest-environment jsdom
 *
 * Guards that the PRODUCTION runtime adapter factory wires the token self-heal.
 * The adapter's refresh-on-401 logic is unit-tested in @vibecore/runtime-remote,
 * but it is dead unless createRuntimeAdapter() actually passes invalidateAuthToken.
 * It historically did not, so a runtime token the API rejected before its
 * client-side expiry (session rotation, an api pod restart on deploy) was replayed
 * dead on every request/reconnect — the auth-failure storm on the runtime sockets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the (browser-only, heavy) WebContainer adapter out of the test module graph.
vi.mock('~/lib/webcontainer', () => ({ webcontainerRuntimeAdapter: { mode: 'webcontainer' } }));

import { createRuntimeAdapter, invalidateRuntimeToken } from './RuntimeAdapterProvider';

describe('createRuntimeAdapter(remote-kubernetes)', () => {
  beforeEach(() => {
    invalidateRuntimeToken();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    invalidateRuntimeToken();
  });

  it('self-heals a 401 by invalidating the cached runtime token and re-minting it from /api/runtime-token', async () => {
    let tokenMints = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/runtime-token')) {
        tokenMints += 1;

        return new Response(JSON.stringify({ token: `session-token-${tokenMints}` }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.includes('/workspaces/ws-1/status')) {
        /*
         * The first status call carries the initial (now "rejected") token and
         * 401s. Only the self-heal — invalidate + re-mint + retry — recovers it;
         * without invalidateAuthToken wired the adapter would throw here.
         */
        const auth = new Headers(init?.headers).get('authorization');

        if (auth === 'Bearer session-token-1') {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        return new Response(
          JSON.stringify({
            id: 'ws-1',
            status: 'running',
            runtimeMode: 'remote-kubernetes',
            workdir: '/home/project',
            createdAt: '',
            updatedAt: '',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    vi.stubGlobal('fetch', fetchMock);

    const adapter = createRuntimeAdapter('remote-kubernetes', { workspaceId: 'ws-1' });
    const status = await adapter.getWorkspaceStatus('ws-1');

    expect(status.status).toBe('running');

    // Two mints prove the self-heal fired: the initial token + one fresh refresh after the 401.
    expect(tokenMints).toBe(2);
  });
});
