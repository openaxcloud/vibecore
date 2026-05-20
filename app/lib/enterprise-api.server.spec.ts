import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiBaseUrl, apiRequest, firstOrganization, firstOrganizationOrNull } from './enterprise-api.server';

const ENV_KEYS = ['SAAS_API_URL', 'API_BASE_URL', 'NODE_ENV'] as const;

describe('apiBaseUrl', () => {
  let original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    original = {};

    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = original[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        (process.env as Record<string, string>)[key] = value;
      }
    }
  });

  it('prefers SAAS_API_URL when set', () => {
    process.env.SAAS_API_URL = 'https://api.example.com';
    process.env.API_BASE_URL = 'https://other.example.com';

    expect(apiBaseUrl()).toBe('https://api.example.com');
  });

  it('falls back to API_BASE_URL when SAAS_API_URL is unset', () => {
    process.env.API_BASE_URL = 'https://other.example.com';

    expect(apiBaseUrl()).toBe('https://other.example.com');
  });

  it('uses the in-cluster default when no env vars are set in production', () => {
    /*
     * Reproduces the vite-plugin-node-polyfills SSR bug: process.env is {}
     * in the prod bundle, so apiBaseUrl() must pick a working default. The
     * polyfill leaves process.env.NODE_ENV intact because vite `define`
     * inlines it at build time.
     */
    process.env.NODE_ENV = 'production';

    expect(apiBaseUrl()).toBe('http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001');
  });

  it('falls back to localhost in non-production environments', () => {
    process.env.NODE_ENV = 'development';

    expect(apiBaseUrl()).toBe('http://localhost:8787');
  });

  it('treats an empty string env var as unset', () => {
    process.env.SAAS_API_URL = '';
    process.env.API_BASE_URL = '';
    process.env.NODE_ENV = 'production';

    expect(apiBaseUrl()).toBe('http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001');
  });
});

describe('apiRequest', () => {
  let originalApiBaseUrl: string | undefined;
  let originalSaasApiUrl: string | undefined;

  beforeEach(() => {
    originalApiBaseUrl = process.env.API_BASE_URL;
    originalSaasApiUrl = process.env.SAAS_API_URL;
    delete process.env.SAAS_API_URL;
    process.env.API_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }

    if (originalSaasApiUrl === undefined) {
      delete process.env.SAAS_API_URL;
    } else {
      process.env.SAAS_API_URL = originalSaasApiUrl;
    }
  });

  it('redirects non-MFA requests to setup when the API requires MFA enrollment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ code: 'MFA_REQUIRED', error: 'MFA enrollment required' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    let thrown: unknown;

    try {
      await apiRequest(new Request('https://app.example.com/dashboard'), '/orgs');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('Location')).toBe('/mfa-setup');
  });

  it('keeps MFA endpoint failures as API errors instead of redirecting', async () => {
    /*
     * The /mfa-setup page itself calls /auth/mfa/setup which is exempt
     * from the API's MFA gate. If that endpoint ever returns 403
     * MFA_REQUIRED (e.g. an unrelated misconfiguration), redirecting
     * back to /mfa-setup would cause an infinite loop; the path guard
     * prevents that.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ code: 'MFA_REQUIRED', error: 'MFA enrollment required' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    let thrown: unknown;

    try {
      await apiRequest(new Request('https://app.example.com/mfa-setup'), '/auth/mfa/setup', { method: 'POST' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(403);
    await expect((thrown as Response).json()).resolves.toMatchObject({
      ok: false,
      error: 'MFA enrollment required',
      code: 'MFA_REQUIRED',
    });
  });

  it('passes through non-MFA 403 responses as json errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'Missing permission: billing:read', code: 'RBAC_FORBIDDEN' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    let thrown: unknown;

    try {
      await apiRequest(new Request('https://app.example.com/dashboard'), '/orgs/org_1/billing');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(403);
    await expect((thrown as Response).json()).resolves.toMatchObject({
      ok: false,
      code: 'RBAC_FORBIDDEN',
      error: 'Missing permission: billing:read',
    });
  });
});

describe('firstOrganization helpers', () => {
  let originalApiBaseUrl: string | undefined;

  beforeEach(() => {
    originalApiBaseUrl = process.env.API_BASE_URL;
    delete process.env.SAAS_API_URL;
    process.env.API_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
  });

  function stubOrgsResponse(organizations: Array<{ id: string }>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ organizations }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  }

  it('firstOrganization returns the first organization when the user belongs to one', async () => {
    stubOrgsResponse([{ id: 'org_1' }, { id: 'org_2' }]);

    await expect(firstOrganization(new Request('https://app.example.com/dashboard'))).resolves.toEqual({ id: 'org_1' });
  });

  it('firstOrganization throws a 400 response when the user has no organizations', async () => {
    stubOrgsResponse([]);

    let thrown: unknown;

    try {
      await firstOrganization(new Request('https://app.example.com/dashboard'));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(400);
  });

  it('firstOrganizationOrNull returns null instead of throwing when the user has no organizations', async () => {
    stubOrgsResponse([]);

    await expect(firstOrganizationOrNull(new Request('https://app.example.com/dashboard'))).resolves.toBeNull();
  });

  it('firstOrganizationOrNull returns the first organization when the user belongs to one', async () => {
    stubOrgsResponse([{ id: 'org_1' }]);

    await expect(firstOrganizationOrNull(new Request('https://app.example.com/dashboard'))).resolves.toEqual({
      id: 'org_1',
    });
  });
});
