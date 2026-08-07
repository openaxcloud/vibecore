/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
const requirePlatformAdmin = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
  };
});

import { action, loader } from './admin.stripe';

type ActionPayload = {
  statusCode?: string;
  errorCode?: string;
  field?: string;
  eventId?: string;
  replayed?: number;
  failed?: number;
};

type DataResult<Value> = { data: Value; init?: ResponseInit };

function actionRequest(fields: Record<string, string>): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('https://app.test/admin/stripe', { method: 'POST', body: form });
}

function actionArgs(request: Request) {
  return { request, params: {}, context: {} } as unknown as Parameters<typeof action>[0];
}

function loaderArgs(request: Request) {
  return { request, params: {}, context: {} } as unknown as Parameters<typeof loader>[0];
}

function apiError(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  apiRequest.mockReset();
  requirePlatformAdmin.mockReset();
});

describe('admin Stripe loader', () => {
  it('loads the configuration and webhook health with the resolved French locale', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest
      .mockResolvedValueOnce({
        hasSecretKey: true,
        hasWebhookSecret: false,
        envSecretKeyPresent: false,
        envWebhookSecretPresent: true,
        stripeConfigured: true,
        plans: [{ key: 'pro', name: 'Pro' }],
      })
      .mockResolvedValueOnce({
        failures: [
          {
            id: 'failure_1',
            eventId: 'evt_123',
            type: 'invoice.paid',
            attempts: 1,
            failedAt: '2026-06-01T12:30:00.000Z',
            lastError: 'Raw private database and Stripe secret detail',
          },
        ],
      });

    const result = (await loader(
      loaderArgs(
        new Request('https://app.test/admin/stripe', {
          headers: { Cookie: 'vibecore-lang=fr' },
        }),
      ),
    )) as DataResult<{
      language: string;
      plans: Array<{ key: string }>;
      webhookFailures: Array<{ eventId: string }>;
    }>;

    expect(requirePlatformAdmin).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls.map((call) => call[1])).toEqual([
      '/admin/stripe-config',
      '/admin/stripe/webhook-failures',
    ]);
    expect(result.data.language).toBe('fr');
    expect(result.data.plans).toEqual([expect.objectContaining({ key: 'pro' })]);
    expect(result.data.webhookFailures).toEqual([expect.objectContaining({ eventId: 'evt_123' })]);
    expect(JSON.stringify(result.data)).not.toContain('Raw private database');
    expect(result.data.webhookFailures[0]).not.toHaveProperty('lastError');
  });
});

describe('admin Stripe action', () => {
  it('requires a webhook event ID before replaying one delivery', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const result = (await action(actionArgs(actionRequest({ intent: 'replay-webhook' })))) as DataResult<ActionPayload>;

    expect(result.init?.status).toBe(400);
    expect(result.data).toEqual({ errorCode: 'eventIdRequired' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('returns a structured replay success while preserving the Stripe event ID', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({
      result: { eventId: 'evt_123/abc', type: 'invoice.paid', ok: true },
    });

    const result = (await action(
      actionArgs(actionRequest({ intent: 'replay-webhook', eventId: 'evt_123/abc' })),
    )) as DataResult<ActionPayload>;

    expect(apiRequest.mock.calls[0][1]).toBe('/admin/stripe/webhook-failures/evt_123%2Fabc/replay');
    expect(result.data).toEqual({ statusCode: 'webhookReplayed', eventId: 'evt_123/abc' });
  });

  it('masks the raw processing error returned by a failed replay', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const rawError = 'Stripe customer cus_secret failed on database host private-db';
    apiRequest.mockResolvedValueOnce({
      result: { eventId: 'evt_failed', type: 'invoice.paid', ok: false, error: rawError, attempts: 4 },
    });

    const result = (await action(
      actionArgs(actionRequest({ intent: 'replay-webhook', eventId: 'evt_failed' })),
    )) as DataResult<ActionPayload>;

    expect(result.init?.status).toBe(502);
    expect(result.data).toEqual({ errorCode: 'replayFailed', eventId: 'evt_failed' });
    expect(JSON.stringify(result.data)).not.toContain(rawError);
  });

  it('returns localized-message inputs for successful and partial replay-all summaries', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ replayed: 1234, failed: 0 });

    const success = (await action(
      actionArgs(actionRequest({ intent: 'replay-all-webhooks' })),
    )) as DataResult<ActionPayload>;

    expect(success.data).toEqual({ statusCode: 'webhooksReplayed', replayed: 1234 });

    apiRequest.mockResolvedValueOnce({ replayed: 1, failed: 2 });

    const partial = (await action(
      actionArgs(actionRequest({ intent: 'replay-all-webhooks' })),
    )) as DataResult<ActionPayload>;

    expect(partial.init?.status).toBe(502);
    expect(partial.data).toEqual({ errorCode: 'partialReplay', replayed: 1, failed: 2 });
  });

  it('maps replay API errors to safe codes and never echoes raw prose', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const rawError = 'No event because internal tenant alpha failed';
    apiRequest.mockRejectedValueOnce(apiError(404, rawError, 'STRIPE_WEBHOOK_FAILURE_NOT_FOUND'));

    const result = (await action(
      actionArgs(actionRequest({ intent: 'replay-webhook', eventId: 'evt_missing' })),
    )) as DataResult<ActionPayload>;

    expect(result.init?.status).toBe(404);
    expect(result.data).toEqual({ errorCode: 'webhookFailureNotFound', eventId: 'evt_missing' });
    expect(JSON.stringify(result.data)).not.toContain(rawError);
  });

  it('requires a confirmation password for configuration changes', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const result = (await action(actionArgs(actionRequest({ secretKey: 'sk_live_123' })))) as DataResult<ActionPayload>;

    expect(result.init?.status).toBe(400);
    expect(result.data).toEqual({ errorCode: 'passwordRequired', field: 'password' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('maps incorrect-password and expired-reauth failures without raw API prose', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockRejectedValueOnce(apiError(401, 'Incorrect password from upstream'));

    const incorrect = (await action(actionArgs(actionRequest({ password: 'wrong' })))) as DataResult<ActionPayload>;

    expect(incorrect.init?.status).toBe(401);
    expect(incorrect.data).toEqual({ errorCode: 'incorrectPassword', field: 'password' });

    apiRequest.mockResolvedValueOnce({ reauthenticated: true });
    apiRequest.mockRejectedValueOnce(apiError(403, 'Raw expired reauthentication detail', 'ADMIN_REAUTH_REQUIRED'));

    const expired = (await action(actionArgs(actionRequest({ password: 'pw' })))) as DataResult<ActionPayload>;

    expect(expired.data.errorCode).toBe('reauthExpired');
    expect(JSON.stringify(expired.data)).not.toContain('Raw expired');
  });

  it('preserves technical IDs and new secrets while omitting blank write-only secrets', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ reauthenticated: true }).mockResolvedValueOnce({ configured: true });

    const webhookSecret = 'whsec_exact_value';

    const result = (await action(
      actionArgs(
        actionRequest({
          password: 'admin-password',
          secretKey: '',
          webhookSecret,
          'price:pro:stripeProductId': 'prod_FR123',
          'price:pro:stripePriceId': 'price_legacy_EUR',
          'price:pro:stripePriceMonthlyId': 'price_monthly_EUR',
          'price:pro:stripePriceAnnualId': 'price_annual_EUR',
          'price:pro:unknownField': 'must-not-send',
        }),
      ),
    )) as DataResult<ActionPayload>;

    expect(apiRequest.mock.calls[0][1]).toBe('/auth/reauth');
    expect(apiRequest.mock.calls[1][1]).toBe('/admin/stripe-config');

    const payload = JSON.parse(String((apiRequest.mock.calls[1][2] as RequestInit).body)) as Record<string, unknown>;

    expect(payload).toEqual({
      webhookSecret,
      prices: {
        pro: {
          stripeProductId: 'prod_FR123',
          stripePriceId: 'price_legacy_EUR',
          stripePriceMonthlyId: 'price_monthly_EUR',
          stripePriceAnnualId: 'price_annual_EUR',
        },
      },
    });
    expect(payload).not.toHaveProperty('secretKey');
    expect(result.data).toEqual({ statusCode: 'configurationSaved' });
    expect(JSON.stringify(result.data)).not.toContain(webhookSecret);
  });

  it('masks arbitrary configuration API and network error details', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ reauthenticated: true });
    apiRequest.mockRejectedValueOnce(apiError(400, 'Secret sk_live_leak belongs to tenant private'));

    const rejected = (await action(actionArgs(actionRequest({ password: 'pw' })))) as DataResult<ActionPayload>;

    expect(rejected.data.errorCode).toBe('invalidConfiguration');
    expect(JSON.stringify(rejected.data)).not.toContain('sk_live_leak');

    apiRequest.mockRejectedValueOnce(new Error('connect ECONNREFUSED private-host'));

    const unavailable = (await action(actionArgs(actionRequest({ password: 'pw' })))) as DataResult<ActionPayload>;

    expect(unavailable.init?.status).toBe(502);
    expect(unavailable.data.errorCode).toBe('serviceUnavailable');
    expect(JSON.stringify(unavailable.data)).not.toContain('private-host');
  });
});
