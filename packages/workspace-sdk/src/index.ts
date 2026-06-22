import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

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

/**
 * Derive a per-workspace agent-token signing key from the platform root secret.
 *
 * Previously a single global WORKSPACE_AGENT_TOKEN_SECRET was injected into every
 * workspace pod AND used to sign every workspace's tokens. A tenant who exfiltrated
 * that secret from their own pod could forge a valid agent token for ANY other
 * workspace — a cross-tenant break of the data-plane auth boundary.
 *
 * By keying the signature with HKDF(root, info=`workspace-agent-token:${id}`) the
 * manager injects only the *derived* key into each pod. A leaked per-workspace key
 * forges tokens for that one workspace; the root never leaves workspace-manager and
 * cannot be recovered from a derived key (HKDF is a one-way KDF). This mirrors the
 * per-Repl isolation boundary Replit enforces between tenant environments.
 */
export function deriveWorkspaceSecret(rootSecret: string, workspaceId: string) {
  // 32-byte HKDF-SHA256 output, returned base64url so it stays a plain env-safe string.
  const derived = hkdfSync('sha256', Buffer.from(rootSecret), Buffer.alloc(0), `workspace-agent-token:${workspaceId}`, 32);

  return Buffer.from(derived).toString('base64url');
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
