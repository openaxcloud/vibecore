import { describe, expect, it } from 'vitest';
import {
  isConnectorDataPart,
  type ConnectorDataPart,
  type ConnectionRequestMessage,
  type ConnectionResolvedMessage,
  type ConnectionFailedMessage,
  type SecretRequestMessage,
  type ReconnectionRequiredMessage,
} from './connector-messages';

describe('isConnectorDataPart', () => {
  it('accepts a well-formed connection_request part', () => {
    const part: ConnectorDataPart = {
      type: 'connector',
      payload: {
        kind: 'connection_request',
        messageId: 'msg_1',
        provider: 'github',
        providerDisplayName: 'GitHub',
        providerLogoUrl: '/integrations/logos/github.svg',
        scopes: [{ scope: 'repo', label: 'Repositories', description: 'Read and write to your repositories.' }],
        reason: 'Needed to create the repo you asked for.',
        resumeToken: 'resume_xyz',
      } satisfies ConnectionRequestMessage,
    };

    expect(isConnectorDataPart(part)).toBe(true);
  });

  it('accepts every other connector kind', () => {
    const kinds: Array<ConnectorDataPart['payload']> = [
      {
        kind: 'connection_resolved',
        messageId: 'msg_2',
        provider: 'github',
        providerDisplayName: 'GitHub',
        accountLabel: 'octocat',
        userConnectionId: 'conn_1',
      } satisfies ConnectionResolvedMessage,
      {
        kind: 'connection_failed',
        messageId: 'msg_3',
        provider: 'github',
        providerDisplayName: 'GitHub',
        reason: 'user_denied',
      } satisfies ConnectionFailedMessage,
      {
        kind: 'secret_request',
        messageId: 'msg_4',
        secretKey: 'SENDGRID_API_KEY',
        displayName: 'SendGrid API key',
        description: 'Used to send transactional emails.',
        fields: [{ name: 'apiKey', label: 'API key', type: 'password', required: true }],
        resumeToken: 'resume_sg',
      } satisfies SecretRequestMessage,
      {
        kind: 'reconnection_required',
        messageId: 'msg_5',
        provider: 'github',
        providerDisplayName: 'GitHub',
        userConnectionId: 'conn_1',
        reason: 'token_expired',
        resumeToken: 'resume_rec',
      } satisfies ReconnectionRequiredMessage,
    ];

    for (const payload of kinds) {
      expect(isConnectorDataPart({ type: 'connector', payload })).toBe(true);
    }
  });

  it('rejects non-objects', () => {
    expect(isConnectorDataPart(null)).toBe(false);
    expect(isConnectorDataPart(undefined)).toBe(false);
    expect(isConnectorDataPart('connector')).toBe(false);
    expect(isConnectorDataPart(42)).toBe(false);
  });

  it('rejects when the discriminator type is wrong', () => {
    expect(
      isConnectorDataPart({
        type: 'text',
        payload: { kind: 'connection_request' },
      }),
    ).toBe(false);
  });

  it('rejects when the payload has no kind string', () => {
    expect(isConnectorDataPart({ type: 'connector', payload: {} })).toBe(false);
    expect(isConnectorDataPart({ type: 'connector', payload: { kind: 42 } })).toBe(false);
  });
});
