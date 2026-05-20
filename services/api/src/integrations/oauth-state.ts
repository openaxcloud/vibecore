import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

// State HMAC for the IDE Integrations OAuth flow. Distinct from the
// login OAuth state (services/api/src/app.ts:3791-3826) because the
// integration callback needs to know which project + user + org the
// flow was initiated for. Encodes the full context as a base64url JSON
// payload signed with HMAC-SHA256 and validated in constant time.
//
// The secret is the same OAUTH_STATE_SECRET env var (with fallback to
// JWT_SECRET) used by the login flow, so existing key rotation runbooks
// apply.

export interface IntegrationOAuthStateContext {
  provider: string;
  projectId: string;
  userId: string;
  organizationId: string;
}

interface SignedStatePayload extends IntegrationOAuthStateContext {
  expiresAt: number;
  nonce: string;
}

export const DEFAULT_STATE_TTL_SECONDS = 600;

export function resolveIntegrationOauthStateSecret(envProvider: Record<string, string | undefined> = process.env): string {
  return envProvider.OAUTH_STATE_SECRET || envProvider.JWT_SECRET || 'dev-jwt-secret-change-me';
}

export function signIntegrationOauthState(input: {
  context: IntegrationOAuthStateContext;
  secret: string;
  ttlSeconds?: number;
  now?: number;
}): string {
  const now = input.now ?? Date.now();
  const ttl = input.ttlSeconds ?? DEFAULT_STATE_TTL_SECONDS;
  const payload: SignedStatePayload = {
    ...input.context,
    expiresAt: Math.floor(now / 1000) + ttl,
    nonce: randomUUID(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', input.secret).update(encoded).digest('base64url');

  return `${encoded}.${signature}`;
}

export type IntegrationOauthStateVerificationFailure =
  | 'malformed'
  | 'invalid_signature'
  | 'expired'
  | 'provider_mismatch';

export type IntegrationOauthStateVerification =
  | { ok: true; context: IntegrationOAuthStateContext }
  | { ok: false; reason: IntegrationOauthStateVerificationFailure };

export function verifyIntegrationOauthState(input: {
  state: string;
  expectedProvider: string;
  secret: string;
  now?: number;
}): IntegrationOauthStateVerification {
  const [encoded, signature] = input.state.split('.');

  if (!encoded || !signature) {
    return { ok: false, reason: 'malformed' };
  }

  const expected = createHmac('sha256', input.secret).update(encoded).digest('base64url');

  if (expected.length !== signature.length) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let signaturesMatch = false;

  try {
    signaturesMatch = timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return { ok: false, reason: 'invalid_signature' };
  }

  if (!signaturesMatch) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let payload: SignedStatePayload;

  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedStatePayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (
    typeof payload.provider !== 'string' ||
    typeof payload.projectId !== 'string' ||
    typeof payload.userId !== 'string' ||
    typeof payload.organizationId !== 'string' ||
    typeof payload.expiresAt !== 'number' ||
    typeof payload.nonce !== 'string'
  ) {
    return { ok: false, reason: 'malformed' };
  }

  const now = input.now ?? Date.now();

  if (payload.expiresAt <= Math.floor(now / 1000)) {
    return { ok: false, reason: 'expired' };
  }

  if (payload.provider !== input.expectedProvider) {
    return { ok: false, reason: 'provider_mismatch' };
  }

  return {
    ok: true,
    context: {
      provider: payload.provider,
      projectId: payload.projectId,
      userId: payload.userId,
      organizationId: payload.organizationId,
    },
  };
}
