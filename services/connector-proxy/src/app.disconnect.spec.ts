import { request as httpRequest } from 'node:http';
import { AddressInfo } from 'node:net';
import { signConnectorAccessToken } from '@vibecore/connector-sdk';
import { describe, expect, it } from 'vitest';
import { buildConnectorProxyApp, type ConnectionResolution } from './app.js';

const secret = 'connector-proxy-spec-secret-do-not-ship';

const basePayload = {
  workspaceId: 'ws_1',
  projectId: 'proj_1',
  userId: 'user_1',
  organizationId: 'org_1',
};

function allowResolver(provider: string, accessToken: string): ConnectionResolution {
  return { ok: true, provider, accessToken };
}

/**
 * Builds a Response that advertises a small, finite Content-Length (so the proxy
 * takes the BUFFERED branch and calls `arrayBuffer()`) but whose body never
 * produces its declared bytes — it resolves only when the injected AbortSignal
 * fires. This models a slow provider that has sent headers but stalls the body.
 */
function stallingBufferedResponse(signal: AbortSignal): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // Emit nothing until aborted; then close so arrayBuffer() can settle.
      const onAbort = () => {
        try {
          controller.error(new DOMException('Aborted', 'AbortError'));
        } catch {
          // already closed
        }
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
    },
  });

  return new Response(body, {
    status: 200,

    // Finite, small, non-zero, <= 1MB => shouldBufferResponse === true.
    headers: { 'content-type': 'application/json', 'content-length': '64' },
  });
}

describe('connector-proxy client-disconnect abort (buffered branch)', () => {
  it('aborts the upstream fetch when the client disconnects mid-buffer', async () => {
    let capturedSignal: AbortSignal | undefined;
    let upstreamAborted = false;

    const fetchImpl = (async (_input: URL | string | Request, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      capturedSignal?.addEventListener('abort', () => {
        upstreamAborted = true;
      });

      /*
       * Slow provider: headers (with a small Content-Length) arrive immediately,
       * but the body bytes never come — arrayBuffer() stays in flight until abort.
       */
      return stallingBufferedResponse(capturedSignal ?? new AbortController().signal);
    }) as unknown as typeof fetch;

    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => allowResolver('github', 'gh-token-secret'),
      fetchImpl,
    });

    await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      const address = app.server.address() as AddressInfo;

      const token = signConnectorAccessToken({
        payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
        secret,
      });

      /*
       * Fire a real request, then abort the client socket while the proxy is
       * still awaiting upstreamResponse.arrayBuffer().
       */
      const clientReq = httpRequest({
        host: '127.0.0.1',
        port: address.port,
        path: '/proxy/conn_1/repos/octo/hello',
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });

      clientReq.on('error', () => {
        // Expected: we destroy the socket below.
      });

      clientReq.end();

      // Give the proxy time to dispatch upstream and start awaiting the body.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(capturedSignal).toBeDefined();
      expect(upstreamAborted).toBe(false);

      // Client disconnects.
      clientReq.destroy();

      // The reply.raw 'close' handler should abort the upstream fetch.
      await waitFor(() => upstreamAborted, 2_000);
      expect(upstreamAborted).toBe(true);
    } finally {
      await app.close();
    }
  });
});

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
