import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { SKILL_CATALOG } from '../skills-catalog.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });

  const user = await store.createUser({
    email: 'skills@example.com',
    name: 'Skills User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Skills Org', slug: 'skills-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'skills-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'Skills Project', slug: 'skills-project' });

  return { app, token: 'skills-token', project };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('skills registry API', () => {
  it('lists the full builtin catalog at its defaults', async () => {
    const { app, token, project } = await setup();

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/skills`,
      headers: auth(token),
    });

    expect(res.statusCode).toBe(200);
    const skills = res.json().skills as Array<{ id: string; enabled: boolean; updatedAt: string | null }>;
    expect(skills).toHaveLength(SKILL_CATALOG.length);

    const review = skills.find((skill) => skill.id === 'code-review')!;
    expect(review.enabled).toBe(true);
    expect(review.updatedAt).toBeNull();
  });

  it('disables then re-enables a skill, persisting the override', async () => {
    const { app, token, project } = await setup();

    const disable = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/code-review/disable`,
      headers: auth(token),
    });
    expect(disable.statusCode).toBe(200);
    expect(disable.json().skill).toMatchObject({ id: 'code-review', enabled: false });
    expect(disable.json().skill.updatedAt).toBeTruthy();

    const afterDisable = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/skills`,
      headers: auth(token),
    });
    expect(afterDisable.json().skills.find((s: any) => s.id === 'code-review').enabled).toBe(false);

    const enable = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/code-review/enable`,
      headers: auth(token),
    });
    expect(enable.json().skill).toMatchObject({ id: 'code-review', enabled: true });
  });

  it('enables a default-off skill', async () => {
    const { app, token, project } = await setup();
    const offSkill = SKILL_CATALOG.find((entry) => !entry.defaultEnabled)!;

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/${offSkill.id}/enable`,
      headers: auth(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().skill).toMatchObject({ id: offSkill.id, enabled: true });
  });

  it('returns 404 for an unknown skill', async () => {
    const { app, token, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/skills/not-a-real-skill/enable`,
      headers: auth(token),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('SKILL_NOT_FOUND');
  });

  it('rejects unauthenticated access', async () => {
    const { app, project } = await setup();

    const res = await app.inject({ method: 'GET', url: `/projects/${project.id}/skills` });
    expect(res.statusCode).toBe(401);
  });
});
