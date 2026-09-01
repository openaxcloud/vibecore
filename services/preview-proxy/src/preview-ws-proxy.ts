/**
 * WebSocket (Vite HMR) proxying for the preview proxy.
 *
 * The HTTP path already forwards preview requests host→agent→dev-server, but
 * `0a819e58` only fixed the Vite CLIENT to target `wss://<preview>:443`; the proxy
 * never actually upgraded that WebSocket. So HMR connected, failed, and Vite
 * looped "server connection lost. Polling for restart…", reloading the page every
 * cycle (white flicker). This closes the gap: it upgrades the preview WebSocket
 * and pipes it, transparently, to the agent's `/preview/<port>/` endpoint (which
 * in turn reaches the dev server's ws on localhost:<port>).
 *
 * The routing + header logic is pure and unit-tested; the socket piping is a thin
 * IO wrapper.
 */
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { parsePreviewHost } from './app.js';

export interface PreviewWsTarget {
  workspaceId: string;
  port: string;

  /** Path to send upstream to the agent, e.g. `/preview/5173/@vite/client`. */
  upstreamPath: string;
}

/**
 * Resolve an incoming upgrade (host + request url) to the agent upstream path, or
 * null when it is not a preview host. Pure.
 */
export function resolvePreviewWsTarget(
  hostHeader: string | undefined,
  rawUrl: string | undefined,
  previewDomain: string | undefined,
): PreviewWsTarget | null {
  const parsed = parsePreviewHost(hostHeader, previewDomain);

  if (!parsed) {
    return null;
  }

  /*
   * The subdomain already identifies workspace+port; the ws path is host-root
   * relative (Vite connects to `/`), so forward it under the agent's dedicated
   * HMR upgrade path. A DISTINCT path (not `/preview/<port>/`) is required: the
   * agent already serves `/preview/:port/*` over HTTP, and a `{websocket:true}`
   * route on the same path collides ("Method 'GET' already declared").
   */
  const path = (rawUrl ?? '/').replace(/^\/+/, '');
  const upstreamPath = `/preview-hmr/${parsed.port}/${path}`;

  return { workspaceId: parsed.workspaceId, port: parsed.port, upstreamPath };
}

/**
 * Build the header set to send on the UPSTREAM upgrade request. Unlike the HTTP
 * path (which strips `upgrade`/`connection`), a WebSocket upgrade MUST preserve
 * `upgrade`, `connection`, and every `sec-websocket-*` header, or the handshake
 * fails. Host is rewritten to the upstream and auth is injected. Cookies and
 * tenant headers are dropped (auth is the agent bearer). Pure.
 */
export function buildUpstreamUpgradeHeaders(
  incoming: Record<string, string | string[] | undefined>,
  opts: { upstreamHost: string; agentToken?: string },
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) {
      continue;
    }

    const lower = name.toLowerCase();

    /*
     * Preserve the WebSocket handshake headers + a small safe set; drop hop-by-hop
     * auth/cookie/host which we re-set below.
     */
    if (
      lower === 'upgrade' ||
      lower === 'connection' ||
      lower.startsWith('sec-websocket-') ||
      lower === 'origin' ||
      lower === 'user-agent'
    ) {
      out[name] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  out.host = opts.upstreamHost;

  if (opts.agentToken) {
    out.authorization = `Bearer ${opts.agentToken}`;
  }

  return out;
}

export interface PreviewWsProxyDeps {
  previewDomain: string | undefined;
  resolveAgent: (workspaceId: string, orgId?: string) => Promise<{ baseUrl: string; token: string } | undefined>;

  /**
   * AUDX-005 — the same authorization the HTTP path applies.
   *
   * Previously this handler resolved the agent with NO orgId and no port gate,
   * so every control the HTTP path enforces was simply absent over WebSocket:
   * anyone who learned a workspaceId could open the HMR socket to another
   * tenant's preview and receive its traffic. A door is not locked because the
   * front door is.
   */
  enforceTenant?: boolean;

  /** Derive the requester's orgId from the upgrade request's `vc_preview` cookie. */
  resolveRequesterOrgId?: (cookieHeader: string | undefined) => string | undefined;

  enforcePrivatePorts?: boolean;

  /** Same lookup the HTTP path uses — fail-closed on an unknown answer. */
  isPortPrivate?: (workspaceId: string, port: string) => Promise<boolean>;

  /** Interval for the server→client keepalive ping (survives the ~30s LB idle). */
  keepaliveMs?: number;
  logger?: { warn?: (msg: string) => void };
}

/**
 * Read one cookie out of a raw Cookie header. Local copy so this module stays
 * usable without importing the whole proxy app.
 */
export function readUpgradeCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();

    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1);
    }
  }

  return undefined;
}

const KEEPALIVE_DEFAULT_MS = 15_000;

function destroy(socket: Duplex, code = 400) {
  try {
    if (socket.writable) {
      socket.write(`HTTP/1.1 ${code} Bad Request\r\nConnection: close\r\n\r\n`);
    }
  } catch {
    // ignore
  }

  socket.destroy();
}

/**
 * Attach the preview WebSocket upgrade handler to a Node http.Server. For a
 * preview-host upgrade it opens the matching upgrade to the agent and pipes both
 * sockets. Non-preview upgrades are left untouched (destroyed) so this never
 * interferes with any other ws surface.
 */
export function attachPreviewWebSocketProxy(server: ReturnType<typeof createServer>, deps: PreviewWsProxyDeps): void {
  const keepaliveMs = deps.keepaliveMs ?? KEEPALIVE_DEFAULT_MS;

  server.on('upgrade', (req: IncomingMessage, clientSocket: Duplex, head: Buffer) => {
    const target = resolvePreviewWsTarget(req.headers.host, req.url, deps.previewDomain);

    if (!target) {
      destroy(clientSocket, 404);

      return;
    }

    void (async () => {
      /*
       * Tenant gate. Mirrors the HTTP path: a missing/invalid `vc_preview`
       * cookie is a hard refusal, never a fall-through to the unauthenticated
       * resolve — that fall-through is what leaked cross-tenant previews.
       */
      let requesterOrgId: string | undefined;

      if (deps.enforceTenant) {
        requesterOrgId = deps.resolveRequesterOrgId?.(req.headers.cookie);

        if (!requesterOrgId) {
          destroy(clientSocket, 403);

          return;
        }
      }

      /*
       * Private-port gate. isPortPrivate fails CLOSED, so an unknown answer
       * denies rather than serving a private port to an anonymous socket.
       */
      if (deps.enforcePrivatePorts && deps.isPortPrivate) {
        const isPrivate = await deps.isPortPrivate(target.workspaceId, String(target.port)).catch(() => true);

        if (isPrivate) {
          const sessionOrgId = requesterOrgId ?? deps.resolveRequesterOrgId?.(req.headers.cookie);

          if (!sessionOrgId) {
            destroy(clientSocket, 401);

            return;
          }
        }
      }

      /*
       * Forward the orgId so workspace-manager can reject a workspace owned by
       * another org. Passing nothing here made the ownership check unreachable.
       */
      const agent = await deps.resolveAgent(target.workspaceId, requesterOrgId).catch(() => undefined);

      if (!agent) {
        destroy(clientSocket, 502);

        return;
      }

      let upstreamUrl: URL;

      try {
        upstreamUrl = new URL(`${agent.baseUrl.replace(/\/$/, '')}${target.upstreamPath}`);
      } catch {
        destroy(clientSocket, 502);

        return;
      }

      const headers = buildUpstreamUpgradeHeaders(req.headers, {
        upstreamHost: upstreamUrl.host,
        agentToken: agent.token,
      });

      const upstreamReq = httpRequest({
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port,
        path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
        method: 'GET',
        headers,
      });

      upstreamReq.on('upgrade', (_upstreamRes, upstreamSocket, upstreamHead) => {
        // Complete the handshake to the client, then pipe both ways.
        clientSocket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            headerLines(_upstreamRes.headers) +
            '\r\n',
        );

        if (upstreamHead && upstreamHead.length) {
          clientSocket.unshift(upstreamHead);
        }

        if (head && head.length) {
          upstreamSocket.unshift(head);
        }

        const ping = setInterval(() => {
          // 0x89 = FIN|ping opcode, 0-length payload — a bare WS ping frame.
          try {
            upstreamSocket.write(Buffer.from([0x89, 0x00]));
          } catch {
            // ignore
          }
        }, keepaliveMs);

        const cleanup = () => {
          clearInterval(ping);
          upstreamSocket.destroy();
          clientSocket.destroy();
        };

        upstreamSocket.on('error', cleanup);
        clientSocket.on('error', cleanup);
        upstreamSocket.on('close', cleanup);
        clientSocket.on('close', cleanup);

        clientSocket.pipe(upstreamSocket);
        upstreamSocket.pipe(clientSocket);
      });

      upstreamReq.on('error', () => {
        deps.logger?.warn?.(`preview ws upstream error for ${target.workspaceId}:${target.port}`);
        destroy(clientSocket, 502);
      });

      upstreamReq.end();
    })();
  });
}

/** Serialize forwarded response headers (excluding the ones we set explicitly). */
function headerLines(headers: IncomingMessage['headers']): string {
  let out = '';

  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();

    if (lower === 'upgrade' || lower === 'connection' || value === undefined) {
      continue;
    }

    const serialized = Array.isArray(value) ? value.join(', ') : value;
    out += `${name}: ${serialized}\r\n`;
  }

  return out;
}
