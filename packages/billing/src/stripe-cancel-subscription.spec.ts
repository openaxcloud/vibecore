import { afterEach, describe, expect, it, vi } from 'vitest';

import { StripeBillingClient } from './index.js';

/*
 * RR-20260723-CODEX-07 reserve #1 — immediate cancellation of an ACTIVE
 * subscription is a DELETE on the resource (`DELETE /v1/subscriptions/{id}`),
 * NOT `POST /v1/subscriptions/{id}/cancel`. STRICT fake HTTP: assert the exact
 * verb + path, and cover BOTH the success and the failure branch.
 */
describe('StripeBillingClient.cancelSubscription — DELETE (strict fake HTTP)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function client() {
    return new StripeBillingClient({ apiKey: 'sk_test_x', baseUrl: 'https://stripe.test' });
  }

  it('issues DELETE /v1/subscriptions/{id} (never POST /cancel) and resolves on 200', async () => {
    const calls: Array<{ url: string; method: string }> = [];

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push({ url: String(input), method: String(init?.method) });

      return new Response(JSON.stringify({ id: 'sub_123', status: 'canceled' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await client().cancelSubscription('sub_123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe('https://stripe.test/v1/subscriptions/sub_123');

    // The old, wrong endpoint must NOT be used.
    expect(calls[0].url).not.toContain('/cancel');
  });

  it('URL-encodes the id and still targets the DELETE resource path', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push({ url: String(input), method: String(init?.method) });

      return new Response(JSON.stringify({ id: 'x' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await client().cancelSubscription('sub/with space');

    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe('https://stripe.test/v1/subscriptions/sub%2Fwith%20space');
  });

  it('FAILURE branch: a non-2xx response throws STRIPE_REQUEST_FAILED (fail-closed for the purge)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'No such subscription' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(client().cancelSubscription('sub_missing')).rejects.toMatchObject({
      code: 'STRIPE_REQUEST_FAILED',
      statusCode: 502,
    });
  });
});
