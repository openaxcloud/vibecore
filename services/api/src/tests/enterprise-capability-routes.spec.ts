import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const apps: Array<Awaited<ReturnType<typeof buildApiApp>>> = [];

afterEach(async () => {
  await Promise.allSettled(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  apps.push(app);
  const owner = await store.createUser({
    email: `capability-${crypto.randomUUID()}@example.test`,
    passwordHash: hashPassword('password123'),
  });
  const organization = await store.createOrganization({
    name: 'Enterprise capability org',
    slug: `enterprise-capability-${crypto.randomUUID()}`,
    ownerUserId: owner.id,
  });
  const token = `capability-session-${crypto.randomUUID()}`;
  await store.createSession({ userId: owner.id, token, expiresAt: new Date(Date.now() + 3_600_000) });
  await store.upsertBillingPlan({ key: 'enterprise', name: 'Enterprise', monthlyCents: 0, limits: {} });
  await store.upsertSubscription({ organizationId: organization.id, planKey: 'enterprise', status: 'ACTIVE' });
  const project = await store.createProject({
    organizationId: organization.id,
    name: 'Enterprise capability project',
    slug: `enterprise-capability-project-${crypto.randomUUID()}`,
  });

  return { app, store, organization, project, token };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('Enterprise capability admission', () => {
  it('serves fail-closed provider, region and badge controls from the persisted plan', async () => {
    const { app, store, organization, project, token } = await setup();

    const unprovisioned = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/deployments/plan-entitlements?provider=static`,
      headers: auth(token),
    });
    expect(unprovisioned.statusCode).toBe(200);
    expect(unprovisioned.json()).toMatchObject({
      plan: 'enterprise',
      provider: 'static',
      providerReady: false,
      unavailableReason: 'region-operator-required',
      publishRegionMode: 'custom',
      publishRegions: [],
      defaultPublishRegion: null,
      badgeRemovable: true,
      badgeRequired: false,
    });

    await store.setFeatureFlag({
      organizationId: organization.id,
      key: 'entitlement.publishRegion.global',
      enabled: true,
    });
    const provisioned = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/deployments/plan-entitlements?provider=static`,
      headers: auth(token),
    });
    expect(provisioned.statusCode).toBe(200);
    expect(provisioned.json()).toMatchObject({
      providerReady: true,
      unavailableReason: null,
      publishRegions: ['global'],
      defaultPublishRegion: 'global',
    });

    const external = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/deployments/plan-entitlements?provider=vercel`,
      headers: auth(token),
    });
    expect(external.statusCode).toBe(200);
    expect(external.json()).toMatchObject({
      provider: 'vercel',
      providerReady: true,
      unavailableReason: null,
    });

    await store.upsertBillingPlan({ key: 'free', name: 'Starter', monthlyCents: 0, limits: {} });
    await store.upsertSubscription({ organizationId: organization.id, planKey: 'free', status: 'ACTIVE' });
    const starter = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/deployments/plan-entitlements?provider=server`,
      headers: auth(token),
    });
    expect(starter.statusCode).toBe(200);
    expect(starter.json()).toMatchObject({
      plan: 'starter',
      provider: 'server',
      providerReady: true,
      publishRegionMode: 'single',
      publishRegions: ['platform-default'],
      defaultPublishRegion: 'platform-default',
      badgeRemovable: false,
      badgeRequired: true,
    });
  });

  it('reports unavailable surfaces as operator-required and never as a simulated capability', async () => {
    const { app, organization, token } = await setup();
    const response = await app.inject({
      method: 'GET',
      url: `/orgs/${organization.id}/enterprise-capabilities`,
      headers: auth(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      plan: 'enterprise',
      capabilities: expect.arrayContaining([
        { key: 'single-tenant', entitled: true, provisioned: false, state: 'operator-required', surface: null },
        { key: 'static-outbound-ip', entitled: true, provisioned: false, state: 'operator-required', surface: null },
        { key: 'vpc-peering', entitled: true, provisioned: false, state: 'operator-required', surface: null },
        { key: 'data-warehouse', entitled: true, provisioned: false, state: 'operator-required', surface: null },
        { key: 'security-center', entitled: true, provisioned: false, state: 'operator-required', surface: null },
      ]),
    });

    const denied = await app.inject({
      method: 'GET',
      url: `/orgs/${organization.id}/security-center/events`,
      headers: auth(token),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: 'ENTERPRISE_CAPABILITY_OPERATOR_REQUIRED' });
  });

  it('opens the real organization-scoped Security Center only after explicit provisioning', async () => {
    const { app, store, organization, token } = await setup();
    await store.setFeatureFlag({
      organizationId: organization.id,
      key: 'entitlement.enterprise.security-center',
      enabled: true,
    });
    await store.recordAudit({
      organizationId: organization.id,
      action: 'security.session.revoked',
      resourceType: 'session',
    });
    await store.recordAudit({
      organizationId: 'another-org',
      action: 'security.session.revoked',
      resourceType: 'session',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/orgs/${organization.id}/enterprise-capabilities`,
      headers: auth(token),
    });
    expect(status.json().capabilities).toEqual(
      expect.arrayContaining([
        {
          key: 'security-center',
          entitled: true,
          provisioned: true,
          state: 'ready',
          surface: 'security-center-events',
        },
      ]),
    );

    const response = await app.inject({
      method: 'GET',
      url: `/orgs/${organization.id}/security-center/events`,
      headers: auth(token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ openCount: 1 });
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0]).toMatchObject({
      organizationId: organization.id,
      action: 'security.session.revoked',
      resolved: false,
    });
  });
});
