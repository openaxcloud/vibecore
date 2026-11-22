import assert from 'node:assert/strict';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';

export const recipeApp = 'http://localhost:5173';
export const recipeApi = 'http://127.0.0.1:3001';

export function recipeBrowserTarget(value: string): URL | undefined {
  try {
    const url = new URL(value);

    if (
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.origin === recipeApp || (url.origin === recipeApi && /^\/api\/runtime(?:\/|$)/.test(url.pathname)))
    ) {
      return url;
    }
  } catch {
    // Malformed or non-absolute browser proxy requests fail closed.
  }

  return undefined;
}

export function recipeSafeResponse(status: number, rawHeaders: readonly string[]): boolean {
  /*
   * Nothing in the happy path requires a redirect: auth is already installed.
   * Don't relay even relative redirects: Chromium could follow a second hop
   * without ever handing it to Playwright's normal route interceptor.
   */
  return (
    !(status >= 300 && status < 400 && status !== 304) &&
    !rawHeaders.some((header, i) => i % 2 === 0 && /^(?:location|refresh)$/i.test(header))
  );
}

const hopByHop = [
  'connection',
  'proxy-connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'trailer',
  'te',
  'proxy-authenticate',
  'proxy-authorization',
];

function endDenied(response: ServerResponse, status: number) {
  response.writeHead(status, { 'cache-control': 'no-store', connection: 'close' });
  response.end();
}

function forward(req: IncomingMessage, res: ServerResponse, target: URL, verified: Set<string>) {
  /*
   * No DNS resolution or proxy chaining: both allowed browser origins refer to
   * a listener on this runner. Keep the browser Host and native Origin, method,
   * cookies and stream body (a real PATCH/DELETE/ZIP operation).
   */
  const headers = { ...req.headers, host: target.host };
  const listed = (req.headers.connection ?? '').split(',').map((key) => key.trim().toLowerCase());

  for (const key of [...hopByHop, ...listed]) {
    delete headers[key as keyof typeof headers];
  }

  const upstream = request(
    {
      hostname: '127.0.0.1',
      port: Number(target.port),
      path: target.pathname + target.search,
      method: req.method,
      headers,
      agent: false,
    },
    (response) => {
      const status = response.statusCode ?? 502;

      if (!recipeSafeResponse(status, response.rawHeaders)) {
        response.destroy();
        endDenied(res, 502);

        return;
      }

      if (status >= 200 && status < 300 && req.method !== 'OPTIONS') {
        verified.add(`${req.method} ${target.origin}${target.pathname}`);
      }

      /*
       * Pass raw header pairs (in particular multiple Set-Cookie headers).
       * Remove hop-by-hop values, letting Node reframe the response stream.
       */
      const headers: string[] = [];
      const listed = (response.headers.connection ?? '').split(',').map((key) => key.trim().toLowerCase());

      for (let index = 0; index < response.rawHeaders.length; index += 2) {
        const key = response.rawHeaders[index].toLowerCase();

        if (!hopByHop.includes(key) && !listed.includes(key)) {
          headers.push(response.rawHeaders[index], response.rawHeaders[index + 1]);
        }
      }

      res.writeHead(status, headers);
      response.on('error', () => res.destroy());
      response.pipe(res);
    },
  );
  upstream.setTimeout(35_000, () => upstream.destroy());
  upstream.on('error', () => (res.headersSent ? res.destroy() : endDenied(res, 502)));
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

/**
 * Local browser forwarding only, not a runner/process/pod firewall. No CONNECT,
 * TLS tunnels, redirects or upgrade/WS; the acceptance doesn't exercise them.
 */
export async function startRecipeBrowserHttp() {
  const verified = new Set<string>();

  const relay = createServer((req, res) => {
    const target = recipeBrowserTarget(req.url ?? '');

    if (!target) {
      endDenied(res, 403);
      return;
    }

    forward(req, res, target, verified);
  });
  relay.on('connect', (_request, socket) => socket.destroy());
  relay.on('upgrade', (_request, socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => {
    relay.once('error', reject);
    relay.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });

  const address = relay.address();
  assert.ok(address && typeof address !== 'string');

  return {
    proxy: `http://127.0.0.1:${address.port}`,
    saw: (key: string) => verified.has(key),
    reset: () => verified.clear(),
    close: () =>
      new Promise<void>((resolve, reject) => {
        relay.close((error) => (error ? reject(error) : resolve()));
        relay.closeAllConnections();
      }),
  };
}
