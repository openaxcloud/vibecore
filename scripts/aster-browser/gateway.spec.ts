import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { localOrigin, routeSurface, startGateway } from './gateway.js';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0).reverse()) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function upstream(label: string) {
  const server = createServer((req, res) => {
    res.setHeader('set-cookie', 'fixture=value; HttpOnly; Path=/');
    res.end(
      JSON.stringify({
        label,
        path: req.url,
        cookie: req.headers.cookie,
        authorization: req.headers.authorization,
        host: req.headers.host,
      }),
    );
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
describe('loopback transport integration only — not Kubernetes or product evidence', () => {
  it('rejects external targets and ambiguous/AI paths before forwarding', () => {
    for (const origin of [
      'https://127.0.0.1:3001',
      'http://localhost:3001',
      'http://example.test:3001',
      'http://127.0.0.1:3001/x',
    ]) {
      expect(() => localOrigin(origin)).toThrow();
    }

    for (const path of [
      '//example.test',
      '/api/chat',
      '/api/x/../chat',
      '/api/runtime/%2e%2e/chat',
      '/api/runtime%2fworkspaces',
      '/api/%63hat',
    ]) {
      expect(() => routeSurface(path)).toThrow();
    }
  });
  it('routes web, runtime and preview on real local sockets without replacing authentication', async () => {
    const web = await upstream('web');
    const api = await upstream('api');
    const gateway = await startGateway(web.origin, api.origin, { E2E_PROVIDER_MODE: 'absent' });
    servers.push(gateway.server);

    for (const [path, label] of [
      ['/register', 'web'],
      ['/api/runtime-token', 'web'],
      ['/api/projects/p/files', 'web'],
      ['/api/runtime/workspaces', 'api'],
      ['/api/runtime/workspaces/w/preview/5173/proxy/', 'api'],
    ]) {
      const response = await fetch(gateway.origin + path, {
        headers: { cookie: 'fixture=value', authorization: 'Bearer synthetic' },
      });
      expect(response.headers.get('set-cookie')).toContain('HttpOnly');
      expect(await response.json()).toEqual({
        label,
        path,
        cookie: 'fixture=value',
        authorization: 'Bearer synthetic',
        host: new URL(gateway.origin).host,
      });
    }
    expect((await fetch(gateway.origin + '/api/chat')).status).toBe(403);
  });
  it('passes an actual WebSocket upgrade and bytes to the selected local upstream', async () => {
    const web = await upstream('web');
    const api = await upstream('api');
    const sockets = new WebSocketServer({ server: api.server });
    sockets.on('connection', (socket) => socket.on('message', (data) => socket.send(data)));

    const gateway = await startGateway(web.origin, api.origin, { E2E_PROVIDER_MODE: 'absent' });
    servers.push(gateway.server);

    const client = new WebSocket(gateway.origin.replace('http:', 'ws:') + '/api/runtime/workspaces/w/terminal');
    await once(client, 'open');

    const received = once(client, 'message');
    client.send('transport-fixture');
    expect(String((await received)[0])).toBe('transport-fixture');
    client.close();
    await once(client, 'close');
    await new Promise<void>((resolve) => sockets.close(() => resolve()));
  });
});
