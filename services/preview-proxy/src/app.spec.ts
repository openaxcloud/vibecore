import { describe, expect, it } from 'vitest';
import {
  buildPreviewProxyApp,
  computeHostPreviewSubpath,
  readCookie,
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
      const app = await buildPreviewProxyApp({ enforceTenant: true, tenantSecret: secret, resolveAgent: async () => fakeAgent });

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
      const { fn: fetchImpl, calls } = recordingFetch(async () =>
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
});
