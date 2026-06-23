import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { action } from './api.update';

/*
 * Bug: the streaming update action floats writer.write() promises. The fake
 * controller wraps the stream writer as `enqueue: (chunk) => writer.write(chunk)`
 * and every writeProgress() call inside the background IIFE invokes it without
 * awaiting or catching the returned promise. If the client aborts/closes the
 * response mid-stream, writer.write() (and the trailing writer.close()) reject
 * with a stream error that was never handled, producing an unhandledRejection
 * in the Node server process.
 *
 * These tests drive the REAL action, cancel the readable early to simulate a
 * client disconnect, and assert that no unhandled rejection escapes to the
 * process. They do not mock git: the action's IIFE falls into its own
 * try/catch when git fails, but still calls writeProgress() against the
 * (now-cancelled) writer — which is exactly the path that used to throw.
 */

function buildRequest() {
  return new Request('http://localhost/api/update', {
    method: 'POST',
    body: JSON.stringify({ branch: 'main', autoUpdate: false }),
  });
}

/** Wait until every queued microtask/timer settles so the background IIFE finishes. */
async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('api.update action — client disconnect mid-stream', () => {
  let rejections: unknown[];
  let onUnhandled: (reason: unknown) => void;

  beforeEach(() => {
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
    const response = (await action({ request: buildRequest(), params: {}, context: {} as any })) as Response;

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
    const response = (await action({ request: buildRequest(), params: {}, context: {} as any })) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');

    await response.body!.cancel();
    await flushAsync();

    expect(rejections).toEqual([]);
  });

  it('rejects non-POST methods', async () => {
    const getRequest = new Request('http://localhost/api/update', { method: 'GET' });
    const response = (await action({ request: getRequest, params: {}, context: {} as any })) as Response;

    expect(response.status).toBe(405);
  });
});
