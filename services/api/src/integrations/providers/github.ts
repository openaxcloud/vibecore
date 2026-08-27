import {
  ConnectorProviderError,
  type ConnectorOAuthCredentials,
  type ConnectorProvider,
  type ConnectorTokenExchangeResult,
  type ConnectorUserInfo,
} from './types.js';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_INFO_URL = 'https://api.github.com/user';

interface GithubTokenResponse {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GithubUserResponse {
  id?: number;
  login?: string;
  name?: string | null;
}

export const githubConnector: ConnectorProvider = {
  provider: 'github',
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
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        redirect_uri: credentials.redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_TOKEN_EXCHANGE_FAILED',
        httpStatus: response.status,
      });
    }

    let payload: GithubTokenResponse;

    try {
      payload = (await response.json()) as GithubTokenResponse;
    } catch {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    if (payload.error) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_TOKEN_EXCHANGE_FAILED',
        providerDetail: payload.error_description ?? payload.error,
      });
    }

    if (!payload.access_token) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    const scopes = (payload.scope ?? '')
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    const result: ConnectorTokenExchangeResult = {
      accessToken: payload.access_token,
      scopes,
    };

    return result;
  },

  async fetchUserInfo({ accessToken, fetchImpl }) {
    const impl = fetchImpl ?? fetch;
    const response = await impl(USER_INFO_URL, {
      method: 'GET',
      headers: {
        authorization: `token ${accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'e-code-connector-proxy',
        'x-github-api-version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_USER_INFO_FAILED',
        httpStatus: response.status,
      });
    }

    let payload: GithubUserResponse;

    try {
      payload = (await response.json()) as GithubUserResponse;
    } catch {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    if (!payload.id || !payload.login) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    const userInfo: ConnectorUserInfo = {
      externalAccountId: String(payload.id),
      externalAccountLabel: payload.login,
    };

    return userInfo;
  },
};

export function resolveGithubCredentials(
  envProvider: Record<string, string | undefined> = process.env,
): ConnectorOAuthCredentials | null {
  const clientId = envProvider.INTEGRATION_GITHUB_CLIENT_ID ?? envProvider.GITHUB_INTEGRATION_CLIENT_ID;
  const clientSecret = envProvider.INTEGRATION_GITHUB_CLIENT_SECRET ?? envProvider.GITHUB_INTEGRATION_CLIENT_SECRET;
  const redirectUri =
    envProvider.INTEGRATION_GITHUB_REDIRECT_URI ?? 'https://app.e-code.ai/integrations/oauth/github/callback';
  const scopesValue = envProvider.INTEGRATION_GITHUB_SCOPES ?? 'read:org read:user read:project repo user:email';

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
