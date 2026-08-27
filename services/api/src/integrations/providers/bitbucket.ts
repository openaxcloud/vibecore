import { Buffer } from 'node:buffer';
import {
  ConnectorProviderError,
  type ConnectorOAuthCredentials,
  type ConnectorProvider,
  type ConnectorTokenExchangeResult,
  type ConnectorUserInfo,
} from './types.js';

const AUTHORIZE_URL = 'https://bitbucket.org/site/oauth2/authorize';
const TOKEN_URL = 'https://bitbucket.org/site/oauth2/access_token';
const USER_INFO_URL = 'https://api.bitbucket.org/2.0/user';

interface BitbucketTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scopes?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface BitbucketUserResponse {
  uuid?: string;
  username?: string;
  display_name?: string;
}

export const bitbucketConnector: ConnectorProvider = {
  provider: 'bitbucket',
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
        authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'e-code-connector-proxy',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
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

    let payload: BitbucketTokenResponse;

    try {
      payload = (await response.json()) as BitbucketTokenResponse;
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

    const result: ConnectorTokenExchangeResult = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresInSeconds: payload.expires_in,
      scopes: (payload.scopes ?? '')
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
        httpStatus: response.status,
      });
    }

    let payload: BitbucketUserResponse;

    try {
      payload = (await response.json()) as BitbucketUserResponse;
    } catch {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    if (!payload.uuid) {
      throw new ConnectorProviderError({
        code: 'PROVIDER_RESPONSE_MALFORMED',
      });
    }

    const userInfo: ConnectorUserInfo = {
      externalAccountId: payload.uuid,
      externalAccountLabel: payload.display_name ?? payload.username ?? payload.uuid,
    };

    return userInfo;
  },
};

export function resolveBitbucketCredentials(
  envProvider: Record<string, string | undefined> = process.env,
): ConnectorOAuthCredentials | null {
  const clientId = envProvider.INTEGRATION_BITBUCKET_CLIENT_ID ?? envProvider.BITBUCKET_INTEGRATION_CLIENT_ID;
  const clientSecret =
    envProvider.INTEGRATION_BITBUCKET_CLIENT_SECRET ?? envProvider.BITBUCKET_INTEGRATION_CLIENT_SECRET;
  const redirectUri =
    envProvider.INTEGRATION_BITBUCKET_REDIRECT_URI ?? 'https://app.e-code.ai/integrations/oauth/bitbucket/callback';
  const scopesValue = envProvider.INTEGRATION_BITBUCKET_SCOPES ?? 'account repository repository:write pullrequest';

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
