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
  const expected = process.env.PREVIEW_PROXY_SHARED_SECRET;

  if (!expected) {
    throw Object.assign(new Error('Preview proxy shared secret is not configured'), {
      statusCode: 503,
      code: 'PREVIEW_PROXY_NOT_CONFIGURED',
    });
  }

  const authorization = request.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = value?.replace(/^Bearer\s+/i, '');

  if (token !== expected) {
    throw Object.assign(new Error('Unauthorized preview proxy request'), {
      statusCode: 401,
      code: 'PREVIEW_PROXY_UNAUTHORIZED',
    });
  }
}

export function buildWorkspaceManagerApp(manager: WorkspaceManager) {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));
  app.post('/workspaces/start', async (request) => manager.startWorkspace(startSchema.parse(request.body)));
  app.get('/workspaces/:workspaceId', async (request) => manager.store.get((request.params as any).workspaceId));
  app.get('/workspaces/:workspaceId/agent-token', async (request) => ({ token: manager.issueAgentToken((request.params as any).workspaceId) }));
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

    if (!workspace || workspace.status === 'DELETED' || workspace.status === 'FAILED') {
      return reply.code(404).send({ error: 'Workspace agent not found', code: 'WORKSPACE_AGENT_NOT_FOUND' });
    }

    return {
      baseUrl: agentBaseUrl(workspaceId),
      token: manager.issueAgentToken(workspaceId, 5 * 60_000),
    };
  });

  return app;
}
