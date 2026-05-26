import { signAgentToken, type WorkspaceEvent } from '@vibecore/workspace-sdk';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  workspaceAgentSecret,
  workspacePod,
  workspacePvc,
  workspaceService,
  type WorkspaceK8sClient,
  type WorkspacePlan,
} from '@vibecore/k8s-client';

export type WorkspaceStatus = 'STARTING' | 'RUNNING' | 'STOPPED' | 'FAILED' | 'DELETED';

export interface WorkspaceRecord {
  id: string;
  orgId: string;
  projectId: string;
  plan: WorkspacePlan;
  status: WorkspaceStatus;
  pvcName: string;
  podName: string;
  serviceName: string;
  agentTokenSecretName: string;
  createdAt: string;
  lastActiveAt: string;
  error?: string;
}

export interface WorkspaceStore {
  create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>): Promise<WorkspaceRecord>;
  update(workspaceId: string, patch: Partial<WorkspaceRecord>): Promise<WorkspaceRecord>;
  get(workspaceId: string): Promise<WorkspaceRecord | undefined>;
  list(): Promise<WorkspaceRecord[]>;
}

export interface EventBus {
  publish(event: WorkspaceEvent): Promise<void>;
}

export class JsonWorkspaceStore implements WorkspaceStore {
  constructor(readonly filePath = process.env.WORKSPACE_MANAGER_STORE_PATH ?? '.vibecore/workspace-manager/workspaces.json') {}

  async create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>) {
    const now = new Date().toISOString();
    const record = { ...input, createdAt: now, lastActiveAt: now };
    const workspaces = await this.read();
    workspaces.set(record.id, record);
    await this.write(workspaces);
    return record;
  }

  async update(workspaceId: string, patch: Partial<WorkspaceRecord>) {
    const workspaces = await this.read();
    const existing = workspaces.get(workspaceId);
    if (!existing) {
      throw new Error('Workspace not found');
    }
    const updated = { ...existing, ...patch };
    workspaces.set(workspaceId, updated);
    await this.write(workspaces);
    return updated;
  }

  async get(workspaceId: string) {
    return (await this.read()).get(workspaceId);
  }

  async list() {
    return [...(await this.read()).values()];
  }

  private async read() {
    const content = await readFile(this.filePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return '[]';
      }

      throw error;
    });

    return new Map<string, WorkspaceRecord>((JSON.parse(content) as WorkspaceRecord[]).map((workspace) => [workspace.id, workspace]));
  }

  private async write(workspaces: Map<string, WorkspaceRecord>) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify([...workspaces.values()], null, 2));
  }
}

export class StructuredLogEventBus implements EventBus {
  async publish(event: WorkspaceEvent) {
    console.log(JSON.stringify({ level: 'info', service: 'workspace-manager', event }));
  }
}

export interface StartWorkspaceInput {
  namespace: string;
  orgId: string;
  projectId: string;
  workspaceId: string;
  image: string;
  plan: WorkspacePlan;
  env: Record<string, string>;
  allowedSecretKeys: string[];
  allowedSecrets?: Record<string, string>;
  resourceLimits?: {
    cpuMillicores?: number;
    ramMb?: number;
    storageGb?: number;
  };
  storageClassName?: string;
}

export class WorkspaceManager {
  constructor(
    readonly store: WorkspaceStore,
    readonly k8s: WorkspaceK8sClient,
    readonly events: EventBus,
    readonly tokenSecret: string,
  ) {}

  async startWorkspace(input: StartWorkspaceInput) {
    const pvcName = `pvc-${input.workspaceId}`;
    const agentTokenSecretName = `agent-token-${input.workspaceId}`;
    const allowedSecrets = input.allowedSecrets ?? {};
    const secretEnv = Object.fromEntries([...new Set([...input.allowedSecretKeys, ...Object.keys(allowedSecrets)])].map((key) => [key, key]));
    const runtimeInput = {
      ...input,
      pvcName,
      agentTokenSecretName,
      storageClassName: input.storageClassName ?? process.env.WORKSPACE_STORAGE_CLASS,
      tokenSecret: this.tokenSecret,
      secretEnv,
      env: { ...input.env, WORKSPACE_ID: input.workspaceId },
    };
    const record = await this.store.create({
      id: input.workspaceId,
      orgId: input.orgId,
      projectId: input.projectId,
      plan: input.plan,
      status: 'STARTING',
      pvcName,
      podName: `workspace-${input.workspaceId}`,
      serviceName: `workspace-${input.workspaceId}`,
      agentTokenSecretName,
    });

    try {
      await this.k8s.apply(workspacePvc(runtimeInput));
      await this.k8s.apply({ ...workspaceAgentSecret(runtimeInput), stringData: { tokenSecret: this.tokenSecret, ...allowedSecrets } });
      await this.k8s.apply(workspacePod(runtimeInput));
      await this.k8s.apply(workspaceService(runtimeInput));
      await this.waitForReadiness(input.namespace, record.podName);
      const running = await this.store.update(input.workspaceId, { status: 'RUNNING', lastActiveAt: new Date().toISOString() });
      await this.publish(running, 'workspace.running');
      return running;
    } catch (error) {
      const failed = await this.store.update(input.workspaceId, { status: 'FAILED', error: error instanceof Error ? error.message : 'Kubernetes error' });
      await this.publish(failed, 'workspace.failed');
      return failed;
    }
  }

  async stopWorkspace(namespace: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.k8s.delete('Pod', namespace, workspace.podName);
    const stopped = await this.store.update(workspaceId, { status: 'STOPPED' });
    await this.publish(stopped, 'workspace.stopped');
    return stopped;
  }

  async restartWorkspace(input: StartWorkspaceInput) {
    await this.stopWorkspace(input.namespace, input.workspaceId).catch(() => undefined);
    return this.startWorkspace(input);
  }

  async deleteWorkspace(namespace: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    await Promise.all([
      this.k8s.delete('Service', namespace, workspace.serviceName),
      this.k8s.delete('Pod', namespace, workspace.podName),
      this.k8s.delete('Secret', namespace, workspace.agentTokenSecretName ?? `agent-token-${workspaceId}`),
      this.k8s.delete('PersistentVolumeClaim', namespace, workspace.pvcName),
    ]);
    const deleted = await this.store.update(workspaceId, { status: 'DELETED' });
    await this.publish(deleted, 'workspace.deleted');
    return deleted;
  }

  async garbageCollect(namespace: string, inactiveMs: number, deleteMs: number) {
    const now = Date.now();
    for (const workspace of await this.store.list()) {
      const inactiveFor = now - new Date(workspace.lastActiveAt).getTime();
      if (workspace.status === 'RUNNING' && inactiveFor > inactiveMs) {
        await this.stopWorkspace(namespace, workspace.id);
      }
      if (workspace.status === 'STOPPED' && inactiveFor > deleteMs) {
        await this.deleteWorkspace(namespace, workspace.id);
      }
    }
  }

  async streamLogs(namespace: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    return this.k8s.streamPodLogs(namespace, workspace.podName);
  }

  issueAgentToken(workspaceId: string, expiresInMs = 60_000) {
    return signAgentToken({ workspaceId, expiresAt: Date.now() + expiresInMs, secret: this.tokenSecret });
  }

  private async waitForReadiness(namespace: string, podName: string) {
    const startedAt = Date.now();
    const timeoutMs = Number(process.env.WORKSPACE_READINESS_TIMEOUT_MS ?? 180_000);

    while (Date.now() - startedAt < timeoutMs) {
      const pod = await this.k8s.getPod(namespace, podName);

      if (pod && isPodReady(pod as unknown as { status?: { conditions?: Array<{ type?: string; status?: string }> } })) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    throw new Error(`Pod ${podName} was not ready before timeout`);
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await this.store.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    return workspace;
  }

  private async publish(workspace: WorkspaceRecord, type: string) {
    await this.events.publish({ type, workspaceId: workspace.id, orgId: workspace.orgId, projectId: workspace.projectId, createdAt: new Date().toISOString() });
  }
}

function isPodReady(pod: { status?: { conditions?: Array<{ type?: string; status?: string }> } }) {
  return pod.status?.conditions?.some((condition) => condition.type === 'Ready' && condition.status === 'True') === true;
}
