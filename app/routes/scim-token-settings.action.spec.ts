/**
 * @vitest-environment node
 *
 * Security and contract guards for SCIM token settings. Upstream response prose
 * must never reach the UI; only reviewed, locale-independent status codes leave
 * the action. One-time secrets are accepted only from a valid response shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { action, loader, meta } from './scim-token-settings';
import type { ScimTokenActionData } from '~/lib/i18n/catalogs/scim-token-settings';

const apiRequest = vi.fn();
const firstOrganizationOrNull = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNull(...args),
  };
});

function formRequest(fields: Record<string, string>): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('http://localhost/scim-token-settings', { method: 'POST', body: form });
}

async function runAction(fields: Record<string, string>) {
  const result = (await action({ request: formRequest(fields) } as never)) as {
    data: ScimTokenActionData;
    init?: { status?: number } | number | null;
  };

  const init = typeof result.init === 'number' ? { status: result.init } : result.init;

  return { status: init?.status ?? 200, body: result.data };
}

async function runLoader(language = 'en-US') {
  const request = new Request('http://localhost/scim-token-settings', {
    headers: { 'Accept-Language': language },
  });
  const result = (await loader({ request } as never)) as {
    data: {
      orgId: string;
      language: 'en' | 'fr';
      scimTokens: Array<Record<string, unknown>>;
      loadErrorKind: 'permission' | 'temporary' | null;
    };
  };

  return result.data;
}

function apiResponse(status: number, payload?: Record<string, unknown>) {
  return new Response(payload ? JSON.stringify(payload) : '', {
    status,
    headers: payload ? { 'content-type': 'application/json' } : undefined,
  });
}

describe('scim-token-settings action', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    firstOrganizationOrNull.mockReset();
    firstOrganizationOrNull.mockResolvedValue({ id: 'org_1' });
  });

  it('maps forbidden API prose to a stable permission code without leaking it', async () => {
    apiRequest.mockRejectedValueOnce(apiResponse(403, { error: 'You lack the scim:manage permission.' }));

    const { status, body } = await runAction({ orgId: 'org_1', intent: 'create', name: 'idp-token' });

    expect(status).toBe(403);
    expect(body).toEqual({ errorCode: 'permissionDenied' });
    expect(JSON.stringify(body)).not.toContain('You lack');
  });

  it('uses stable API codes for recent-admin reauthentication', async () => {
    apiRequest.mockRejectedValueOnce(
      apiResponse(403, { code: 'ADMIN_REAUTH_REQUIRED', error: 'Internal policy prose' }),
    );

    const { status, body } = await runAction({ orgId: 'org_1', intent: 'create', name: 'idp-token' });

    expect(status).toBe(403);
    expect(body).toEqual({ errorCode: 'reauthRequired' });
    expect(JSON.stringify(body)).not.toContain('Internal policy prose');
  });

  it('maps validation prose to a reviewed invalid-request code', async () => {
    apiRequest.mockRejectedValueOnce(apiResponse(400, { error: 'A token with that name already exists.' }));

    const { status, body } = await runAction({ orgId: 'org_1', intent: 'create', name: 'dupe' });

    expect(status).toBe(400);
    expect(body).toEqual({ errorCode: 'invalidRequest' });
    expect(JSON.stringify(body)).not.toContain('already exists');
  });

  it('maps server and network failures to the same safe unavailable code', async () => {
    apiRequest.mockRejectedValueOnce(apiResponse(500));

    await expect(runAction({ orgId: 'org_1', intent: 'create', name: 'x' })).resolves.toEqual({
      status: 502,
      body: { errorCode: 'serviceUnavailable' },
    });

    apiRequest.mockRejectedValueOnce(new Error('fetch failed with private upstream host'));

    await expect(runAction({ orgId: 'org_1', intent: 'create', name: 'x' })).resolves.toEqual({
      status: 502,
      body: { errorCode: 'serviceUnavailable' },
    });
  });

  it('validates organization, intent and token name before touching the API', async () => {
    await expect(runAction({ intent: 'create', name: 'x' })).resolves.toEqual({
      status: 400,
      body: { errorCode: 'organizationUnavailable' },
    });
    await expect(runAction({ orgId: 'org_1', intent: 'unsupported', name: 'x' })).resolves.toEqual({
      status: 400,
      body: { errorCode: 'intentInvalid' },
    });
    await expect(runAction({ orgId: 'org_1', intent: 'create', name: '   ' })).resolves.toEqual({
      status: 400,
      body: { errorCode: 'nameRequired', field: 'name' },
    });
    await expect(runAction({ orgId: 'org_1', intent: 'create', name: 'x'.repeat(257) })).resolves.toEqual({
      status: 400,
      body: { errorCode: 'nameTooLong', field: 'name' },
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('trims user input, encodes the organization and returns the exact created secret', async () => {
    apiRequest.mockResolvedValueOnce({ token: ' scim_secret_value ' });

    const { body } = await runAction({ orgId: ' org/one ', name: '  Okta production  ' });

    expect(body).toEqual({ statusCode: 'created', token: ' scim_secret_value ' });
    expect(apiRequest).toHaveBeenCalledWith(expect.any(Request), '/orgs/org%2Fone/scim/tokens', {
      method: 'POST',
      body: JSON.stringify({ name: 'Okta production' }),
    });
  });

  it('rejects a malformed create response instead of rendering an invalid secret', async () => {
    apiRequest.mockResolvedValueOnce({ token: '   ' });

    await expect(runAction({ orgId: 'org_1', intent: 'create', name: 'Okta' })).resolves.toEqual({
      status: 502,
      body: { errorCode: 'invalidResponse' },
    });
  });

  it('renews a selected token with encoded identifiers and returns the one-time secret', async () => {
    apiRequest.mockResolvedValueOnce({ token: 'rotated_secret' });

    const { body } = await runAction({ orgId: 'org/1', intent: 'rotate', tokenId: 'token/1' });

    expect(body).toEqual({ statusCode: 'rotated', token: 'rotated_secret' });
    expect(apiRequest).toHaveBeenCalledWith(expect.any(Request), '/orgs/org%2F1/scim/tokens/token%2F1/rotate', {
      method: 'POST',
    });
  });

  it('revokes a selected token and never returns a secret', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { body } = await runAction({ orgId: 'org_1', intent: 'revoke', tokenId: 'token_1' });

    expect(body).toEqual({ statusCode: 'revoked' });
    expect(apiRequest).toHaveBeenCalledWith(expect.any(Request), '/orgs/org_1/scim/tokens/token_1', {
      method: 'DELETE',
    });
  });

  it('validates a missing token ID and maps a disappeared token', async () => {
    await expect(runAction({ orgId: 'org_1', intent: 'rotate' })).resolves.toEqual({
      status: 400,
      body: { errorCode: 'tokenRequired' },
    });

    apiRequest.mockRejectedValueOnce(apiResponse(404, { code: 'SCIM_TOKEN_NOT_FOUND', error: 'Database row details' }));

    await expect(runAction({ orgId: 'org_1', intent: 'revoke', tokenId: 'gone' })).resolves.toEqual({
      status: 404,
      body: { errorCode: 'tokenNotFound' },
    });
  });

  it('rethrows login and MFA redirects so React Router performs them', async () => {
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fscim-token-settings' },
    });
    apiRequest.mockRejectedValueOnce(loginRedirect);

    await expect(
      action({ request: formRequest({ orgId: 'org_1', intent: 'create', name: 'x' }) } as never),
    ).rejects.toBe(loginRedirect);

    const mfaRedirect = new Response(null, { status: 303, headers: { Location: '/mfa-setup' } });
    apiRequest.mockRejectedValueOnce(mfaRedirect);

    await expect(
      action({ request: formRequest({ orgId: 'org_1', intent: 'create', name: 'x' }) } as never),
    ).rejects.toBe(mfaRedirect);
  });
});

describe('scim-token-settings loader and metadata', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    firstOrganizationOrNull.mockReset();
    firstOrganizationOrNull.mockResolvedValue({ id: 'org/1' });
  });

  it('resolves French on the server, encodes the organization and validates token metadata', async () => {
    apiRequest.mockResolvedValueOnce({
      scimTokens: [
        {
          id: 'token_1',
          name: 'Nom saisi par le client',
          createdAt: '2026-01-02T03:04:05.000Z',
          lastUsedAt: null,
          expiresAt: '2027-01-02T03:04:05.000Z',
          expired: false,
        },
      ],
    });

    const data = await runLoader('fr-FR,fr;q=0.9,en;q=0.8');

    expect(data.language).toBe('fr');
    expect(data.loadErrorKind).toBeNull();
    expect(data.scimTokens).toHaveLength(1);
    expect(data.scimTokens[0]?.name).toBe('Nom saisi par le client');
    expect(apiRequest).toHaveBeenCalledWith(expect.any(Request), '/orgs/org%2F1/scim/tokens');

    expect(meta({ data } as never)).toEqual([
      { title: 'Paramètres des jetons SCIM — E-Code' },
      {
        name: 'description',
        content:
          'Créez, renouvelez et révoquez les jetons SCIM utilisés par les fournisseurs d’identité pour provisionner les membres.',
      },
    ]);
  });

  it('does not turn malformed security metadata into a false empty state', async () => {
    apiRequest.mockResolvedValueOnce({ scimTokens: [{ id: 'token_1', name: 'incomplete' }] });

    const data = await runLoader('en-US');

    expect(data.scimTokens).toEqual([]);
    expect(data.loadErrorKind).toBe('temporary');
  });

  it('distinguishes permission denial from temporary failure without returning API prose', async () => {
    apiRequest.mockRejectedValueOnce(apiResponse(403, { error: 'Sensitive upstream explanation' }));

    const data = await runLoader('fr');

    expect(data.loadErrorKind).toBe('permission');
    expect(JSON.stringify(data)).not.toContain('Sensitive upstream explanation');

    apiRequest.mockRejectedValueOnce(new Error('private backend hostname'));

    const retryData = await runLoader('fr');

    expect(retryData.loadErrorKind).toBe('temporary');
    expect(JSON.stringify(retryData)).not.toContain('private backend hostname');
  });

  it('rethrows authentication redirects from the loader', async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: '/login' } });
    apiRequest.mockRejectedValueOnce(redirectResponse);

    await expect(loader({ request: new Request('http://localhost/scim-token-settings') } as never)).rejects.toBe(
      redirectResponse,
    );
  });
});
