// Shared types for connector OAuth providers. Every concrete provider
// implements ConnectorProvider so the routes layer can stay generic.
// See docs/INTEGRATIONS_MASTER_PLAN.md section 5 for the full surface.

export interface ConnectorOAuthCredentials {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri: string;
}

export interface ConnectorTokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  scopes: string[];
}

export interface ConnectorUserInfo {
  externalAccountId: string;
  externalAccountLabel: string;
}

export interface ConnectorProvider {
  readonly provider: string;
  buildAuthorizeUrl(input: { credentials: ConnectorOAuthCredentials; state: string }): string;
  exchangeCodeForToken(input: {
    credentials: ConnectorOAuthCredentials;
    code: string;
    fetchImpl?: typeof fetch;
  }): Promise<ConnectorTokenExchangeResult>;
  fetchUserInfo(input: { accessToken: string; fetchImpl?: typeof fetch }): Promise<ConnectorUserInfo>;
}

export class ConnectorProviderError extends Error {
  readonly code: 'PROVIDER_TOKEN_EXCHANGE_FAILED' | 'PROVIDER_USER_INFO_FAILED' | 'PROVIDER_RESPONSE_MALFORMED';
  readonly httpStatus?: number;
  readonly providerDetail?: string;

  constructor(input: {
    code: ConnectorProviderError['code'];
    message: string;
    httpStatus?: number;
    providerDetail?: string;
  }) {
    super(input.message);
    this.name = 'ConnectorProviderError';
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.providerDetail = input.providerDetail;
  }
}
