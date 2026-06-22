import { createDatabaseClient } from '@vibecore/database';
import { KubectlWorkspaceK8sClient } from '@vibecore/k8s-client';
import { buildWorkspaceManagerApp } from './app.js';
import { JsonWorkspaceStore, StructuredLogEventBus, WorkspaceManager, type WorkspaceStore } from './manager.js';
import { PrismaWorkspaceStore } from './prisma-store.js';
import { FilesystemSnapshotStore, type WorkspaceSnapshotStore } from './snapshot-store.js';

if (!process.env.WORKSPACE_AGENT_TOKEN_SECRET) {
  throw new Error('WORKSPACE_AGENT_TOKEN_SECRET is required');
}

// Prod: Postgres-backed store (shared across replicas, survives restarts).
// Dev/test: file-backed JSON store under .vibecore/workspace-manager/ — keeps
// `pnpm dev` working without standing up a database. The opt-out switch
// (WORKSPACE_MANAGER_STORE=json) is here for local debugging only — in prod
// the absence of DATABASE_URL would mean the api was already broken upstream.
function resolveStore(): WorkspaceStore {
  const explicit = (process.env.WORKSPACE_MANAGER_STORE ?? '').toLowerCase();

  if (explicit === 'json') {
    console.log(JSON.stringify({ level: 'info', service: 'workspace-manager', event: 'store.selected', kind: 'json', reason: 'WORKSPACE_MANAGER_STORE=json' }));
    return new JsonWorkspaceStore();
  }

  if (process.env.DATABASE_URL) {
    console.log(JSON.stringify({ level: 'info', service: 'workspace-manager', event: 'store.selected', kind: 'prisma' }));
    return new PrismaWorkspaceStore(createDatabaseClient());
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required to start workspace-manager in production (PrismaWorkspaceStore). Set WORKSPACE_MANAGER_STORE=json only for local debugging.');
  }

  console.log(JSON.stringify({ level: 'info', service: 'workspace-manager', event: 'store.selected', kind: 'json', reason: 'no DATABASE_URL outside production' }));
  return new JsonWorkspaceStore();
}

/*
 * Optional snapshot store (compute/storage decoupling — see
 * docs/replit-parity-isolation.md). Off unless configured, so the default stays
 * unchanged PVC-only behaviour. WORKSPACE_SNAPSHOT_DIR points at a (shared/RWX)
 * volume — the same-node/NFS path. A GCS-backed ObjectStorageSnapshotStore is a
 * drop-in here once a bucket + ObjectStorageClient adapter are provisioned.
 */
function resolveSnapshotStore(): WorkspaceSnapshotStore | undefined {
  const dir = process.env.WORKSPACE_SNAPSHOT_DIR?.trim();

  if (dir) {
    console.log(JSON.stringify({ level: 'info', service: 'workspace-manager', event: 'snapshot-store.selected', kind: 'filesystem', dir }));
    return new FilesystemSnapshotStore(dir);
  }

  return undefined;
}

const app = buildWorkspaceManagerApp(
  new WorkspaceManager(
    resolveStore(),
    new KubectlWorkspaceK8sClient(),
    new StructuredLogEventBus(),
    process.env.WORKSPACE_AGENT_TOKEN_SECRET,
    resolveSnapshotStore(),
  ),
);
const port = Number(process.env.WORKSPACE_MANAGER_PORT ?? 3010);

await app.listen({ host: '0.0.0.0', port });
