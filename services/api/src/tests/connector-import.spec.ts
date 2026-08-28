import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class MemoryProjectStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  corruptNextWrite = false;

  async writeFiles(
    projectId: string,
    files: Array<{ path: string; content: string }>,
    scope: { expectedOrganizationId: string; workspaceId?: string },
  ) {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    for (const file of files) bucket.set(file.path, file.content);
    if (this.corruptNextWrite && files[0]) {
      this.corruptNextWrite = false;
      bucket.set(files[0].path, `${files[0].content}\ncorrupted-after-write`);
    }
    this.files.set(projectId, bucket);
    return this.listFiles(projectId, scope);
  }

  async listFiles(
    projectId: string,
    scope: { expectedOrganizationId: string; workspaceId?: string },
  ): Promise<ProjectFile[]> {
    return this.listFilesWithinPhysicalAccess(projectId, scope.workspaceId);
  }

  async listFilesWithinPhysicalAccess(projectId: string, _workspaceId?: string): Promise<ProjectFile[]> {
    const updatedAt = new Date().toISOString();
    return [...(this.files.get(projectId) ?? new Map()).entries()].map(([path, content]) => ({
      path,
      content,
      updatedAt,
    }));
  }

  async readFile() {
    return undefined;
  }
  async deleteFiles() {}
  async deleteProjectFiles(projectId: string) {
    this.files.delete(projectId);
  }
  async eraseProjectDataWithinPhysicalAccess(projectId: string) {
    this.files.delete(projectId);
  }
  async exportZip() {
    return { storageKey: 'export', byteLength: 0, base64: '', createdAt: new Date().toISOString() };
  }
  async importZip() {
    return [];
  }
  async writeObject() {}
  async readObject() {
    return undefined;
  }
  async deleteObject() {}
  async createSnapshot() {
    return { storageKey: 'snapshot', byteLength: 0, createdAt: new Date().toISOString() };
  }
  async getSnapshotFiles(
    projectId: string,
    storageKey: string,
    _scope: { expectedOrganizationId: string; workspaceId?: string },
  ) {
    return this.getSnapshotFilesWithinPhysicalAccess(projectId, storageKey);
  }
  async getSnapshotFilesWithinPhysicalAccess(_projectId: string, _storageKey: string) {
    return [];
  }
  async restoreSnapshot() {
    return [];
  }
}

/*
 * GitLab / Bitbucket repo import (parity with GitHub): the connector token drives
 * a real, persistent project — not deploy-only. Uses a fake git provider so the
 * route's org-scoping + createProject + sourceType are exercised without cloning.
 */
const fakeGitProvider = {
  importRepository: async (input: { repositoryUrl: string; branch?: string }) => ({
    defaultBranch: input.branch ?? 'main',
    remoteUrl: input.repositoryUrl,
    files: [],
  }),
} as any;

async function register(app: any, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Tester', organizationName: 'Org' },
  });
  expect(res.statusCode).toBe(201);

  return res.json() as { token: string; organization: { id: string } };
}

describe('GitHub / GitLab / Bitbucket repo import', () => {
  it.each([
    ['github', 'https://github.com/acme/app'],
    ['gitlab', 'https://gitlab.com/acme/app'],
    ['bitbucket', 'https://bitbucket.org/acme/app'],
  ])('imports a %s repository into a persistent org-scoped project', async (provider, repoUrl) => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), gitProvider: fakeGitProvider });
    const t = await register(app, `${provider}@example.com`);

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${t.organization.id}/projects/import/${provider}`,
      headers: { authorization: `Bearer ${t.token}` },
      payload: { repositoryUrl: repoUrl },
    });

    expect(res.statusCode).toBe(201);
    const project = res.json().project as { id: string; sourceType: string; organizationId: string; name: string };
    expect(project.sourceType).toBe(provider);
    expect(project.organizationId).toBe(t.organization.id);
    expect(project.name).toBe('app');
    expect(res.json().import).toMatchObject({ state: 'COMMITTED', targetProjectId: project.id });

    await app.close();
  });

  it('returns 202 with no target or secret before explicit consent, then commits the redacted artifact', async () => {
    const importedSecret = 'fixture-secret-value-with-enough-entropy-7Qm2X9p4';
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const gitProvider = {
      importRepository: async (input: { repositoryUrl: string; branch?: string }) => ({
        defaultBranch: input.branch ?? 'main',
        remoteUrl: input.repositoryUrl,
        files: [
          { path: '.env', content: `API_SECRET=${importedSecret}\n`, updatedAt: new Date().toISOString() },
          { path: 'src/index.ts', content: 'export const imported = true;\n', updatedAt: new Date().toISOString() },
        ],
      }),
    } as any;
    const app = await buildApiApp({
      store,
      projectStorage,
      emailProvider: new QuietEmailProvider(),
      gitProvider,
    });
    const t = await register(app, 'quarantined-gitlab@example.com');

    const staged = await app.inject({
      method: 'POST',
      url: `/orgs/${t.organization.id}/projects/import/gitlab`,
      headers: { authorization: `Bearer ${t.token}`, 'idempotency-key': 'direct-secret-consent' },
      payload: { repositoryUrl: 'https://gitlab.com/acme/private-app' },
    });

    expect(staged.statusCode).toBe(202);
    expect(staged.json()).toMatchObject({
      project: null,
      import: { state: 'AWAITING_USER_ACTION', requiresConsent: true },
    });
    expect(JSON.stringify(staged.json())).not.toContain(importedSecret);
    expect(await store.listProjects(t.organization.id)).toEqual([]);
    expect(projectStorage.files.size).toBe(0);

    const importJobId = staged.json().import.importJobId as string;
    const inspected = await app.inject({
      method: 'GET',
      url: `/orgs/${t.organization.id}/imports/${importJobId}`,
      headers: { authorization: `Bearer ${t.token}` },
    });
    expect(inspected.statusCode).toBe(200);
    expect(inspected.body).not.toContain(importedSecret);
    expect(inspected.body).not.toContain('vibecore.import-staging.v1');
    const finding = staged.json().import.findings[0] as { path: string; line: number };

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${t.organization.id}/imports/${importJobId}/commit`,
      headers: { authorization: `Bearer ${t.token}` },
      payload: { consent: { [`${finding.path}:${finding.line}`]: 'redact' } },
    });
    expect(committed.statusCode).toBe(201);
    expect(committed.json().import.state).toBe('COMMITTED');
    const project = committed.json().project as { id: string; sourceType: string; gitRepositoryUrl?: string };
    expect(project).toMatchObject({
      sourceType: 'gitlab',
      gitRepositoryUrl: 'https://gitlab.com/acme/private-app',
    });
    const targetFiles = await projectStorage.listFiles(project.id, {
      expectedOrganizationId: t.organization.id,
    });
    expect(targetFiles.map((file) => file.content).join('\n')).not.toContain(importedSecret);
    expect(targetFiles.find((file) => file.path === '.env')?.content).toContain('API_SECRET=');

    await app.close();
  });

  it('replays an explicitly keyed clean import without a second target or a second 201', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const app = await buildApiApp({
      store,
      projectStorage,
      emailProvider: new QuietEmailProvider(),
      gitProvider: fakeGitProvider,
    });
    const t = await register(app, 'idempotent-bitbucket@example.com');
    const request = () =>
      app.inject({
        method: 'POST',
        url: `/orgs/${t.organization.id}/projects/import/bitbucket`,
        headers: { authorization: `Bearer ${t.token}`, 'idempotency-key': 'direct-clean-replay' },
        payload: { repositoryUrl: 'https://bitbucket.org/acme/replay-app' },
      });

    const first = await request();
    await store.createQuotaOverride({
      organizationId: t.organization.id,
      key: 'projects.count',
      limit: 0,
      reason: 'prove committed idempotency replay bypasses mutable quota',
    });
    const replay = await request();
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      project: { id: first.json().project.id },
      import: { state: 'COMMITTED', replayed: true },
    });
    expect(await store.listProjects(t.organization.id)).toHaveLength(1);

    await app.close();
  });

  it('keeps an existing project intact when the requested import slug is occupied', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({
      store,
      emailProvider: new QuietEmailProvider(),
      gitProvider: fakeGitProvider,
    });
    const t = await register(app, 'occupied-import-slug@example.com');
    const existing = await store.createProject({
      organizationId: t.organization.id,
      name: 'Existing app',
      slug: 'shared-app',
      sourceType: 'blank',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${t.organization.id}/projects/import/github`,
      headers: { authorization: `Bearer ${t.token}`, 'idempotency-key': 'occupied-import-slug' },
      payload: { repositoryUrl: 'https://github.com/acme/imported-app', slug: 'shared-app' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().project).toMatchObject({ sourceType: 'github' });
    expect(response.json().project.slug).toMatch(/^shared-app-/);
    expect(await store.getProject(existing.id)).toMatchObject({ id: existing.id, slug: 'shared-app' });
    expect(await store.listProjects(t.organization.id)).toHaveLength(2);

    await app.close();
  });

  it('resumes a durable RECEIVED job after a crash between reservation and repository staging', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    let cloneCalls = 0;
    const gitProvider = {
      importRepository: async (input: { repositoryUrl: string }) => {
        cloneCalls += 1;
        return {
          defaultBranch: 'main',
          remoteUrl: input.repositoryUrl,
          files: [{ path: 'README.md', content: '# resumed after reservation\n' }],
        };
      },
    } as any;
    const app = await buildApiApp({
      store,
      projectStorage,
      emailProvider: new QuietEmailProvider(),
      gitProvider,
    });
    const t = await register(app, 'resume-received@example.com');
    const repositoryUrl = 'https://github.com/acme/reserved-before-clone';
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ provider: 'github', repositoryUrl, branch: null, name: null, slug: null }))
      .digest('hex');
    const reserved = await store.createImportJob({
      organizationId: t.organization.id,
      provider: 'github',
      sourceRef: repositoryUrl,
      expiresInMs: 60 * 60_000,
      idempotencyKey: 'resume-received-direct',
      requestHash,
      reservedCredits: 1,
    });
    expect(reserved.job.state).toBe('RECEIVED');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${t.organization.id}/projects/import/github`,
      headers: { authorization: `Bearer ${t.token}`, 'idempotency-key': 'resume-received-direct' },
      payload: { repositoryUrl },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ import: { importJobId: reserved.job.id, state: 'COMMITTED' } });
    expect(cloneCalls).toBe(1);
    expect(store.importJobs.size).toBe(1);
    expect(await store.listProjects(t.organization.id)).toHaveLength(1);

    await app.close();
  });

  it('verifies target bytes before reveal and compensates a corrupt direct import completely', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const gitProvider = {
      importRepository: async (input: { repositoryUrl: string }) => ({
        defaultBranch: 'main',
        remoteUrl: input.repositoryUrl,
        files: [{ path: 'src/index.ts', content: 'export const clean = true;\n' }],
      }),
    } as any;
    const app = await buildApiApp({
      store,
      projectStorage,
      emailProvider: new QuietEmailProvider(),
      gitProvider,
    });
    const t = await register(app, 'corrupt-github@example.com');
    projectStorage.corruptNextWrite = true;

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${t.organization.id}/projects/import/github`,
      headers: { authorization: `Bearer ${t.token}`, 'idempotency-key': 'direct-corrupt-target' },
      payload: { repositoryUrl: 'https://github.com/acme/corrupt-target' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'IMPORT_TARGET_DIGEST_MISMATCH' });
    expect(await store.listProjects(t.organization.id)).toEqual([]);
    expect(store.projects.size).toBe(0);
    expect(store.projectManifestRevisions.size).toBe(0);
    expect(projectStorage.files.size).toBe(0);
    const job = [...store.importJobs.values()][0];
    expect(job).toMatchObject({ state: 'ROLLING_BACK', targetProjectId: undefined });
    expect(await store.getImportReservationByJob(job.id, t.organization.id)).toMatchObject({
      state: 'COMPENSATED',
      debitedCredits: 0,
    });

    await app.close();
  });

  it('rejects an unsafe (file://) repository URL', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), gitProvider: fakeGitProvider });
    const t = await register(app, 'unsafe@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${t.organization.id}/projects/import/gitlab`,
      headers: { authorization: `Bearer ${t.token}` },
      payload: { repositoryUrl: 'file:///etc/passwd' },
    });
    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('does not let a non-member import into another org (org-scoped)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), gitProvider: fakeGitProvider });
    const owner = await register(app, 'owner@example.com');
    const intruder = await register(app, 'intruder@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects/import/gitlab`,
      headers: { authorization: `Bearer ${intruder.token}` },
      payload: { repositoryUrl: 'https://gitlab.com/acme/app' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(403);

    await app.close();
  });
});
