import assert from 'node:assert/strict';
import { createServer, request, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { validateProviderAbsent } from './contracts.js';

export function localOrigin(value: string) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port);
  assert.equal(url.origin, value);

  return url;
}

/** Only the missing runtime routes bypass the real web server's session-aware routes. */
export function routeSurface(path: string) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  assert.ok(!/[\\\r\n]/.test(path));

  const pathname = new URL(path, 'http://127.0.0.1').pathname;
  assert.equal(pathname, path.split('?')[0]);

  // This ASCII fixture needs no encoded path segments; reject ambiguous routing outright.
  assert.ok(!pathname.includes('%'));
  assert.ok(!/^\/api\/(chat|generate|agent|llm|ai|completion|completions)(\/|-|$)/.test(pathname));

  return pathname === '/api/runtime' || pathname.startsWith('/api/runtime/') ? 'api' : 'web';
}

/** Loopback transport only; does not start a stack, authorize a PVC mutation or mint auth. */
export async function startGateway(web: string, api: string, env = process.env) {
  validateProviderAbsent(env);

  const targets = { web: localOrigin(web), api: localOrigin(api) };
  assert.notEqual(web, api);

  const server = createServer((incoming, response) => {
    try {
      const target = targets[routeSurface(incoming.url ?? '')];

      const upstream = request(options(incoming, target), (received) => {
        response.writeHead(received.statusCode ?? 502, received.headers);
        received.pipe(response);
      });
      upstream.on('error', () => {
        if (!response.headersSent) {
          response.writeHead(502);
        }

        response.end();
      });
      incoming.on('aborted', () => upstream.destroy());
      incoming.pipe(upstream);
    } catch {
      response.writeHead(403).end();
    }
  });
  server.on('upgrade', (incoming, socket, head) => {
    try {
      const target = targets[routeSurface(incoming.url ?? '')];
      const upstream = request(options(incoming, target));
      upstream.on('upgrade', (received, remote, upstreamHead) => {
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\n${received.rawHeaders.reduce((lines, value, i, all) => (i % 2 ? lines : `${lines}${value}: ${all[i + 1]}\r\n`), '')}\r\n`,
        );

        if (upstreamHead.length) {
          socket.write(upstreamHead);
        }

        if (head.length) {
          remote.write(head);
        }

        remote.on('error', () => socket.destroy());
        socket.on('error', () => remote.destroy());
        socket.on('close', () => remote.destroy());
        remote.on('close', () => socket.destroy());
        remote.pipe(socket).pipe(remote);
      });
      upstream.on('response', (received) => {
        received.resume();
        socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      });
      upstream.on('error', () => socket.destroy());
      upstream.end();
    } catch {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

function options(incoming: IncomingMessage, target: URL) {
  // Keep the browser Host/Origin/cookies/bearer intact for the real auth and preview guards.
  return {
    hostname: target.hostname,
    port: target.port,
    method: incoming.method,
    path: incoming.url,
    headers: incoming.headers,
  };
}
