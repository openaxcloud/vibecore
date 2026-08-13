import {
  ConnectorProviderError,
  type ConnectorApiKeyTestResult,
  type ConnectorProvider,
  type ConnectorUserInfo,
} from './types.js';

const USER_INFO_URL = 'https://api.netlify.com/api/v1/user';

interface NetlifyUserResponse {
  id?: string;
  uid?: string;
  slug?: string;
  email?: string;
  full_name?: string | null;
  login_provider?: string | null;
}

async function callNetlifyUser(accessToken: string, fetchImpl?: typeof fetch): Promise<Response> {
  const impl = fetchImpl ?? fetch;
  return impl(USER_INFO_URL, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'user-agent': 'e-code-connector-proxy',
    },
  });
}

function parseNetlifyUser(payload: NetlifyUserResponse): ConnectorUserInfo | null {
  const id = payload.id ?? payload.uid;

  if (!id) {
    return null;
  }

  const label = payload.full_name ?? payload.email ?? payload.slug ?? String(id);

  return {
    externalAccountId: String(id),
    externalAccountLabel: String(label),
  };
}

export const netlifyConnector: ConnectorProvider = {
  provider: 'netlify',
  authType: 'api_key',

  async fetchUserInfo({ accessToken, fetchImpl }) {
    const response = await callNetlifyUser(accessToken, fetchImpl);

    if (!response.ok) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_USER_INFO_FAILED',
        message: `Netlify user info returned HTTP ${response.status}`,
        httpStatus: response.status,
      });
    }

    let payload: NetlifyUserResponse;

    try {
      payload = (await response.json()) as NetlifyUserResponse;
    } catch {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
        message: 'Netlify user info returned a non-JSON body',
      });
    }

    const userInfo = parseNetlifyUser(payload);

    if (!userInfo) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
        message: 'Netlify user info response is missing id',
      });
    }

    return userInfo;
  },

  async testApiKey({ apiKey, fetchImpl }): Promise<ConnectorApiKeyTestResult> {
    let response: Response;

    try {
      response = await callNetlifyUser(apiKey, fetchImpl);
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
        detail: 'Netlify rejected the token (HTTP 401)',
      };
    }

    if (response.status === 403) {
      return {
        ok: false,
        code: 'API_KEY_INSUFFICIENT_SCOPE',
        detail: 'Netlify token lacks the required scopes (HTTP 403)',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: 'PROVIDER_UNREACHABLE',
        detail: `Netlify user info returned HTTP ${response.status}`,
      };
    }

    let payload: NetlifyUserResponse;

    try {
      payload = (await response.json()) as NetlifyUserResponse;
    } catch {
      return {
        ok: false,
        code: 'PROVIDER_RESPONSE_MALFORMED',
        detail: 'Netlify user info returned a non-JSON body',
      };
    }

    const userInfo = parseNetlifyUser(payload);

    if (!userInfo) {
      return {
        ok: false,
        code: 'PROVIDER_RESPONSE_MALFORMED',
        detail: 'Netlify user info response is missing id',
      };
    }

    return { ok: true, userInfo };
  },
};
