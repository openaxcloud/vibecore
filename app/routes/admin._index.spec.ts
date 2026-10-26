/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
  };
});

import { loader } from './admin._index';

beforeEach(() => {
  requirePlatformAdmin.mockReset();
  requirePlatformAdmin.mockResolvedValue(undefined);
});

describe('admin entry redirect', () => {
  it.each(['fr', 'en'])('preserves explicit %s language without forwarding unrelated parameters', async (language) => {
    const request = new Request(`http://localhost/admin?lang=${language}&export=csv&returnTo=https://example.invalid`);
    const response = await loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0]);

    expect(requirePlatformAdmin).toHaveBeenCalledExactlyOnceWith(request);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/admin/overview?lang=${language}`);
  });

  it('keeps the default destination when no language is supplied', async () => {
    const request = new Request('http://localhost/admin');
    const response = await loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0]);

    expect(response.headers.get('Location')).toBe('/admin/overview');
    expect(requirePlatformAdmin).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('propagates the authorization rejection before producing a redirect', async () => {
    const forbidden = new Response('Synthetic forbidden', { status: 403 });
    requirePlatformAdmin.mockRejectedValue(forbidden);
    const request = new Request('http://localhost/admin?lang=fr');

    await expect(loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0])).rejects.toBe(forbidden);
    expect(requirePlatformAdmin).toHaveBeenCalledExactlyOnceWith(request);
  });
});
