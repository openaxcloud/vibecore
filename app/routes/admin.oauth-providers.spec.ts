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

import { action, loader } from './admin.oauth-providers';

type ActionPayload = {
  statusCode?: string;
  errorCode?: string;
  provider?: string;
  kind?: string;
};

type DataResult<Value> = { data: Value; init?: ResponseInit };

function actionRequest(fields: Record<string, string>): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('https://app.test/admin/oauth-providers', { method: 'POST', body: form });
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

describe('admin OAuth provider action', () => {
  it('requires a provider and a confirmation password', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const missingProvider = (await action(
      actionArgs(actionRequest({ kind: 'login', password: 'pw' })),
    )) as DataResult<ActionPayload>;
    const missingPassword = (await action(
      actionArgs(actionRequest({ kind: 'login', provider: 'github' })),
    )) as DataResult<ActionPayload>;

    expect(missingProvider.init?.status).toBe(400);
    expect(missingProvider.data.errorCode).toBe('providerRequired');
    expect(missingPassword.init?.status).toBe(400);
    expect(missingPassword.data.errorCode).toBe('passwordRequired');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('rejects a provider ID outside the selected closed provider family', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const result = (await action(
      actionArgs(actionRequest({ kind: 'login', provider: 'gitlab', password: 'pw' })),
    )) as DataResult<ActionPayload>;

    expect(result.init?.status).toBe(400);
    expect(result.data.errorCode).toBe('providerUnsupported');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('rejects a missing or unknown connector type', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const result = (await action(
      actionArgs(actionRequest({ kind: 'future-kind', provider: 'github', password: 'pw' })),
    )) as DataResult<ActionPayload>;

    expect(result.init?.status).toBe(400);
    expect(result.data.errorCode).toBe('connectorTypeUnsupported');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('reauthenticates and saves a login provider without returning its secret', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ reauthenticated: true }).mockResolvedValueOnce({ provider: {} });

    const clientSecret = 'login-secret-that-must-not-return';

    const result = (await action(
      actionArgs(
        actionRequest({
          kind: 'login',
          provider: 'github',
          clientId: 'github-client-id',
          clientSecret,
          scopes: 'openid email profile',
          enabled: 'on',
          password: 'admin-password',
        }),
      ),
    )) as DataResult<ActionPayload>;

    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest.mock.calls[0][1]).toBe('/auth/reauth');
    expect(JSON.parse(String((apiRequest.mock.calls[0][2] as RequestInit).body))).toEqual({
      password: 'admin-password',
    });
    expect(apiRequest.mock.calls[1][1]).toBe('/admin/login-providers');
    expect(JSON.parse(String((apiRequest.mock.calls[1][2] as RequestInit).body))).toEqual({
      provider: 'github',
      enabled: true,
      clientId: 'github-client-id',
      clientSecret,
      scopes: 'openid email profile',
    });
    expect(result.data).toEqual({ statusCode: 'loginSaved', provider: 'github', kind: 'login' });
    expect(JSON.stringify(result.data)).not.toContain(clientSecret);
  });

  it('keeps a stored connector secret when the password field is left blank', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ reauthenticated: true }).mockResolvedValueOnce({ connector: {} });

    const result = (await action(
      actionArgs(
        actionRequest({
          kind: 'connector',
          provider: 'gitlab',
          clientId: 'gitlab-client-id',
          clientSecret: '',
          enabled: 'true',
          password: 'admin-password',
        }),
      ),
    )) as DataResult<ActionPayload>;

    const payload = JSON.parse(String((apiRequest.mock.calls[1][2] as RequestInit).body)) as Record<string, unknown>;

    expect(apiRequest.mock.calls[1][1]).toBe('/admin/connectors/oauth');
    expect(payload).toEqual({ provider: 'gitlab', enabled: true, clientId: 'gitlab-client-id' });
    expect(payload).not.toHaveProperty('clientSecret');
    expect(result.data.statusCode).toBe('connectorSaved');
  });

  it('sends only provider and enabled state to an API-key connector endpoint', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ reauthenticated: true }).mockResolvedValueOnce({ connector: {} });

    const result = (await action(
      actionArgs(
        actionRequest({
          kind: 'apikey',
          provider: 'vercel',
          clientId: 'must-not-send',
          clientSecret: 'must-not-send',
          enabled: 'on',
          password: 'admin-password',
        }),
      ),
    )) as DataResult<ActionPayload>;

    expect(apiRequest.mock.calls[1][1]).toBe('/admin/connectors/api-key');
    expect(JSON.parse(String((apiRequest.mock.calls[1][2] as RequestInit).body))).toEqual({
      provider: 'vercel',
      enabled: true,
    });
    expect(result.data).toEqual({ statusCode: 'apiKeySaved', provider: 'vercel', kind: 'apikey' });
  });

  it('maps incorrect-password and expired-reauth responses to safe codes', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const rawPasswordError = 'Incorrect password from upstream';
    apiRequest.mockRejectedValueOnce(apiError(401, rawPasswordError));

    const incorrect = (await action(
      actionArgs(actionRequest({ kind: 'login', provider: 'github', password: 'wrong' })),
    )) as DataResult<ActionPayload>;

    expect(incorrect.data.errorCode).toBe('incorrectPassword');
    expect(JSON.stringify(incorrect.data)).not.toContain(rawPasswordError);

    apiRequest.mockResolvedValueOnce({ reauthenticated: true });
    apiRequest.mockRejectedValueOnce(apiError(403, 'Raw expired message', 'ADMIN_REAUTH_REQUIRED'));

    const expired = (await action(
      actionArgs(actionRequest({ kind: 'connector', provider: 'github', password: 'pw' })),
    )) as DataResult<ActionPayload>;

    expect(expired.data.errorCode).toBe('reauthExpired');
    expect(JSON.stringify(expired.data)).not.toContain('Raw expired message');
  });

  it('never echoes arbitrary API prose or network error details', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ reauthenticated: true });
    apiRequest.mockRejectedValueOnce(apiError(400, 'Invalid client for secret tenant 123'));

    const rejected = (await action(
      actionArgs(actionRequest({ kind: 'login', provider: 'google', password: 'pw' })),
    )) as DataResult<ActionPayload>;

    expect(rejected.data.errorCode).toBe('invalidConfiguration');
    expect(JSON.stringify(rejected.data)).not.toContain('secret tenant 123');

    apiRequest.mockResolvedValueOnce({ reauthenticated: true });
    apiRequest.mockRejectedValueOnce(apiError(500, 'Database host and tenant leaked here'));

    const failed = (await action(
      actionArgs(actionRequest({ kind: 'connector', provider: 'bitbucket', password: 'pw' })),
    )) as DataResult<ActionPayload>;

    expect(failed.init?.status).toBe(502);
    expect(failed.data.errorCode).toBe('saveFailed');
    expect(JSON.stringify(failed.data)).not.toContain('Database host');

    apiRequest.mockRejectedValueOnce(new Error('connect ECONNREFUSED private-host'));

    const unavailable = (await action(
      actionArgs(actionRequest({ kind: 'apikey', provider: 'netlify', password: 'pw' })),
    )) as DataResult<ActionPayload>;

    expect(unavailable.data.errorCode).toBe('serviceUnavailable');
    expect(JSON.stringify(unavailable.data)).not.toContain('private-host');
  });
});

describe('admin OAuth provider loader', () => {
  it('loads all three provider families and resolves French from the manual cookie', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest
      .mockResolvedValueOnce({ connectors: [{ provider: 'github' }] })
      .mockResolvedValueOnce({ providers: [{ provider: 'google' }] })
      .mockResolvedValueOnce({ connectors: [{ provider: 'vercel' }] });

    const result = (await loader(
      loaderArgs(
        new Request('https://app.test/admin/oauth-providers', {
          headers: { Cookie: 'vibecore-lang=fr' },
        }),
      ),
    )) as DataResult<{
      language: string;
      connectors: Array<{ provider: string }>;
      loginProviders: Array<{ provider: string }>;
      apiKeyConnectors: Array<{ provider: string }>;
    }>;

    expect(requirePlatformAdmin).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls.map((call) => call[1])).toEqual([
      '/admin/connectors/oauth',
      '/admin/login-providers',
      '/admin/connectors/api-key',
    ]);
    expect(result.data).toEqual({
      connectors: [{ provider: 'github' }],
      loginProviders: [{ provider: 'google' }],
      apiKeyConnectors: [{ provider: 'vercel' }],
      language: 'fr',
    });
  });
});
