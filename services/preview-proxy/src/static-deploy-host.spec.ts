import { describe, expect, it, vi } from 'vitest';
import {
  buildPreviewProxyApp,
  parsePublishedBadgeFrameHost,
  parseServerDeployHost,
  parseStaticDeployHost,
} from './app.js';

/*
 * LAUNCH-BLOCKER 2026-08-01: published static apps rendered BLANK because they
 * were served from the API origin, which requires an opaque `CSP: sandbox`
 * (no allow-same-origin) to strip ambient cookie authority — and an opaque
 * origin makes localStorage throw, killing SPA boot. The fix gives each
 * deployment its own origin `s-<id>.<previewDomain>`.
 *
 * These tests pin the host grammar: `s-` hosts are recognised, and they never
 * collide with the existing `d-` (server deploy) or `<ws>-<port>` (IDE preview)
 * shapes — a collision would misroute a live preview or a deployed app.
 */
const DOMAIN = 'preview.e-code.ai';

describe('parseStaticDeployHost', () => {
  it('parses a dedicated static-deploy host', () => {
    expect(parseStaticDeployHost(`s-cmsaqaye5002v0ncds67lsa86.${DOMAIN}`, DOMAIN)).toEqual({
      deploymentId: 'cmsaqaye5002v0ncds67lsa86',
    });
  });

  it('is case- and port-insensitive', () => {
    expect(parseStaticDeployHost(`S-ABC123DEF.${DOMAIN}:443`, DOMAIN)).toEqual({ deploymentId: 'abc123def' });
  });

  it('does NOT match a server-deploy host (d-) — no cross-routing', () => {
    expect(parseStaticDeployHost(`d-cmsaqaye5002v0ncds67lsa86.${DOMAIN}`, DOMAIN)).toBeNull();
  });

  it('does NOT match an IDE preview host (<ws>-<port>)', () => {
    expect(parseStaticDeployHost(`ws-10f68d4026c62927-5173.${DOMAIN}`, DOMAIN)).toBeNull();
  });

  it('rejects nested labels, foreign domains and missing config', () => {
    expect(parseStaticDeployHost(`evil.s-abc123def.${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parseStaticDeployHost('s-abc123def.attacker.test', DOMAIN)).toBeNull();
    expect(parseStaticDeployHost(`s-abc123def.${DOMAIN}`, undefined)).toBeNull();
    expect(parseStaticDeployHost(undefined, DOMAIN)).toBeNull();
  });

  it('rejects too-short ids (grammar guard)', () => {
    expect(parseStaticDeployHost(`s-abc.${DOMAIN}`, DOMAIN)).toBeNull();
  });

  it('the existing server-deploy parser still ignores s- hosts (both directions)', () => {
    expect(parseServerDeployHost(`s-abc123def.${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parseServerDeployHost(`d-abc123def.${DOMAIN}`, DOMAIN)).toEqual({ deploymentId: 'abc123def' });
  });

  it('reserves separate raw frame origins for the non-removable platform badge shell', () => {
    expect(parsePublishedBadgeFrameHost(`rs-abc123def.${DOMAIN}`, DOMAIN)).toEqual({
      deploymentId: 'abc123def',
      kind: 'static',
    });
    expect(parsePublishedBadgeFrameHost(`rd-abc123def.${DOMAIN}`, DOMAIN)).toEqual({
      deploymentId: 'abc123def',
      kind: 'server',
    });
    expect(parsePublishedBadgeFrameHost(`s-abc123def.${DOMAIN}`, DOMAIN)).toBeNull();
    expect(parsePublishedBadgeFrameHost(`evil.rs-abc123def.${DOMAIN}`, DOMAIN)).toBeNull();
  });
});

describe('static published badge edge', () => {
  it('keeps the mandatory badge outside hostile application CSS/JS and denies the raw URL', async () => {
    const deploymentId = 'staticbadge001';
    const hostileApp =
      '<!doctype html><style>*[data-vibecore-published-badge]{display:none!important}</style>' +
      '<script>top.document.querySelector("[data-vibecore-published-badge]")?.remove()</script><h1>App</h1>';
    const upstreamHits: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = vi.fn(async (input: URL | string | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      upstreamHits.push({ url, headers });

      if (url.includes('/serving-state')) {
        return new Response(
          JSON.stringify({
            state: 'live',
            planEntitlements: { version: '2026-08-27.1', badgeRequired: true },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.includes('/static-deployments/')) {
        return new Response(hostileApp, {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
            'x-frame-options': 'DENY',
            'x-vibecore-plan-entitlements-version': '2026-08-27.1',
            'x-vibecore-published-badge-required': '1',
            'set-cookie': 'app_session=app-proof; Path=/; HttpOnly; SameSite=Lax',
          },
        });
      }

      throw new Error(`Unexpected upstream ${url}`);
    }) as unknown as typeof fetch;
    const proxy = await buildPreviewProxyApp({
      previewDomain: DOMAIN,
      apiBaseUrl: 'http://api.internal',
      proxySharedSecret: 'published-static-frame-secret',
      fetchImpl,
    });

    try {
      const shell = await proxy.inject({
        method: 'GET',
        url: '/',
        headers: { host: `s-${deploymentId}.${DOMAIN}`, 'accept-language': 'en', 'sec-fetch-dest': 'document' },
      });
      expect(shell.statusCode).toBe(200);
      expect(shell.body).toContain('data-vibecore-published-badge');
      expect(shell.body).toContain('<iframe');
      expect(shell.body).not.toContain(hostileApp);
      expect(shell.headers['x-frame-options']).toBe('DENY');
      expect(shell.headers['content-security-policy']).toContain('frame-ancestors \'none\'');

      const source = /<iframe[^>]+src="([^"]+)"/.exec(shell.body)?.[1]?.replaceAll('&amp;', '&');
      expect(source).toBeTruthy();
      const rawUrl = new URL(source!);
      expect(rawUrl.hostname).toBe(`rs-${deploymentId}.${DOMAIN}`);

      const raw = await proxy.inject({
        method: 'GET',
        url: `${rawUrl.pathname}${rawUrl.search}`,
        headers: { host: rawUrl.host, 'sec-fetch-dest': 'iframe' },
      });
      expect(raw.statusCode).toBe(200);
      expect(raw.body).toBe(hostileApp);
      expect(raw.headers['x-frame-options']).toBeUndefined();
      expect(raw.headers['content-security-policy']).toContain(`frame-ancestors http://s-${deploymentId}.${DOMAIN}`);
      expect(raw.headers['content-security-policy']).not.toContain("frame-ancestors 'none'");
      expect(String(raw.headers['set-cookie'])).toContain('vc_badge_s_staticbadge001=');
      expect(String(raw.headers['set-cookie'])).toContain('app_session=app-proof');

      const bypass = await proxy.inject({
        method: 'GET',
        url: `${rawUrl.pathname}${rawUrl.search}`,
        headers: { host: rawUrl.host, 'sec-fetch-dest': 'document' },
      });
      expect(bypass.statusCode).toBe(404);

      const artifactHits = upstreamHits.filter((hit) => hit.url.includes('/static-deployments/'));
      expect(artifactHits).toHaveLength(1);
      expect(artifactHits.every((hit) => hit.headers.get('authorization') === 'Bearer published-static-frame-secret')).toBe(
        true,
      );
      expect(artifactHits[0]?.headers.get('x-vibecore-published-badge-frame')).toBe('1');
    } finally {
      await proxy.close();
    }
  });

  it.each([
    ['XHTML', 'application/xhtml+xml', 200],
    ['SVG', 'image/svg+xml', 200],
    ['HTML latin-1', 'text/html; charset=iso-8859-1', 200],
    ['MIME absent', undefined, 200],
    ['404', 'text/html; charset=utf-8', 404],
    ['500', 'text/html; charset=utf-8', 500],
  ])('compose le shell static avant tout artefact pour %s', async (_label, contentType, status) => {
    const deploymentId = `staticmatrix${status}${contentType ? contentType.length : 0}`;
    const artifactHits: string[] = [];
    const fetchImpl = vi.fn(async (input: URL | string | Request) => {
      const url = String(input);
      if (url.includes('/serving-state')) {
        return new Response(
          JSON.stringify({
            state: 'live',
            planEntitlements: { version: '2026-08-27.1', badgeRequired: true },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      artifactHits.push(url);
      return new Response('STATIC_MATRIX_BODY', {
        status,
        headers: contentType ? { 'content-type': contentType } : undefined,
      });
    }) as unknown as typeof fetch;
    const proxy = await buildPreviewProxyApp({
      previewDomain: DOMAIN,
      apiBaseUrl: 'http://api.internal',
      proxySharedSecret: 'published-static-frame-secret',
      fetchImpl,
    });
    try {
      const shell = await proxy.inject({
        method: 'GET',
        url: '/route',
        headers: { host: `s-${deploymentId}.${DOMAIN}`, 'sec-fetch-dest': 'document' },
      });
      expect(shell.statusCode).toBe(200);
      expect(shell.body).toContain('data-vibecore-published-badge');
      expect(artifactHits).toHaveLength(0);

      const source = /<iframe[^>]+src="([^"]+)"/.exec(shell.body)?.[1]?.replaceAll('&amp;', '&');
      const rawUrl = new URL(source!);
      const raw = await proxy.inject({
        method: 'GET',
        url: `${rawUrl.pathname}${rawUrl.search}`,
        headers: { host: rawUrl.host, 'sec-fetch-dest': 'iframe' },
      });
      expect(raw.statusCode).toBe(status);
      expect(raw.body).toBe('STATIC_MATRIX_BODY');
      expect(artifactHits).toHaveLength(1);
    } finally {
      await proxy.close();
    }
  });
});
