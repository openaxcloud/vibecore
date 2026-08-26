import { hashPassword } from '@vibecore/auth';
import type { PlanKey } from '@vibecore/billing';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { tenantGuardrailUsageType } from '../tenant-guardrails.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const previousEnabled = process.env.TENANT_GUARDRAILS_ENABLED;

afterEach(() => {
  if (previousEnabled === undefined) {
    delete process.env.TENANT_GUARDRAILS_ENABLED;
  } else {
    process.env.TENANT_GUARDRAILS_ENABLED = previousEnabled;
  }
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup(options: { emailVerified?: boolean; billingBound?: boolean; planKey?: PlanKey } = {}) {
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
  await store.createSession({ userId: user.id, token: 'tg-token', expiresAt: new Date(Date.now() + 3_600_000) });
  await store.upsertSubscription({ organizationId: org.id, planKey: options.planKey ?? 'team', status: 'ACTIVE' });

  if (options.billingBound) {
    await store.upsertBillingCustomer({ organizationId: org.id, provider: 'stripe', externalId: 'cus_guard' });
  }

  return { app, store, org, user, token: 'tg-token' };
}

const createProject = (app: Awaited<ReturnType<typeof buildApiApp>>, orgId: string, token: string, name: string) =>
  app.inject({
    method: 'POST',
    url: `/orgs/${orgId}/projects`,
    headers: auth(token),
    payload: { name, slug: name.toLowerCase() },
  });

describe('tenant guardrails — secure rollout semantics', () => {
  it('enforces by default when the environment variable is absent', async () => {
    delete process.env.TENANT_GUARDRAILS_ENABLED;
    const { app, org, token } = await setup();

    expect((await createProject(app, org.id, token, 'p1')).statusCode).toBe(201);
    expect((await createProject(app, org.id, token, 'p2')).statusCode).toBe(201);

    const refused = await createProject(app, org.id, token, 'p3');
    expect(refused.statusCode).toBe(429);
    expect(refused.json().code).toBe('TENANT_CAP_EXCEEDED');
  });

  it('supports only an explicit observe-only kill switch and audits it', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'false';
    const { app, store, org, token } = await setup();

    for (const name of ['p1', 'p2', 'p3']) {
      expect((await createProject(app, org.id, token, name)).statusCode).toBe(201);
    }

    const refusals = (await store.listAuditLogs(org.id)).filter((entry) => entry.action === 'tenant.guardrail.refused');
    expect(refusals).toHaveLength(1);
    expect(refusals[0].metadata?.enforced).toBe(false);
  });
});

describe('tenant guardrails — route-level negative proofs', () => {
  it('serializes concurrent creates so exactly one request receives the last slot', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup();
    expect((await createProject(app, org.id, token, 'p1')).statusCode).toBe(201);

    const results = await Promise.all([
      createProject(app, org.id, token, 'p2'),
      createProject(app, org.id, token, 'p3'),
    ]);

    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 429]);
    expect(await store.countProjects(org.id)).toBe(2);
  });

  it('does not reset the project burst wall when created projects are deleted', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup();

    for (const name of ['ephemeral-one', 'ephemeral-two']) {
      const created = await createProject(app, org.id, token, name);
      expect(created.statusCode).toBe(201);

      const removed = await app.inject({
        method: 'DELETE',
        url: `/projects/${created.json().project.id}`,
        headers: auth(token),
      });
      expect(removed.statusCode).toBe(200);
    }

    expect(await store.countProjects(org.id)).toBe(0);
    const refused = await createProject(app, org.id, token, 'ephemeral-three');
    expect(refused.statusCode).toBe(429);
    expect(refused.json().code).toBe('TENANT_BURST_EXCEEDED');
  });

  it('fails closed with a stable 503 and creates nothing when an authoritative counter is unavailable', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup();
    const countProjects = store.countProjects.bind(store);
    store.countProjects = async () => {
      throw new Error('database unavailable');
    };

    const refused = await createProject(app, org.id, token, 'never-created');

    expect(refused.statusCode).toBe(503);
    expect(refused.json().code).toBe('TENANT_GUARDRAIL_UNAVAILABLE');
    store.countProjects = countProjects;
    expect(await store.countProjects(org.id)).toBe(0);
  });

  it('fails closed before mutation when the admission audit cannot be persisted', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup();
    store.recordAudit = async () => {
      throw new Error('audit store unavailable');
    };

    const refused = await createProject(app, org.id, token, 'never-unaudited');

    expect(refused.statusCode).toBe(503);
    expect(refused.json().code).toBe('TENANT_GUARDRAIL_UNAVAILABLE');
    expect(await store.countProjects(org.id)).toBe(0);
  });

  it('does not trust a client-selected organization without membership', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, token } = await setup({ emailVerified: true });
    const outsider = await store.createUser({
      email: 'owner@example.com',
      name: 'Owner',
      passwordHash: hashPassword('password123'),
    });
    const otherOrg = await store.createOrganization({ name: 'Other', slug: 'other', ownerUserId: outsider.id });

    const refused = await createProject(app, otherOrg.id, token, 'cross-tenant');

    // Cross-tenant resources are deliberately hidden to avoid organization enumeration.
    expect(refused.statusCode).toBe(404);
    expect(await store.countProjects(otherOrg.id)).toBe(0);
  });

  it('applies the workspace concurrency wall on the real workspace route', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    // Free provisions exactly the UNTRUSTED resource envelope and has one active slot.
    const { app, store, org, token } = await setup({ planKey: 'free' });
    const project = await store.createProject({ organizationId: org.id, name: 'Runtime', slug: 'runtime' });
    const createWorkspace = (name: string) =>
      app.inject({
        method: 'POST',
        url: `/projects/${project.id}/workspaces`,
        headers: auth(token),
        payload: { name },
      });

    expect((await createWorkspace('first')).statusCode).toBe(201);
    const refused = await createWorkspace('second');
    expect(refused.statusCode).toBe(429);
    expect(refused.json().code).toBe('TENANT_CAP_EXCEEDED');
  });

  it('fails closed before workspace creation when the durable burst claim cannot be written', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup({ planKey: 'free' });
    const project = await store.createProject({ organizationId: org.id, name: 'No meter', slug: 'no-meter' });
    store.recordUsageEvent = async () => {
      throw new Error('usage store unavailable');
    };

    const refused = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/workspaces`,
      headers: auth(token),
      payload: { name: 'must-not-exist' },
    });

    expect(refused.statusCode).toBe(503);
    expect(refused.json().code).toBe('TENANT_GUARDRAIL_UNAVAILABLE');
    expect(await store.listWorkspaces(project.id)).toEqual([]);
  });

  it('denies every deployment provider for an unverified tenant', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup();
    const project = await store.createProject({ organizationId: org.id, name: 'Dep', slug: 'dep' });

    const refused = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth(token),
      payload: { provider: 'static' },
    });

    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('TENANT_PROVIDER_NOT_ALLOWED');
  });

  it('cannot bypass a tenant demotion by acting through a clean collaborator', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup({ emailVerified: true, billingBound: true });
    const struckMember = await store.createUser({
      email: 'struck@example.com',
      name: 'Struck member',
      passwordHash: hashPassword('password123'),
    });
    await store.updateUser({
      userId: struckMember.id,
      preferences: {
        moderationStrikes: [{ severity: 'major', createdAt: new Date().toISOString() }],
      },
    });
    await store.addMember({ organizationId: org.id, userId: struckMember.id, roleKey: 'member' });
    const project = await store.createProject({ organizationId: org.id, name: 'Demoted', slug: 'demoted' });

    const refused = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth(token),
      payload: { provider: 'static' },
    });

    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('TENANT_PROVIDER_NOT_ALLOWED');
  });

  it('cannot bury a recent severe incident behind a capped page of harmless events', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup({ emailVerified: true, billingBound: true });
    const project = await store.createProject({ organizationId: org.id, name: 'Buried abuse', slug: 'buried-abuse' });
    const severe = await store.createAbuseEvent({
      organizationId: org.id,
      type: 'credential_stuffing',
      severity: 'critical',
    });
    store.abuseEvents.set(severe.id, {
      ...severe,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });

    for (let index = 0; index < 101; index += 1) {
      await store.createAbuseEvent({ organizationId: org.id, type: `noise-${index}`, severity: 'low' });
    }

    const refused = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth(token),
      payload: { provider: 'static' },
    });

    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('TENANT_PROVIDER_NOT_ALLOWED');
  });

  it('applies the hourly start wall to restarting an already-active workspace', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup({ planKey: 'free' });
    const project = await store.createProject({ organizationId: org.id, name: 'Restart', slug: 'restart' });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      name: 'Running workspace',
      runtimeMode: 'remote-kubernetes',
      initialStatus: 'RUNNING',
    });

    for (let index = 0; index < 5; index += 1) {
      await store.recordUsageEvent({
        organizationId: org.id,
        type: tenantGuardrailUsageType('workspace.start'),
      });
    }

    const refused = await app.inject({
      method: 'POST',
      url: `/api/runtime/workspaces/${workspace.id}/restart`,
      headers: auth(token),
    });

    expect(refused.statusCode).toBe(429);
    expect(refused.json().code).toBe('TENANT_BURST_EXCEEDED');
    expect((await store.getWorkspace(workspace.id))?.status).toBe('RUNNING');
  });

  it('applies the hourly start wall when reopening an already-active runtime', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup({ planKey: 'free' });
    const project = await store.createProject({ organizationId: org.id, name: 'Reopen', slug: 'reopen' });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      name: 'Running runtime',
      runtimeMode: 'remote-kubernetes',
      initialStatus: 'RUNNING',
    });

    for (let index = 0; index < 5; index += 1) {
      await store.recordUsageEvent({
        organizationId: org.id,
        type: tenantGuardrailUsageType('workspace.start'),
      });
    }

    const refused = await app.inject({
      method: 'POST',
      url: '/api/runtime/workspaces',
      headers: auth(token),
      payload: { projectId: project.id, workspaceId: workspace.id },
    });

    expect(refused.statusCode).toBe(429);
    expect(refused.json().code).toBe('TENANT_BURST_EXCEEDED');
    expect((await store.getWorkspace(workspace.id))?.status).toBe('RUNNING');
  });

  it('derives email trust from the tenant owner, not a verified collaborating actor', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, user: verifiedActor, token } = await setup({ emailVerified: true, billingBound: true });
    const unverifiedOwner = await store.createUser({
      email: 'unverified-owner@example.com',
      name: 'Unverified owner',
      passwordHash: hashPassword('password123'),
    });
    const targetOrg = await store.createOrganization({
      name: 'Unverified boundary',
      slug: 'unverified-boundary',
      ownerUserId: unverifiedOwner.id,
    });
    await store.addMember({ organizationId: targetOrg.id, userId: verifiedActor.id, roleKey: 'member' });
    await store.upsertSubscription({ organizationId: targetOrg.id, planKey: 'team', status: 'ACTIVE' });
    await store.upsertBillingCustomer({
      organizationId: targetOrg.id,
      provider: 'stripe',
      externalId: 'cus_unverified_boundary',
    });
    const project = await store.createProject({
      organizationId: targetOrg.id,
      name: 'Owner trust',
      slug: 'owner-trust',
    });

    const refused = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth(token),
      payload: { provider: 'static' },
    });

    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('TENANT_PROVIDER_NOT_ALLOWED');
  });

  it('cannot hide an unverified co-owner behind the first verified owner row', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup({ emailVerified: true, billingBound: true });
    const unverifiedCoOwner = await store.createUser({
      email: 'unverified-co-owner@example.com',
      name: 'Unverified co-owner',
      passwordHash: hashPassword('password123'),
    });
    await store.addMember({ organizationId: org.id, userId: unverifiedCoOwner.id, roleKey: 'owner' });
    const project = await store.createProject({ organizationId: org.id, name: 'Owners', slug: 'owners' });

    const refused = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth(token),
      payload: { provider: 'static' },
    });

    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('TENANT_PROVIDER_NOT_ALLOWED');
  });

  it('feeds a verified tenant deployment burst into the durable AbuseEvent pipeline', async () => {
    process.env.TENANT_GUARDRAILS_ENABLED = 'true';
    const { app, store, org, token } = await setup({ emailVerified: true, billingBound: true });
    const project = await store.createProject({ organizationId: org.id, name: 'Dep2', slug: 'dep2' });

    for (let index = 0; index < 20; index += 1) {
      await store.recordUsageEvent({
        organizationId: org.id,
        type: tenantGuardrailUsageType('deployment.create'),
      });
    }

    const refused = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth(token),
      payload: { provider: 'static' },
    });

    expect(refused.statusCode).toBe(429);
    expect(refused.json().code).toBe('TENANT_BURST_EXCEEDED');
    const events = await store.listAbuseEvents({ organizationId: org.id });
    expect(events.some((event) => event.type === 'deployment_creation_spike')).toBe(true);
  });
});
