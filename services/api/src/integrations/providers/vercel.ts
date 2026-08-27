import {
  ConnectorProviderError,
  type ConnectorApiKeyTestResult,
  type ConnectorProvider,
  type ConnectorUserInfo,
} from './types.js';

const USER_INFO_URL = 'https://api.vercel.com/v2/user';

interface VercelUserResponse {
  user?: {
    id?: string;
    uid?: string;
    username?: string;
    email?: string;
    name?: string | null;
  };
}

async function callVercelUser(accessToken: string, fetchImpl?: typeof fetch): Promise<Response> {
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

function parseVercelUser(payload: VercelUserResponse): ConnectorUserInfo | null {
  const user = payload.user;

  if (!user) {
    return null;
  }

  const id = user.id ?? user.uid;

  if (!id) {
    return null;
  }

  const label = user.username ?? user.email ?? user.name ?? id;

  return {
    externalAccountId: String(id),
    externalAccountLabel: String(label),
  };
}

export const vercelConnector: ConnectorProvider = {
  provider: 'vercel',
  authType: 'api_key',

  async fetchUserInfo({ accessToken, fetchImpl }) {
    const response = await callVercelUser(accessToken, fetchImpl);

    if (!response.ok) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_USER_INFO_FAILED',
        httpStatus: response.status,
      });
    }

    let payload: VercelUserResponse;

    try {
      payload = (await response.json()) as VercelUserResponse;
    } catch {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    const userInfo = parseVercelUser(payload);

    if (!userInfo) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    return userInfo;
  },

  async testApiKey({ apiKey, fetchImpl }): Promise<ConnectorApiKeyTestResult> {
    let response: Response;

    try {
      response = await callVercelUser(apiKey, fetchImpl);
    } catch (error) {
      return {
        ok: false,
        code: 'PROVIDER_UNREACHABLE',
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: 'API_KEY_INVALID',
        detail: `Vercel rejected the token (HTTP ${response.status})`,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: 'PROVIDER_UNREACHABLE',
        detail: `Vercel user info returned HTTP ${response.status}`,
      };
    }

    let payload: VercelUserResponse;

    try {
      payload = (await response.json()) as VercelUserResponse;
    } catch {
      return {
        ok: false,
        code: 'PROVIDER_RESPONSE_MALFORMED',
        detail: 'Vercel user info returned a non-JSON body',
      };
    }

    const userInfo = parseVercelUser(payload);

    if (!userInfo) {
      return {
        ok: false,
        code: 'PROVIDER_RESPONSE_MALFORMED',
        detail: 'Vercel user info response is missing id or username',
      };
    }

    return { ok: true, userInfo };
  },
};
