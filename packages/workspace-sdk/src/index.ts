import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WorkspaceEvent {
  type: string;
  workspaceId: string;
  projectId?: string;
  orgId?: string;
  message?: string;
  createdAt: string;
}

export interface WorkspaceFileNode {
  path: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
  updatedAt?: string;
}

export interface WorkspacePort {
  port: number;
  protocol: 'http' | 'https' | 'tcp';
  url?: string;
}

/*
 * Agent-token signing schemes.
 *
 * 'root'       — LEGACY. The manager wrote its own global WORKSPACE_AGENT_TOKEN_SECRET
 *                verbatim into every workspace's Kubernetes Secret, which is mounted
 *                into the tenant pod. Any tenant able to read that value (a leaked
 *                /proc entry, a memory dump, a log) could forge a valid agent token
 *                for ANY OTHER workspace — one leak, full cross-tenant filesystem and
 *                command takeover.
 * 'derived-v1' — Each workspace pod receives only HMAC(rootSecret, workspaceId). The
 *                root secret never leaves the manager. A leaked per-workspace secret
 *                forges tokens for that workspace ALONE, and cannot be inverted to
 *                recover the root.
 *
 * The scheme is recorded per workspace because a pod's mounted Secret is fixed at
 * pod-creation time: a workspace whose pod predates 'derived-v1' still holds the root
 * secret and must keep being signed with it until its pod is recreated. Signing a
 * live pod with the wrong secret is not a soft failure — the agent 401s, and the
 * client's one-shot token self-heal re-mints the SAME wrong secret, so the workspace
 * wedges instead of recovering.
 */
export const AGENT_TOKEN_SCHEME_ROOT = 'root';
export const AGENT_TOKEN_SCHEME_DERIVED_V1 = 'derived-v1';

export type AgentTokenScheme = typeof AGENT_TOKEN_SCHEME_ROOT | typeof AGENT_TOKEN_SCHEME_DERIVED_V1;

/*
 * Domain-separated so this HMAC can never collide with the token signature HMAC
 * (which is keyed by the derived secret over a base64url payload). Without the
 * label, a caller who can choose a `payload` equal to a workspaceId would get a
 * signature that doubles as another workspace's secret.
 */
const AGENT_SECRET_DERIVATION_LABEL = 'vibecore/workspace-agent-token/v1';

/**
 * Derive the per-workspace agent signing secret from the manager's root secret.
 *
 * Deterministic: the manager can re-derive it at any time without storing it,
 * so the only durable copy is the one inside that workspace's own pod Secret.
 */
export function deriveWorkspaceAgentSecret(rootSecret: string, workspaceId: string): string {
  if (!rootSecret) {
    throw new Error('deriveWorkspaceAgentSecret requires a non-empty root secret');
  }

  if (!workspaceId) {
    throw new Error('deriveWorkspaceAgentSecret requires a non-empty workspaceId');
  }

  return createHmac('sha256', rootSecret).update(`${AGENT_SECRET_DERIVATION_LABEL}:${workspaceId}`).digest('hex');
}

/**
 * The secret that must be used to sign/verify tokens for a workspace, given the
 * scheme its running pod was created with. Anything other than the known
 * 'derived-v1' marker is treated as legacy 'root' — an unknown value must not
 * silently select the stronger scheme and wedge a live pod.
 */
export function agentSecretForScheme(
  rootSecret: string,
  workspaceId: string,
  scheme: string | null | undefined,
): string {
  return scheme === AGENT_TOKEN_SCHEME_DERIVED_V1 ? deriveWorkspaceAgentSecret(rootSecret, workspaceId) : rootSecret;
}

export function signAgentToken(input: { workspaceId: string; expiresAt: number; secret: string }) {
  const payload = Buffer.from(JSON.stringify({ workspaceId: input.workspaceId, expiresAt: input.expiresAt })).toString('base64url');
  const signature = createHmac('sha256', input.secret).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

export function verifyAgentToken(token: string | undefined, secret: string, workspaceId?: string) {
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split('.');

  if (!payload || !signature) {
    return false;
  }

  /*
   * Compare the raw HMAC digest bytes against the decoded signature bytes. The
   * previous string-length pre-check let an attacker-supplied multibyte signature
   * of equal string length but unequal byte length reach timingSafeEqual, which
   * throws on length mismatch — and that throw was uncaught, crashing the caller.
   */
  const expectedBuf = createHmac('sha256', secret).update(payload).digest();
  const signatureBuf = Buffer.from(signature, 'base64url');
  const valid = expectedBuf.length === signatureBuf.length && timingSafeEqual(expectedBuf, signatureBuf);

  if (!valid) {
    return false;
  }

  let parsed: { workspaceId: string; expiresAt: number };

  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { workspaceId: string; expiresAt: number };
  } catch {
    // A malformed payload must fail closed, not throw.
    return false;
  }

  return parsed.expiresAt > Date.now() && (!workspaceId || parsed.workspaceId === workspaceId);
}

export class WorkspaceAgentClient {
  constructor(
    readonly baseUrl: string,
    readonly token: string,
  ) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      // Bound the request so a hung agent can't leak the connection forever.
      signal: AbortSignal.timeout(30_000),
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      // Drain the body so the socket is released instead of leaking until GC.
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Workspace agent request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
