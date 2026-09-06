import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/**
 * Route-level proof for P0-A2-14: the guardrails actually refuse over HTTP, not
 * just in the pure module. Each test drives a real endpoint through
 * `buildApiApp` + `app.inject` and asserts the refusal reaches the client.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const prevEnabled = process.env.TENANT_GUARDRAILS_ENABLED;

afterEach(() => {
  if (prevEnabled === undefined) {
    delete process.env.TENANT_GUARDRAILS_ENABLED;
  } else {
    process.env.TENANT_GUARDRAILS_ENABLED = prevEnabled;
  }
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * `emailVerified` is what moves the tenant between reputation tiers (UNTRUSTED →
 * BASIC). The org is put on `team` so the PLAN quota stays out of the way and a
 * refusal can only have come from the guardrail.
 */
async function setup(options: { emailVerified?: boolean } = {}) {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'tenant@example.com',
    name: 'Tenant',
    passwordHash: hashPassword('password123'),
  });

  if (options.emailVerified) {
    await store.updateUser({ userId: user.id, emailVerifiedAt: new Date().toISOString() });
  }

  const org = await store.createOrganization({ name: 'Guard Org', slug: 'guard-org', ownerUserId: user.id });

  await store.createSession({ userId: user.id, token: 'tg-token', expiresAt: new Date(Date.now() + 3600_000) });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });

  return { app, store, org, user, token: 'tg-token' };
}

const createProject = (app: any, orgId: string, token: string, name: string) =>
  app.inject({
    method: 'POST',
    url: `/orgs/${orgId}/projects`,
    headers: auth(token),
    payload: { name, slug: name.toLowerCase() },
  });

describe('tenant guardrails — enforcement is OFF by default', () => {
  it('does not block an untrusted tenant past its tier cap while the flag is unset', async () => {
    delete process.env.TENANT_GUARDRAILS_ENABLED;

    const { app, org, token } = await setup();

    // UNTRUSTED maxProjects is 2; a 3rd would be refused IF enforcement were on.
    for (const name of ['p1', 'p2', 'p3']) {
      const res = await createProject(app, org.id, token, name);
      expect(res.statusCode).toBe(201);
    }
  });

  it('still AUDITS the would-be refusal, so the blast radius is measurable first', async () => {
    delete process.env.TENANT_GUARDRAILS_ENABLED;

    const { app, store, org, token } = await setup();

    for (const name of ['p1', 'p2', 'p3']) {
      await createProject(app, org.id, token, name);
    }

    const logs = await store.listAuditLogs(org.id);
    const refusals = logs.filter((entry: any) => entry.action === 'tenant.guardrail.refused');

    expect(refusals.length).toBeGreaterThan(0);
    expect(refusals[0].metadata?.enforced).toBe(false);
  });
});

describe('tenant guardrails — enforcement ON', () => {
  it('NEGATIVE: an untrusted tenant is refused its 3rd project with 429', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';

    const { app, org, token } = await setup();

    expect((await createProject(app, org.id, token, 'p1')).statusCode).toBe(201);
    expect((await createProject(app, org.id, token, 'p2')).statusCode).toBe(201);

    const refused = await createProject(app, org.id, token, 'p3');
    expect(refused.statusCode).toBe(429);
    expect(refused.json().message ?? refused.json().error).toMatch(/at most 2/);
  });

  it('NEGATIVE: an unverified tenant cannot create a deployment (publish wall)', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';

    const { app, store, org, token } = await setup();
    const project = await store.createProject({ organizationId: org.id, name: 'Dep', slug: 'dep' });

    const refused = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth(token),
      payload: { type: 'AUTOSCALE' },
    });

    // The publish wall must fire — never a 201.
    expect(refused.statusCode).toBeGreaterThanOrEqual(400);
    expect([402, 429]).toContain(refused.statusCode);
  });

  it('a VERIFIED-email tenant is NOT blocked at the same project count', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';

    // emailVerified ⇒ BASIC ⇒ maxProjects 10, not the UNTRUSTED 2.
    const { app, org, token } = await setup({ emailVerified: true });

    for (const name of ['p1', 'p2', 'p3', 'p4']) {
      const res = await createProject(app, org.id, token, name);
      expect(res.statusCode).toBe(201);
    }
  });

  it('a burst refusal feeds the existing AbuseEvent pipeline', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';

    /*
     * Driven through the DEPLOYMENT wall on purpose: UNTRUSTED has a
     * deployment burst ceiling of 0, so a single request trips it. Using the
     * project path instead would never reach the burst check — BASIC's lifetime
     * cap (10) and hourly burst (10) are equal, so the cap always fires first.
     */
    const { app, store, org, token } = await setup();
    const project = await store.createProject({ organizationId: org.id, name: 'Dep2', slug: 'dep2' });

    const refused = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth(token),
      payload: { type: 'AUTOSCALE' },
    });
    expect(refused.statusCode).toBe(429);

    const events = await store.listAbuseEvents({ organizationId: org.id });
    const spikes = events.filter((event: any) => event.type === 'deployment_creation_spike');

    expect(spikes.length).toBeGreaterThan(0);
  });
});
