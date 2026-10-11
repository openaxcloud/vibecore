import { once } from 'node:events';
import { createServer, request, type IncomingHttpHeaders } from 'node:http';
import { connect } from 'node:net';
import type { Duplex } from 'node:stream';
import { resolveOutboundDestination, type OutboundUrlPolicy } from '@vibecore/security';

/** Every browser HTTP request or CONNECT tunnel reaches only its checked IP. */
export async function createBrowserEgressProxy(resolveHost?: OutboundUrlPolicy['resolveHost']) {
  const sockets = new Set<Duplex>();

  let closed = false;

  const policy = { allowedHostSuffixes: [], allowAnyPublicHost: true, resolveHost };

  const server = createServer(async (incoming, outgoing) => {
    try {
      const destination = await resolveOutboundDestination(incoming.url ?? '', policy);

      if (closed || outgoing.destroyed) {
        return;
      }

      if ('rejection' in destination || destination.url.protocol !== 'http:') {
        outgoing.writeHead(403).end();

        return;
      }

      const { url, addresses } = destination;
      const headers: IncomingHttpHeaders = { ...incoming.headers, host: url.host };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];

      const upstream = request(
        {
          hostname: addresses[0],
          port: url.port || 80,
          method: incoming.method,
          path: `${url.pathname}${url.search}`,
          headers,
          agent: false,
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      upstream.on('error', () => {
        if (!outgoing.headersSent) {
          outgoing.writeHead(502);
        }

        outgoing.end();
      });
      upstream.setTimeout(15_000, () => upstream.destroy(new Error('Outbound request timed out')));
      incoming.once('aborted', () => upstream.destroy());
      outgoing.once('close', () => upstream.destroy());
      incoming.pipe(upstream);
    } catch {
      outgoing.writeHead(403).end();
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  // Chromium uses CONNECT for HTTPS and WebSockets; the TLS identity stays end-to-end.
  server.on('connect', async (incoming, client, head) => {
    try {
      const destination = await resolveOutboundDestination(`https://${incoming.url ?? ''}/`, policy);

      if ('rejection' in destination) {
        client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');

        return;
      }

      if (closed || client.destroyed) {
        return;
      }

      const { url, addresses } = destination;
      const upstream = connect({ host: addresses[0], port: Number(url.port || 443) });
      sockets.add(upstream);
      upstream.once('close', () => sockets.delete(upstream));

      const timeout = setTimeout(() => upstream.destroy(), 10_000);
      upstream.once('connect', () => {
        clearTimeout(timeout);
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');

        if (head.length) {
          upstream.write(head);
        }

        client.pipe(upstream).pipe(client);
      });
      upstream.once('error', () => client.destroy());
      upstream.once('close', () => {
        clearTimeout(timeout);
        client.destroy();
      });
      client.once('error', () => upstream.destroy());
      client.once('close', () => upstream.destroy());
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Browser egress proxy failed to listen');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      closed = true;

      for (const socket of sockets) {
        socket.destroy();
      }

      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
