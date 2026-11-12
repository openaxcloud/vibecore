import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it, vi } from 'vitest';

const endpoint = 'https://mcp.example.com/rpc';
const secret = 'synthetic-mcp-header-not-a-real-credential';

const message = {
  jsonrpc: '2.0' as const,
  id: 7,
  method: 'tools/call',
  params: { name: 'echo', arguments: { text: 'private fixture' } },
};

const result = { jsonrpc: '2.0', id: 7, result: { content: [] } };

type Receipt = {
  url: string;
  headers: Headers;
  body: BodyInit | null | undefined;
  redirect: RequestRedirect | undefined;
};

function controlledFetch(redirectTo?: string) {
  const receipts: Receipt[] = [];
  const success = () => new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });

  /*
   * The only fake is the Fetch boundary, not the SDK transport. Model Fetch's
   * default following of a 307 (including custom headers and the POST body).
   */
  const fetcher: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    receipts.push({ url, headers: new Headers(init?.headers), body: init?.body, redirect: init?.redirect });

    if (redirectTo && url === endpoint) {
      if (init?.redirect === 'error') {
        throw new TypeError('redirect disallowed');
      }

      if (init?.redirect === 'manual') {
        return new Response(null, { status: 307, headers: { location: redirectTo } });
      }

      receipts.push({
        url: redirectTo,
        headers: new Headers(init?.headers),
        body: init?.body,
        redirect: init?.redirect,
      });
    }

    return success();
  };

  return { fetcher, receipts };
}

function client(fetcher: typeof fetch) {
  return new StreamableHTTPClientTransport(new URL(endpoint), {
    fetch: fetcher,
    requestInit: { headers: { 'X-Private-Token': secret } },
  });
}

describe('installed MCP Streamable HTTP transport redirect policy', () => {
  it('rejects an inter-origin redirect without resending the private header or JSON-RPC body', async () => {
    const { fetcher, receipts } = controlledFetch('https://other.example.net/collect');
    const transport = client(fetcher);
    const onmessage = vi.fn();
    transport.onmessage = onmessage;

    try {
      await transport.start();

      const outcome = await transport.send(message).then(
        () => 'accepted',
        () => 'rejected',
      );
      expect({ outcome, destinations: receipts.map((receipt) => receipt.url) }).toEqual({
        outcome: 'rejected',
        destinations: [endpoint],
      });
      expect(receipts[0].headers.get('X-Private-Token')).toBe(secret);
      expect(receipts[0].body).toBe(JSON.stringify(message));
      expect(onmessage).not.toHaveBeenCalled();
    } finally {
      await transport.close();
    }
  });

  it.each([undefined, 'https://mcp.example.com/next-rpc'])(
    'preserves a normal response and same-origin redirects (%s)',
    async (redirectTo) => {
      const { fetcher, receipts } = controlledFetch(redirectTo);
      const transport = client(fetcher);
      const onmessage = vi.fn();
      transport.onmessage = onmessage;

      try {
        await transport.start();
        await transport.send(message);
        expect(onmessage).toHaveBeenCalledWith(result);
        expect(receipts.map((receipt) => receipt.url)).toEqual(redirectTo ? [endpoint, redirectTo] : [endpoint]);

        for (const receipt of receipts) {
          expect(receipt.headers.get('X-Private-Token')).toBe(secret);
          expect(receipt.body).toBe(JSON.stringify(message));
        }
      } finally {
        await transport.close();
      }
    },
  );
});

async function listenOnLoopback(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

describe('native Fetch redirect boundary on isolated loopback servers', () => {
  it.each([307, 308])('does not contact another origin after HTTP %s', async (status) => {
    const collectorRequests: string[] = [];
    const received: Array<{ path: string; header: string | string[] | undefined; body: string }> = [];

    const collector = createServer((request, response) => {
      collectorRequests.push(request.url ?? '');
      request.resume();
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result));
    });

    const collectorUrl = await listenOnLoopback(collector);

    const origin = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        received.push({ path: request.url ?? '', header: request.headers['x-private-token'], body });

        if (request.url === '/redirect') {
          response.writeHead(status, { location: `${collectorUrl}/collect` });
          response.end();

          return;
        }

        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(result));
      });
    });

    const transports: StreamableHTTPClientTransport[] = [];

    try {
      const originUrl = await listenOnLoopback(origin);

      const redirected = new StreamableHTTPClientTransport(new URL(`${originUrl}/redirect`), {
        fetch: globalThis.fetch,
        requestInit: { headers: { 'X-Private-Token': secret } },
      });
      transports.push(redirected);
      await redirected.start();
      await expect(redirected.send(message)).rejects.toThrow();
      expect(collectorRequests).toEqual([]);
      expect(received).toEqual([{ path: '/redirect', header: secret, body: JSON.stringify(message) }]);

      const normal = new StreamableHTTPClientTransport(new URL(`${originUrl}/normal`), {
        fetch: globalThis.fetch,
        requestInit: { headers: { 'X-Private-Token': secret } },
      });
      transports.push(normal);

      const onmessage = vi.fn();
      normal.onmessage = onmessage;
      await normal.start();
      await normal.send(message);
      expect(onmessage).toHaveBeenCalledWith(result);
      expect(received[1]).toEqual({ path: '/normal', header: secret, body: JSON.stringify(message) });
      expect(collectorRequests).toEqual([]);
    } finally {
      await Promise.all(transports.map((transport) => transport.close()));
      await Promise.all([closeServer(origin), closeServer(collector)]);
    }
  });
});
