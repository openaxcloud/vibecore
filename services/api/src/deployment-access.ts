import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** The four access modes fixed by docs/parity/AUTH_ACCESS_CONTRACT.md. */
export const DEPLOYMENT_ACCESS_MODES = ['PUBLIC', 'PASSWORD_PROTECTED', 'WORKSPACE_ONLY', 'INVITE_ONLY'] as const;

export type DeploymentAccessMode = (typeof DEPLOYMENT_ACCESS_MODES)[number];

export interface DeploymentAccessPolicyRecord {
  id: string;
  projectId: string;
  environment: string;
  version: number;
  mode: DeploymentAccessMode;
  revision: string;

  /** Internal only. Never serialize this field from a public route. */
  passwordHash?: string;
  createdByUserId?: string;
  createdAt: string;
}

export type DeploymentAccessCookieKind = 'PASSWORD' | 'USER';

export interface DeploymentAccessCookieClaims {
  version: 1;
  kind: DeploymentAccessCookieKind;
  deploymentId: string;
  policyVersion: number;
  policyRevision: string;
  userId?: string;
  expiresAtMs: number;
}

export const PASSWORD_ACCESS_COOKIE_TTL_SECONDS = 12 * 60 * 60;
export const PRIVATE_ACCESS_COOKIE_TTL_SECONDS = 15 * 60;
export const ACCESS_EXCHANGE_TICKET_TTL_SECONDS = 90;

/**
 * Coordinated rollout interlock. Production must opt in explicitly after every
 * serving edge enforces the gate; local/test environments default on unless
 * they explicitly exercise the mixed-rollout refusal with `false`.
 */
export function deploymentAccessActivationEnabled(isProduction: boolean): boolean {
  if (
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED === '1' ||
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED === 'true'
  ) {
    return true;
  }

  return (
    !isProduction &&
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED !== '0' &&
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED !== 'false'
  );
}

const ACCESS_COOKIE_SECRET_LABEL = 'vibecore.deployment-access.cookie.v1';
const ACCESS_TICKET_HASH_LABEL = 'vibecore.deployment-access.ticket.v1';

/** Missing or unrecognised persisted state is always the most restrictive mode. */
export function normalizeDeploymentAccessMode(value: unknown): DeploymentAccessMode {
  return typeof value === 'string' && (DEPLOYMENT_ACCESS_MODES as readonly string[]).includes(value)
    ? (value as DeploymentAccessMode)
    : 'INVITE_ONLY';
}

/** One host-scoped proof cookie per deployment; never forward it to user workloads. */
export function deploymentAccessCookieName(deploymentId: string): string {
  return `vc_dep_${deploymentId}`;
}

/** Domain-separate access signing material from the platform secret it derives from. */
export function deriveDeploymentAccessCookieSecret(baseSecret: string): string {
  return createHmac('sha256', baseSecret).update(ACCESS_COOKIE_SECRET_LABEL).digest('base64url');
}

function signature(secret: string, encodedPayload: string): Buffer {
  return Buffer.from(createHmac('sha256', secret).update(encodedPayload).digest('base64url'));
}

export function signDeploymentAccessCookie(secret: string, claims: DeploymentAccessCookieClaims): string {
  const encodedPayload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${encodedPayload}.${signature(secret, encodedPayload).toString()}`;
}

/**
 * Verify signature, shape, expiry and the current immutable policy binding.
 * Policy version/revision rotation therefore invalidates every older proof.
 */
export function verifyDeploymentAccessCookie(
  secrets: readonly string[],
  token: string | undefined,
  expected: { deploymentId: string; policyVersion: number; policyRevision: string },
  nowMs: number = Date.now(),
): DeploymentAccessCookieClaims | undefined {
  if (!token || token.length > 4096) {
    return undefined;
  }

  const dot = token.indexOf('.');

  if (dot <= 0 || dot !== token.lastIndexOf('.') || dot === token.length - 1) {
    return undefined;
  }

  const encodedPayload = token.slice(0, dot);
  const supplied = Buffer.from(token.slice(dot + 1));

  let signatureValid = false;

  for (const secret of secrets) {
    const expectedSignature = signature(secret, encodedPayload);

    if (supplied.length === expectedSignature.length && timingSafeEqual(supplied, expectedSignature)) {
      signatureValid = true;
    }
  }

  if (!signatureValid) {
    return undefined;
  }

  let claims: unknown;

  try {
    claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }

  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    return undefined;
  }

  const candidate = claims as Partial<DeploymentAccessCookieClaims>;

  if (
    candidate.version !== 1 ||
    (candidate.kind !== 'PASSWORD' && candidate.kind !== 'USER') ||
    candidate.deploymentId !== expected.deploymentId ||
    candidate.policyVersion !== expected.policyVersion ||
    candidate.policyRevision !== expected.policyRevision ||
    typeof candidate.expiresAtMs !== 'number' ||
    !Number.isSafeInteger(candidate.expiresAtMs) ||
    candidate.expiresAtMs <= nowMs ||
    (candidate.kind === 'USER' && (!candidate.userId || typeof candidate.userId !== 'string')) ||
    (candidate.kind === 'PASSWORD' && candidate.userId !== undefined)
  ) {
    return undefined;
  }

  return candidate as DeploymentAccessCookieClaims;
}

/** Tickets are stored only as a domain-separated digest; raw capabilities never hit the DB. */
export function hashDeploymentAccessTicket(rawTicket: string): string {
  return createHash('sha256').update(`${ACCESS_TICKET_HASH_LABEL}\0${rawTicket}`).digest('hex');
}

export function publicDeploymentAccessPolicy(policy: DeploymentAccessPolicyRecord) {
  return {
    mode: policy.mode,
    version: policy.version,
    revision: policy.revision,
    createdAt: policy.createdAt,
  };
}
