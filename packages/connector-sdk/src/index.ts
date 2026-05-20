// Public surface of @vibecore/connector-sdk. Consumed by:
//   - services/api when it signs an access token to inject into a workspace
//   - services/connector-proxy when it verifies an incoming token
//   - workspaces (the generated SDK methods are added by future codegen)
//
// The token is HMAC-SHA256 signed and carries enough context for the proxy
// to enforce the ACL chain documented in docs/INTEGRATIONS_MASTER_PLAN.md
// section 5.2: workspaceId → projectId binding, ProjectConnectionLink
// existence, OrganizationConnectorPolicy match, rate-limit bucket key.

export interface ConnectorAccessTokenPayload {
  workspaceId: string;
  projectId: string;
  userId: string;
  organizationId: string;
  agentSessionId?: string;
  expiresAt: number;
}

export type ConnectorErrorCode =
  | 'CONNECTOR_TOKEN_MISSING'
  | 'CONNECTOR_TOKEN_INVALID'
  | 'CONNECTOR_TOKEN_EXPIRED'
  | 'CONNECTOR_LINK_MISSING'
  | 'CONNECTOR_POLICY_DENIED'
  | 'CONNECTOR_RATE_LIMITED'
  | 'CONNECTOR_PROVIDER_AUTH_FAILED'
  | 'CONNECTOR_PROVIDER_UNREACHABLE'
  | 'CONNECTOR_UNKNOWN_PROVIDER'
  | 'CONNECTOR_NEEDS_RECONNECT';

export interface ConnectorErrorBody {
  error: string;
  code: ConnectorErrorCode;
  detail?: string;
}

export { signConnectorAccessToken, verifyConnectorAccessToken } from './token.js';
