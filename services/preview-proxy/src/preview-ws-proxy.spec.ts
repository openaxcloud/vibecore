import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { describe, expect, it } from 'vitest';

import { attachPreviewWebSocketProxy, buildUpstreamUpgradeHeaders, resolvePreviewWsTarget } from './preview-ws-proxy';

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

describe('preview WebSocket relay', () => {
  it.each(['server-first', 'client-first'])('relays %s messages and a normal close', async (order) => {
    const upstream = createServer();
    const relay = createServer();
    const sockets = new WebSocketServer({ noServer: true });
    upstream.on('upgrade', (req, socket, head) => {
      // Deliver the greeting in the same write as the upgrade response.
      socket.cork();
      sockets.handleUpgrade(req, socket, head, (peer) => {
        peer.on('error', () => peer.terminate());
        peer.on('message', (message) => peer.send(message.toString()));
        if (order === 'server-first') peer.send('ready');
      });
      socket.uncork();
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    attachPreviewWebSocketProxy(relay, {
      previewDomain: 'preview.test',
      resolveAgent: async () => ({ baseUrl, token: 'fixture' }),
    });
    await new Promise<void>((resolve) => relay.listen(0, '127.0.0.1', resolve));
    const client = new WebSocket(`ws://127.0.0.1:${(relay.address() as AddressInfo).port}`, {
      headers: { host: 'ws-1-5173.preview.test' },
    });
    try {
      const received = await new Promise<string[]>((resolve, reject) => {
        const messages: string[] = [];
        client.once('error', reject);
        client.once('close', () => reject(new Error('closed before echo')));
        client.once('open', () => {
          if (order === 'client-first') client.send('echo');
        });
        client.on('message', (message) => {
          messages.push(message.toString());
          if (message.toString() === 'ready') client.send('echo');
          else resolve(messages);
        });
      });
      expect(received).toEqual(order === 'server-first' ? ['ready', 'echo'] : ['echo']);
      const closed = once(client, 'close');
      client.close(1000, 'done');
      const [code, reason] = await closed;
      expect([code, reason.toString()]).toEqual([1000, 'done']);
    } finally {
      client.terminate();
      for (const peer of sockets.clients) peer.terminate();
      sockets.close();
      relay.close();
      upstream.close();
    }
  });
});
