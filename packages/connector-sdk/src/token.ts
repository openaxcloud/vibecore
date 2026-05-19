import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ConnectorAccessTokenPayload } from './index.js';

export function signConnectorAccessToken(input: {
  payload: ConnectorAccessTokenPayload;
  secret: string;
}): string {
  const payload = Buffer.from(JSON.stringify(input.payload)).toString('base64url');
  const signature = createHmac('sha256', input.secret).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

export interface VerifyConnectorAccessTokenResult {
  ok: boolean;
  payload?: ConnectorAccessTokenPayload;
  reason?: 'missing' | 'malformed' | 'invalid_signature' | 'expired';
}

export function verifyConnectorAccessToken(input: {
  token: string | undefined;
  secret: string;
  expectedWorkspaceId?: string;
  now?: number;
}): VerifyConnectorAccessTokenResult {
  if (!input.token) {
    return { ok: false, reason: 'missing' };
  }

  const [payload, signature] = input.token.split('.');

  if (!payload || !signature) {
    return { ok: false, reason: 'malformed' };
  }

  const expected = createHmac('sha256', input.secret).update(payload).digest('base64url');

  if (expected.length !== signature.length) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const valid = timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  if (!valid) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let parsed: ConnectorAccessTokenPayload;

  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ConnectorAccessTokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const now = input.now ?? Date.now();

  if (parsed.expiresAt <= now) {
    return { ok: false, reason: 'expired' };
  }

  if (input.expectedWorkspaceId && parsed.workspaceId !== input.expectedWorkspaceId) {
    return { ok: false, reason: 'invalid_signature' };
  }

  return { ok: true, payload: parsed };
}
