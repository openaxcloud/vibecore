import { createServer } from 'node:http';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import {
  attachPreviewWebSocketProxy,
  buildUpstreamUpgradeHeaders,
  resolvePreviewWsTarget,
  type PreviewWsProxyDeps,
} from './preview-ws-proxy';

describe('resolvePreviewWsTarget', () => {
  it('resolves a preview host + ws path to the agent upstream path', () => {
    const target = resolvePreviewWsTarget('ws-abc123-5173.preview.e-code.ai', '/', 'preview.e-code.ai');
    expect(target).toEqual({ workspaceId: 'ws-abc123', port: '5173', upstreamPath: '/preview-hmr/5173/' });
  });

  it('preserves the ws sub-path and query', () => {
    const target = resolvePreviewWsTarget('ws-x-3000.preview.e-code.ai', '/@vite/client?token=1', 'preview.e-code.ai');
    expect(target?.upstreamPath).toBe('/preview-hmr/3000/@vite/client?token=1');
  });

  it('returns null for a non-preview host', () => {
    expect(resolvePreviewWsTarget('app.e-code.ai', '/', 'preview.e-code.ai')).toBeNull();
    expect(resolvePreviewWsTarget(undefined, '/', 'preview.e-code.ai')).toBeNull();
    expect(resolvePreviewWsTarget('ws-x-5173.preview.e-code.ai', '/', undefined)).toBeNull();
  });
});

describe('buildUpstreamUpgradeHeaders', () => {
  it('preserves the WebSocket handshake headers (does NOT strip upgrade/connection/sec-websocket-*)', () => {
    const headers = buildUpstreamUpgradeHeaders(
      {
        host: 'ws-x-5173.preview.e-code.ai',
        upgrade: 'websocket',
        connection: 'Upgrade',
        'sec-websocket-key': 'abc==',
        'sec-websocket-version': '13',
        'sec-websocket-protocol': 'vite-hmr',
        cookie: 'vc_preview=secret',
        origin: 'https://ws-x-5173.preview.e-code.ai',
      },
      { upstreamHost: 'agent.internal:8080', agentToken: 'tok' },
    );

    expect(headers.upgrade).toBe('websocket');
    expect(headers.connection).toBe('Upgrade');
    expect(headers['sec-websocket-key']).toBe('abc==');
    expect(headers['sec-websocket-version']).toBe('13');
    expect(headers['sec-websocket-protocol']).toBe('vite-hmr');

    // host rewritten to upstream, auth injected, cookie dropped
    expect(headers.host).toBe('agent.internal:8080');
    expect(headers.authorization).toBe('Bearer tok');
    expect(headers.cookie).toBeUndefined();
  });
});

/*
 * Tenant gate on the UPGRADE door.
 *
 * Regression guard for a proven cross-tenant read channel: this handler used to
 * call resolveAgent(workspaceId) with no orgId and without reading the cookie, so
 * with PREVIEW_PROXY_ENFORCE_TENANT=true an anonymous client (or one holding
 * another tenant's cookie) still got a 101 and live bytes from the workspace's dev
 * server, while the HTTP door answered 403 for the very same host.
 */
describe('attachPreviewWebSocketProxy — tenant gate', () => {
  const PREVIEW_DOMAIN = 'preview.e-code.ai';

  /** Start a server with the proxy attached; returns its port + a resolveAgent spy log. */
  const start = async (deps: Partial<PreviewWsProxyDeps>) => {
    const calls: Array<{ workspaceId: string; orgId?: string }> = [];
    const server = createServer((_req, res) => res.end('nope'));

    attachPreviewWebSocketProxy(server, {
      previewDomain: PREVIEW_DOMAIN,
      resolveAgent: async (workspaceId, orgId) => {
        calls.push({ workspaceId, orgId });

        // No reachable upstream in a unit test: returning undefined makes the
        // handler answer 502, which is enough to distinguish "gate let it through"
        // (resolveAgent called) from "gate refused" (never called).
        return undefined;
      },
      ...deps,
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const { port } = server.address() as AddressInfo;

    return { calls, port, close: () => new Promise<void>((r) => server.close(() => r())) };
  };

  /** Attempt an upgrade; resolves with the refusal status, or 101 on upgrade. */
  const upgrade = (port: number, cookie?: string) =>
    new Promise<number>((resolve) => {
      const req = request({
        host: '127.0.0.1',
        port,
        path: '/',
        headers: {
          host: `ws-abc-5173.${PREVIEW_DOMAIN}`,
          connection: 'Upgrade',
          upgrade: 'websocket',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13',
          ...(cookie ? { cookie } : {}),
        },
      });

      req.on('upgrade', (_res, socket) => {
        socket.destroy();
        resolve(101);
      });
      req.on('response', (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      // The handler answers a raw `HTTP/1.1 <code>` then destroys the socket, which
      // surfaces as a socket error rather than a parsed response in some cases.
      req.on('error', () => resolve(0));
      req.end();
    });

  it('refuses the upgrade with 403 and never resolves an agent when enforcing and no cookie is present', async () => {
    const s = await start({ enforceTenant: true, resolveRequesterOrgId: () => undefined });

    const status = await upgrade(s.port);

    expect(status).toBe(403);
    expect(s.calls).toEqual([]); // the gate ran BEFORE any upstream resolution
    await s.close();
  });

  it('refuses the upgrade when the cookie is invalid/forged (verifier returns undefined)', async () => {
    const s = await start({ enforceTenant: true, resolveRequesterOrgId: () => undefined });

    expect(await upgrade(s.port, 'vc_preview=forged')).toBe(403);
    expect(s.calls).toEqual([]);
    await s.close();
  });

  it('forwards the verified orgId to resolveAgent when the cookie is valid', async () => {
    const s = await start({ enforceTenant: true, resolveRequesterOrgId: () => 'org_1' });

    await upgrade(s.port, 'vc_preview=good');

    expect(s.calls).toEqual([{ workspaceId: 'ws-abc', orgId: 'org_1' }]);
    await s.close();
  });

  it('forwards the orgId even when enforcement is OFF, so a mismatch can still be denied upstream', async () => {
    const s = await start({ enforceTenant: false, resolveRequesterOrgId: () => 'org_other' });

    await upgrade(s.port, 'vc_preview=good');

    expect(s.calls).toEqual([{ workspaceId: 'ws-abc', orgId: 'org_other' }]);
    await s.close();
  });

  it('leaves an unopted environment untouched: enforcement off + no cookie still resolves', async () => {
    const s = await start({ enforceTenant: false, resolveRequesterOrgId: () => undefined });

    await upgrade(s.port);

    expect(s.calls).toEqual([{ workspaceId: 'ws-abc', orgId: undefined }]);
    await s.close();
  });
});
