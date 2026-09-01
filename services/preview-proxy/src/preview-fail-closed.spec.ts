import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPreviewProxyApp } from './app';
import { attachPreviewWebSocketProxy, readUpgradeCookie } from './preview-ws-proxy';

/*
 * AUDX-005 — previews must fail CLOSED, over HTTP and over WebSocket.
 *
 * Two independent defects lived here:
 *
 *  1. HTTP: the private-port lookup returned "public" on ANY failure (non-2xx,
 *     timeout, DNS). An authorization decision that answers "allow" when it does
 *     not know is fail-open — one api hiccup turned every private port on the
 *     platform public, silently.
 *  2. WebSocket: the upgrade handler resolved the agent with NO orgId and had no
 *     port gate at all, so every control the HTTP path enforces was simply
 *     absent. A door is not locked because the front door is.
 */
const TENANT_SECRET = 'tenant-secret';

/** Mint the `vc_preview` cookie value the proxy verifies. Format: <orgId-b64url>.<expMs>.<sig> */
async function mintPreviewCookie(orgId: string) {
  const { createHmac } = await import('node:crypto');
  const payload = `${Buffer.from(orgId).toString('base64url')}.${Date.now() + 60_000}`;
  const sig = createHmac('sha256', TENANT_SECRET).update(payload).digest('base64url');

  return `${payload}.${sig}`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AUDX-005 HTTP private-port gate fails closed', () => {
  /*
   * The decisive case. `fetchImpl` rejects, so the proxy CANNOT know whether the
   * port is private. Before, unknown meant "public, proxy it".
   */
  it('treats an unreachable port-access lookup as PRIVATE, not public', async () => {
    const resolveAgent = vi.fn(async () => ({ baseUrl: 'http://agent.internal:8080', token: 'tok' }));

    const app = await buildPreviewProxyApp({
      enforcePrivatePorts: true,
      apiBaseUrl: 'http://api.internal',
      proxySharedSecret: 'shared',
      tenantSecret: TENANT_SECRET,
      resolveAgent,
      fetchImpl: (async () => {
        throw new Error('api unreachable');
      }) as unknown as typeof fetch,
    });

    const response = await app.inject({ method: 'GET', url: '/p/ws-1/5173/' });

    expect(response.statusCode).toBe(401);

    // Fail-closed means the request never reached the workspace at all.
    expect(resolveAgent).not.toHaveBeenCalled();

    await app.close();
  });

  it('treats a non-2xx port-access lookup as PRIVATE, not public', async () => {
    const resolveAgent = vi.fn(async () => ({ baseUrl: 'http://agent.internal:8080', token: 'tok' }));

    const app = await buildPreviewProxyApp({
      enforcePrivatePorts: true,
      apiBaseUrl: 'http://api.internal',
      proxySharedSecret: 'shared',
      tenantSecret: TENANT_SECRET,
      resolveAgent,
      fetchImpl: (async () => new Response('boom', { status: 503 })) as unknown as typeof fetch,
    });

    const response = await app.inject({ method: 'GET', url: '/p/ws-1/5173/' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  /*
   * Rule 19: a guard that blocks legitimate work gets reverted, not fixed.
   * Failing closed must NOT lock the owner out — "private" means "a session is
   * required", and the owner has one. This is the test that makes the change
   * survivable in production.
   */
  it('still lets the OWNER through while the lookup is failing', async () => {
    const resolveAgent = vi.fn(async () => ({ baseUrl: 'http://agent.internal:8080', token: 'tok' }));

    const app = await buildPreviewProxyApp({
      enforcePrivatePorts: true,
      apiBaseUrl: 'http://api.internal',
      proxySharedSecret: 'shared',
      tenantSecret: TENANT_SECRET,
      resolveAgent,
      fetchImpl: (async (input: RequestInfo | URL) => {
        if (String(input).includes('/internal/preview/port-access')) {
          throw new Error('api unreachable');
        }

        return new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html' } });
      }) as unknown as typeof fetch,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/p/ws-1/5173/',
      headers: { cookie: `vc_preview=${await mintPreviewCookie('org-1')}` },
    });

    expect(response.statusCode).not.toBe(401);
    expect(resolveAgent).toHaveBeenCalled();

    await app.close();
  });

  /* A KNOWN public port must stay public — the gate must not deny everything. */
  it('proxies a port the api reports as public', async () => {
    const resolveAgent = vi.fn(async () => ({ baseUrl: 'http://agent.internal:8080', token: 'tok' }));

    const app = await buildPreviewProxyApp({
      enforcePrivatePorts: true,
      apiBaseUrl: 'http://api.internal',
      proxySharedSecret: 'shared',
      tenantSecret: TENANT_SECRET,
      resolveAgent,
      fetchImpl: (async (input: RequestInfo | URL) => {
        if (String(input).includes('/internal/preview/port-access')) {
          return Response.json({ private: false });
        }

        return new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html' } });
      }) as unknown as typeof fetch,
    });

    const response = await app.inject({ method: 'GET', url: '/p/ws-1/5173/' });

    expect(response.statusCode).not.toBe(401);
    await app.close();
  });
});

describe('AUDX-005 WebSocket gates', () => {
  /** Drive a real upgrade against the attached handler and report the status line. */
  async function upgradeStatus(deps: Parameters<typeof attachPreviewWebSocketProxy>[1], cookie?: string) {
    const server = createServer();
    attachPreviewWebSocketProxy(server, deps);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const { port } = server.address() as AddressInfo;
    const net = await import('node:net');

    const status = await new Promise<string>((resolve) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(
          'GET / HTTP/1.1\r\n' +
            'Host: ws-1-5173.preview.e-code.ai\r\n' +
            'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
            'Sec-WebSocket-Key: abc==\r\nSec-WebSocket-Version: 13\r\n' +
            (cookie ? `Cookie: ${cookie}\r\n` : '') +
            '\r\n',
        );
      });

      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
      });
      socket.on('close', () => resolve(buffer.split('\r\n')[0] ?? ''));
      socket.on('error', () => resolve(''));
    });

    server.close();

    return status;
  }

  /*
   * MECHANISM 1: tenant gate. Without a valid vc_preview cookie the upgrade must
   * be refused, not resolved anonymously.
   */
  it('refuses an upgrade with no tenant cookie when tenant enforcement is on', async () => {
    const resolveAgent = vi.fn(async () => ({ baseUrl: 'http://agent.internal:8080', token: 'tok' }));

    const status = await upgradeStatus({
      previewDomain: 'preview.e-code.ai',
      resolveAgent,
      enforceTenant: true,
      resolveRequesterOrgId: () => undefined,
    });

    expect(status).toContain('403');
    expect(resolveAgent).not.toHaveBeenCalled();
  });

  /*
   * MECHANISM 2: the orgId must actually reach resolveAgent. Passing nothing
   * made workspace-manager's ownership check unreachable — the gate looked
   * present while enforcing nothing.
   */
  it('forwards the requester orgId to resolveAgent', async () => {
    const resolveAgent = vi.fn(async () => undefined);

    await upgradeStatus(
      {
        previewDomain: 'preview.e-code.ai',
        resolveAgent,
        enforceTenant: true,
        resolveRequesterOrgId: () => 'org-1',
      },
      'vc_preview=whatever',
    );

    expect(resolveAgent).toHaveBeenCalledWith('ws-1', 'org-1');
  });

  /* MECHANISM 3: private-port gate exists over WS at all. */
  it('refuses an anonymous upgrade to a private port', async () => {
    const resolveAgent = vi.fn(async () => ({ baseUrl: 'http://agent.internal:8080', token: 'tok' }));

    const status = await upgradeStatus({
      previewDomain: 'preview.e-code.ai',
      resolveAgent,
      enforcePrivatePorts: true,
      isPortPrivate: async () => true,
      resolveRequesterOrgId: () => undefined,
    });

    expect(status).toContain('401');
    expect(resolveAgent).not.toHaveBeenCalled();
  });

  /* MECHANISM 4: the WS private-port gate fails CLOSED when the lookup throws. */
  it('refuses an anonymous upgrade when the port lookup throws', async () => {
    const resolveAgent = vi.fn(async () => ({ baseUrl: 'http://agent.internal:8080', token: 'tok' }));

    const status = await upgradeStatus({
      previewDomain: 'preview.e-code.ai',
      resolveAgent,
      enforcePrivatePorts: true,
      isPortPrivate: async () => {
        throw new Error('api unreachable');
      },
      resolveRequesterOrgId: () => undefined,
    });

    expect(status).toContain('401');
    expect(resolveAgent).not.toHaveBeenCalled();
  });

  /* Rule 19 again: the owner must still get through over WS. */
  it('lets an authenticated owner upgrade to a private port', async () => {
    const resolveAgent = vi.fn(async () => undefined);

    await upgradeStatus(
      {
        previewDomain: 'preview.e-code.ai',
        resolveAgent,
        enforcePrivatePorts: true,
        isPortPrivate: async () => true,
        resolveRequesterOrgId: () => 'org-1',
      },
      'vc_preview=valid',
    );

    expect(resolveAgent).toHaveBeenCalled();
  });
});

describe('readUpgradeCookie', () => {
  it('reads a named cookie out of a raw header', () => {
    expect(readUpgradeCookie('a=1; vc_preview=tok; b=2', 'vc_preview')).toBe('tok');
    expect(readUpgradeCookie(undefined, 'vc_preview')).toBeUndefined();
    expect(readUpgradeCookie('other=1', 'vc_preview')).toBeUndefined();
  });
});
