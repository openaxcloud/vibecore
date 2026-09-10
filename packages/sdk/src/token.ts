import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Claims carried by a workspace's object-storage access token. Minted by the
 * API at workspace start, injected as `OBJECT_STORAGE_ACCESS_TOKEN`, and
 * verified by the API on every `/projects/:projectId/object-storage/*` call so a
 * generated app can only reach ITS OWN project bucket.
 */
/**
 * AUDX-022 — what a token is allowed to do, not merely WHICH project it may
 * touch. Before this existed the API took a `permission` argument and then
 * ignored it on the token path, so a single token authorised read, write,
 * delete AND destroying the bucket. That token is injected into the workspace
 * pod, which runs user-authored code.
 */
export type ObjectStorageScope = 'read' | 'write' | 'delete' | 'admin';

/**
 * Scopes assumed for a token minted before the `scopes` claim existed.
 *
 * Deliberately read+write and NOT delete/admin: live workspaces keep working
 * across the deploy, while the destructive verbs — the ones the token should
 * never have carried — are withdrawn immediately. A legacy token is not a
 * reason to keep a hole open.
 */
export const LEGACY_OBJECT_STORAGE_SCOPES: readonly ObjectStorageScope[] = ['read', 'write'];

export interface ObjectStorageAccessTokenPayload {
  projectId: string;

  /**
   * Operations this token authorises. Absent on tokens minted before AUDX-022,
   * which fall back to LEGACY_OBJECT_STORAGE_SCOPES.
   */
  scopes?: ObjectStorageScope[];
  /** The user the workspace runs as (for audit); optional for service contexts. */
  userId?: string;
  /** The workspace the token was minted for (binding/audit). */
  workspaceId?: string;
  /** Unix epoch milliseconds after which the token is rejected. */
  expiresAt: number;
}

export interface VerifyObjectStorageAccessTokenResult {
  ok: boolean;
  payload?: ObjectStorageAccessTokenPayload;
  reason?: 'missing' | 'malformed' | 'invalid_signature' | 'expired' | 'project_mismatch' | 'insufficient_scope';
}

/**
 * Sign an object-storage access token. Identical HMAC scheme to
 * `@vibecore/connector-sdk` (`signConnectorAccessToken`): the base64url JSON
 * payload is HMAC-SHA256'd and appended as `payload.signature`.
 */
export function signObjectStorageAccessToken(input: {
  payload: ObjectStorageAccessTokenPayload;
  secret: string;
}): string {
  const payload = Buffer.from(JSON.stringify(input.payload)).toString('base64url');
  const signature = createHmac('sha256', input.secret).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

/**
 * Verify an object-storage access token: signature (timing-safe), expiry, and —
 * when `expectedProjectId` is given — that the token is scoped to that project.
 */
export function objectStorageTokenScopes(
  payload: Pick<ObjectStorageAccessTokenPayload, 'scopes'>,
): readonly ObjectStorageScope[] {
  return Array.isArray(payload.scopes) && payload.scopes.length > 0
    ? payload.scopes
    : LEGACY_OBJECT_STORAGE_SCOPES;
}

export function verifyObjectStorageAccessToken(input: {
  token: string | undefined;
  secret: string;
  expectedProjectId?: string;
  /** When given, the token must carry this scope or verification fails. */
  requiredScope?: ObjectStorageScope;
  now?: number;
}): VerifyObjectStorageAccessTokenResult {
  if (!input.token) {
    return { ok: false, reason: 'missing' };
  }

  const [payload, signature] = input.token.split('.');

  if (!payload || !signature) {
    return { ok: false, reason: 'malformed' };
  }

  const expectedBuf = createHmac('sha256', input.secret).update(payload).digest();
  const signatureBuf = Buffer.from(signature, 'base64url');

  if (expectedBuf.length !== signatureBuf.length || !timingSafeEqual(expectedBuf, signatureBuf)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let parsed: ObjectStorageAccessTokenPayload;

  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ObjectStorageAccessTokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (parsed.expiresAt <= (input.now ?? Date.now())) {
    return { ok: false, reason: 'expired' };
  }

  if (input.expectedProjectId && parsed.projectId !== input.expectedProjectId) {
    return { ok: false, reason: 'project_mismatch' };
  }

  if (input.requiredScope && !objectStorageTokenScopes(parsed).includes(input.requiredScope)) {
    return { ok: false, reason: 'insufficient_scope' };
  }

  return { ok: true, payload: parsed };
}
