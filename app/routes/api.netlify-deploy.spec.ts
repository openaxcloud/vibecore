import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { action } from './api.netlify-deploy';

/*
 * Bug 1: a single transient status-poll failure (timeout abort / DNS hiccup /
 * network blip) during the up-to-120s polling window must NOT abort the whole
 * deploy with a generic 500. The poll loop should count the retry, back off,
 * and poll again — exactly like the file-upload block already does.
 */

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function buildRequest() {
  return new Request('http://localhost/api/netlify-deploy', {
    method: 'POST',
    body: JSON.stringify({
      siteId: 'site-1',
      token: 'tok',
      chatId: 'chat-1',
      files: { '/index.html': '<html></html>' },
    }),
  });
}

async function readJson(result: unknown) {
  /*
   * react-router `data(...)` returns a DataWithResponseInit-like object whose
   * payload is on `.data`; a real Response exposes `.json()`.
   */
  const anyResult = result as any;

  if (anyResult && typeof anyResult.json === 'function') {
    return anyResult.json();
  }

  return anyResult?.data ?? anyResult;
}

describe('api.netlify-deploy action — transient status-poll resilience (Bug 1)', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    // Make the 1s backoff sleeps instant so the test stays fast.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: (...args: any[]) => void) => {
      cb();
      return 0 as any;
    }) as any);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('retries a thrown status-poll error instead of failing the deploy with a 500', async () => {
    let statusPolls = 0;

    globalThis.fetch = vi.fn(async (input: any, _init?: any) => {
      const url = String(typeof input === 'string' ? input : (input?.url ?? input));

      // Existing-site lookup
      if (url.endsWith('/sites/site-1')) {
        return jsonResponse({ id: 'site-1', name: 'site', url: 'https://site.netlify.app' });
      }

      // Create the deploy
      if (url.endsWith('/sites/site-1/deploys')) {
        return jsonResponse({ id: 'deploy-1', state: 'new' });
      }

      // Status polling endpoint
      if (url.includes('/sites/site-1/deploys/deploy-1')) {
        statusPolls += 1;

        // First poll throws (simulating the 30s timeout abort / network blip).
        if (statusPolls === 1) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        // Second poll: prepared -> triggers file upload.
        if (statusPolls === 2) {
          return jsonResponse({ id: 'deploy-1', state: 'prepared' });
        }

        // Third poll: ready.
        return jsonResponse({ id: 'deploy-1', state: 'ready', ssl_url: 'https://site.netlify.app' });
      }

      // File upload PUT
      if (url.includes('/deploys/deploy-1/files')) {
        return new Response('', { status: 200 });
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as any;

    const result = await action({ request: buildRequest() } as any);
    const body = await readJson(result);

    // The transient error was retried, not surfaced as a failure.
    expect(statusPolls).toBeGreaterThanOrEqual(2);
    expect(body.error).toBeUndefined();
    expect(body.success).toBe(true);
    expect(body.deploy.state).toBe('ready');
    expect(body.deploy.url).toBe('https://site.netlify.app');
  });

  it('still surfaces a genuine non-OK status response with its real status code', async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(typeof input === 'string' ? input : (input?.url ?? input));

      if (url.endsWith('/sites/site-1')) {
        return jsonResponse({ id: 'site-1', name: 'site', url: 'https://site.netlify.app' });
      }

      if (url.endsWith('/sites/site-1/deploys')) {
        return jsonResponse({ id: 'deploy-1', state: 'new' });
      }

      if (url.includes('/sites/site-1/deploys/deploy-1')) {
        return jsonResponse({ message: 'gone' }, { status: 404 });
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as any;

    const result = await action({ request: buildRequest() } as any);
    const status = (result as any).init?.status ?? (result as any).status;
    const body = await readJson(result);

    expect(status).toBe(404);
    expect(body).toMatchObject({
      code: 'NETLIFY_DEPLOYMENT_STATUS_FAILED',
      error: 'The Netlify deployment status could not be checked. Please try again.',
    });
    expect(JSON.stringify(body)).not.toContain('gone');
  });
});
