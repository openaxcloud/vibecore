import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Claims carried by a workspace's object-storage access token. Minted by the
 * API at workspace start, injected as `OBJECT_STORAGE_ACCESS_TOKEN`, and
 * verified by the API on every `/projects/:projectId/object-storage/*` call so a
 * generated app can only reach ITS OWN project bucket.
 */
export interface ObjectStorageAccessTokenPayload {
  projectId: string;
  /** Tenant authority at issuance; a project transfer permanently invalidates the token. */
  organizationId: string;
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
  reason?: 'missing' | 'malformed' | 'invalid_signature' | 'expired' | 'project_mismatch' | 'organization_mismatch';
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
export function verifyObjectStorageAccessToken(input: {
  token: string | undefined;
  secret: string;
  expectedProjectId?: string;
  expectedOrganizationId?: string;
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

  if (
    typeof parsed.projectId !== 'string' ||
    !parsed.projectId ||
    typeof parsed.organizationId !== 'string' ||
    !parsed.organizationId ||
    !Number.isFinite(parsed.expiresAt)
  ) {
    return { ok: false, reason: 'malformed' };
  }

  if (parsed.expiresAt <= (input.now ?? Date.now())) {
    return { ok: false, reason: 'expired' };
  }

  if (input.expectedProjectId && parsed.projectId !== input.expectedProjectId) {
    return { ok: false, reason: 'project_mismatch' };
  }

  if (input.expectedOrganizationId && parsed.organizationId !== input.expectedOrganizationId) {
    return { ok: false, reason: 'organization_mismatch' };
  }

  return { ok: true, payload: parsed };
}
