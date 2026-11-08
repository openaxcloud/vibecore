/** CI transport only: forwards to the actual Kubernetes workspace Service. */
import { execFile } from 'node:child_process';
import http from 'node:http';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

export function assertEphemeralEnvironment(env = process.env) {
  if (env.VIBECORE_CI_EPHEMERAL_RUNTIME !== '1' || !env.KUBECONFIG?.trim()) {
    throw new Error('Router requires VIBECORE_CI_EPHEMERAL_RUNTIME=1 and explicit KUBECONFIG');
  }
}

export function createServiceLookup({ env = process.env, ttlMs = 2000, maxEntries = 128 } = {}) {
  assertEphemeralEnvironment(env);

  const cache = new Map();

  return async (workspaceId) => {
    if (!ID.test(workspaceId)) {
      throw new Error('Invalid workspace ID');
    }

    const previous = cache.get(workspaceId);

    if (previous && previous.expires > Date.now()) {
      return previous.target;
    }

    cache.delete(workspaceId);

    const { stdout } = await execute(
      'kubectl',
      [
        '--kubeconfig',
        env.KUBECONFIG,
        '--namespace',
        'workspaces',
        'get',
        'service',
        `workspace-${workspaceId}`,
        '--output',
        'jsonpath={.spec.clusterIP}',
        '--request-timeout=5s',
      ],
      { env, timeout: 7000, maxBuffer: 4096 },
    );

    const hostname = stdout.trim();

    if (!isIP(hostname)) {
      throw new Error('Workspace Service has no routable ClusterIP');
    }

    const target = { hostname, port: 8080 };

    while (cache.size >= maxEntries) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(workspaceId, { target, expires: Date.now() + ttlMs });

    return target;
  };
}

function route(url) {
  // Match the raw URL: never decode encoded slashes or normalize dot segments.
  const match = /^\/([^/?]+)(\/[^]*|\?[^]*|)$/.exec(url ?? '');

  if (!match || !ID.test(match[1])) {
    return undefined;
  }

  return { id: match[1], path: match[2].startsWith('/') ? match[2] : `/${match[2]}` };
}

function headersFor(headers, websocket) {
  const result = { ...headers };

  if (!websocket) {
    for (const name of String(headers.connection ?? '').split(',')) {
      delete result[name.trim().toLowerCase()];
    }

    for (const name of HOP_HEADERS) {
      delete result[name];
    }
  }

  return result;
}

function rawResponse(socket, response, upgrade = false) {
  socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage ?? ''}\r\n`);

  const headers = headersFor(response.headers, upgrade);

  for (const [name, value] of Object.entries(headers)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        socket.write(`${name}: ${item}\r\n`);
      }
    }
  }
  socket.write('\r\n');
}

export function createRuntimeAgentRouter({ lookup, timeoutMs = 120000 } = {}) {
  if (typeof lookup !== 'function') {
    throw new Error('A Service lookup is required');
  }

  const server = http.createServer(async (request, response) => {
    const targetRoute = route(request.url);

    if (!targetRoute) {
      response.writeHead(400).end('Invalid workspace route');
      return;
    }

    let upstream;

    try {
      const target = await lookup(targetRoute.id);

      if (request.destroyed || response.destroyed) {
        return;
      }

      upstream = http.request(
        { ...target, method: request.method, path: targetRoute.path, headers: headersFor(request.headers, false) },
        (incoming) => {
          response.writeHead(incoming.statusCode, headersFor(incoming.headers, false));
          incoming.on('error', () => response.destroy());
          incoming.pipe(response);
        },
      );
      upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error('Upstream timeout')));
      upstream.on('error', () => {
        if (!response.headersSent) {
          response.writeHead(502).end('Workspace transport unavailable');
        } else {
          response.destroy();
        }
      });
      request.on('aborted', () => upstream.destroy());
      response.on('close', () => upstream.destroy());
      request.pipe(upstream);
    } catch {
      if (!response.headersSent) {
        response.writeHead(502).end('Workspace transport unavailable');
      } else {
        response.destroy();
      }
    }
  });
  server.on('upgrade', async (request, socket, head) => {
    socket.on('error', () => socket.destroy());

    const targetRoute = route(request.url);

    if (!targetRoute) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    let upstream;
    let upgraded = false;

    try {
      const target = await lookup(targetRoute.id);

      if (socket.destroyed) {
        return;
      }

      upstream = http.request({
        ...target,
        method: request.method,
        path: targetRoute.path,
        headers: headersFor(request.headers, true),
      });
      upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error('Upgrade timeout')));
      socket.on('close', () => upstream.destroy());
      upstream.on('upgrade', (response, peer, upstreamHead) => {
        upgraded = true;
        rawResponse(socket, response, true);
        peer.setTimeout(timeoutMs, () => peer.destroy());
        socket.setTimeout(timeoutMs, () => socket.destroy());
        peer.on('error', () => socket.destroy());
        peer.on('close', () => socket.destroy());
        socket.on('close', () => peer.destroy());

        if (head.length) {
          peer.write(head);
        }

        if (upstreamHead.length) {
          socket.write(upstreamHead);
        }

        socket.pipe(peer).pipe(socket);
      });
      upstream.on('response', (response) => {
        // Non-upgrade rejection is still the real upstream response.
        rawResponse(socket, response);
        response.on('error', () => socket.destroy());
        response.pipe(socket);
      });
      upstream.on('error', () => {
        if (upgraded) {
          socket.destroy();
        } else {
          socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        }
      });
      upstream.end();
    } catch {
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    }
  });
  server.requestTimeout = timeoutMs;
  server.headersTimeout = Math.min(timeoutMs, 30000);

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createRuntimeAgentRouter({ lookup: createServiceLookup() });
  server.listen(18081, '127.0.0.1', () => console.log('Ephemeral workspace transport listening on 127.0.0.1:18081'));

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
      setTimeout(() => process.exit(0), 1000).unref();
    });
  }
}
