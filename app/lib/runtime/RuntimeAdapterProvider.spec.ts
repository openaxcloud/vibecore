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

      // AUDX-004: the mint URL now carries ?projectId=… , so match on the path.
      if (url.includes('/api/runtime-token')) {
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

/*
 * AUDX-004 — the browser must never receive the session token.
 *
 * /api/runtime-token used to return `readSessionToken(request)` verbatim: the
 * httpOnly session cookie value, handed to JavaScript. These guard the client
 * half of the replacement.
 */
describe('AUDX-004 runtime ticket resolution', () => {
  beforeEach(() => {
    invalidateRuntimeToken();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    invalidateRuntimeToken();
  });

  /*
   * MECHANISM 1: no localStorage override. A `runtime-auth-token` entry used to
   * short-circuit the resolver entirely — localStorage is readable by any script
   * on the origin, so it is the one place a runtime credential must never live.
   */
  it('ignores a runtime-auth-token planted in localStorage', async () => {
    localStorage.setItem('runtime-auth-token', 'attacker-planted-token');

    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes('/api/runtime-token')) {
          return new Response(JSON.stringify({ token: 'vcrt_server-minted' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        seen.push(new Headers(init?.headers).get('authorization') ?? '');

        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );

    const adapter = createRuntimeAdapter('remote-kubernetes', { projectId: 'project-1', workspaceId: 'ws-1' });
    await adapter.listFiles('ws-1');

    expect(seen).not.toContain('Bearer attacker-planted-token');
    expect(seen.some((value) => value.includes('vcrt_server-minted'))).toBe(true);
  });

  /*
   * MECHANISM 2: the mint request must name the project, or the server cannot
   * scope the ticket and fails closed.
   */
  it('asks for a ticket scoped to the current project', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);

        if (url.includes('/api/runtime-token')) {
          return new Response(JSON.stringify({ token: 'vcrt_scoped' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );

    const adapter = createRuntimeAdapter('remote-kubernetes', { projectId: 'project-42', workspaceId: 'ws-1' });
    await adapter.listFiles('ws-1');

    expect(urls.some((url) => url.includes('/api/runtime-token?projectId=project-42'))).toBe(true);
  });

  /*
   * MECHANISM 3: one cache slot per project. A single shared slot would hand
   * project B the ticket minted for project A — which the API rejects on scope,
   * turning a stale cache into a hard 401 loop.
   */
  it('does not reuse one project ticket for another project', async () => {
    const minted: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/runtime-token')) {
          const projectId = new URL(url, 'http://local').searchParams.get('projectId') ?? '';
          minted.push(projectId);

          return new Response(JSON.stringify({ token: `vcrt_${projectId}` }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );

    await createRuntimeAdapter('remote-kubernetes', { projectId: 'project-a', workspaceId: 'ws-a' }).listFiles('ws-a');
    await createRuntimeAdapter('remote-kubernetes', { projectId: 'project-b', workspaceId: 'ws-b' }).listFiles('ws-b');

    expect(minted).toEqual(['project-a', 'project-b']);
  });
});
