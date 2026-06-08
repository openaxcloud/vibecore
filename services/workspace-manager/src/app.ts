import Fastify from 'fastify';
import { z } from 'zod';
import { WorkspaceManager } from './manager.js';

const startSchema = z.object({
  namespace: z.string().default('workspaces'),
  orgId: z.string(),
  projectId: z.string(),
  workspaceId: z.string(),
  image: z.string().default('vibecore/workspace-agent:2026.04.0'),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
  storageClassName: z.string().min(1).optional(),
  env: z.record(z.string()).default({}),
  allowedSecretKeys: z.array(z.string()).default([]),
  allowedSecrets: z.record(z.string()).optional(),
  resourceLimits: z
    .object({
      cpuMillicores: z.number().int().positive().optional(),
      ramMb: z.number().int().positive().optional(),
      storageGb: z.number().int().positive().optional(),
    })
    .optional(),
});

function runtimeNamespace() {
  return process.env.WORKSPACE_RUNTIME_NAMESPACE ?? 'workspaces';
}

function agentBaseUrl(workspaceId: string) {
  const template = process.env.WORKSPACE_AGENT_URL_TEMPLATE ?? process.env.WORKSPACE_AGENT_BASE_URL;

  if (template) {
    return template
      .replaceAll('{workspaceId}', workspaceId)
      .replaceAll('{namespace}', runtimeNamespace())
      .replace(/\/+$/, '');
  }

  return `http://workspace-${workspaceId}.${runtimeNamespace()}.svc.cluster.local:8080`;
}

function requirePreviewProxyAuth(request: { headers: Record<string, string | string[] | undefined> }) {
  const expected = normalizeSharedSecret(process.env.PREVIEW_PROXY_SHARED_SECRET);

  if (!expected) {
    throw Object.assign(new Error('Preview proxy shared secret is not configured'), {
      statusCode: 503,
      code: 'PREVIEW_PROXY_NOT_CONFIGURED',
    });
  }

  const authorization = request.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = normalizeSharedSecret(value?.replace(/^Bearer\s+/i, ''));

  if (token !== expected) {
    throw Object.assign(new Error('Unauthorized preview proxy request'), {
      statusCode: 401,
      code: 'PREVIEW_PROXY_UNAUTHORIZED',
    });
  }
}

function normalizeSharedSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

/**
 * Control-plane auth for the manager's mutating/sensitive routes. The manager can mint
 * agent tokens (cross-tenant workspace access), start/stop/delete arbitrary workspaces
 * and trigger GC — so when a shared secret is configured every non-health route must
 * present it as a bearer. The secret is `WORKSPACE_MANAGER_SHARED_SECRET`, falling back
 * to `PREVIEW_PROXY_SHARED_SECRET` (already wired between api↔manager) so existing
 * deployments are protected the moment either is set. In production an unset secret is a
 * hard misconfiguration and is rejected (fail-closed); outside production it is allowed
 * so local/dev and tests keep working without a secret.
 */
function controlPlaneSecret(): string | undefined {
  return (
    normalizeSharedSecret(process.env.WORKSPACE_MANAGER_SHARED_SECRET) ??
    normalizeSharedSecret(process.env.PREVIEW_PROXY_SHARED_SECRET)
  );
}

export function buildWorkspaceManagerApp(manager: WorkspaceManager) {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/health?')) {
      return;
    }

    /*
     * The internal preview-proxy agent endpoint enforces its own auth via
     * requirePreviewProxyAuth (PREVIEW_PROXY_SHARED_SECRET). The global hook
     * authenticates against WORKSPACE_MANAGER_SHARED_SECRET (with a fallback to
     * the preview secret), so once an operator sets a distinct manager secret
     * the global check would 401 preview-proxy before its own auth runs and
     * break every preview. Skip the global hook here and let the route's
     * dedicated check gate it.
     */
    if (request.url.startsWith('/internal/')) {
      return;
    }

    const expected = controlPlaneSecret();

    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        return reply
          .code(503)
          .send({ error: 'Workspace manager shared secret is not configured', code: 'WORKSPACE_MANAGER_NOT_CONFIGURED' });
      }

      return; // dev/test convenience only
    }

    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = normalizeSharedSecret(value?.replace(/^Bearer\s+/i, ''));

    if (token !== expected) {
      return reply.code(401).send({ error: 'Unauthorized workspace manager request', code: 'WORKSPACE_MANAGER_UNAUTHORIZED' });
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.post('/workspaces/start', async (request) => manager.startWorkspace(startSchema.parse(request.body)));
  app.get('/workspaces/:workspaceId', async (request) => manager.store.get((request.params as any).workspaceId));
  app.get('/workspaces/:workspaceId/agent-token', async (request) => {
    const workspaceId = (request.params as any).workspaceId;
    /*
     * Minting a token means the api is about to act on the workspace for a user
     * — and the IDE's file/port watch pollers mint one every few seconds for the
     * whole session — so treat it as activity. Without this the inactivity GC
     * reaps live workspaces (blank preview until reload). Fire-and-forget and
     * throttled so it never adds latency to the token mint.
     */
    void manager.touch(workspaceId).catch(() => undefined);
    return { token: manager.issueAgentToken(workspaceId) };
  });
  // Explicit activity heartbeat for callers that keep a workspace open without
  // minting tokens; same throttled bump as the agent-token side effect.
  app.post('/workspaces/:workspaceId/touch', async (request) => {
    const touched = await manager.touch((request.params as any).workspaceId);
    return { ok: true, lastActiveAt: touched?.lastActiveAt };
  });
  app.get('/workspaces/:workspaceId/logs', async (request) => {
    const logs = [];
    for await (const line of await manager.streamLogs(runtimeNamespace(), (request.params as any).workspaceId)) {
      logs.push(line);
    }
    return { logs };
  });
  app.post('/workspaces/:workspaceId/stop', async (request) => manager.stopWorkspace(runtimeNamespace(), (request.params as any).workspaceId));
  app.post('/workspaces/:workspaceId/restart', async (request) => manager.restartWorkspace({ ...startSchema.parse(request.body), workspaceId: (request.params as any).workspaceId }));
  app.delete('/workspaces/:workspaceId', async (request) => manager.deleteWorkspace(runtimeNamespace(), (request.params as any).workspaceId));
  app.post('/workspaces/gc', async (request) => {
    const body = z.object({ namespace: z.string().default('workspaces'), inactiveMs: z.number().default(30 * 60_000), deleteMs: z.number().default(24 * 60 * 60_000) }).parse(request.body ?? {});
    await manager.garbageCollect(body.namespace, body.inactiveMs, body.deleteMs);
    return { ok: true };
  });
  app.get('/internal/workspaces/:workspaceId/agent', async (request, reply) => {
    requirePreviewProxyAuth(request as any);

    const workspaceId = (request.params as any).workspaceId as string;
    const workspace = await manager.store.get(workspaceId);

    /*
     * A STOPPED workspace has had its Pod garbage-collected while the row
     * remains; returning a baseUrl pointed preview-proxy at a Service with no
     * ready endpoints, producing an endless ENOTFOUND/connection-refused 502
     * loop instead of a clean 404. 404 signals "agent not running" so the
     * reopen flow re-provisions via POST /workspaces/start. (STARTING/PENDING
     * are left served — the pod is legitimately coming up and a brief retry is
     * expected; only DELETED/FAILED/STOPPED have no agent to reach.)
     */
    if (
      !workspace ||
      workspace.status === 'DELETED' ||
      workspace.status === 'FAILED' ||
      workspace.status === 'STOPPED'
    ) {
      return reply.code(404).send({ error: 'Workspace agent not found', code: 'WORKSPACE_AGENT_NOT_FOUND' });
    }

    /*
     * The standalone preview-proxy resolves the agent through this route on
     * every host-based preview request. A user actively testing their running
     * app via the preview URL (no IDE tab open to run the watch pollers) would
     * otherwise generate zero activity, so the inactivity GC stops the pod
     * mid-use. Treat a successful agent resolve as activity — throttled and
     * fire-and-forget so it never adds latency to the preview hot path.
     */
    void manager.touch(workspaceId).catch(() => undefined);

    return {
      baseUrl: agentBaseUrl(workspaceId),
      token: manager.issueAgentToken(workspaceId, 5 * 60_000),
    };
  });

  return app;
}
