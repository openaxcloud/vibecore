import { describe, expect, it } from 'vitest';
import {
  buildPreviewProxyApp,
  computeHostPreviewSubpath,
  injectInspectorScript,
  parseServerDeployHost,
  readCookie,
  sanitizePreviewFramingHeader,
  serverDeployUpstreamUrl,
  signPreviewTenantToken,
  verifyPreviewTenantToken,
} from './app.js';

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
  it('serves an auto-refreshing HTML holding page when the dev server is unreachable (iframe document)', async () => {
    const fetchImpl = (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:4173');
    }) as unknown as typeof fetch;

    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });

    const response = await app.inject({
      method: 'GET',
      url: '/p/ws_1/4173/',
      headers: { accept: 'text/html,*/*', 'sec-fetch-dest': 'iframe' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['retry-after']).toBe('2');
    expect(response.body).toContain('Starting your app');
  });

  it('serves the holding page (not a silent blank) when the dev server answers a 0-byte 404 (index.html not yet synced)', async () => {
    // Vite serves `GET /` as a 404 with an empty body while its index.html has not
    // yet landed on disk; the port is already LISTENING so /ports reports ready.
    const fetchImpl = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });

    const response = await app.inject({
      method: 'GET',
      url: '/p/ws_1/5173/',
      headers: { accept: 'text/html,*/*', 'sec-fetch-dest': 'iframe' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['retry-after']).toBe('2');
    expect(response.body).toContain('Starting your app');
  });

  it('serves the localized holding page when the dev server is still booting (503, empty body)', async () => {
    const fetchImpl = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;

    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });

    const response = await app.inject({
      method: 'GET',
      url: '/p/ws_1/5173/',
      headers: {
        accept: 'text/html',
        'accept-language': 'fr-FR,fr;q=0.9',
        'sec-fetch-dest': 'document',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.headers.vary).toContain('Accept-Language');
    expect(response.body).toContain('<html lang="fr">');
    expect(response.body).toContain('Démarrage de votre application');
  });

  it('passes through a REAL app 404 page (text/html with a body) unchanged — never masks it', async () => {
    const fetchImpl = (async () =>
      new Response('<!doctype html><title>Not found</title><h1>404 — no such route</h1>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })) as unknown as typeof fetch;

    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });

    const response = await app.inject({
      method: 'GET',
      url: '/p/ws_1/5173/no-such-route',
      headers: { accept: 'text/html', 'sec-fetch-dest': 'document' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('404 — no such route');
  });

  it('passes through a sub-resource 404 (script/XHR) unchanged — only document navs get the holding page', async () => {
    const fetchImpl = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;

    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });

    const response = await app.inject({
      method: 'GET',
      url: '/p/ws_1/5173/assets/missing.js',
      headers: { accept: '*/*', 'sec-fetch-dest': 'script' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('Starting your app');
  });

  it('serves French holding HTML with the active lang and locale response headers', async () => {
    const fetchImpl = (async () => {
      throw new Error('raw upstream detail must stay private');
    }) as unknown as typeof fetch;
    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });

    const response = await app.inject({
      method: 'GET',
      url: '/p/ws_1/4173/',
      headers: {
        accept: 'text/html,*/*',
        'accept-language': 'fr-FR,fr;q=0.9',
        'sec-fetch-dest': 'iframe',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.headers.vary).toContain('Cookie');
    expect(response.body).toContain('<html lang="fr">');
    expect(response.body).toContain('Démarrage de votre application');
    expect(response.body).not.toContain('raw upstream detail');
    await app.close();
  });

  it('prioritizes the manual locale cookie and localizes stable JSON errors', async () => {
    const app = await buildPreviewProxyApp({ resolveAgent: async () => undefined });

    const frenchResponse = await app.inject({
      method: 'GET',
      url: '/p/ws_1/4173/assets/main.js',
      headers: { cookie: 'vibecore-lang=fr', 'accept-language': 'en-US' },
    });
    const englishResponse = await app.inject({
      method: 'GET',
      url: '/p/ws_1/4173/assets/main.js',
      headers: { cookie: 'vibecore-lang=en', 'accept-language': 'fr-FR' },
    });

    expect(frenchResponse.headers['content-language']).toBe('fr');
    expect(frenchResponse.json()).toEqual({
      error: 'L’aperçu de l’espace de travail est encore inaccessible. Veuillez réessayer.',
      code: 'PREVIEW_AGENT_NOT_FOUND',
    });
    expect(englishResponse.headers['content-language']).toBe('en');
    expect(englishResponse.json()).toMatchObject({ code: 'PREVIEW_AGENT_NOT_FOUND' });
    expect(englishResponse.json().error).toMatch(/^The workspace preview/);
    await app.close();
  });

  it('still returns a JSON error for asset/XHR sub-requests when the dev server is unreachable', async () => {
    const fetchImpl = (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:4173');
    }) as unknown as typeof fetch;

    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });

    const response = await app.inject({
      method: 'GET',
      url: '/p/ws_1/4173/assets/main.js',
      headers: { accept: '*/*', 'sec-fetch-dest': 'script' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('PREVIEW_UPSTREAM_ERROR');
  });

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
    const { fn: fetchImpl, calls } = recordingFetch(
      async () => new Response('hello world', { status: 200, headers: { 'content-type': 'text/plain' } }),
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

  it('serves the preview error reporter script', async () => {
    const app = await buildPreviewProxyApp();
    const response = await app.inject({ method: 'GET', url: '/__vibecore/preview-reporter.js' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/javascript');
    expect(response.body).toContain('PREVIEW_ERROR');
    expect(response.body).toContain('PREVIEW_UNHANDLED_REJECTION');
    expect(response.body).toContain("addEventListener('error'");
    expect(response.body).toContain("addEventListener('unhandledrejection'");
    await app.close();
  });

  it('injects the preview error reporter into proxied HTML so the IDE Console tab is fed in remote previews', async () => {
    const html = '<!doctype html><html><head><title>App</title></head><body><h1>Hi</h1></body></html>';

    const { fn: fetchImpl } = recordingFetch(
      async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    );

    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/' });

    expect(response.statusCode).toBe(200);

    // Both the reporter and the inspector bridge are injected, exactly once each.
    expect(response.body).toContain('src="/__vibecore/preview-reporter.js"');
    expect(response.body).toContain('data-vibecore-reporter');
    expect(response.body).toContain('src="/__vibecore/inspector-script.js"');
    expect((response.body.match(/data-vibecore-reporter/g) ?? []).length).toBe(1);
    expect(response.body).toContain('<h1>Hi</h1>');

    // content-length must match the rewritten body, not the upstream length.
    expect(Number(response.headers['content-length'])).toBe(Buffer.byteLength(response.body));
    await app.close();
  });

  it('records a blank-preview beacon (server-side trace) and returns 204', async () => {
    const app = await buildPreviewProxyApp({
      fetchImpl: async () => new Response('', { status: 200 }),
      resolveAgent: async () => fakeAgent,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/__vibecore/preview-blank',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ url: 'https://ws-x-5173.preview.e-code.ai/', ts: 1 }),
    });

    expect(response.statusCode).toBe(204);
    await app.close();
  });

  it("BLOCKER #5: relays a failed-asset 'error' beacon to the api readiness endpoint", async () => {
    const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('', { status: 204 }));

    const app = await buildPreviewProxyApp({
      fetchImpl,
      resolveAgent: async () => fakeAgent,
      previewDomain: 'preview.e-code.ai',
      apiBaseUrl: 'http://api.local',
      proxySharedSecret: 'preview-secret',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/__vibecore/preview-blank',
      headers: { 'content-type': 'application/json', host: 'ws-abc-5173.preview.e-code.ai' },
      payload: JSON.stringify({
        url: 'https://ws-abc-5173.preview.e-code.ai/',
        ts: 1,
        status: 'error',
        detail: 'Failed to load stylesheet: /assets/index.css',
      }),
    });

    expect(response.statusCode).toBe(204);

    const relay = calls.find((c) => c.url.pathname === '/internal/preview/beacon');
    expect(relay).toBeDefined();
    const relayed = JSON.parse(String(relay!.init.body));
    expect(relayed).toMatchObject({ workspaceId: 'ws-abc', port: 5173, status: 'error' });
    expect(relayed.detail).toContain('stylesheet');
    await app.close();
  });

  it("BLOCKER #5: a body without status defaults to 'blank' (back-compat with older reporters)", async () => {
    const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('', { status: 204 }));

    const app = await buildPreviewProxyApp({
      fetchImpl,
      resolveAgent: async () => fakeAgent,
      previewDomain: 'preview.e-code.ai',
      apiBaseUrl: 'http://api.local',
      proxySharedSecret: 'preview-secret',
    });

    await app.inject({
      method: 'POST',
      url: '/__vibecore/preview-blank',
      headers: { 'content-type': 'application/json', host: 'ws-abc-5173.preview.e-code.ai' },
      payload: JSON.stringify({ url: 'https://ws-abc-5173.preview.e-code.ai/', ts: 1 }),
    });

    const relay = calls.find((c) => c.url.pathname === '/internal/preview/beacon');
    expect(JSON.parse(String(relay!.init.body))).toMatchObject({ status: 'blank' });
    await app.close();
  });

  it('REGRESSION: injecting the reporter/inspector NEVER strips the app entry script (blank-preview guard)', () => {
    const withEntry =
      '<!doctype html><html><head><title>App</title></head>' +
      '<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';

    const out = injectInspectorScript(withEntry);

    // Our injections landed (before </head>)…
    expect(out).toContain('src="/__vibecore/preview-reporter.js"');
    expect(out).toContain('src="/__vibecore/inspector-script.js"');

    // …and the app entry survives, exactly once (structurally: our tags go in <head>, the entry in <body>).
    expect((out.match(/src="\/src\/main\.tsx"/g) ?? []).length).toBe(1);
    expect(out).toContain('<div id="root">');
  });

  it('does not double-inject the reporter when the page already self-hosts it', async () => {
    const html = '<html><head><script src="/x" data-vibecore-reporter></script></head><body></body></html>';

    const { fn: fetchImpl } = recordingFetch(
      async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    );

    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });
    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/' });

    expect((response.body.match(/data-vibecore-reporter/g) ?? []).length).toBe(1);
    expect(response.body).not.toContain('src="/__vibecore/preview-reporter.js"');
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

  it('sets CORP and COEP so the COEP-isolated IDE can embed the preview iframe', async () => {
    const { fn: fetchImpl } = recordingFetch(async () => new Response('preview', { status: 200 }));
    const app = await buildPreviewProxyApp({ fetchImpl, resolveAgent: async () => fakeAgent });

    const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');

    /*
     * The embedder sends COEP: credentialless; a cross-origin iframe DOCUMENT is
     * blocked (ERR_BLOCKED_BY_RESPONSE) unless it carries its own compatible
     * COEP — CORP alone is not enough for the nested document.
     */
    expect(response.headers['cross-origin-embedder-policy']).toBe('credentialless');

    // also on health, so probes/embeds are never blocked
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(health.headers['cross-origin-embedder-policy']).toBe('credentialless');
    await app.close();
  });

  describe('host-based preview routing', () => {
    const previewDomain = 'preview.e-code.ai';
    const host = (port: number, ws = 'ws-81ab929b9800a908') => `${ws}-${port}.${previewDomain}`;

    it('serves root-relative asset requests at the host root (workspace+port from the Host)', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(
        async () =>
          new Response('console.log(1)', { status: 200, headers: { 'content-type': 'application/javascript' } }),
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

    it('rejects encoded-slash (%2f) dot-segment traversal instead of forwarding it upstream', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('SHOULD NOT FORWARD', { status: 200 }));
      const app = await buildPreviewProxyApp({ fetchImpl, previewDomain, resolveAgent: async () => fakeAgent });

      const response = await app.inject({
        method: 'POST',
        url: '/..%2f..%2fcommands/run',
        headers: { host: host(5173) },
      });

      // Decoded + normalized, the path escapes /preview/5173/ → rejected, never forwarded.
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'PREVIEW_PATH_INVALID' });
      expect(calls).toHaveLength(0);
      await app.close();
    });
  });

  describe('computeHostPreviewSubpath', () => {
    const ws = 'ws-81ab929b9800a908';

    it('decodes encoded slashes so dot-segments normalize like the path-based route', () => {
      expect(computeHostPreviewSubpath('/..%2f..%2fcommands/run', ws, '5173')).toBe('../../commands/run');
    });

    it('strips a self-referential /p/<ws>/<port> prefix', () => {
      expect(computeHostPreviewSubpath(`/p/${ws}/5173/assets/app.js`, ws, '5173')).toBe('assets/app.js');
      expect(computeHostPreviewSubpath(`/p/${ws}/5173`, ws, '5173')).toBe('');
    });

    it('forwards a different /p/<a>/<b> route verbatim (no self-prefix collision)', () => {
      expect(computeHostPreviewSubpath('/p/products/8080', ws, '5173')).toBe('p/products/8080');
    });

    it('falls back to the raw value on a malformed percent-escape', () => {
      expect(computeHostPreviewSubpath('/bad%path', ws, '5173')).toBe('bad%path');
    });
  });

  describe('per-tenant authorization (vc_preview)', () => {
    const secret = 'tenant-secret';

    it('readCookie extracts a named cookie and tolerates absence/garbage', () => {
      expect(readCookie('a=1; vc_preview=tok; b=2', 'vc_preview')).toBe('tok');
      expect(readCookie('vc_preview=tok', 'vc_preview')).toBe('tok');
      expect(readCookie(undefined, 'vc_preview')).toBeUndefined();
      expect(readCookie('a=1; b=2', 'vc_preview')).toBeUndefined();
      expect(readCookie('; ;; junk', 'vc_preview')).toBeUndefined();
    });

    it('sign/verify round-trips an orgId and rejects tampering/expiry', () => {
      const now = 1_000_000;
      const token = signPreviewTenantToken('org_1', now + 60_000, secret);

      expect(verifyPreviewTenantToken(token, secret, now)).toBe('org_1');

      // expired
      expect(verifyPreviewTenantToken(token, secret, now + 120_000)).toBeUndefined();

      // wrong secret
      expect(verifyPreviewTenantToken(token, 'other', now)).toBeUndefined();

      // tampered signature
      expect(verifyPreviewTenantToken(`${token}x`, secret, now)).toBeUndefined();

      // malformed
      expect(verifyPreviewTenantToken('not-a-token', secret, now)).toBeUndefined();
      expect(verifyPreviewTenantToken(undefined, secret, now)).toBeUndefined();
      expect(verifyPreviewTenantToken(token, undefined, now)).toBeUndefined();
    });

    it('throws on boot when enforcement is on but no tenant secret is set', async () => {
      await expect(buildPreviewProxyApp({ enforceTenant: true, resolveAgent: async () => fakeAgent })).rejects.toThrow(
        /PREVIEW_TENANT_SECRET is required/,
      );
    });

    it('403s a preview request with no vc_preview cookie when enforcement is on', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(async () => new Response('hi', { status: 200 }));
      const app = await buildPreviewProxyApp({ enforceTenant: true, tenantSecret: secret, fetchImpl });

      const response = await app.inject({ method: 'GET', url: '/p/ws_1/3000/index.html' });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('PREVIEW_TENANT_FORBIDDEN');
      expect(calls).toHaveLength(0); // never resolved the agent
      await app.close();
    });

    it('403s a preview request with an expired/forged cookie when enforcement is on', async () => {
      const app = await buildPreviewProxyApp({
        enforceTenant: true,
        tenantSecret: secret,
        resolveAgent: async () => fakeAgent,
      });

      const expired = signPreviewTenantToken('org_1', Date.now() - 1000, secret);

      const response = await app.inject({
        method: 'GET',
        url: '/p/ws_1/3000/index.html',
        headers: { cookie: `vc_preview=${expired}` },
      });
      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('forwards the verified orgId to the resolver and proxies when the cookie is valid', async () => {
      const seen: Array<string | undefined> = [];

      const app = await buildPreviewProxyApp({
        enforceTenant: true,
        tenantSecret: secret,
        resolveAgent: async (_workspaceId, orgId) => {
          seen.push(orgId);

          return fakeAgent;
        },
        fetchImpl: recordingFetch(async () => new Response('ok', { status: 200 })).fn,
      });

      const token = signPreviewTenantToken('org_42', Date.now() + 60_000, secret);

      const response = await app.inject({
        method: 'GET',
        url: '/p/ws_1/3000/index.html',
        headers: { cookie: `vc_preview=${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(seen).toEqual(['org_42']);
      await app.close();
    });

    it('default resolver forwards orgId as a query param to workspace-manager', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(
        async () =>
          new Response(JSON.stringify(fakeAgent), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      const app = await buildPreviewProxyApp({
        enforceTenant: true,
        tenantSecret: secret,
        workspaceManagerUrl: 'http://workspace-manager.test',
        proxySharedSecret: 'preview-secret',
        fetchImpl,
      });

      const token = signPreviewTenantToken('org_99', Date.now() + 60_000, secret);
      await app.inject({ method: 'GET', url: '/p/ws_1/3000/index.html', headers: { cookie: `vc_preview=${token}` } });

      const agentCall = calls.find((c) => c.url.pathname.endsWith('/agent'));
      expect(agentCall?.url.searchParams.get('orgId')).toBe('org_99');
      await app.close();
    });

    it('leaves behaviour unchanged when enforcement is off (no cookie required)', async () => {
      const app = await buildPreviewProxyApp({
        tenantSecret: secret,
        resolveAgent: async () => fakeAgent,
        fetchImpl: recordingFetch(async () => new Response('ok', { status: 200 })).fn,
      });

      const response = await app.inject({ method: 'GET', url: '/p/ws_1/3000/index.html' });
      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('sets Referrer-Policy: no-referrer on proxied responses', async () => {
      const app = await buildPreviewProxyApp({
        resolveAgent: async () => fakeAgent,
        fetchImpl: recordingFetch(async () => new Response('ok', { status: 200 })).fn,
      });

      const response = await app.inject({ method: 'GET', url: '/p/ws_1/3000/index.html' });
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      await app.close();
    });
  });

  describe('private-port enforcement', () => {
    const privateOpts = {
      enforcePrivatePorts: true,
      apiBaseUrl: 'http://api.test',
      proxySharedSecret: 'preview-secret',
      tenantSecret: 'tenant-secret',
    } as const;

    /*
     * fetchImpl that answers the port-access lookup, else behaves as an
     * unreachable dev server (so a request that PASSES the gate yields 503, not 401).
     */
    const fetchFor = (isPrivate: boolean) =>
      (async (input: URL | string | Request) => {
        const url = String(input instanceof URL ? input.href : input);

        if (url.includes('/internal/preview/port-access')) {
          return new Response(JSON.stringify({ private: isPrivate }), {
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error('connect ECONNREFUSED dev-server');
      }) as unknown as typeof fetch;

    it('returns 401 for a private port with no preview session cookie', async () => {
      const app = await buildPreviewProxyApp({
        ...privateOpts,
        fetchImpl: fetchFor(true),
        resolveAgent: async () => fakeAgent,
      });

      const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/', headers: { accept: 'text/html' } });

      expect(response.statusCode).toBe(401);
      expect(response.body).toContain('private');
      await app.close();
    });

    it('allows a private port when a valid vc_preview session cookie is present', async () => {
      const token = signPreviewTenantToken('org_1', Date.now() + 60_000, 'tenant-secret');

      const app = await buildPreviewProxyApp({
        ...privateOpts,
        fetchImpl: fetchFor(true),
        resolveAgent: async () => fakeAgent,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/p/ws_1/4173/',
        headers: { accept: 'text/html', cookie: `vc_preview=${token}` },
      });

      // Passes the gate -> reaches the (unreachable) dev server -> 503 holding page, not 401.
      expect(response.statusCode).not.toBe(401);
      await app.close();
    });

    it('does not gate a public port (no session required)', async () => {
      const app = await buildPreviewProxyApp({
        ...privateOpts,
        fetchImpl: fetchFor(false),
        resolveAgent: async () => fakeAgent,
      });

      const response = await app.inject({ method: 'GET', url: '/p/ws_1/4173/', headers: { accept: 'text/html' } });

      expect(response.statusCode).not.toBe(401);
      await app.close();
    });
  });

  describe('server deployments (Replit-parity durable runtime)', () => {
    it('parseServerDeployHost extracts the deployment id from a `d-<id>` host', () => {
      expect(parseServerDeployHost('d-clr8x9abc123.preview.e-code.ai', 'preview.e-code.ai')).toEqual({
        deploymentId: 'clr8x9abc123',
      });
    });

    it('parseServerDeployHost rejects a preview host and a bare/foreign host (no collision)', () => {
      // A per-preview host `<ws>-<port>` is NOT a deploy host.
      expect(parseServerDeployHost('ws-abc-5173.preview.e-code.ai', 'preview.e-code.ai')).toBeNull();

      // Wrong domain, nested label, and missing prefix all reject.
      expect(parseServerDeployHost('d-abc123.evil.com', 'preview.e-code.ai')).toBeNull();
      expect(parseServerDeployHost('x.d-abc123.preview.e-code.ai', 'preview.e-code.ai')).toBeNull();
      expect(parseServerDeployHost('abc123.preview.e-code.ai', 'preview.e-code.ai')).toBeNull();
    });

    it('serverDeployUpstreamUrl substitutes the id and rejects a non-http template', () => {
      expect(serverDeployUpstreamUrl('dep1', 'http://app-{deploymentId}.workspaces.svc.cluster.local')).toBe(
        'http://app-dep1.workspaces.svc.cluster.local',
      );
      expect(serverDeployUpstreamUrl('dep1', 'file:///etc/passwd')).toBeNull();
    });

    it('forwards a deploy host straight to the `app-<id>` Service (no agent token, no gates)', async () => {
      const { fn: fetchImpl, calls } = recordingFetch(
        async () => new Response('hello from the deployed server', { status: 200 }),
      );

      const app = await buildPreviewProxyApp({
        fetchImpl,
        previewDomain: 'preview.e-code.ai',

        // resolveAgent must NEVER be consulted for a deploy host.
        resolveAgent: async () => {
          throw new Error('resolveAgent should not be called for a server deploy host');
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/health?x=1',
        headers: { host: 'd-clr8x9abc123.preview.e-code.ai' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('hello from the deployed server');

      // Path + query forwarded verbatim to the deployment's Service (no /preview/ prefix, no token).
      expect(calls[0].url.href).toBe('http://app-clr8x9abc123.workspaces.svc.cluster.local/api/health?x=1');
      expect((calls[0].init.headers as Record<string, string>)?.authorization).toBeUndefined();

      await app.close();
    });

    it('serves the starting/holding page when the deploy Service is unreachable (document nav)', async () => {
      const fetchImpl = (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;

      const app = await buildPreviewProxyApp({ fetchImpl, previewDomain: 'preview.e-code.ai' });

      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: { host: 'd-clr8x9abc123.preview.e-code.ai', accept: 'text/html' },
      });

      expect(response.statusCode).toBe(503);
      expect(response.body).toContain('Starting your app');

      await app.close();
    });

    it('wakes a scaled-to-zero deploy (activate via manager) and retries the forward → 200', async () => {
      const seen: string[] = [];
      let upstreamHits = 0;

      const fetchImpl = (async (url: any, init: any) => {
        const href = typeof url === 'string' ? url : (url.href ?? url.toString());
        seen.push(href);

        // The manager activate call: report the deployment woke up.
        if (href.includes('/server-deployments/') && href.endsWith('/activate')) {
          expect(init.method).toBe('POST');
          return new Response(JSON.stringify({ ready: true, readyReplicas: 1, wokeUp: true }), { status: 200 });
        }

        // Upstream app: asleep on the first hit (refused), serving after the wake.
        if (href.includes('app-clr8x9abc123')) {
          upstreamHits += 1;

          if (upstreamHits === 1) {
            throw new Error('ECONNREFUSED');
          }

          return new Response('awake and serving', { status: 200 });
        }

        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;

      const app = await buildPreviewProxyApp({
        fetchImpl,
        previewDomain: 'preview.e-code.ai',
        serverDeployManagerUrl: 'http://workspace-manager.test',
        serverDeployManagerSecret: 'mgr-secret',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: { host: 'd-clr8x9abc123.preview.e-code.ai', accept: 'text/html' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('awake and serving');
      // The manager was asked to wake it, and the upstream was hit twice (fail → retry).
      expect(seen.some((u) => u.endsWith('/server-deployments/clr8x9abc123/activate'))).toBe(true);
      expect(upstreamHits).toBe(2);

      await app.close();
    });

    it('serves a non-refreshing billing page and never retries a suspended Reserved VM upstream', async () => {
      let activateCalls = 0;
      let upstreamHits = 0;
      const fetchImpl = (async (url: any) => {
        const href = typeof url === 'string' ? url : (url.href ?? url.toString());

        if (href.endsWith('/activate')) {
          activateCalls += 1;
          return new Response(JSON.stringify({ error: 'RESERVED_VM_SUSPENDED', code: 'RESERVED_VM_SUSPENDED' }), {
            status: 402,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (href.includes('app-clr8x9abc123')) {
          upstreamHits += 1;
          throw new Error('ECONNREFUSED');
        }

        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;
      const app = await buildPreviewProxyApp({
        fetchImpl,
        previewDomain: 'preview.e-code.ai',
        serverDeployManagerUrl: 'http://workspace-manager.test',
      });

      for (const language of ['en', 'fr']) {
        const response = await app.inject({
          method: 'GET',
          url: '/',
          headers: {
            host: 'd-clr8x9abc123.preview.e-code.ai',
            accept: 'text/html',
            'accept-language': language,
          },
        });

        expect(response.statusCode).toBe(402);
        expect(response.headers['cache-control']).toBe('private, no-store, max-age=0');
        expect(response.body).not.toContain('http-equiv="refresh"');
        expect(response.body).toContain(language === 'fr' ? 'facturation' : 'billing');
      }

      expect(activateCalls).toBe(2);
      expect(upstreamHits).toBe(2);
      await app.close();
    });

    it('does not loop: if the app is still unreachable after a wake, it serves the starting page once', async () => {
      let activateCalls = 0;
      let upstreamHits = 0;

      const fetchImpl = (async (url: any) => {
        const href = typeof url === 'string' ? url : (url.href ?? url.toString());

        if (href.endsWith('/activate')) {
          activateCalls += 1;
          return new Response(JSON.stringify({ ready: true }), { status: 200 });
        }

        if (href.includes('app-clr8x9abc123')) {
          upstreamHits += 1;
          throw new Error('ECONNREFUSED');
        }

        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;

      const app = await buildPreviewProxyApp({
        fetchImpl,
        previewDomain: 'preview.e-code.ai',
        serverDeployManagerUrl: 'http://workspace-manager.test',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: { host: 'd-clr8x9abc123.preview.e-code.ai', accept: 'text/html' },
      });

      expect(response.statusCode).toBe(503);
      expect(response.body).toContain('Starting your app');
      // Woke exactly once, hit upstream exactly twice (original + one retry) — no loop.
      expect(activateCalls).toBe(1);
      expect(upstreamHits).toBe(2);

      await app.close();
    });

    /*
     * BUG-DEPLOY-003 (proven live 2026-08-06): a crash-looping app never becomes
     * ready, so the manager's activate call hung for its full readiness poll. The
     * proxy waited it out and the browser was answered by nginx with a raw
     * `504 Gateway Time-out` at the ingress read timeout — the branded page never
     * shipped. The wake wait is now bounded well under that timeout.
     */
    it('gives up waiting on a wake that never becomes ready and serves the branded page, not a gateway error', async () => {
      let activateAborted = false;

      const fetchImpl = (async (url: any, init: any) => {
        const href = typeof url === 'string' ? url : (url.href ?? url.toString());

        if (href.endsWith('/activate')) {
          // A crash-looping app: the manager polls readiness and never answers.
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              activateAborted = true;
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          });
        }

        if (href.includes('app-clr8x9abc123')) {
          throw new Error('ECONNREFUSED');
        }

        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;

      const app = await buildPreviewProxyApp({
        fetchImpl,
        previewDomain: 'preview.e-code.ai',
        serverDeployManagerUrl: 'http://workspace-manager.test',
        serverDeployWakeWaitMs: 1_000,
      });

      const startedAt = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: { host: 'd-clr8x9abc123.preview.e-code.ai', accept: 'text/html' },
      });

      expect(response.statusCode).toBe(503);
      expect(response.body).toContain('Starting your app');
      expect(activateAborted).toBe(true);

      // Bounded by the configured wake budget, nowhere near the old 90s wait.
      expect(Date.now() - startedAt).toBeLessThan(10_000);

      await app.close();
    });

    /*
     * An app that accepts the connection but never responds looked identical to a
     * gateway failure: the abort short-circuited to a bare JSON 504 that a browser
     * renders as a finished page. It now takes the same wake + holding-page path.
     */
    it('serves the branded holding page when the app accepts the connection but never responds', async () => {
      const fetchImpl = (async (url: any, init: any) => {
        const href = typeof url === 'string' ? url : (url.href ?? url.toString());

        if (href.endsWith('/activate')) {
          return new Response(JSON.stringify({ ready: false, readyReplicas: 0 }), { status: 200 });
        }

        if (href.includes('app-clr8x9abc123')) {
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            );
          });
        }

        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;

      const app = await buildPreviewProxyApp({
        fetchImpl,
        previewDomain: 'preview.e-code.ai',
        serverDeployManagerUrl: 'http://workspace-manager.test',
        requestTimeoutMs: 1_000,
        serverDeployWakeWaitMs: 1_000,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: { host: 'd-clr8x9abc123.preview.e-code.ai', accept: 'text/html' },
      });

      expect(response.statusCode).toBe(503);
      expect(response.body).toContain('Starting your app');

      await app.close();
    });
  });
});

/*
 * BUG-PREVIEW-FRAMING-BLOCKED. The Webview stayed blank while the request
 * itself returned 200 with the whole document — reading the same URL directly
 * worked, because that is top-level and not framed. The proxy forwarded the
 * upstream's `X-Frame-Options` / CSP `frame-ancestors` verbatim, so the browser
 * refused the IDE's cross-origin iframe and reported nothing an HTTP-level
 * check could see.
 */
describe('sanitizePreviewFramingHeader', () => {
  it('drops X-Frame-Options whole, whatever its case or value', () => {
    expect(sanitizePreviewFramingHeader('X-Frame-Options', 'DENY')).toBeNull();
    expect(sanitizePreviewFramingHeader('x-frame-options', 'SAMEORIGIN')).toBeNull();
  });

  it('removes ONLY frame-ancestors from a CSP and keeps every other directive', () => {
    expect(sanitizePreviewFramingHeader('content-security-policy', "default-src 'self'; frame-ancestors 'self'")).toBe(
      "default-src 'self'",
    );
    expect(
      sanitizePreviewFramingHeader(
        'Content-Security-Policy',
        "default-src 'self'; frame-ancestors 'none'; script-src 'unsafe-inline'",
      ),
    ).toBe("default-src 'self'; script-src 'unsafe-inline'");
  });

  it('drops a CSP that carried nothing but frame-ancestors', () => {
    expect(sanitizePreviewFramingHeader('content-security-policy', "frame-ancestors 'self'")).toBeNull();
  });

  it('also sanitizes the report-only CSP, which browsers honour for framing reports', () => {
    expect(
      sanitizePreviewFramingHeader('content-security-policy-report-only', "default-src 'self'; frame-ancestors 'self'"),
    ).toBe("default-src 'self'");
  });

  it('does not touch a directive that merely starts with the same letters', () => {
    expect(sanitizePreviewFramingHeader('content-security-policy', 'frame-ancestors-not-a-directive foo')).toBe(
      'frame-ancestors-not-a-directive foo',
    );
  });

  it('leaves unrelated headers exactly as they are', () => {
    expect(sanitizePreviewFramingHeader('content-type', 'text/html')).toBe('text/html');
    expect(sanitizePreviewFramingHeader('cross-origin-resource-policy', 'cross-origin')).toBe('cross-origin');
  });
});

/*
 * The framing exemption must stop at the IDE preview. A PUBLISHED app is opened
 * DIRECTLY by the public in a top-level tab — nothing of ours frames it — so
 * removing its anti-clickjacking headers would let any site on the internet
 * frame a user's published app. These three cases pin the boundary in both
 * directions, so a future refactor cannot widen it by accident.
 */
describe('preview-proxy — framing headers are scoped to the IDE preview surface', () => {
  const framingUpstream = () =>
    (async () =>
      new Response('<!doctype html><html><head></head><body><div id="root">app</div></body></html>', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'x-frame-options': 'SAMEORIGIN',
          'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
        },
      })) as unknown as typeof fetch;

  it('IDE preview (/p/:workspaceId/:port): strips framing headers so the IDE can frame the dev server', async () => {
    const app = await buildPreviewProxyApp({ fetchImpl: framingUpstream(), resolveAgent: async () => fakeAgent });

    const response = await app.inject({
      method: 'GET',
      url: '/p/ws_1/5173/',
      headers: { accept: 'text/html', 'sec-fetch-dest': 'iframe' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-frame-options']).toBeUndefined();

    const csp = String(response.headers['content-security-policy'] ?? '');
    expect(csp).not.toMatch(/frame-ancestors/i);

    // Strips framing, not security: the app's other directives survive.
    expect(csp).toContain("default-src 'self'");

    await app.close();
  });

  it('PUBLISHED server deploy (d-<id>): keeps X-Frame-Options and frame-ancestors untouched', async () => {
    const app = await buildPreviewProxyApp({ fetchImpl: framingUpstream(), previewDomain: 'preview.e-code.ai' });

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'd-clr8x9abc123.preview.e-code.ai', accept: 'text/html' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(String(response.headers['content-security-policy'])).toBe("default-src 'self'; frame-ancestors 'self'");

    await app.close();
  });

  it('PUBLISHED static deploy (s-<id>): keeps X-Frame-Options and frame-ancestors untouched', async () => {
    const app = await buildPreviewProxyApp({
      fetchImpl: framingUpstream(),
      previewDomain: 'preview.e-code.ai',
      apiBaseUrl: 'http://api.test',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 's-clr8x9abc123.preview.e-code.ai', accept: 'text/html' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(String(response.headers['content-security-policy'])).toBe("default-src 'self'; frame-ancestors 'self'");

    await app.close();
  });
});
