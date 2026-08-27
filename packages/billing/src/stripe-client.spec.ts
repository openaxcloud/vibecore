import { afterEach, describe, expect, it, vi } from 'vitest';

import { StripeBillingClient } from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StripeBillingClient account-purge cancellation', () => {
  it('uses an immediate DELETE with the caller stable idempotency key', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'sub_live', status: 'canceled' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new StripeBillingClient({ apiKey: 'sk_test', baseUrl: 'https://stripe.example.test' });

    await expect(client.cancelSubscription('sub/live', 'account-purge-plan-sub')).resolves.toEqual({
      id: 'sub_live',
      status: 'canceled',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://stripe.example.test/v1/subscriptions/sub%2Flive',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          authorization: 'Bearer sk_test',
          'idempotency-key': 'account-purge-plan-sub',
        }),
      }),
    );
  });

  it('fails closed on a provider error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'resource_missing' } }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const client = new StripeBillingClient({ apiKey: 'sk_test', baseUrl: 'https://stripe.example.test' });

    await expect(client.cancelSubscription('sub_missing', 'account-purge-plan-sub')).rejects.toMatchObject({
      code: 'STRIPE_REQUEST_FAILED',
      statusCode: 502,
    });
  });

  it('verifies an already-canceled provider state after an ambiguous retry response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'subscription_already_canceled' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'sub_done', status: 'canceled' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new StripeBillingClient({ apiKey: 'sk_test', baseUrl: 'https://stripe.example.test' });

    await expect(client.cancelSubscription('sub_done', 'account-purge-plan-sub')).resolves.toEqual({
      id: 'sub_done',
      status: 'canceled',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://stripe.example.test/v1/subscriptions/sub_done',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer sk_test' }) }),
    );
  });
});
