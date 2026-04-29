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
});

export function buildWorkspaceManagerApp(manager: WorkspaceManager) {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));
  app.post('/workspaces/start', async (request) => manager.startWorkspace(startSchema.parse(request.body)));
  app.get('/workspaces/:workspaceId', async (request) => manager.store.get((request.params as any).workspaceId));
  app.get('/workspaces/:workspaceId/agent-token', async (request) => ({ token: manager.issueAgentToken((request.params as any).workspaceId) }));
  app.get('/workspaces/:workspaceId/logs', async (request) => {
    const logs = [];
    for await (const line of await manager.streamLogs('workspaces', (request.params as any).workspaceId)) {
      logs.push(line);
    }
    return { logs };
  });
  app.post('/workspaces/:workspaceId/stop', async (request) => manager.stopWorkspace('workspaces', (request.params as any).workspaceId));
  app.post('/workspaces/:workspaceId/restart', async (request) => manager.restartWorkspace({ ...startSchema.parse(request.body), workspaceId: (request.params as any).workspaceId }));
  app.delete('/workspaces/:workspaceId', async (request) => manager.deleteWorkspace('workspaces', (request.params as any).workspaceId));
  app.post('/workspaces/gc', async (request) => {
    const body = z.object({ namespace: z.string().default('workspaces'), inactiveMs: z.number().default(30 * 60_000), deleteMs: z.number().default(24 * 60 * 60_000) }).parse(request.body ?? {});
    await manager.garbageCollect(body.namespace, body.inactiveMs, body.deleteMs);
    return { ok: true };
  });

  return app;
}
