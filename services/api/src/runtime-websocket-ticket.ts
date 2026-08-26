import type { RuntimeWebSocketEndpoint } from './store.js';

/** Stable, non-secret protocol selected by the WebSocket server. */
export const RUNTIME_WEBSOCKET_PROTOCOL = 'vibecore.runtime.v1';

/** The raw one-time credential is carried only in this handshake header value. */
export const RUNTIME_WEBSOCKET_TICKET_PROTOCOL_PREFIX = 'vibecore.runtime.ticket.';

const ENDPOINTS = new Set<RuntimeWebSocketEndpoint>([
  'commands/stream',
  'terminal',
  'logs',
  'files/watch',
  'ports/watch',
]);

export function runtimeWebSocketProtocols(ticket: string): [string, string] {
  return [RUNTIME_WEBSOCKET_PROTOCOL, `${RUNTIME_WEBSOCKET_TICKET_PROTOCOL_PREFIX}${ticket}`];
}

export function runtimeWebSocketTicketFromProtocolHeader(header: string | string[] | undefined): string | undefined {
  const values = (Array.isArray(header) ? header.join(',') : (header ?? '')).split(',').map((value) => value.trim());
  const credentials = values.filter((value) => value.startsWith(RUNTIME_WEBSOCKET_TICKET_PROTOCOL_PREFIX));

  /*
   * The stable protocol MUST be first: `ws` selects the first offered protocol
   * by default. If the credential protocol came first, the server would echo
   * the raw ticket in `Sec-WebSocket-Protocol` on the 101 response, needlessly
   * exposing it to response-header logging. Reject ambiguous/duplicate tickets
   * too, rather than silently authenticating with whichever value came first.
   */
  if (values[0] !== RUNTIME_WEBSOCKET_PROTOCOL || credentials.length !== 1) {
    return undefined;
  }

  const credential = credentials[0];
  const ticket = credential.slice(RUNTIME_WEBSOCKET_TICKET_PROTOCOL_PREFIX.length);

  /* Bound parsing and require the opaque-token alphabet used by createOpaqueToken. */
  return ticket.length >= 16 && ticket.length <= 256 && /^[A-Za-z0-9._~-]+$/.test(ticket) ? ticket : undefined;
}

export function runtimeWebSocketTargetFromUrl(
  rawUrl: string,
): { workspaceId: string; endpoint: RuntimeWebSocketEndpoint } | undefined {
  const pathname = new URL(rawUrl, 'http://vibecore.local').pathname;

  const match = pathname.match(
    /^\/api\/runtime\/workspaces\/([^/]+)\/(commands\/stream|terminal|logs|files\/watch|ports\/watch)$/,
  );

  if (!match) {
    return undefined;
  }

  let workspaceId: string;

  try {
    workspaceId = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }

  const endpoint = match[2] as RuntimeWebSocketEndpoint;

  return workspaceId && ENDPOINTS.has(endpoint) ? { workspaceId, endpoint } : undefined;
}
