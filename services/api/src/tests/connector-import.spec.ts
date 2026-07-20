import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/* Direct one-phase imports are intentionally retired. Bitbucket is available
 * through the two-phase Import Hub; GitLab is not one of the twelve supported
 * sources and therefore has no route. */
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

describe('retired direct repository imports', () => {
  it('requires Bitbucket imports to use the two-phase Import Hub', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), gitProvider: fakeGitProvider });
    const t = await register(app, 'bitbucket@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${t.organization.id}/projects/import/bitbucket`,
      headers: { authorization: `Bearer ${t.token}` },
      payload: { repositoryUrl: 'https://bitbucket.org/acme/app' },
    });

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({
      code: 'PROJECT_IMPORT_HUB_REQUIRED',
      recoverable: true,
      importHubPath: '/dashboard/templates?section=import&source=bitbucket',
    });

    await app.close();
  });

  it('does not expose the removed GitLab connector route', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), gitProvider: fakeGitProvider });
    const t = await register(app, 'unsafe@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${t.organization.id}/projects/import/gitlab`,
      headers: { authorization: `Bearer ${t.token}` },
      payload: { repositoryUrl: 'file:///etc/passwd' },
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it("does not let a non-member invoke another organization's retired Bitbucket route", async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), gitProvider: fakeGitProvider });
    const owner = await register(app, 'owner@example.com');
    const intruder = await register(app, 'intruder@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects/import/bitbucket`,
      headers: { authorization: `Bearer ${intruder.token}` },
      payload: { repositoryUrl: 'https://bitbucket.org/acme/app' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(403);

    await app.close();
  });
});
