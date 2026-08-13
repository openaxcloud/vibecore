// Shared types for connector providers. Every concrete provider implements
// ConnectorProvider so the routes layer can stay generic. Phase 1 only had
// OAuth providers (GitHub); Phase 2 introduces api_key providers (Vercel,
// Supabase, Netlify) and dual oauth+pat providers (GitLab). See
// docs/INTEGRATIONS_MASTER_PLAN.md section 5 for the full surface.

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

export interface ConnectorApiKeyTestResult {
  ok: boolean;
  userInfo?: ConnectorUserInfo;
  /**
   * When ok === false, machine-readable code surfacing in the route's
   * structured error response. The Settings tab uses this to render
   * actionable copy ("Token expired" vs "Insufficient scope").
   */
  code?:
    | 'API_KEY_INVALID'
    | 'API_KEY_EXPIRED'
    | 'API_KEY_INSUFFICIENT_SCOPE'
    | 'PROVIDER_UNREACHABLE'
    | 'PROVIDER_RESPONSE_MALFORMED';
  detail?: string;
}

export interface ConnectorProvider {
  readonly provider: string;
  readonly authType: 'oauth' | 'api_key';

  /**
   * Required for oauth providers. Optional for api_key providers (they
   * never run the authorize step). Throws ConnectorProviderError when
   * called on an api_key provider.
   */
  buildAuthorizeUrl?(input: { credentials: ConnectorOAuthCredentials; state: string }): string;

  /**
   * Required for oauth providers. Optional for api_key providers.
   */
  exchangeCodeForToken?(input: {
    credentials: ConnectorOAuthCredentials;
    code: string;
    fetchImpl?: typeof fetch;
  }): Promise<ConnectorTokenExchangeResult>;

  /**
   * Required. Called both after the OAuth exchange and after an api_key
   * provider's testApiKey returns ok=true, to populate the
   * UserConnection.externalAccountId + externalAccountLabel.
   */
  fetchUserInfo(input: { accessToken: string; fetchImpl?: typeof fetch }): Promise<ConnectorUserInfo>;

  /**
   * Required for api_key providers. Pings the provider with the
   * supplied key to confirm it's valid before persisting the
   * UserConnection. The route layer maps ConnectorApiKeyTestResult to
   * its HTTP response.
   */
  testApiKey?(input: { apiKey: string; fetchImpl?: typeof fetch }): Promise<ConnectorApiKeyTestResult>;
}

export class ConnectorProviderError extends Error {
  readonly code:
    | 'PROVIDER_TOKEN_EXCHANGE_FAILED'
    | 'PROVIDER_USER_INFO_FAILED'
    | 'PROVIDER_RESPONSE_MALFORMED'
    | 'PROVIDER_UNSUPPORTED_OPERATION';
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

