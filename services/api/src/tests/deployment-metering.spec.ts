import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const ORIGINAL_FLAG = process.env.BILLING_CREDITS_ENABLED;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete (process.env as Record<string, string | undefined>).BILLING_CREDITS_ENABLED;
  } else {
    process.env.BILLING_CREDITS_ENABLED = ORIGINAL_FLAG;
  }
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const user = await store.createUser({
    email: 'deployer@example.com',
    name: 'Deployer',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Deploy Org', slug: 'deploy-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'deploy-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'Deploy Project', slug: 'deploy-project' });

  return { app, store, org, project };
}

const auth = { authorization: 'Bearer deploy-token' };

describe('deployment metering emitter', () => {
  it('meters a READY deployment exactly once (idempotent via lastMeteredAt)', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';
    const { app, store, org, project } = await setup();
    await store.recordCreditEntry({ organizationId: org.id, deltaCents: 100_000, kind: 'GRANT', reason: 'grant' });

    const deployment = await store.createDeployment({
      projectId: project.id,
      expectedOrganizationId: project.organizationId,
      provider: 'static',
      status: 'READY',
      url: 'https://example.test',
    });

    // First GET reconciles → meters + stamps lastMeteredAt.
    const first = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/deployments/${deployment.id}`,
      headers: auth,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().deployment.lastMeteredAt).toBeTruthy();
    const usageAfterFirst = await store.sumUsage(org.id, 'deployment.compute');
    expect(usageAfterFirst).toBe(1);

    // Second GET must NOT re-meter (idempotent).
    await app.inject({ method: 'GET', url: `/projects/${project.id}/deployments/${deployment.id}`, headers: auth });
    expect(await store.sumUsage(org.id, 'deployment.compute')).toBe(1);
  });

  it('records a usage event but debits nothing in SHADOW', async () => {
    delete (process.env as Record<string, string | undefined>).BILLING_CREDITS_ENABLED;
    const { app, store, org, project } = await setup();
    await store.recordCreditEntry({ organizationId: org.id, deltaCents: 100_000, kind: 'GRANT', reason: 'grant' });

    const deployment = await store.createDeployment({
      projectId: project.id,
      expectedOrganizationId: project.organizationId,
      provider: 'static',
      status: 'READY',
    });
    await app.inject({ method: 'GET', url: `/projects/${project.id}/deployments/${deployment.id}`, headers: auth });

    // Usage recorded, but wallet balance untouched (static deploy = $0 anyway, and SHADOW never debits).
    expect(await store.sumUsage(org.id, 'deployment.compute')).toBe(1);
    expect((await store.getCreditWallet(org.id))?.balanceCents).toBe(100_000);
  });
});
