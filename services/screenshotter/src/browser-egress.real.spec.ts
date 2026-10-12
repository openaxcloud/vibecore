import { createHash } from 'node:crypto';
import dns from 'node:dns';
import { writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { chromium } from 'playwright-core';
import { describe, expect, it, vi, type MockInstance } from 'vitest';
import { PlaywrightPageRenderer } from './browser.js';

const executable = process.env.SCREENSHOTTER_PROOF_EXECUTABLE;

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

/* Opt-in: one browser and two fixture servers. The private target counts real TCP requests. */
describe.skipIf(!executable)('capture HTTP : témoin TCP dans Chromium réel', () => {
  it('charge l’aperçu et ne contacte jamais la ressource privée', async () => {
    let privateRequests = 0;
    let privateConnections = 0;

    const privateServer = createServer((_request, response) => {
      privateRequests += 1;
      response.end('private fixture');
    });

    privateServer.on('connection', () => {
      privateConnections += 1;
    });

    const privateUrl = await listen(privateServer);
    const witness = await fetch(`${privateUrl}/positive-control`);
    expect(witness.status).toBe(200);
    expect(await witness.text()).toBe('private fixture');
    expect(privateRequests).toBe(1);
    privateRequests = 0;
    privateConnections = 0;

    const publicAddress = process.env.BROWSER_EGRESS_PROOF_ADDRESS;

    let publicImages = 0;
    let publicSockets = 0;
    let publicUrl: string | undefined;
    let publicServer: Server | undefined;
    let lookup: MockInstance<typeof dns.lookup> | undefined;

    if (publicAddress) {
      publicServer = createServer((_request, response) => {
        publicImages += 1;
        response.setHeader('content-type', 'image/svg+xml');
        response.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>',
        );
      });
      publicServer.on('upgrade', (request, socket) => {
        publicSockets += 1;

        const accept = createHash('sha1')
          .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest('base64');
        socket.end(
          `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
        );
      });
      await new Promise<void>((resolve, reject) => {
        publicServer!.once('error', reject);
        publicServer!.listen(Number(new URL(privateUrl).port), publicAddress, resolve);
      });
      publicUrl = `http://rebind.fixture.test:${(publicServer.address() as { port: number }).port}`;

      const nativeLookup = dns.lookup.bind(dns);
      lookup = vi.spyOn(dns, 'lookup').mockImplementation(((
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
    }

    const previewPaths: string[] = [];
    const previewHosts: string[] = [];

    const preview = createServer((request, response) => {
      previewPaths.push(request.url ?? '');
      previewHosts.push(request.headers.host ?? '');

      if (request.url?.startsWith('/redirect.svg')) {
        response.writeHead(302, { location: `${privateUrl}/redirect-private.svg` });
        response.end();
      } else if (request.url?.startsWith('/okay.svg')) {
        response.setHeader('content-type', 'image/svg+xml');
        response.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>',
        );
      } else {
        response.setHeader('content-type', 'text/html');
        response.end(
          `<html><body><h1>Real preview</h1><img src="/okay.svg"><img src="/redirect.svg"><img src="${privateUrl}/private.svg">${publicUrl ? `<img src="${publicUrl}/public.svg"><script>new WebSocket('${publicUrl.replace('http:', 'ws:')}/socket');new WebSocket('${privateUrl.replace('http:', 'ws:')}/private-socket');</script>` : ''}</body></html>`,
        );
      }
    });

    const previewUrl = await listen(preview);

    /*
     * Disable the browser's independent private-network protection only in
     * this fixture, so a green cannot hide a missing application guard.
     */
    const nativeLaunch = chromium.launch.bind(chromium);

    const launch = vi.spyOn(chromium, 'launch').mockImplementation((options) =>
      nativeLaunch({
        ...options,
        args: [
          ...(options?.args ?? []),
          '--disable-web-security',
          '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
        ],
      }),
    );
    const renderer = new PlaywrightPageRenderer({
      chromiumExecutablePath: executable,
      previewProxyUrl: previewUrl,
      previewHostSuffixes: ['localhost'],
      settleMs: 300,
      resolveHost: async () => [publicAddress ?? '93.184.216.34'],
    });

    try {
      const image = await renderer.render({ url: 'http://localhost/', width: 390, height: 400 });
      expect(image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
      expect(previewPaths).toContain('/');
      expect(previewPaths).toContain('/okay.svg');
      expect(previewPaths).toContain('/redirect.svg');
      expect(previewHosts).toContain('localhost');
      expect(privateRequests).toBe(0);
      expect(privateConnections).toBe(0);

      if (publicAddress) {
        expect(publicImages).toBeGreaterThan(0);
        expect(publicSockets).toBe(1);
        expect(lookup!.mock.calls.filter(([hostname]) => hostname === 'rebind.fixture.test')).toHaveLength(0);
      }

      if (process.env.SCREENSHOTTER_PROOF_IMAGE) {
        await writeFile(process.env.SCREENSHOTTER_PROOF_IMAGE, image);
      }
    } finally {
      if (process.env.BROWSER_EGRESS_PROOF_REPORT) {
        await writeFile(
          process.env.BROWSER_EGRESS_PROOF_REPORT,
          JSON.stringify({ publicImages, publicSockets, privateRequests, privateConnections }),
        );
      }

      await renderer.close();
      launch.mockRestore();
      lookup?.mockRestore();

      if (publicServer) {
        await close(publicServer);
      }

      await Promise.all([close(preview), close(privateServer)]);
    }
  }, 30_000);
});
