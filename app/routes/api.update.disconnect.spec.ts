import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * /api/update is a local self-update helper whose loader/action fork a chain of
 * git subprocesses (including an outbound `git fetch upstream <branch>`). Two
 * concerns are exercised here:
 *
 *  1. Auth gate (DoS / topology leak): an unauthenticated caller must receive
 *     the auth Response (401/503) and never reach the git subprocesses. We mock
 *     requireWebSession so the test stays pure (no real fetch, no real git).
 *
 *  2. Client disconnect mid-stream: the streaming action floats writer.write()
 *     promises inside a background IIFE. Cancelling the readable early (client
 *     abort) must not surface an unhandledRejection in the Node process.
 */

const requireWebSession = vi.fn<(request: Request) => Promise<string>>();

vi.mock('~/lib/.server/require-session', () => ({
  requireWebSession: (request: Request) => requireWebSession(request),
}));

import { action, loader } from './api.update';

function buildRequest() {
  return new Request('http://localhost/api/update', {
    method: 'POST',
    body: JSON.stringify({ branch: 'main', autoUpdate: false }),
    headers: { Cookie: 'vc_session=test' },
  });
}

/** Wait until every queued microtask/timer settles so the background IIFE finishes. */
async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const makeArgs = (request: Request) => ({ request, params: {}, context: {} as any });

describe('api.update auth gate', () => {
  beforeEach(() => {
    requireWebSession.mockReset();
  });

  it('returns the auth Response and never runs git for unauthenticated loader calls', async () => {
    const unauthorized = new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
    requireWebSession.mockRejectedValueOnce(unauthorized);

    const response = (await loader(
      makeArgs(new Request('http://localhost/api/update', { method: 'GET' })),
    )) as Response;

    expect(response.status).toBe(401);

    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('Authentication required');
  });

  it('propagates a 503 when session verification is unavailable (loader)', async () => {
    const unavailable = new Response(JSON.stringify({ error: 'Authentication unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
    requireWebSession.mockRejectedValueOnce(unavailable);

    const response = (await loader(
      makeArgs(new Request('http://localhost/api/update', { method: 'GET' })),
    )) as Response;

    expect(response.status).toBe(503);
  });

  it('returns the auth Response and never opens the stream for unauthenticated action calls', async () => {
    const unauthorized = new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
    requireWebSession.mockRejectedValueOnce(unauthorized);

    const response = (await action(
      makeArgs(new Request('http://localhost/api/update', { method: 'POST' })),
    )) as Response;

    expect(response.status).toBe(401);

    // The streaming response uses text/plain; an auth rejection must be JSON, not the stream.
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('rejects disallowed HTTP methods before any auth work', async () => {
    const response = (await loader(
      makeArgs(new Request('http://localhost/api/update', { method: 'DELETE' })),
    )) as Response;

    expect(response.status).toBe(405);
    expect(requireWebSession).not.toHaveBeenCalled();
  });
});

describe('api.update action — client disconnect mid-stream (authenticated)', () => {
  let rejections: unknown[];
  let onUnhandled: (reason: unknown) => void;

  beforeEach(() => {
    requireWebSession.mockReset();
    requireWebSession.mockResolvedValue('session-token');

    rejections = [];

    onUnhandled = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  it('does not emit an unhandled rejection when the reader is cancelled mid-stream', async () => {
    const response = (await action(makeArgs(buildRequest()))) as Response;

    expect(response.status).toBe(200);
    expect(response.body).toBeTruthy();

    // Simulate the client aborting the SSE-style response before it completes.
    await response.body!.cancel();

    /*
     * Let the background IIFE run all of its writeProgress() + close() calls
     * against the now-cancelled stream.
     */
    await flushAsync();

    expect(rejections).toEqual([]);
  });

  it('still produces a 200 streaming response with the expected headers', async () => {
    const response = (await action(makeArgs(buildRequest()))) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');

    await response.body!.cancel();
    await flushAsync();

    expect(rejections).toEqual([]);
  });
});
