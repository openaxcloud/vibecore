import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { GitCliProvider, LocalProjectStorage } from '../project-storage.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import type { RunStaticBuildResult } from '../deployments.js';
import { TestApiStore } from './test-api-store.js';

const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;

afterEach(() => {
  if (previousProjectStorageDir === undefined) {
    delete process.env.PROJECT_STORAGE_DIR;
  } else {
    process.env.PROJECT_STORAGE_DIR = previousProjectStorageDir;
  }
});

class TestEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

interface IsolationFixture {
  app: Awaited<ReturnType<typeof buildApiApp>>;
  store: TestApiStore;
  gitProvider: GitCliProvider;
  storage: string;
  projectId: string;
  workspaceA: { id: string; gitPath?: string };
  workspaceB: { id: string; gitPath?: string };
  token: string;
  staticBuildCalls: Array<{ projectId: string; workspaceId?: string; outputDir: string }>;
}

/**
 * Boots an isolated API instance with one project and two workspaces.
 * Workspace A is created via the public endpoint (consuming the free
 * plan's single-workspace quota). Workspace B is inserted directly on
 * the store to bypass the quota — the resolver and provider still treat
 * it as a real secondary workspace.
 */
async function bootstrapTwoWorkspaceProject(suiteLabel: string): Promise<IsolationFixture> {
  const parent = await mkdtemp(join(tmpdir(), `vibecore-workspace-iso-${suiteLabel}-`));
  const storage = join(parent, '.vibecore-project-storage');
  process.env.PROJECT_STORAGE_DIR = storage;

  const staticBuildCalls: IsolationFixture['staticBuildCalls'] = [];

  const store = new TestApiStore();
  const gitProvider = new GitCliProvider();
  const projectStorage = new LocalProjectStorage();
  const app = await buildApiApp({
    store,
    emailProvider: new TestEmailProvider(),
    projectStorage,
    gitProvider,
    /*
     * Stub out the real npm-install + build pipeline. We only care that
     * the deployment route forwards the correct workspaceId and that the
     * created DeploymentRecord is tagged with it; running an actual Vite
     * build inside a vitest worker would be slow and brittle.
     */
    staticBuildRunner: async (options): Promise<RunStaticBuildResult> => {
      const outputDir = await mkdtemp(join(tmpdir(), 'vibecore-iso-static-out-'));
      await writeFile(join(outputDir, 'index.html'), '<!doctype html><title>iso</title>');
      staticBuildCalls.push({
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        outputDir,
      });

      return {
        ok: true,
        outputDir,
        logs: [{ timestamp: new Date().toISOString(), level: 'info', message: 'stubbed build' }],
      };
    },
  });

  const registered = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `workspace-iso-${suiteLabel}@example.com`,
      password: 'password123',
      name: 'Workspace Isolation Owner',
      organizationName: 'Workspace Isolation Org',
    },
  });
  expect(registered.statusCode).toBe(201);
  const auth = registered.json() as { token: string; organization: { id: string } };

  const created = await app.inject({
    method: 'POST',
    url: `/orgs/${auth.organization.id}/projects`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: `Two-workspace ${suiteLabel}` },
  });
  expect(created.statusCode).toBe(201);
  const projectId = created.json().project.id as string;

  /*
   * Upgrade the org to a paid plan so the deployments test can call POST
   * /projects/:id/deployments without hitting the free plan's 0-deploy
   * quota. The team plan also raises workspaces.active so the test does
   * not bump into that ceiling either.
   */
  await store.upsertSubscription({
    organizationId: auth.organization.id,
    planKey: 'team',
    status: 'ACTIVE',
  });

  const workspaceAResponse = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/workspaces`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: 'Workspace A', runtimeMode: 'remote-kubernetes' },
  });
  expect(workspaceAResponse.statusCode).toBe(201);
  const workspaceA = workspaceAResponse.json().workspace as { id: string; gitPath?: string };

  const workspaceB = await store.createWorkspace({
    projectId,
    expectedOrganizationId: auth.organization.id,
    name: 'Workspace B',
    runtimeMode: 'remote-kubernetes',
  });

  return {
    app,
    store,
    gitProvider,
    storage,
    projectId,
    workspaceA,
    workspaceB,
    token: auth.token,
    staticBuildCalls,
  };
}

describe('workspace isolation: two workspaces in the same project do not contaminate each other', () => {
  it('sanity check — both workspaces exist on the same project with distinct gitPaths', async () => {
    const fixture = await bootstrapTwoWorkspaceProject('sanity');

    try {
      const list = await fixture.app.inject({
        method: 'GET',
        url: `/projects/${fixture.projectId}/workspaces`,
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      expect(list.statusCode).toBe(200);

      const workspaces = list.json().workspaces as Array<{ id: string; gitPath?: string }>;
      const ids = workspaces.map((w) => w.id).sort();
      const expectedIds = [fixture.workspaceA.id, fixture.workspaceB.id].sort();

      expect(ids).toEqual(expectedIds);
      expect(fixture.workspaceA.id).not.toBe(fixture.workspaceB.id);
      expect(fixture.workspaceA.gitPath).toBe(`.vibecore-workspaces/${fixture.workspaceA.id}`);
      expect(fixture.workspaceB.gitPath).toBe(`.vibecore-workspaces/${fixture.workspaceB.id}`);
    } finally {
      await fixture.app.close();
    }
  }, 240_000);

  it('IDE state PUT on workspace A is not visible from workspace B', async () => {
    const fixture = await bootstrapTwoWorkspaceProject('ide-state');

    try {
      const putA = await fixture.app.inject({
        method: 'PUT',
        url: `/workspaces/${fixture.workspaceA.id}/ide-state`,
        headers: { authorization: `Bearer ${fixture.token}` },
        payload: {
          state: {
            ui: { activeTab: 'A-ONLY-TAB-MARKER' },
            chat: { lastMessageId: 'A-ONLY-CHAT-MARKER' },
          },
        },
      });
      expect(putA.statusCode).toBe(200);

      const putB = await fixture.app.inject({
        method: 'PUT',
        url: `/workspaces/${fixture.workspaceB.id}/ide-state`,
        headers: { authorization: `Bearer ${fixture.token}` },
        payload: {
          state: {
            ui: { activeTab: 'B-ONLY-TAB-MARKER' },
            chat: { lastMessageId: 'B-ONLY-CHAT-MARKER' },
          },
        },
      });
      expect(putB.statusCode).toBe(200);

      const getA = await fixture.app.inject({
        method: 'GET',
        url: `/workspaces/${fixture.workspaceA.id}/ide-state`,
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      expect(getA.statusCode).toBe(200);
      const serializedA = JSON.stringify(getA.json().ideState);
      expect(serializedA).toContain('A-ONLY-TAB-MARKER');
      expect(serializedA).toContain('A-ONLY-CHAT-MARKER');
      expect(serializedA).not.toContain('B-ONLY-TAB-MARKER');
      expect(serializedA).not.toContain('B-ONLY-CHAT-MARKER');

      const getB = await fixture.app.inject({
        method: 'GET',
        url: `/workspaces/${fixture.workspaceB.id}/ide-state`,
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      expect(getB.statusCode).toBe(200);
      const serializedB = JSON.stringify(getB.json().ideState);
      expect(serializedB).toContain('B-ONLY-TAB-MARKER');
      expect(serializedB).toContain('B-ONLY-CHAT-MARKER');
      expect(serializedB).not.toContain('A-ONLY-TAB-MARKER');
      expect(serializedB).not.toContain('A-ONLY-CHAT-MARKER');

      // Cross-check the store: workspaceIdeStates is keyed by workspaceId,
      // so we should see two distinct rows that don't share content.
      const stateA = await fixture.store.getWorkspaceIdeState(fixture.workspaceA.id);
      const stateB = await fixture.store.getWorkspaceIdeState(fixture.workspaceB.id);
      expect(stateA).toBeDefined();
      expect(stateB).toBeDefined();
      expect(JSON.stringify(stateA?.state)).not.toContain('B-ONLY-');
      expect(JSON.stringify(stateB?.state)).not.toContain('A-ONLY-');
    } finally {
      await fixture.app.close();
    }
  }, 240_000);

  it('a commit on workspace B is not visible from workspace A', async () => {
    const fixture = await bootstrapTwoWorkspaceProject('git');

    try {
      /*
       * Materialize a unique file in workspace B's checkout and commit it
       * directly through the git provider. We bypass the /git/commit route
       * here because that route re-syncs the manifest from persisted IDE
       * state before staging — which would wipe the file. The invariant we
       * care about is that the per-workspace gitPath actually isolates
       * history between A and B, which is what the route relies on too.
       */
      const workspaceBPath = join(fixture.storage, fixture.projectId, '.vibecore-workspaces', fixture.workspaceB.id);
      await mkdir(workspaceBPath, { recursive: true });
      await writeFile(join(workspaceBPath, 'b-isolation-marker.txt'), 'workspace-b-only');

      const commit = await fixture.gitProvider.commit({
        projectId: fixture.projectId,
        workspaceId: fixture.workspaceB.id,
        message: 'workspace-isolation-test-b-only',
        files: [],
      });
      expect(commit.message).toBe('workspace-isolation-test-b-only');

      // Graph scoped to B sees the new commit.
      const bGraph = await fixture.app.inject({
        method: 'GET',
        url: `/projects/${fixture.projectId}/git/graph?workspaceId=${encodeURIComponent(fixture.workspaceB.id)}`,
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      expect(bGraph.statusCode).toBe(200);
      expect(JSON.stringify(bGraph.json())).toContain('workspace-isolation-test-b-only');

      // Graph scoped to A (the primary workspace, served from the project
      // root) must not see B's commit nor B's working-tree marker file.
      const aGraph = await fixture.app.inject({
        method: 'GET',
        url: `/projects/${fixture.projectId}/git/graph?workspaceId=${encodeURIComponent(fixture.workspaceA.id)}`,
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      expect(aGraph.statusCode).toBe(200);
      expect(JSON.stringify(aGraph.json())).not.toContain('workspace-isolation-test-b-only');

      const aStatus = await fixture.app.inject({
        method: 'GET',
        url: `/projects/${fixture.projectId}/git/status?workspaceId=${encodeURIComponent(fixture.workspaceA.id)}`,
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      expect(aStatus.statusCode).toBe(200);
      expect(aStatus.json().status.changedFiles).not.toContain('b-isolation-marker.txt');
    } finally {
      await fixture.app.close();
    }
  }, 240_000);

  it('a deployment created from workspace A is tagged with workspace A and not workspace B', async () => {
    const fixture = await bootstrapTwoWorkspaceProject('deploy');

    try {
      // Seed both workspace checkouts so the (stubbed) static build does
      // not bail on PROJECT_STORAGE_MISSING.
      const workspaceAPath = join(fixture.storage, fixture.projectId, '.vibecore-workspaces', fixture.workspaceA.id);
      const workspaceBPath = join(fixture.storage, fixture.projectId, '.vibecore-workspaces', fixture.workspaceB.id);
      await mkdir(workspaceAPath, { recursive: true });
      await mkdir(workspaceBPath, { recursive: true });

      const deployA = await fixture.app.inject({
        method: 'POST',
        url: `/projects/${fixture.projectId}/deployments`,
        headers: { authorization: `Bearer ${fixture.token}` },
        payload: {
          provider: 'static',
          environment: 'preview',
          buildCommand: 'echo "noop"',
          outputDirectory: 'dist',
          workspaceId: fixture.workspaceA.id,
        },
      });
      expect(deployA.statusCode).toBe(201);
      const deploymentA = deployA.json().deployment as { id: string; workspaceId?: string };
      expect(deploymentA.workspaceId).toBe(fixture.workspaceA.id);

      const deployB = await fixture.app.inject({
        method: 'POST',
        url: `/projects/${fixture.projectId}/deployments`,
        headers: { authorization: `Bearer ${fixture.token}` },
        payload: {
          provider: 'static',
          environment: 'preview',
          buildCommand: 'echo "noop"',
          outputDirectory: 'dist',
          workspaceId: fixture.workspaceB.id,
        },
      });
      expect(deployB.statusCode).toBe(201);
      const deploymentB = deployB.json().deployment as { id: string; workspaceId?: string };
      expect(deploymentB.workspaceId).toBe(fixture.workspaceB.id);

      expect(deploymentA.workspaceId).not.toBe(deploymentB.workspaceId);

      // The list endpoint also reflects the per-workspace tag — important
      // for the UI's "deployments from this workspace" filter.
      const list = await fixture.app.inject({
        method: 'GET',
        url: `/projects/${fixture.projectId}/deployments`,
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      expect(list.statusCode).toBe(200);
      const deployments = list.json().deployments as Array<{ id: string; workspaceId?: string }>;

      const persistedA = deployments.find((d) => d.id === deploymentA.id);
      const persistedB = deployments.find((d) => d.id === deploymentB.id);
      expect(persistedA?.workspaceId).toBe(fixture.workspaceA.id);
      expect(persistedB?.workspaceId).toBe(fixture.workspaceB.id);

      /*
       * The static build runner is what physically reads the workspace
       * checkout. The primary workspace (A) collapses onto the project
       * root, so resolveGitWorkspaceId hands the runner `undefined` for
       * A — that is the contract we assert here.
       */
      const buildForA = fixture.staticBuildCalls.find((call) => call.workspaceId === undefined);
      const buildForB = fixture.staticBuildCalls.find((call) => call.workspaceId === fixture.workspaceB.id);
      expect(buildForA).toBeDefined();
      expect(buildForB).toBeDefined();
      expect(fixture.staticBuildCalls).toHaveLength(2);
    } finally {
      await fixture.app.close();
    }
  }, 240_000);
});
