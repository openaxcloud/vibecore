import { describe, expect, it } from 'vitest';
import {
  RUNTIME_WEBSOCKET_PROTOCOL,
  runtimeWebSocketProtocols,
  runtimeWebSocketTargetFromUrl,
  runtimeWebSocketTicketFromProtocolHeader,
} from './runtime-websocket-ticket.js';

describe('runtime WebSocket ticket transport', () => {
  it('keeps the credential out of the URL and extracts it from Sec-WebSocket-Protocol', () => {
    const [protocol, credential] = runtimeWebSocketProtocols('runtime_ws_abc123456789');

    expect(protocol).toBe(RUNTIME_WEBSOCKET_PROTOCOL);
    expect(credential).toBe('vibecore.runtime.ticket.runtime_ws_abc123456789');
    expect(runtimeWebSocketTicketFromProtocolHeader(`${protocol}, ${credential}`)).toBe('runtime_ws_abc123456789');
  });

  it('binds only the five explicit runtime socket endpoints', () => {
    expect(runtimeWebSocketTargetFromUrl('/api/runtime/workspaces/ws-1/files/watch?managed=1')).toEqual({
      workspaceId: 'ws-1',
      endpoint: 'files/watch',
    });
    expect(runtimeWebSocketTargetFromUrl('/api/runtime/workspaces/ws-1/files/read')).toBeUndefined();
    expect(runtimeWebSocketTargetFromUrl('/projects/ws-1/terminal')).toBeUndefined();
  });

  it('rejects malformed or missing credential protocols', () => {
    expect(runtimeWebSocketTicketFromProtocolHeader(RUNTIME_WEBSOCKET_PROTOCOL)).toBeUndefined();
    expect(runtimeWebSocketTicketFromProtocolHeader('vibecore.runtime.ticket.bad token')).toBeUndefined();
    expect(runtimeWebSocketTicketFromProtocolHeader('vibecore.runtime.ticket.short')).toBeUndefined();
    expect(runtimeWebSocketTicketFromProtocolHeader('vibecore.runtime.ticket.runtime_ws_abc123456789')).toBeUndefined();
    expect(
      runtimeWebSocketTicketFromProtocolHeader('vibecore.runtime.ticket.runtime_ws_abc123456789, vibecore.runtime.v1'),
    ).toBeUndefined();
    expect(
      runtimeWebSocketTicketFromProtocolHeader(
        'vibecore.runtime.v1, vibecore.runtime.ticket.runtime_ws_abc123456789, vibecore.runtime.ticket.runtime_ws_other123456789',
      ),
    ).toBeUndefined();
  });
});
