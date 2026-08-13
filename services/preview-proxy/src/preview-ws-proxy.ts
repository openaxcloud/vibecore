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
   * Per-tenant authorization for the WebSocket door.
   *
   * This upgrade path used to call `resolveAgent(workspaceId)` with NO orgId and
   * without reading the `vc_preview` cookie at all, so it bypassed the tenant gate
   * entirely: with PREVIEW_PROXY_ENFORCE_TENANT=true an anonymous client — or one
   * holding another tenant's cookie — still got a 101 and a live pipe to the
   * workspace's dev server. Proven on the audit cluster (2026-08-09): the HTTP
   * door answered 403 while the same host upgraded and delivered upstream bytes.
   * A gate that covers GET but not UPGRADE is not a gate; Vite's HMR socket
   * carries module source, so this was a cross-tenant read channel.
   *
   * `resolveRequesterOrgId` verifies the cookie and returns the requester's orgId
   * (undefined when absent/invalid/expired). `enforceTenant` makes a missing orgId
   * a hard refusal. The orgId is forwarded to `resolveAgent` in BOTH modes so the
   * workspace-manager's ownership check can deny a mismatch even while enforcement
   * is off — exactly what the HTTP path does.
   */
  enforceTenant?: boolean;
  resolveRequesterOrgId?: (headers: IncomingMessage['headers']) => string | undefined;

  /** Interval for the server→client keepalive ping (survives the ~30s LB idle). */
  keepaliveMs?: number;
  logger?: { warn?: (msg: string) => void };
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
       * Tenant gate, BEFORE resolving anything upstream. 403 (not 401): the
       * refusal is final for this cookie, and it matches what the HTTP door
       * answers for the same condition.
       */
      const requesterOrgId = deps.resolveRequesterOrgId?.(req.headers);

      if (deps.enforceTenant && !requesterOrgId) {
        deps.logger?.warn?.(
          `preview ws upgrade refused: no valid vc_preview cookie (workspace=${target.workspaceId})`,
        );
        destroy(clientSocket, 403);

        return;
      }

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
