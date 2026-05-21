import { describe, expect, it } from 'vitest';
import { buildPreviewProxyApp } from './app.js';

const fakeAgent = { baseUrl: 'http://workspace-agent.test', token: 'agent-token' };

function recordingFetch(handler: (input: URL, init: RequestInit) => Promise<Response>): {
  fn: typeof fetch;
  calls: Array<{ url: URL; init: RequestInit }>;
} {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fn = (async (input: URL | string | Request, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('preview-proxy', () => {
  it('serves /health', async () => {
    const app = await buildPreviewProxyApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json()).toEqual({ status: 'ok', service: 'preview-proxy' });
    await app.close();
  });

  it('rejects an invalid port', async () => {
    const app = await buildPreviewProxyApp({ resolveAgent: async () => fakeAgent });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/0/index.html' });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 404 when the workspace agent cannot be resolved', async () => {
    const app = await buildPreviewProxyApp({ resolveAgent: async () => undefined });
    const response = await app.inject({ method: 'GET', url: '/p/ws_unknown/3000/index.html' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('forwards GET to the workspace agent and adds auth + workspace headers', async () => {
    const { fn: fetchImpl, calls } = recordingFetch(async () =>
      new Response('hello world', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const app = await buildPreviewProxyApp({
      fetchImpl,
      resolveAgent: async () => fakeAgent,
    });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/about?lang=en' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('hello world');
    expect(calls).toHaveLength(1);
    expect(calls[0].url.toString()).toBe('http://workspace-agent.test/preview/4173/about?lang=en');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer agent-token');
    expect((calls[0].init.headers as Record<string, string>)['x-vibecore-workspace']).toBe('ws_1');
    await app.close();
  });

  it('resolves agents through workspace-manager with the preview shared secret', async () => {
    const { fn: fetchImpl, calls } = recordingFetch(async (url) => {
      if (url.pathname === '/internal/workspaces/ws_1/agent') {
        return Response.json(fakeAgent);
      }

      return new Response('preview', { status: 200 });
    });

    const app = await buildPreviewProxyApp({
      fetchImpl,
      workspaceManagerUrl: 'http://workspace-manager.test',
      proxySharedSecret: 'preview-secret',
    });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/' });

    expect(response.statusCode).toBe(200);
    expect(calls[0].url.toString()).toBe('http://workspace-manager.test/internal/workspaces/ws_1/agent');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer preview-secret');
    expect(calls[1].url.toString()).toBe('http://workspace-agent.test/preview/4173/');

    await app.close();
  });

  it('translates upstream timeout to 504', async () => {
    const fetchImpl = (async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }) as unknown as typeof fetch;
    const app = await buildPreviewProxyApp({
      fetchImpl,
      resolveAgent: async () => fakeAgent,
    });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/index.html' });
    expect(response.statusCode).toBe(504);
    await app.close();
  });

  it('translates upstream errors to 502', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const app = await buildPreviewProxyApp({
      fetchImpl,
      resolveAgent: async () => fakeAgent,
    });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/index.html' });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: 'PREVIEW_UPSTREAM_ERROR' });
    await app.close();
  });
});
