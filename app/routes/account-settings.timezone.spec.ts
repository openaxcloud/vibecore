import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function formRequest(timezone: string): Request {
  const form = new FormData();
  form.set('timezone', timezone);

  return new Request('https://app.test/account-settings', { method: 'POST', body: form });
}

type ActionResult = { data: { status?: string; error?: string }; init?: { status?: number } };

describe('account settings time zone action', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('rejects arbitrary text without sending it to the account API', async () => {
    const { action } = await import('./account-settings._index');
    const result = (await action({ request: formRequest('Paris time') } as any)) as ActionResult;

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.init?.status).toBe(400);
    expect(result.data.error).toBe('Choose a valid IANA time zone.');
  });

  it('trims and saves a valid IANA time zone', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { action } = await import('./account-settings._index');
    const result = (await action({ request: formRequest(' Europe/Paris ') } as any)) as ActionResult;

    expect(apiRequest).toHaveBeenCalledOnce();
    expect(apiRequest.mock.calls[0][1]).toBe('/auth/me');
    expect(JSON.parse(String((apiRequest.mock.calls[0][2] as RequestInit).body))).toEqual({
      timezone: 'Europe/Paris',
    });
    expect(result.data.status).toBe('Account settings saved.');
  });
});
