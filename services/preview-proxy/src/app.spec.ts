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

  it('refuses production boot when the default resolver has no manager URL or shared secret', async () => {
    await expect(buildPreviewProxyApp({ isProduction: true, proxySharedSecret: 'preview-secret' })).rejects.toThrow(
      /WORKSPACE_MANAGER_URL is required/,
    );

    await expect(
      buildPreviewProxyApp({
        isProduction: true,
        workspaceManagerUrl: 'https://workspace-manager.example.com',
      }),
    ).rejects.toThrow(/PREVIEW_PROXY_SHARED_SECRET is required/);

    await expect(
      buildPreviewProxyApp({
        isProduction: true,
        workspaceManagerUrl: 'http://127.0.0.1:3010',
        proxySharedSecret: 'preview-secret',
      }),
    ).rejects.toThrow(/WORKSPACE_MANAGER_URL must use HTTPS or an internal Kubernetes service DNS URL/);
  });

  it('boots in production with an internal workspace-manager service URL and shared secret', async () => {
    const app = await buildPreviewProxyApp({
      isProduction: true,
      workspaceManagerUrl: 'http://workspace-manager.vibecore.svc:3010',
      proxySharedSecret: 'preview-secret',
    });

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
      proxySharedSecret: 'preview-secret\n',
    });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/' });

    expect(response.statusCode).toBe(200);
    expect(calls[0].url.toString()).toBe('http://workspace-manager.test/internal/workspaces/ws_1/agent');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer preview-secret');
    expect(calls[1].url.toString()).toBe('http://workspace-agent.test/preview/4173/');

    await app.close();
  });

  it('forwards root preview requests without requiring a trailing slash', async () => {
    const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('root preview', { status: 200 }));
    const app = await buildPreviewProxyApp({
      fetchImpl,
      resolveAgent: async () => fakeAgent,
    });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('root preview');
    expect(calls[0].url.toString()).toBe('http://workspace-agent.test/preview/4173/');

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

  it('serves the inspect-to-code bridge script', async () => {
    const app = await buildPreviewProxyApp();
    const response = await app.inject({ method: 'GET', url: '/__vibecore/inspector-script.js' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/javascript');
    expect(response.body).toContain('INSPECTOR_READY');
    await app.close();
  });

  it('injects the inspector bridge into proxied HTML before </head>', async () => {
    const html = '<!doctype html><html><head><title>App</title></head><body><h1>Hi</h1></body></html>';
    const { fn: fetchImpl } = recordingFetch(
      async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    );
    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('src="/__vibecore/inspector-script.js"');
    expect(response.body).toContain('data-vibecore-inspector');
    expect(response.body).toMatch(/<script[^>]*data-vibecore-inspector[^>]*><\/script><\/head>/);
    expect(response.body).toContain('<h1>Hi</h1>');
    expect(Number(response.headers['content-length'])).toBe(Buffer.byteLength(response.body));
    await app.close();
  });

  it('does not inject into non-HTML responses', async () => {
    const { fn: fetchImpl } = recordingFetch(
      async () => new Response('body { color: red }', { status: 200, headers: { 'content-type': 'text/css' } }),
    );
    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/app.css' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('body { color: red }');
    await app.close();
  });

  it('honors injectInspector:false', async () => {
    const html = '<html><head></head><body></body></html>';
    const { fn: fetchImpl } = recordingFetch(
      async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const app = await buildPreviewProxyApp({
      fetchImpl,
      resolveAgent: async () => fakeAgent,
      injectInspector: false,
    });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/' });

    expect(response.body).toBe(html);
    expect(response.body).not.toContain('inspector-script.js');
    await app.close();
  });

  describe('host-based preview routing', () => {
    const previewDomain = 'preview.e-code.ai';
    const host = (port: number, ws = 'ws-81ab929b9800a908') => `${ws}-${port}.${previewDomain}`;

    it('serves root-relative asset requests at the host root (workspace+port from the Host)', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(
        async () => new Response('console.log(1)', { status: 200, headers: { 'content-type': 'application/javascript' } }),
      );
      const app = await buildPreviewProxyApp({ fetchImpl, previewDomain, resolveAgent: async () => fakeAgent });

      const response = await app.inject({ method: 'GET', url: '/main.js', headers: { host: host(5173) } });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('console.log(1)');
      expect(calls[0].url.toString()).toBe('http://workspace-agent.test/preview/5173/main.js');
      await app.close();
    });

    it('serves the host root itself (empty subpath) to the dev server root', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('<html></html>', { status: 200 }));
      const app = await buildPreviewProxyApp({ fetchImpl, previewDomain, resolveAgent: async () => fakeAgent });

      const response = await app.inject({ method: 'GET', url: '/', headers: { host: host(3000) } });

      expect(response.statusCode).toBe(200);
      expect(calls[0].url.toString()).toBe('http://workspace-agent.test/preview/3000/');
      await app.close();
    });

    it('strips a self-referential /p/<ws>/<port> prefix (path-based iframe URL on a preview host)', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('ok', { status: 200 }));
      const app = await buildPreviewProxyApp({ fetchImpl, previewDomain, resolveAgent: async () => fakeAgent });

      const response = await app.inject({
        method: 'GET',
        url: '/p/ws-81ab929b9800a908/5173/',
        headers: { host: host(5173) },
      });

      expect(response.statusCode).toBe(200);
      expect(calls[0].url.toString()).toBe('http://workspace-agent.test/preview/5173/');
      await app.close();
    });

    it('forwards a DIFFERENT /p/<a>/<b> path verbatim as an app route (no self-prefix collision)', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('app route', { status: 200 }));
      const app = await buildPreviewProxyApp({ fetchImpl, previewDomain, resolveAgent: async () => fakeAgent });

      const response = await app.inject({
        method: 'GET',
        url: '/p/products/8080',
        headers: { host: host(5173) },
      });

      expect(response.statusCode).toBe(200);
      expect(calls[0].url.toString()).toBe('http://workspace-agent.test/preview/5173/p/products/8080');
      await app.close();
    });

    it('exempts /health and the inspector script from host proxying', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('SHOULD NOT FORWARD', { status: 200 }));
      const app = await buildPreviewProxyApp({ fetchImpl, previewDomain, resolveAgent: async () => fakeAgent });

      const health = await app.inject({ method: 'GET', url: '/health', headers: { host: host(5173) } });
      expect(health.json()).toEqual({ status: 'ok', service: 'preview-proxy' });

      const inspector = await app.inject({
        method: 'GET',
        url: '/__vibecore/inspector-script.js',
        headers: { host: host(5173) },
      });
      expect(inspector.statusCode).toBe(200);
      expect(inspector.headers['content-type']).toContain('application/javascript');

      expect(calls).toHaveLength(0); // neither was forwarded upstream
      await app.close();
    });

    it('ignores non-preview hosts (falls through to path-based routing)', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('nope', { status: 200 }));
      const app = await buildPreviewProxyApp({ fetchImpl, previewDomain, resolveAgent: async () => fakeAgent });

      // A bare /main.js on a NON-preview host has no route → Fastify 404, no upstream call.
      const response = await app.inject({ method: 'GET', url: '/main.js', headers: { host: 'app.e-code.ai' } });
      expect(response.statusCode).toBe(404);
      expect(calls).toHaveLength(0);
      await app.close();
    });
  });
});
