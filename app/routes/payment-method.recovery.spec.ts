import { afterEach, describe, expect, it, vi } from 'vitest';
import { action } from './payment-method';

const { apiRequest, firstOrganizationOrNull } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  firstOrganizationOrNull: vi.fn().mockResolvedValue({ id: 'synthetic-org' }),
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/enterprise-api.server')>()),
  apiRequest,
  firstOrganizationOrNull,
}));

function submit(intent = 'billing-email', billingEmail = 'draft@example.test') {
  return action({
    request: new Request('http://localhost/payment-method', {
      method: 'POST',
      body: new URLSearchParams({ intent, billingEmail }),
    }),
  } as never);
}

afterEach(() => apiRequest.mockReset());

describe('payment method recovery preserves action error contracts', () => {
  it.each([500, 503])('throws a structured %s with the validated email draft', async (status) => {
    apiRequest.mockRejectedValueOnce(new Response('upstream details', { status }));

    const result = await submit().catch((error: unknown) => error);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(status);
    expect(await (result as Response).json()).toEqual({
      recovery: 'billing-email-draft',
      billingEmail: 'draft@example.test',
    });
  });

  it('keeps an intentional empty email draft recoverable', async () => {
    apiRequest.mockRejectedValueOnce(new Response(null, { status: 503 }));

    const result = (await submit('billing-email', '').catch((error: unknown) => error)) as Response;

    expect((await result.json()).billingEmail).toBe('');
  });

  it.each(['/login', '/mfa-setup'])('rethrows %s redirect unchanged', async (location) => {
    const redirect = new Response(null, { status: 302, headers: { Location: location } });
    apiRequest.mockRejectedValueOnce(redirect);
    await expect(submit()).rejects.toBe(redirect);
  });

  it('keeps portal 503 unchanged without an email recovery envelope', async () => {
    const error = new Response('portal unavailable', { status: 503 });
    apiRequest.mockRejectedValueOnce(error);
    await expect(submit('portal')).rejects.toBe(error);
  });

  it('keeps validation 400 and never submits the invalid draft upstream', async () => {
    const response = await submit('billing-email', 'a@b');

    expect(response).toMatchObject({ init: { status: 400 } });
    expect(response).toMatchObject({ data: { field: 'billingEmail' } });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('preserves successful portal redirect', async () => {
    apiRequest.mockResolvedValueOnce({ portalUrl: 'https://example.test/portal' });

    const response = (await submit('portal')) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://example.test/portal');
  });
});
