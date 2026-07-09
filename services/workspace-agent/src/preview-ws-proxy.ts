/**
 * Preview WebSocket bridge (agent side).
 *
 * The preview-proxy now forwards the Vite HMR WebSocket upgrade to the agent at
 * `/preview/<port>/<rest>`. Because the agent already terminates WebSockets with
 * @fastify/websocket (terminal), a raw `server.on('upgrade')` here would collide
 * with it — so this is a normal `{ websocket: true }` route that BRIDGES the
 * incoming socket to the dev server's own WebSocket on `ws://localhost:<port>`.
 *
 * The path parsing is pure + unit-tested; the bridge is a thin, defensive relay
 * (a dev-server ws failure only drops HMR, never the agent).
 */
import WebSocket from 'ws';

export interface AgentPreviewWsTarget {
  port: number;

  /** Path to open on the local dev server, e.g. `/` or `/@vite/`. */
  forwardPath: string;
}

/**
 * Parse `/preview-hmr/<port>/<rest>` into the dev-server port + the ws path to
 * open on it. Vite's HMR ws listens at the server root, so `/preview-hmr/5173/`
 * maps to `/`. A dedicated path (not `/preview/<port>/`) avoids colliding with
 * the agent's HTTP preview route. Returns null for a non-preview / invalid path
 * or the agent's own port.
 */
export function parseAgentPreviewWsPath(rawUrl: string | undefined, selfPort: number): AgentPreviewWsTarget | null {
  if (!rawUrl) {
    return null;
  }

  const [pathname, search = ''] = rawUrl.split('?', 2);
  const match = /^\/preview-hmr\/(\d{1,5})\/(.*)$/.exec(pathname);

  if (!match) {
    return null;
  }

  const port = Number(match[1]);

  if (!Number.isInteger(port) || port <= 0 || port > 65535 || port === selfPort) {
    return null;
  }

  const rest = match[2].replace(/^\/+/, '');
  const forwardPath = `/${rest}${search ? `?${search}` : ''}`;

  return { port, forwardPath };
}

interface BridgeableSocket {
  send(data: WebSocket.RawData | string): void;
  close(code?: number): void;
  on(event: 'message', listener: (data: WebSocket.RawData, isBinary: boolean) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: (err: unknown) => void): void;
}

export interface PreviewWsBridgeDeps {
  selfPort: number;

  /** Injectable for tests; defaults to the real `ws` client. */
  createUpstream?: (url: string) => BridgeableSocket & { on(event: 'open', listener: () => void): void };
  logger?: { warn?: (msg: string) => void };
}

/**
 * Build the @fastify/websocket route handler that bridges an incoming preview ws
 * to the local dev server. Frame-level relay in both directions with queueing
 * until the upstream opens; any error/close on either side tears down both.
 */
export function createPreviewWsBridgeHandler(deps: PreviewWsBridgeDeps) {
  const createUpstream =
    deps.createUpstream ??
    ((url: string) => new WebSocket(url) as unknown as ReturnType<NonNullable<PreviewWsBridgeDeps['createUpstream']>>);

  return function handle(clientRaw: unknown, request: { url?: string }): void {
    const client = clientRaw as BridgeableSocket;
    const target = parseAgentPreviewWsPath(request.url, deps.selfPort);

    if (!target) {
      client.close(1008);

      return;
    }

    let upstream: ReturnType<typeof createUpstream>;

    try {
      upstream = createUpstream(`ws://127.0.0.1:${target.port}${target.forwardPath}`);
    } catch {
      client.close(1011);

      return;
    }

    let open = false;

    const pending: Array<WebSocket.RawData | string> = [];

    const teardown = () => {
      try {
        upstream.close();
      } catch {
        // ignore
      }

      try {
        client.close();
      } catch {
        // ignore
      }
    };

    upstream.on('open', () => {
      open = true;

      for (const frame of pending.splice(0)) {
        try {
          upstream.send(frame);
        } catch {
          // ignore
        }
      }
    });

    upstream.on('message', (data: WebSocket.RawData) => {
      try {
        client.send(data);
      } catch {
        // ignore
      }
    });

    client.on('message', (data: WebSocket.RawData) => {
      if (open) {
        try {
          upstream.send(data);
        } catch {
          // ignore
        }
      } else {
        pending.push(data);
      }
    });

    upstream.on('error', () => {
      deps.logger?.warn?.(`preview ws upstream error on :${target.port}`);
      teardown();
    });
    client.on('error', teardown);
    upstream.on('close', teardown);
    client.on('close', teardown);
  };
}
