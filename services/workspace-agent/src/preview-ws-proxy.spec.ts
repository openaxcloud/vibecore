import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { createPreviewWsBridgeHandler, parseAgentPreviewWsPath } from './preview-ws-proxy';

describe('parseAgentPreviewWsPath', () => {
  it('parses /preview/<port>/<rest> into port + dev-server ws path', () => {
    expect(parseAgentPreviewWsPath('/preview-hmr/5173/', 8080)).toEqual({ port: 5173, forwardPath: '/' });
    expect(parseAgentPreviewWsPath('/preview-hmr/3000/@vite/client', 8080)).toEqual({
      port: 3000,
      forwardPath: '/@vite/client',
    });
    expect(parseAgentPreviewWsPath('/preview-hmr/5173/socket?token=1', 8080)).toEqual({
      port: 5173,
      forwardPath: '/socket?token=1',
    });
  });

  it('rejects the agent self-port and invalid paths', () => {
    expect(parseAgentPreviewWsPath('/preview-hmr/8080/', 8080)).toBeNull();
    expect(parseAgentPreviewWsPath('/terminal', 8080)).toBeNull();
    expect(parseAgentPreviewWsPath('/preview-hmr/0/', 8080)).toBeNull();
    expect(parseAgentPreviewWsPath(undefined, 8080)).toBeNull();
  });
});

class FakeSocket extends EventEmitter {
  sent: Array<unknown> = [];
  closed = false;
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}

describe('createPreviewWsBridgeHandler', () => {
  it('bridges frames both ways and queues client frames until upstream opens', () => {
    const upstream = new FakeSocket();

    const handler = createPreviewWsBridgeHandler({
      selfPort: 8080,
      createUpstream: () => upstream as never,
    });

    const client = new FakeSocket();
    handler(client, { url: '/preview-hmr/5173/' });

    // Client sends before upstream is open → queued, not sent yet.
    client.emit('message', 'early');
    expect(upstream.sent).toEqual([]);

    // Upstream opens → queued frame flushes.
    upstream.emit('open');
    expect(upstream.sent).toEqual(['early']);

    // Live both ways.
    client.emit('message', 'from-client');
    expect(upstream.sent).toEqual(['early', 'from-client']);
    upstream.emit('message', 'from-vite');
    expect(client.sent).toEqual(['from-vite']);
  });

  it('closes the client for a non-preview path (no upstream opened)', () => {
    const createUpstream = vi.fn();
    const handler = createPreviewWsBridgeHandler({ selfPort: 8080, createUpstream: createUpstream as never });
    const client = new FakeSocket();

    handler(client, { url: '/preview-hmr/8080/' }); // self-port → rejected

    expect(client.closed).toBe(true);
    expect(createUpstream).not.toHaveBeenCalled();
  });

  it('tears down the client when upstream errors', () => {
    const upstream = new FakeSocket();
    const handler = createPreviewWsBridgeHandler({ selfPort: 8080, createUpstream: () => upstream as never });
    const client = new FakeSocket();

    handler(client, { url: '/preview-hmr/5173/' });
    upstream.emit('error', new Error('econnrefused'));

    expect(client.closed).toBe(true);
    expect(upstream.closed).toBe(true);
  });
});
