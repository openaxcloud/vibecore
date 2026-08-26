import { redirect } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

import { loader } from './workspace-settings';

function request(path = '/workspace-settings?lang=fr') {
  return new Request(`https://app.e-code.ai${path}`, {
    headers: { cookie: 'vibecore-lang=fr' },
  });
}

describe('workspace-settings authentication boundary', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('verifies the session server-side before rendering the private shell', async () => {
    apiRequest.mockResolvedValueOnce({ user: { id: 'user-1' } });

    const result = await loader({ request: request() } as never);

    expect(apiRequest).toHaveBeenCalledWith(expect.any(Request), '/auth/me');
    expect(result.data).toEqual({ language: 'fr' });
    expect(new Headers(result.init.headers).get('Content-Language')).toBe('fr');
  });

  it('propagates the canonical sign-in redirect when the session is absent', async () => {
    const login = redirect('/login?returnTo=%2Fworkspace-settings');
    apiRequest.mockRejectedValueOnce(login);

    await expect(loader({ request: request('/workspace-settings') } as never)).rejects.toBe(login);
  });

  it('fails closed when /auth/me returns a malformed success payload', async () => {
    apiRequest.mockResolvedValueOnce({});

    let thrown: unknown;

    try {
      await loader({ request: request() } as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('Location')).toBe(
      `/login?returnTo=${encodeURIComponent('/workspace-settings?lang=fr')}`,
    );
  });
});
