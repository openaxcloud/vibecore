import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';

import { parseBridgeRoute, startAgentBridge, type AgentBridge } from './runtime-e2e-agent-bridge.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup().catch(() => undefined);
  }
});

describe('runtime E2E agent bridge', () => {
  it('rejects encoded separators and accepts one strict workspace segment', () => {
    expect(parseBridgeRoute('/ws-safe/files/read?path=src%2Fmain.ts')).toEqual({
      workspaceId: 'ws-safe',
      upstreamPath: '/files/read?path=src%2Fmain.ts',
    });
    expect(parseBridgeRoute('/ws%2Fother/files')).toBeUndefined();
    expect(parseBridgeRoute('/../files')).toBeUndefined();
    expect(parseBridgeRoute('/ws_safe/files')).toBeUndefined();
  });

  it('proxies real HTTP bodies and authorization to the selected upstream', async () => {
    const upstream = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk.toString();
      });
      request.on('end', () => {
        response.writeHead(201, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            method: request.method,
            url: request.url,
            authorization: request.headers.authorization,
            body,
          }),
        );
      });
    });

    const upstreamPort = await listen(upstream);
    cleanups.push(() => closeServer(upstream));

    const bridge = await startAgentBridge({ resolveAgentPort: async () => upstreamPort });
    registerBridge(bridge);

    const response = await fetch(`${bridge.baseUrl}/ws-real/files/write?mode=atomic`, {
      method: 'POST',
      headers: { authorization: 'Bearer signed-agent-token', 'content-type': 'text/plain' },
      body: 'real workspace bytes',
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      method: 'POST',
      url: '/files/write?mode=atomic',
      authorization: 'Bearer signed-agent-token',
      body: 'real workspace bytes',
    });
  });

  it('proxies a real WebSocket upgrade and frames', async () => {
    const upstreamServer = createServer();
    const upstreamSockets = new WebSocketServer({ server: upstreamServer });
    upstreamSockets.on('connection', (socket, request) => {
      socket.send(`auth:${request.headers.authorization}`);
      socket.on('message', (message) => socket.send(`echo:${message.toString()}`));
    });

    const upstreamPort = await listen(upstreamServer);
    cleanups.push(async () => {
      upstreamSockets.close();
      await closeServer(upstreamServer);
    });

    const bridge = await startAgentBridge({ resolveAgentPort: async () => upstreamPort });
    registerBridge(bridge);

    const client = new WebSocket(`${bridge.baseUrl.replace(/^http/, 'ws')}/ws-real/terminal`, {
      headers: { authorization: 'Bearer signed-agent-token' },
    });
    cleanups.push(async () => client.terminate());

    expect(await nextMessage(client)).toBe('auth:Bearer signed-agent-token');
    client.send('terminal-input');
    expect(await nextMessage(client)).toBe('echo:terminal-input');
  });
});

function registerBridge(bridge: AgentBridge) {
  cleanups.push(() => bridge.close());
}

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return (server.address() as AddressInfo).port;
}

async function closeServer(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message')), 5_000);
    socket.once('message', (message) => {
      clearTimeout(timer);
      resolve(message.toString());
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
