import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
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

describe('GitLab / Bitbucket repo import', () => {
  it.each([
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

  it("does not let a non-member import into another org (org-scoped)", async () => {
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
