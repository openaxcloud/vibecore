import {
  ConnectorProviderError,
  type ConnectorOAuthCredentials,
  type ConnectorProvider,
  type ConnectorTokenExchangeResult,
  type ConnectorUserInfo,
} from './types.js';

const AUTHORIZE_URL = 'https://gitlab.com/oauth/authorize';
const TOKEN_URL = 'https://gitlab.com/oauth/token';
const USER_INFO_URL = 'https://gitlab.com/api/v4/user';

interface GitLabTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GitLabUserResponse {
  id?: number;
  username?: string;
  name?: string | null;
}

export const gitlabConnector: ConnectorProvider = {
  provider: 'gitlab',
  authType: 'oauth',

  buildAuthorizeUrl({ credentials, state }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', credentials.clientId);
    url.searchParams.set('redirect_uri', credentials.redirectUri);
    url.searchParams.set('scope', credentials.scopes.join(' '));
    url.searchParams.set('state', state);

    return url.toString();
  },

  async exchangeCodeForToken({ credentials, code, fetchImpl }) {
    const impl = fetchImpl ?? fetch;
    const response = await impl(TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'e-code-connector-proxy',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        redirect_uri: credentials.redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_TOKEN_EXCHANGE_FAILED',
        message: `GitLab token exchange returned HTTP ${response.status}`,
        httpStatus: response.status,
      });
    }

    let payload: GitLabTokenResponse;

    try {
      payload = (await response.json()) as GitLabTokenResponse;
    } catch {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
        message: 'GitLab token exchange returned a non-JSON body',
      });
    }

    if (payload.error) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_TOKEN_EXCHANGE_FAILED',
        message: payload.error,
        providerDetail: payload.error_description,
      });
    }

    if (!payload.access_token) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
        message: 'GitLab token exchange response did not include access_token',
      });
    }

    const result: ConnectorTokenExchangeResult = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresInSeconds: payload.expires_in,
      scopes: (payload.scope ?? '')
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    };

    return result;
  },

  async fetchUserInfo({ accessToken, fetchImpl }) {
    const impl = fetchImpl ?? fetch;
    const response = await impl(USER_INFO_URL, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'user-agent': 'e-code-connector-proxy',
      },
    });

    if (!response.ok) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_USER_INFO_FAILED',
        message: `GitLab user info returned HTTP ${response.status}`,
        httpStatus: response.status,
      });
    }

    let payload: GitLabUserResponse;

    try {
      payload = (await response.json()) as GitLabUserResponse;
    } catch {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
        message: 'GitLab user info returned a non-JSON body',
      });
    }

    if (!payload.id || !payload.username) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
        message: 'GitLab user info response is missing id or username',
      });
    }

    const userInfo: ConnectorUserInfo = {
      externalAccountId: String(payload.id),
      externalAccountLabel: payload.username,
    };

    return userInfo;
  },
};

export function resolveGitLabCredentials(
  envProvider: Record<string, string | undefined> = process.env,
): ConnectorOAuthCredentials | null {
  const clientId = envProvider.INTEGRATION_GITLAB_CLIENT_ID ?? envProvider.GITLAB_INTEGRATION_CLIENT_ID;
  const clientSecret = envProvider.INTEGRATION_GITLAB_CLIENT_SECRET ?? envProvider.GITLAB_INTEGRATION_CLIENT_SECRET;
  const redirectUri =
    envProvider.INTEGRATION_GITLAB_REDIRECT_URI ?? 'https://app.e-code.ai/integrations/oauth/gitlab/callback';
  const scopesValue = envProvider.INTEGRATION_GITLAB_SCOPES ?? 'read_user read_repository write_repository api';

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: scopesValue
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}
