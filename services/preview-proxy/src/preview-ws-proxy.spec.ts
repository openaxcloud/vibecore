import { describe, expect, it } from 'vitest';

import { buildUpstreamUpgradeHeaders, resolvePreviewWsTarget } from './preview-ws-proxy';

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
