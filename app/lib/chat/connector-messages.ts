/*
 * Connector-related agent messages exchanged between the e-code agent
 * (app/lib/.server/llm/agent-orchestration.ts) and the chat UI
 * (app/components/chat/*). These plug into the Vercel AI SDK message
 * stream as data parts annotated on assistant messages — the chat
 * renderer dispatches each kind to a dedicated card component.
 *
 * See docs/INTEGRATIONS_MASTER_PLAN.md sections 4 ("Database schema")
 * and 7 ("Agent layer integration") for how the agent emits these and
 * how the proxy interacts with the resulting UserConnection records.
 */

export type ConnectorMessageKind =
  | 'connection_request'
  | 'connection_resolved'
  | 'connection_failed'
  | 'secret_request'
  | 'secret_provided'
  | 'reconnection_required';

export interface ConnectionRequestScopeDescription {
  scope: string;
  label: string;
  description?: string;
}

export interface ExistingAccountConnection {
  userConnectionId: string;
  accountLabel: string;
  scopes: string[];
  scopesMatch: boolean;
}

export interface ConnectionRequestMessage {
  kind: 'connection_request';
  messageId: string;
  provider: string;
  providerDisplayName: string;
  providerLogoUrl: string;
  scopes: ConnectionRequestScopeDescription[];
  reason: string;
  resumeToken: string;
  existingAccountConnections?: ExistingAccountConnection[];
}

export interface ConnectionResolvedMessage {
  kind: 'connection_resolved';
  messageId: string;
  provider: string;
  providerDisplayName: string;
  accountLabel: string;
  userConnectionId: string;
}

export type ConnectionFailureReason = 'user_denied' | 'invalid_state' | 'provider_error' | 'scope_mismatch' | 'timeout';

export interface ConnectionFailedMessage {
  kind: 'connection_failed';
  messageId: string;
  provider: string;
  providerDisplayName: string;
  reason: ConnectionFailureReason;
  detail?: string;
}

export interface SecretRequestField {
  name: string;
  label: string;
  type: 'text' | 'password';
  required: boolean;
  placeholder?: string;
}

export interface SecretRequestMessage {
  kind: 'secret_request';
  messageId: string;
  secretKey: string;
  displayName: string;
  description: string;
  fields: SecretRequestField[];
  resumeToken: string;
}

export interface SecretProvidedMessage {
  kind: 'secret_provided';
  messageId: string;
  secretKey: string;
}

export type ReconnectionRequiredReason = 'token_expired' | 'token_revoked' | 'scope_insufficient';

export interface ReconnectionRequiredMessage {
  kind: 'reconnection_required';
  messageId: string;
  provider: string;
  providerDisplayName: string;
  userConnectionId: string;
  reason: ReconnectionRequiredReason;
  resumeToken: string;
}

export type ConnectorAgentMessage =
  | ConnectionRequestMessage
  | ConnectionResolvedMessage
  | ConnectionFailedMessage
  | SecretRequestMessage
  | SecretProvidedMessage
  | ReconnectionRequiredMessage;

/*
 * Vercel AI SDK data parts use a `type` discriminator distinct from
 * `kind`. We expose a uniform wrapper so the renderer can match on
 * `type === 'connector'` and then switch on the inner `kind`.
 */
export interface ConnectorDataPart {
  type: 'connector';
  payload: ConnectorAgentMessage;
}

export function isConnectorDataPart(part: unknown): part is ConnectorDataPart {
  if (typeof part !== 'object' || part === null) {
    return false;
  }

  const candidate = part as { type?: unknown; payload?: { kind?: unknown } };

  if (candidate.type !== 'connector') {
    return false;
  }

  if (typeof candidate.payload !== 'object' || candidate.payload === null) {
    return false;
  }

  return typeof candidate.payload.kind === 'string';
}
