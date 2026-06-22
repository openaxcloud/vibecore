import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import type { GitProvider } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Cross-organization isolation: a member of org Beta must never be able to read
 * a resource that belongs to org Alpha's project. The existing suite proved this
 * for a single endpoint (GET /projects/:id); this table-driven test extends the
 * guarantee across every project sub-resource read, so a future handler that
 * forgets its org-scoping check is caught here instead of in production. The
 * convention across the API is to answer 404 (not 403) for a foreign resource so
 * its mere existence is not disclosed — we accept either denial, but never a 200.
 */

class TestEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

class TestGitProvider implements GitProvider {
  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    return {
      defaultBranch: input.branch ?? 'main',
      remoteUrl: input.repositoryUrl,
      files: [{ path: 'README.md', content: '# Imported\n', updatedAt: new Date().toISOString() }],
    };
  }

  async status() {
    return { branch: 'main', changedFiles: [], ahead: 0, behind: 0 };
  }

  async commit(input: { message: string }) {
    return { sha: 'iso-sha', message: input.message };
  }

  async push(input: { branch: string }) {
    return { pushed: true, branch: input.branch };
  }

  async pull(input: { branch: string }) {
    return { pulled: true, branch: input.branch, changedFiles: [] };
  }

  async listBranches() {
    return ['main'];
  }

  async checkoutBranch(input: { branch: string }) {
    return { branch: input.branch };
  }

  async stashPush() {
    return { stashed: true, output: 'Saved working directory' };
  }

  async stashList() {
    return [];
  }

  async stashApply() {
    return { applied: true, output: 'Applied stash' };
  }
}

type TestApp = Awaited<ReturnType<typeof buildApiApp>>;

async function register(app: TestApp, input: { email: string; organizationName: string }) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { password: 'password123', name: 'Test User', ...input },
  });
  expect(response.statusCode).toBe(201);

  return response.json() as { token: string; organization: { id: string } };
}

describe('cross-organization isolation on project resources', () => {
  let app: TestApp | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  // Read endpoints that resolve a project (or its collection) purely from the
  // store, i.e. without needing a live workspace runtime. `:projectId` is
  // substituted with Alpha's real project id.
  const readEndpoints = [
    '/projects/:projectId',
    '/projects/:projectId/dashboard',
    '/projects/:projectId/settings',
    '/projects/:projectId/activity',
    '/projects/:projectId/env-vars',
    '/projects/:projectId/secrets',
    '/projects/:projectId/deployments',
    '/projects/:projectId/workspaces',
    '/projects/:projectId/collaborators',
    '/projects/:projectId/snapshots',
    '/projects/:projectId/agent-patch-proposals',
  ];

  it('denies a foreign org every project read endpoint (404, never 200)', async () => {
    app = await buildApiApp({
      store: new TestApiStore(),
      emailProvider: new TestEmailProvider(),
      gitProvider: new TestGitProvider(),
    });

    const alpha = await register(app, { email: 'alpha@example.com', organizationName: 'Alpha' });
    const beta = await register(app, { email: 'beta@example.com', organizationName: 'Beta' });

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${alpha.organization.id}/projects`,
      headers: { authorization: `Bearer ${alpha.token}` },
      payload: { name: 'Alpha Project' },
    });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().project.id as string;

    for (const template of readEndpoints) {
      const url = template.replace(':projectId', projectId);

      const beforeForeign = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${beta.token}` } });

      // The security invariant: Beta is denied and the response never leaks data.
      expect(
        [403, 404],
        `${url} must deny a foreign org (got ${beforeForeign.statusCode})`,
      ).toContain(beforeForeign.statusCode);

      // And the denial is an authorization decision, not a missing route: Alpha,
      // the owner, must NOT be denied on the same endpoint.
      const owner = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${alpha.token}` } });
      expect([403, 404], `${url} should resolve for the owner (got ${owner.statusCode})`).not.toContain(
        owner.statusCode,
      );
    }
  });

  it('denies a foreign org mutating a project it does not own', async () => {
    app = await buildApiApp({
      store: new TestApiStore(),
      emailProvider: new TestEmailProvider(),
      gitProvider: new TestGitProvider(),
    });

    const alpha = await register(app, { email: 'alpha2@example.com', organizationName: 'Alpha2' });
    const beta = await register(app, { email: 'beta2@example.com', organizationName: 'Beta2' });

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${alpha.organization.id}/projects`,
      headers: { authorization: `Bearer ${alpha.token}` },
      payload: { name: 'Alpha2 Project' },
    });
    const projectId = created.json().project.id as string;

    // Beta tries to provision a workspace on Alpha's project — must be denied.
    const stolen = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/workspaces`,
      headers: { authorization: `Bearer ${beta.token}` },
      payload: { name: 'Stolen Workspace', runtimeMode: 'remote-kubernetes' },
    });
    expect([403, 404]).toContain(stolen.statusCode);

    // Beta tries to delete Alpha's project — must be denied and leave it intact.
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/projects/${projectId}`,
      headers: { authorization: `Bearer ${beta.token}` },
    });
    expect([403, 404]).toContain(deleted.statusCode);

    const stillThere = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}`,
      headers: { authorization: `Bearer ${alpha.token}` },
    });
    expect(stillThere.statusCode).toBe(200);
  });
});
