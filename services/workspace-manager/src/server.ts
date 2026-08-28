import { createDatabaseClient } from '@vibecore/database';
import { KubectlWorkspaceK8sClient } from '@vibecore/k8s-client';
import { resolveSandboxRuntime } from '@vibecore/sandbox-runtime';
import { buildWorkspaceManagerApp } from './app.js';
import { JsonWorkspaceStore, StructuredLogEventBus, WorkspaceManager, type WorkspaceStore } from './manager.js';
import { PrismaWorkspaceStore } from './prisma-store.js';
import {
  GcePersistentDiskProviderAdapter,
  InClusterProjectVolumeKubernetesAdapter,
  StaticProjectVolumeProviderResolver,
} from './project-volume-erasure-adapters.js';

if (!process.env.WORKSPACE_AGENT_TOKEN_SECRET) {
  throw new Error('WORKSPACE_AGENT_TOKEN_SECRET is required');
}

// Prod: Postgres-backed store (shared across replicas, survives restarts).
// Dev/test: file-backed JSON store under .vibecore/workspace-manager/ — keeps
// `pnpm dev` working without standing up a database. The opt-out switch
// (WORKSPACE_MANAGER_STORE=json) is here for local debugging only — in prod
// the absence of DATABASE_URL would mean the api was already broken upstream.
function resolveStore(volumeSettlement?: {
  kubernetes: InClusterProjectVolumeKubernetesAdapter;
  providers: StaticProjectVolumeProviderResolver;
}): WorkspaceStore {
  const explicit = (process.env.WORKSPACE_MANAGER_STORE ?? '').toLowerCase();

  if (explicit === 'json') {
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'workspace-manager',
        event: 'store.selected',
        kind: 'json',
        reason: 'WORKSPACE_MANAGER_STORE=json',
      }),
    );
    return new JsonWorkspaceStore();
  }

  if (process.env.DATABASE_URL) {
    console.log(
      JSON.stringify({ level: 'info', service: 'workspace-manager', event: 'store.selected', kind: 'prisma' }),
    );
    return new PrismaWorkspaceStore(createDatabaseClient(), volumeSettlement);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL is required to start workspace-manager in production (PrismaWorkspaceStore). Set WORKSPACE_MANAGER_STORE=json only for local debugging.',
    );
  }

  console.log(
    JSON.stringify({
      level: 'info',
      service: 'workspace-manager',
      event: 'store.selected',
      kind: 'json',
      reason: 'no DATABASE_URL outside production',
    }),
  );
  return new JsonWorkspaceStore();
}

const allowedGceProjects = (process.env.PROJECT_VOLUME_ERASURE_GCP_PROJECTS ?? '')
  .split(',')
  .map((project) => project.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === 'production' && allowedGceProjects.length === 0) {
  throw new Error('PROJECT_VOLUME_ERASURE_GCP_PROJECTS is required in production');
}
const k8s = new KubectlWorkspaceK8sClient();
const volumeErasure = process.env.KUBERNETES_SERVICE_HOST
  ? {
      // Kubernetes continuation tokens are consumed to exhaustion; a repeated
      // token fails closed instead of truncating inventories above 5,000 PVs.
      kubernetes: new InClusterProjectVolumeKubernetesAdapter({ timeoutMs: 4_000 }),
      providers: new StaticProjectVolumeProviderResolver(
        allowedGceProjects.length > 0
          ? [new GcePersistentDiskProviderAdapter({ allowedProjects: allowedGceProjects, timeoutMs: 4_000 })]
          : [],
      ),
    }
  : undefined;
if (process.env.NODE_ENV === 'production' && !volumeErasure) {
  throw new Error('In-cluster Kubernetes credentials are required for project volume erasure');
}
const app = buildWorkspaceManagerApp(
  new WorkspaceManager(
    resolveStore(volumeErasure),
    k8s,
    new StructuredLogEventBus(),
    process.env.WORKSPACE_AGENT_TOKEN_SECRET,
    resolveSandboxRuntime(k8s),
    volumeErasure,
  ),
);
// NaN-safe: `?? 3010` only covers an undefined env var, so a non-numeric
// WORKSPACE_MANAGER_PORT (config typo, or a shadowing k8s service-link value like
// `tcp://10.0.0.1:3010`) would make Number(...) NaN, which app.listen coerces to
// port 0 and binds an arbitrary ephemeral port — the Service targetPort 3010 then
// has no listener. Mirror the manager.ts timeout-parse convention.
const parsedPort = Number(process.env.WORKSPACE_MANAGER_PORT);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3010;

await app.listen({ host: '0.0.0.0', port });
