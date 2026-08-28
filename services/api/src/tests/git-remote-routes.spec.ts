import { describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { GitProvider } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class RemoteAwareGitProvider implements GitProvider {
  readonly configuredRemotes: Array<{
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    remoteUrl: string;
  }> = [];

  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    return { defaultBranch: input.branch ?? 'main', remoteUrl: input.repositoryUrl, files: [] };
  }
  async status() {
    return { branch: 'main', changedFiles: [], ahead: 0, behind: 0 };
  }
  async commit(input: { message: string }) {
    return { sha: 'test-sha', message: input.message };
  }
  async push(input: { branch: string }) {
    return { pushed: true, branch: input.branch };
  }
  async pull(input: { branch: string }) {
    return { pulled: true, branch: input.branch, changedFiles: [] };
  }
  async configureRemote(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId?: string;
    remoteUrl: string;
  }) {
    this.configuredRemotes.push(input);
    return { remote: 'origin', remoteUrl: input.remoteUrl };
  }
  async listBranches() {
    return ['main'];
  }
  async checkoutBranch(input: { branch: string }) {
    return { branch: input.branch };
  }
  async stashPush() {
    return { stashed: true, output: 'noop' };
  }
  async stashList() {
    return [];
  }
  async stashApply() {
    return { applied: true, output: 'noop' };
  }
  async cherryPick() {
    return { picked: true, output: 'noop' };
  }
  async discard(_input: { projectId: string; workspaceId?: string; filePaths?: string[] }) {
    return { discarded: true, filePaths: [] as string[] };
  }

  async resolveConflict(input: { filePath: string; strategy: 'ours' | 'theirs' }) {
    return { resolved: true, filePath: input.filePath, strategy: input.strategy };
  }
  async logGraph() {
    return [];
  }
  async diff() {
    return '';
  }
  async blame() {
    return [];
  }
  async createPullRequest() {
    return { number: 1, url: 'https://example.com/pr/1' };
  }
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  const gitProvider = new RemoteAwareGitProvider();

  return {
    gitProvider,
    app: buildApiApp({
      gitProvider,
      emailProvider: new QuietEmailProvider(),
      ...options,
    }),
  };
}

async function registerUserAndProject(app: Awaited<ReturnType<typeof buildApiApp>>, email: string, orgName: string) {
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Git Remote Tester', organizationName: orgName },
  });
  expect(register.statusCode).toBe(201);
  const { token, organization } = register.json() as { token: string; organization: { id: string } };

  const createProject = await app.inject({
    method: 'POST',
    url: `/orgs/${organization.id}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Remote Project' },
  });
  expect(createProject.statusCode).toBe(201);

  return {
    token,
    projectId: (createProject.json() as { project: { id: string } }).project.id,
  };
}

describe('Git remote routes', () => {
  it('configures origin and persists the project remote URL', async () => {
    const store = new TestApiStore();
    const { app: appPromise, gitProvider } = buildTestApiApp({ store });
    const app = await appPromise;
    const tenant = await registerUserAndProject(app, 'remote@example.com', 'RemoteOrg');

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${tenant.projectId}/git/remote`,
      headers: { authorization: `Bearer ${tenant.token}` },
      payload: {
        remoteUrl: 'git@github.com:acme/app.git',
        branch: 'trunk',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(gitProvider.configuredRemotes).toEqual([
      {
        projectId: tenant.projectId,
        expectedOrganizationId: (await store.getProject(tenant.projectId))!.organizationId,
        remoteUrl: 'git@github.com:acme/app.git',
        workspaceId: undefined,
      },
    ]);
    await expect(store.getProject(tenant.projectId)).resolves.toMatchObject({
      gitRepositoryUrl: 'git@github.com:acme/app.git',
      gitDefaultBranch: 'trunk',
    });
    await app.close();
  });

  it.each(['file:///etc/passwd', 'git@localhost:acme/app.git', 'git@127.0.0.1:acme/app.git'])(
    'rejects unsafe remote %s before touching the git provider',
    async (remoteUrl) => {
      const store = new TestApiStore();
      const { app: appPromise, gitProvider } = buildTestApiApp({ store });
      const app = await appPromise;
      const tenant = await registerUserAndProject(app, 'unsafe-remote@example.com', 'UnsafeRemoteOrg');

      const response = await app.inject({
        method: 'POST',
        url: `/projects/${tenant.projectId}/git/remote`,
        headers: { authorization: `Bearer ${tenant.token}` },
        payload: {
          remoteUrl,
          branch: 'main',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(gitProvider.configuredRemotes).toEqual([]);
      await app.close();
    },
  );
});
