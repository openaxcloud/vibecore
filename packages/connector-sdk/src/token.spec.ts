import { describe, expect, it } from 'vitest';
import { signConnectorAccessToken, verifyConnectorAccessToken } from './token.js';

const secret = 'test-secret-do-not-use-in-production';

const basePayload = {
  workspaceId: 'ws_abc',
  projectId: 'proj_def',
  userId: 'user_ghi',
  organizationId: 'org_jkl',
};

describe('signConnectorAccessToken / verifyConnectorAccessToken', () => {
  it('round-trips a valid payload', () => {
    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    const result = verifyConnectorAccessToken({ token, secret });

    expect(result.ok).toBe(true);
    expect(result.payload?.workspaceId).toBe('ws_abc');
    expect(result.payload?.projectId).toBe('proj_def');
  });

  it('rejects when the token is missing', () => {
    const result = verifyConnectorAccessToken({ token: undefined, secret });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing');
  });

  it('rejects a malformed token', () => {
    const result = verifyConnectorAccessToken({ token: 'no-dot-here', secret });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed');
  });

  it('rejects a tampered payload', () => {
    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });
    const [, signature] = token.split('.');
    const tampered = `${Buffer.from(JSON.stringify({ ...basePayload, workspaceId: 'ws_attacker', expiresAt: Date.now() + 60_000 })).toString('base64url')}.${signature}`;

    const result = verifyConnectorAccessToken({ token: tampered, secret });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects when the secret differs', () => {
    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    const result = verifyConnectorAccessToken({ token, secret: 'wrong-secret' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects an expired token', () => {
    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: 1000 },
      secret,
    });

    const result = verifyConnectorAccessToken({ token, secret, now: 2000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects when the expected workspace does not match the payload', () => {
    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    const result = verifyConnectorAccessToken({ token, secret, expectedWorkspaceId: 'ws_other' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('keeps the agentSessionId field when provided', () => {
    const token = signConnectorAccessToken({
      payload: { ...basePayload, agentSessionId: 'sess_123', expiresAt: Date.now() + 60_000 },
      secret,
    });

    const result = verifyConnectorAccessToken({ token, secret });
    expect(result.ok).toBe(true);
    expect(result.payload?.agentSessionId).toBe('sess_123');
  });
});
