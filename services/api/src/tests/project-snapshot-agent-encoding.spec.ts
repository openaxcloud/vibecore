import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { hashPassword } from '@vibecore/auth';
import type { WorkspaceK8sClient } from '@vibecore/k8s-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- These services run in Node, outside the web-only ~/ alias.
import { buildWorkspaceAgentApp } from '../../../workspace-agent/src/app.js';
// eslint-disable-next-line no-restricted-imports -- These services run in Node, outside the web-only ~/ alias.
import { buildWorkspaceManagerApp } from '../../../workspace-manager/src/app.js';
// eslint-disable-next-line no-restricted-imports -- These services run in Node, outside the web-only ~/ alias.
import { JsonWorkspaceStore, WorkspaceManager } from '../../../workspace-manager/src/manager.js';
// eslint-disable-next-line no-restricted-imports -- Node API tests cannot resolve the web-only ~/ alias.
import { buildApiApp } from '../app.js';
// eslint-disable-next-line no-restricted-imports -- Node API tests cannot resolve the web-only ~/ alias.
import { LocalProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Three real HTTP servers: API, manager token issuer and workspace agent. The
 * archive/API tree and the agent tree are separate disposable disk directories.
 * API auth/metadata use TestApiStore; manager metadata use JsonWorkspaceStore.
 * No Kubernetes/PG/PVC recovery is claimed. Every K8s or event call throws; no
 * fake successful restore or file-write response can satisfy these assertions.
 */
describe('project snapshot restore preserves encoding through API to agent', () => {
  const projectStorage = new LocalProjectStorage();
  const tokenSecret = 'snapshot-encoding-local-test-only';
  const receivedWrites: Array<{ path: string; encoding?: string }> = [];

  let root: string;
  let store: TestApiStore;
  let storageRoot: string;
  let agentRoot: string;
  let projectId: string;
  let baseUrl: string;
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let agent: ReturnType<typeof buildWorkspaceAgentApp>;
  let managerApp: ReturnType<typeof buildWorkspaceManagerApp>;
  let forbiddenCalls = 0;

  const forbidInfrastructureCall = (): never => {
    forbiddenCalls += 1;
    throw new Error('This disk/HTTP test must not perform infrastructure or event operations');
  };
  const k8s: WorkspaceK8sClient = {
    apply: forbidInfrastructureCall,
    delete: forbidInfrastructureCall,
    get: forbidInfrastructureCall,
    getPod: forbidInfrastructureCall,
    streamPodLogs: forbidInfrastructureCall,
    scale: forbidInfrastructureCall,
    annotate: forbidInfrastructureCall,
    listByLabel: forbidInfrastructureCall,
  };
  const post = (path: string, body: unknown = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer snapshot-encoding-session-fixture',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    store = new TestApiStore();
    forbiddenCalls = 0;
    receivedWrites.length = 0;
    root = await mkdtemp(join(tmpdir(), 'vibecore-snapshot-agent-encoding-'));
    storageRoot = join(root, 'api-storage');
    agentRoot = join(root, 'agent-workspace');
    await mkdir(agentRoot);
    vi.stubEnv('PROJECT_STORAGE_DIR', storageRoot);
    vi.stubEnv('WORKSPACE_MANAGER_SHARED_SECRET', 'snapshot-manager-local-fixture');
    vi.stubEnv('SANDBOX_RUNTIME', 'gvisor-pod');
    vi.stubEnv('DB_ROLLBACK_ENABLED', 'false');
    vi.stubEnv('WORKSPACE_ADMISSION_V2_QUOTA_ENABLED', 'false');
    vi.stubEnv('WORKSPACE_ADMISSION_V2_ENABLED', 'false');

    const owner = await store.createUser({
      email: 'snapshot-encoding@example.test',
      name: 'Snapshot encoding fixture',
      passwordHash: hashPassword('local-fixture-password'),
    });
    const organization = await store.createOrganization({
      name: 'Snapshot encoding fixture',
      slug: 'snapshot-encoding-fixture',
      ownerUserId: owner.id,
    });
    await store.createSession({
      userId: owner.id,
      token: 'snapshot-encoding-session-fixture',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await store.upsertSubscription({ organizationId: organization.id, planKey: 'team', status: 'ACTIVE' });
    projectId = (await store.createProject({ organizationId: organization.id, name: 'Project', slug: 'project' })).id;

    const workspaceId = (
      await store.createWorkspace({ projectId, name: 'Workspace', runtimeMode: 'remote-kubernetes' })
    ).id;

    const managerStore = new JsonWorkspaceStore(join(root, 'manager', 'workspaces.json'));
    await managerStore.create({
      id: workspaceId,
      orgId: organization.id,
      projectId,
      plan: 'team',
      status: 'RUNNING',
      pvcName: 'fixture-only-no-pvc',
      podName: 'fixture-only-no-pod',
      serviceName: 'fixture-only-no-service',
      agentTokenSecretName: 'fixture-only-no-k8s-secret',
    });
    managerApp = buildWorkspaceManagerApp(
      new WorkspaceManager(managerStore, k8s, { publish: forbidInfrastructureCall }, tokenSecret),
    );
    vi.stubEnv('WORKSPACE_MANAGER_URL', await managerApp.listen({ host: '127.0.0.1', port: 0 }));

    agent = buildWorkspaceAgentApp({ workspaceId, workspaceRoot: agentRoot, tokenSecret });
    agent.addHook('preHandler', async (request) => {
      if (request.method === 'POST' && request.url === '/files/write') {
        const body = request.body as { path: string; encoding?: string };
        receivedWrites.push({ path: body.path, encoding: body.encoding });
      }
    });
    vi.stubEnv('WORKSPACE_AGENT_URL_TEMPLATE', await agent.listen({ host: '127.0.0.1', port: 0 }));
    app = await buildApiApp({ store, projectStorage });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  afterEach(async () => {
    await app?.close();
    await agent?.close();
    await managerApp?.close();
    await rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it.each([
    {
      path: 'assets/icon.png',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0xff, 0x80]),
      encoding: 'base64' as const,
    },
    { path: 'README.md', bytes: Buffer.from('Restauration réelle — café 🌍\n', 'utf8'), encoding: 'utf8' as const },
  ])('restores the original $encoding bytes in API storage AND the real agent workspace', async (file) => {
    await projectStorage.writeFiles(projectId, [
      { path: file.path, content: file.bytes.toString(file.encoding), encoding: file.encoding },
    ]);

    const created = await post(`/projects/${projectId}/snapshots`, { label: `Real disk ${file.encoding}` });
    expect(created.status).toBe(201);

    const snapshot = ((await created.json()) as { snapshot: { id: string; storageKey: string } }).snapshot;
    expect(await store.getProjectStorageObject(snapshot.storageKey)).toBeDefined();
    await projectStorage.writeFiles(projectId, [{ path: file.path, content: 'changed in API storage' }]);
    await mkdir(dirname(join(agentRoot, file.path)), { recursive: true });
    await writeFile(join(agentRoot, file.path), 'changed independently in workspace');
    receivedWrites.length = 0;

    const restored = await post(`/projects/${projectId}/snapshots/${snapshot.id}/restore`);

    expect(restored.status).toBe(200);
    expect(await readFile(join(storageRoot, projectId, file.path))).toEqual(file.bytes);
    expect(await readFile(join(agentRoot, file.path))).toEqual(file.bytes);
    expect(receivedWrites.filter((write) => write.path === file.path)).toHaveLength(1);

    if (file.encoding === 'base64') {
      expect(receivedWrites).toContainEqual({ path: file.path, encoding: 'base64' });
    }

    expect(forbiddenCalls).toBe(0);
  });
});
