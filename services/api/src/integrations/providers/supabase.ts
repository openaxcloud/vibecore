import {
  ConnectorProviderError,
  type ConnectorApiKeyTestResult,
  type ConnectorProvider,
  type ConnectorUserInfo,
} from './types.js';

// The Supabase Management API does not expose a /user endpoint. The
// canonical way to validate a Management API token (PAT or
// service-role token returned by oauth/token) is to list the projects
// the token has access to. A 200 with an array - even an empty one -
// confirms the token works; 401/403 confirms it's invalid or
// insufficient. We use the smallest possible payload (the first
// project's ref + name) to derive the externalAccount metadata.
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
  const first = projects[0];

  if (!first) {
    // Empty list is still a valid Supabase account - the token works
    // but the user has no projects yet. We surface a stable synthetic
    // id keyed off the token's first available organization so the
    // UserConnection row has a deterministic external account.
    return {
      externalAccountId: 'supabase-account',
      externalAccountLabel: 'Supabase account (no projects)',
    };
  }

  const id = first.organization_id ?? first.ref ?? first.id ?? 'supabase-account';
  const label = first.organization_id ? `Supabase org ${first.organization_id}` : (first.name ?? first.ref ?? id);

  return {
    externalAccountId: String(id),
    externalAccountLabel: String(label),
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
        message: `Supabase projects returned HTTP ${response.status}`,
        httpStatus: response.status,
      });
    }

    let payload: SupabaseProject[];

    try {
      payload = (await response.json()) as SupabaseProject[];
    } catch {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
        message: 'Supabase projects returned a non-JSON body',
      });
    }

    if (!Array.isArray(payload)) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
        message: 'Supabase projects response is not an array',
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
