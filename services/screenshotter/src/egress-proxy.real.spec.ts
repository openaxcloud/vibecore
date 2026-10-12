import dns from 'node:dns';
import { writeFile } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import { connect } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserEgressProxy } from './egress-proxy.js';

const publicAddress = process.env.BROWSER_EGRESS_PROOF_ADDRESS;
afterEach(() => vi.restoreAllMocks());

async function listen(server: Server, host: string, port = 0) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return (server.address() as { port: number }).port;
}

function throughProxy(proxy: string, target: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const url = new URL(proxy);

    const outgoing = request({ hostname: url.hostname, port: url.port, path: target }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function tunnel(proxy: string, target: string, host: string) {
  return new Promise<string>((resolve, reject) => {
    const url = new URL(proxy);
    const socket = connect({ host: url.hostname, port: Number(url.port) });

    let data = '';
    let sent = false;
    socket.setTimeout(3000, () => socket.destroy(new Error('Proof tunnel timed out')));
    socket.once('connect', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    socket.on('data', (chunk) => {
      data += chunk.toString();

      if (!sent && data.includes('\r\n\r\n') && data.startsWith('HTTP/1.1 200')) {
        sent = true;
        socket.write(`GET /tunnel HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
      }
    });
    socket.once('end', () => resolve(data));
    socket.once('error', reject);
  });
}

describe.skipIf(!publicAddress)('browser proxy: real checked-IP connections', () => {
  it('pins HTTP and CONNECT, refuses private destinations and preserves Host', async () => {
    let privateRequests = 0;
    let publicRequests = 0;

    const hosts: string[] = [];

    const publicServer = createServer((incoming, response) => {
      publicRequests += 1;
      hosts.push(incoming.headers.host ?? '');
      response.end('public fixture');
    });

    const port = await listen(publicServer, publicAddress!);

    const privateServer = createServer((_incoming, response) => {
      privateRequests += 1;
      response.end('private fixture');
    });
    await listen(privateServer, '127.0.0.1', port);
    expect(await (await fetch(`http://127.0.0.1:${port}/witness`)).text()).toBe('private fixture');
    expect(privateRequests).toBe(1);
    privateRequests = 0;

    const nativeLookup = dns.lookup.bind(dns);

    const lookup = vi.spyOn(dns, 'lookup').mockImplementation(((
      hostname: string,
      options: unknown,
      callback: (error: null, address: string | dns.LookupAddress[], family?: number) => void,
    ) => {
      if (hostname === 'rebind.fixture.test') {
        if ((options as { all?: boolean }).all) {
          callback(null, [{ address: '127.0.0.1', family: 4 }]);
        } else {
          callback(null, '127.0.0.1', 4);
        }

        return;
      }

      nativeLookup(hostname, options as never, callback as never);
    }) as typeof dns.lookup);

    const proxy = await createBrowserEgressProxy(async () => [publicAddress!]);

    try {
      const host = `rebind.fixture.test:${port}`;
      expect(await throughProxy(proxy.url, `http://${host}/public`)).toEqual({ status: 200, body: 'public fixture' });
      expect(await tunnel(proxy.url, host, host)).toContain('public fixture');
      expect((await throughProxy(proxy.url, `http://127.0.0.1:${port}/private`)).status).toBe(403);
      expect(await tunnel(proxy.url, `127.0.0.1:${port}`, '127.0.0.1')).toContain('403 Forbidden');
      expect(publicRequests).toBe(2);
      expect(hosts).toEqual([host, host]);
      expect(privateRequests).toBe(0);
      expect(lookup.mock.calls.filter(([hostname]) => hostname === 'rebind.fixture.test')).toHaveLength(0);
    } finally {
      if (process.env.BROWSER_EGRESS_PROOF_REPORT) {
        await writeFile(process.env.BROWSER_EGRESS_PROOF_REPORT, JSON.stringify({ publicRequests, privateRequests }));
      }

      await proxy.close();
      await Promise.all([
        new Promise<void>((resolve) => publicServer.close(() => resolve())),
        new Promise<void>((resolve) => privateServer.close(() => resolve())),
      ]);
    }
  }, 10000);
});

describe('browser proxy: private network refusal on real sockets', () => {
  it('blocks HTTP and CONNECT even when the private server is reachable', async () => {
    let requests = 0;

    const server = createServer((_incoming, response) => {
      requests += 1;
      response.end('private fixture');
    });

    const port = await listen(server, '127.0.0.1');
    expect(await (await fetch(`http://127.0.0.1:${port}/witness`)).text()).toBe('private fixture');
    expect(requests).toBe(1);
    requests = 0;

    const proxy = await createBrowserEgressProxy();

    try {
      expect((await throughProxy(proxy.url, `http://127.0.0.1:${port}/private`)).status).toBe(403);
      expect(await tunnel(proxy.url, `127.0.0.1:${port}`, '127.0.0.1')).toContain('403 Forbidden');
      expect(requests).toBe(0);
    } finally {
      await proxy.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
