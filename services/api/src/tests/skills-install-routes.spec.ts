import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { buildRawUrl, isAllowedGithubRawUrl } from '../skills-github-fetch.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

async function setup(options: { withWorkspace?: boolean } = {}) {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });

  const user = await store.createUser({
    email: 'iskills@example.com',
    name: 'Install Skills User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'ISkills Org', slug: 'iskills-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'iskills-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'ISkills Project', slug: 'iskills-project' });

  let workspace;
  if (options.withWorkspace) {
    workspace = await store.createWorkspace({ projectId: project.id, name: 'ws', runtimeMode: 'remote' });
  }

  return { app, store, token: 'iskills-token', project, workspace };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** A minimal fetch stub that serves a body for SKILL.md and 404s everything else. */
function stubFetch(map: Record<string, string | number>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      for (const [suffix, value] of Object.entries(map)) {
        if (url.endsWith(suffix)) {
          if (typeof value === 'number') {
            return { ok: value >= 200 && value < 300, status: value, text: async () => 'x' } as unknown as Response;
          }

          return { ok: true, status: 200, text: async () => value } as unknown as Response;
        }
      }

      return { ok: false, status: 404, text: async () => 'Not Found' } as unknown as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('installable skills — SSRF guard', () => {
  it('only allows https raw.githubusercontent.com', () => {
    expect(isAllowedGithubRawUrl('https://raw.githubusercontent.com/a/b/HEAD/SKILL.md')).toBe(true);
    expect(isAllowedGithubRawUrl('http://raw.githubusercontent.com/a/b/HEAD/SKILL.md')).toBe(false);
    expect(isAllowedGithubRawUrl('https://evil.com/a/b')).toBe(false);
    expect(isAllowedGithubRawUrl('https://raw.githubusercontent.com.evil.com/a/b')).toBe(false);
    expect(isAllowedGithubRawUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('always builds a raw-host URL for a valid slug', () => {
    expect(isAllowedGithubRawUrl(buildRawUrl('anthropics/skills', 'SKILL.md'))).toBe(true);
  });
});

describe('installable skills routes (F#27)', () => {
  it('installs a public repo, fetching instructions from SKILL.md', async () => {
    const { app, token, project } = await setup();
    stubFetch({ 'SKILL.md': '# Do the thing\nFollow these steps.' });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills', scope: 'project' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().source).toBe('SKILL.md');
    expect(res.json().skill).toMatchObject({
      ownerRepo: 'anthropics/skills',
      scope: 'project',
      enabled: true,
    });
    expect(res.json().skill.instructions).toContain('Do the thing');
  });

  it('falls back to AGENTS.md then README.md', async () => {
    const { app, token, project } = await setup();
    stubFetch({ 'SKILL.md': 404, 'AGENTS.md': 404, 'README.md': 'readme instructions here' });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().source).toBe('README.md');
  });

  it('is a 409 on duplicate install', async () => {
    const { app, token, project } = await setup();
    stubFetch({ 'SKILL.md': 'instructions' });

    const first = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills' },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('SKILL_ALREADY_INSTALLED');
  });

  it('lists installed skills by scope and reflects the catalog install count', async () => {
    const { app, token, project } = await setup();
    stubFetch({ 'SKILL.md': 'instructions' });

    await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills' },
    });

    const installed = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/skills/installed?scope=project`,
      headers: auth(token),
    });
    expect(installed.statusCode).toBe(200);
    expect(installed.json().skills).toHaveLength(1);

    const catalog = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/skills/catalog`,
      headers: auth(token),
    });
    expect(catalog.statusCode).toBe(200);
    const entry = catalog.json().entries.find((e: any) => e.ownerRepo === 'anthropics/skills');
    expect(entry.installCount).toBe(1);
    expect(entry.installedInProject).toBe(true);
  });

  it('filters the catalog by ?q=', async () => {
    const { app, token, project } = await setup();

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/skills/catalog?q=owasp`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);
    const entries = res.json().entries as Array<{ ownerRepo: string }>;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.ownerRepo.toLowerCase().includes('owasp'))).toBe(true);
  });

  it('uninstalls and then 404s on a repeat uninstall', async () => {
    const { app, token, project } = await setup();
    stubFetch({ 'SKILL.md': 'instructions' });

    await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills' },
    });

    const remove = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/skills/installed`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills', scope: 'project' },
    });
    expect(remove.statusCode).toBe(200);
    expect(remove.json().removed).toBe(true);

    const again = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/skills/installed`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills', scope: 'project' },
    });
    expect(again.statusCode).toBe(404);
    expect(again.json().code).toBe('SKILL_NOT_INSTALLED');
  });

  it('toggles an installed skill enabled flag', async () => {
    const { app, token, project } = await setup();
    stubFetch({ 'SKILL.md': 'instructions' });

    await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills' },
    });

    const toggle = await app.inject({
      method: 'PATCH',
      url: `/projects/${project.id}/skills/installed`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills', scope: 'project', enabled: false },
    });
    expect(toggle.statusCode).toBe(200);
    expect(toggle.json().skill.enabled).toBe(false);
  });

  it('rejects an invalid owner/repo with 400', async () => {
    const { app, token, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'https://evil.com/a/b' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('SKILL_REPO_INVALID');
  });

  it('returns SKILL_REPO_PRIVATE when a non-curated repo has no public instructions', async () => {
    const { app, token, project } = await setup();
    stubFetch({}); // everything 404s

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'someone/private-repo' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('SKILL_REPO_PRIVATE');
  });

  it('falls back to the catalog summary when a curated repo is unreachable', async () => {
    const { app, token, project } = await setup();
    stubFetch({}); // 404 everywhere → private_or_missing, but repo is curated

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().source).toBeNull();
    expect(res.json().note).toBeTruthy();
    expect(res.json().skill.instructions.length).toBeGreaterThan(0);
  });

  it('409s a workspace-scoped install when no workspace exists', async () => {
    const { app, token, project } = await setup();
    stubFetch({ 'SKILL.md': 'instructions' });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills', scope: 'workspace' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('SKILL_NO_WORKSPACE');
  });

  it('installs a workspace-scoped skill when a workspace exists', async () => {
    const { app, token, project } = await setup({ withWorkspace: true });
    stubFetch({ 'SKILL.md': 'ws instructions' });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/install`,
      headers: auth(token),
      payload: { ownerRepo: 'anthropics/skills', scope: 'workspace' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().skill.scope).toBe('workspace');
  });

  it('rejects unauthenticated access', async () => {
    const { app, project } = await setup();
    const res = await app.inject({ method: 'GET', url: `/projects/${project.id}/skills/catalog` });
    expect(res.statusCode).toBe(401);
  });
});
