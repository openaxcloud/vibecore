import {
  ConnectorProviderError,
  type ConnectorApiKeyTestResult,
  type ConnectorProvider,
  type ConnectorUserInfo,
} from './types.js';

/*
 * The Supabase Management API does not expose a /user endpoint. The
 * canonical way to validate a Management API token (PAT or
 * service-role token returned by oauth/token) is to list the projects
 * the token has access to. A 200 with an array - even an empty one -
 * confirms the token works; 401/403 confirms it's invalid or
 * insufficient. We use the smallest possible payload (the first
 * project's ref + name) to derive the externalAccount metadata.
 */
const PROJECTS_URL = 'https://api.supabase.com/v1/projects';

interface SupabaseProject {
  id?: string;
  ref?: string;
  name?: string;
  organization_id?: string;
}

async function callSupabaseProjects(accessToken: string, fetchImpl?: typeof fetch): Promise<Response> {
  const impl = fetchImpl ?? fetch;
  return impl(PROJECTS_URL, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'user-agent': 'e-code-connector-proxy',
    },
  });
}

function parseSupabaseAccount(projects: SupabaseProject[]): ConnectorUserInfo {
  if (projects.length === 0) {
    /*
     * Empty list is still a valid Supabase account - the token works
     * but the user has no projects yet. We surface a stable synthetic
     * id keyed off the token's first available organization so the
     * UserConnection row has a deterministic external account.
     */
    return {
      externalAccountId: 'supabase-account',
      externalAccountLabel: 'Supabase account (no projects)',
    };
  }

  /*
   * The Management API GET /v1/projects returns projects in NO guaranteed
   * order, and the set shifts as the user creates/deletes projects. Picking
   * projects[0] therefore yields a non-deterministic externalAccountId, which
   * breaks the UserConnection upsert keyed on (userId, provider,
   * externalAccountId): reconnecting the SAME token can mint a fresh row and
   * leave a stale 'ghost' connection behind. To stay stable across calls we
   * prefer an organization the token can see (a token is typically scoped to a
   * single org) and, failing that, fall back to the lexicographically smallest
   * project ref/id. The chosen candidate is independent of array ordering.
   */
  const orgIds = projects
    .map((p) => p.organization_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort();

  if (orgIds[0]) {
    const orgId = orgIds[0];

    return {
      externalAccountId: orgId,
      externalAccountLabel: `Supabase org ${orgId}`,
    };
  }

  const refIds = projects
    .map((p) => p.ref ?? p.id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort();

  const id = refIds[0] ?? 'supabase-account';

  /*
   * Preserve the original project's display name where we can, but anchor the
   * label to the same stable project we keyed off so it does not flap either.
   */
  const anchor = projects.find((p) => (p.ref ?? p.id) === id);
  const label = anchor?.name ?? id;

  return {
    externalAccountId: id,
    externalAccountLabel: label,
  };
}

export const supabaseConnector: ConnectorProvider = {
  provider: 'supabase',
  authType: 'api_key',

  async fetchUserInfo({ accessToken, fetchImpl }) {
    const response = await callSupabaseProjects(accessToken, fetchImpl);

    if (!response.ok) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_USER_INFO_FAILED',
        httpStatus: response.status,
      });
    }

    let payload: SupabaseProject[];

    try {
      payload = (await response.json()) as SupabaseProject[];
    } catch {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    if (!Array.isArray(payload)) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    return parseSupabaseAccount(payload);
  },

  async testApiKey({ apiKey, fetchImpl }): Promise<ConnectorApiKeyTestResult> {
    let response: Response;

    try {
      response = await callSupabaseProjects(apiKey, fetchImpl);
    } catch (error) {
      return {
        ok: false,
        code: 'PROVIDER_UNREACHABLE',
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    if (response.status === 401) {
      return {
        ok: false,
        code: 'API_KEY_INVALID',
        detail: 'Supabase rejected the token (HTTP 401)',
      };
    }

    if (response.status === 403) {
      return {
        ok: false,
        code: 'API_KEY_INSUFFICIENT_SCOPE',
        detail: 'Supabase token lacks the required scopes (HTTP 403)',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: 'PROVIDER_UNREACHABLE',
        detail: `Supabase projects returned HTTP ${response.status}`,
      };
    }

    let payload: SupabaseProject[];

    try {
      payload = (await response.json()) as SupabaseProject[];
    } catch {
      return {
        ok: false,
        code: 'PROVIDER_RESPONSE_MALFORMED',
        detail: 'Supabase projects returned a non-JSON body',
      };
    }

    if (!Array.isArray(payload)) {
      return {
        ok: false,
        code: 'PROVIDER_RESPONSE_MALFORMED',
        detail: 'Supabase projects response is not an array',
      };
    }

    return { ok: true, userInfo: parseSupabaseAccount(payload) };
  },
};
