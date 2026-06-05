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

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const valid = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

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
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Workspace agent request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
