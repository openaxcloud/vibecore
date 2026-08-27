import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The API tsconfig intentionally has no `~/` path alias; runtime ESM tests use package-relative imports.
// eslint-disable-next-line no-restricted-imports
import { buildApiApp } from '../app.js';
// eslint-disable-next-line no-restricted-imports
import {
  deploymentAccessCookieName,
  deriveDeploymentAccessCookieSecret,
  hashDeploymentAccessTicket,
  normalizeDeploymentAccessMode,
  signDeploymentAccessCookie,
  verifyDeploymentAccessCookie,
} from '../deployment-access.js';
import { TestApiStore } from './test-api-store.js';

const ACCESS_SECRET = 'deployment-access-test-secret-with-at-least-32-bytes';
const PROXY_SECRET = 'preview-proxy-test-secret';
const PREVIEW_DOMAIN = 'preview.e-code.test';

describe('deployment access cryptographic contract', () => {
  it('fails unknown persisted modes closed and binds proofs to exact policy revision', () => {
    expect(normalizeDeploymentAccessMode(undefined)).toBe('INVITE_ONLY');
    expect(normalizeDeploymentAccessMode('public')).toBe('INVITE_ONLY');

    const secret = deriveDeploymentAccessCookieSecret(ACCESS_SECRET);

    const token = signDeploymentAccessCookie(secret, {
      version: 1,
      kind: 'PASSWORD',
      deploymentId: 'dep_1',
      policyVersion: 3,
      policyRevision: 'revision-a',
      expiresAtMs: Date.now() + 60_000,
    });
    expect(
      verifyDeploymentAccessCookie([secret], token, {
        deploymentId: 'dep_1',
        policyVersion: 3,
        policyRevision: 'revision-a',
      })?.kind,
    ).toBe('PASSWORD');
    expect(
      verifyDeploymentAccessCookie([secret], token, {
        deploymentId: 'dep_1',
        policyVersion: 4,
        policyRevision: 'revision-b',
      }),
    ).toBeUndefined();
  });

  it('domain-separates and hashes raw exchange tickets before persistence', () => {
    const raw = 'dep_access_raw-capability-never-store-this';
    expect(hashDeploymentAccessTicket(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDeploymentAccessTicket(raw)).not.toContain(raw);
  });
});

describe('deployment access API', () => {
  const original = {
    access: process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET,
    proxy: process.env.PREVIEW_PROXY_SHARED_SECRET,
    activation: process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED,
    domain: process.env.PREVIEW_DOMAIN,
  };

  beforeEach(() => {
    process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET = ACCESS_SECRET;
    process.env.PREVIEW_PROXY_SHARED_SECRET = PROXY_SECRET;
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = 'true';
    process.env.PREVIEW_DOMAIN = PREVIEW_DOMAIN;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries({
      DEPLOYMENT_ACCESS_TOKEN_SECRET: original.access,
      PREVIEW_PROXY_SHARED_SECRET: original.proxy,
      DEPLOYMENT_ACCESS_ACTIVATION_ENABLED: original.activation,
      PREVIEW_DOMAIN: original.domain,
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ store });

    const owner = await store.createUser({
      email: 'owner-access@example.com',
      name: 'Access Owner',
      passwordHash: hashPassword('password123'),
    });
    const outsider = await store.createUser({
      email: 'outsider-access@example.com',
      name: 'Outsider',
      passwordHash: hashPassword('password123'),
    });

    const org = await store.createOrganization({ name: 'Access Org', slug: 'access-org', ownerUserId: owner.id });

    const otherOrg = await store.createOrganization({
      name: 'Other Org',
      slug: 'other-org',
      ownerUserId: outsider.id,
    });

    const project = await store.createProject({ organizationId: org.id, name: 'Access app', slug: 'access-app' });

    const otherProject = await store.createProject({
      organizationId: otherOrg.id,
      name: 'Other app',
      slug: 'other-app',
    });
    await store.createSession({
      userId: owner.id,
      token: 'owner-access-token',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await store.createSession({
      userId: outsider.id,
      token: 'outsider-access-token',
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const deployment = await store.createDeployment({
      projectId: project.id,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      accessPolicy: { mode: 'PUBLIC', createdByUserId: owner.id },
    });
    await store.updateDeployment(project.id, deployment.id, {
      url: `https://s-${deployment.id}.${PREVIEW_DOMAIN}/`,
    });
    await store.createReleaseManifest({
      projectId: project.id,
      deploymentId: deployment.id,
      environment: 'preview',
      version: 1,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${deployment.id}`,
      artifactDigest: 'a'.repeat(64),
      accessPolicyVersion: deployment.accessPolicyVersion,
    });

    return { app, store, owner, outsider, project, otherProject, deployment };
  }

  const proxyHeaders = { authorization: `Bearer ${PROXY_SECRET}` };

  it('rotates password proofs, never returns hashes, and locks corrupt policy pointers', async () => {
    const { app, store, project, deployment } = await setup();

    try {
      const changed = await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/deployments/${deployment.id}/access`,
        headers: { authorization: 'Bearer owner-access-token' },
        payload: { mode: 'PASSWORD_PROTECTED', password: 'correct-horse-battery', expectedVersion: 1 },
      });
      expect(changed.statusCode).toBe(200);
      expect(changed.body).not.toContain('passwordHash');

      const blocked = await app.inject({
        method: 'GET',
        url: `/internal/deployments/${deployment.id}/access/verdict`,
        headers: proxyHeaders,
      });
      expect(blocked.json()).toMatchObject({ decision: 'password-required', mode: 'PASSWORD_PROTECTED' });

      const password = await app.inject({
        method: 'POST',
        url: `/internal/deployments/${deployment.id}/access/password`,
        headers: proxyHeaders,
        payload: { password: 'correct-horse-battery' },
      });
      expect(password.statusCode).toBe(204);

      const oldCookie = password.cookies.find((entry) => entry.name === deploymentAccessCookieName(deployment.id));
      expect(oldCookie?.httpOnly).toBe(true);

      const allowed = await app.inject({
        method: 'GET',
        url: `/internal/deployments/${deployment.id}/access/verdict`,
        headers: { ...proxyHeaders, 'x-vibecore-deployment-access-cookie': oldCookie!.value },
      });
      expect(allowed.json().decision).toBe('allow');

      const rotated = await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/deployments/${deployment.id}/access`,
        headers: { authorization: 'Bearer owner-access-token' },
        payload: { mode: 'PASSWORD_PROTECTED', password: 'a-new-strong-password', expectedVersion: 2 },
      });
      expect(rotated.statusCode).toBe(200);

      const oldAfterRotation = await app.inject({
        method: 'GET',
        url: `/internal/deployments/${deployment.id}/access/verdict`,
        headers: { ...proxyHeaders, 'x-vibecore-deployment-access-cookie': oldCookie!.value },
      });
      expect(oldAfterRotation.json().decision).toBe('password-required');

      store.deploymentAccessPolicies.splice(0, store.deploymentAccessPolicies.length);

      const corrupt = await app.inject({
        method: 'GET',
        url: `/internal/deployments/${deployment.id}/access/verdict`,
        headers: proxyHeaders,
      });
      expect(corrupt.json()).toMatchObject({ decision: 'locked', mode: 'INVITE_ONLY' });
    } finally {
      await app.close();
    }
  });

  it('uses one-shot body tickets, rejects replay, and prevents cross-tenant issuance', async () => {
    const { app, project, deployment } = await setup();

    try {
      const changed = await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/deployments/${deployment.id}/access`,
        headers: { authorization: 'Bearer owner-access-token' },
        payload: { mode: 'INVITE_ONLY', expectedVersion: 1 },
      });
      expect(changed.statusCode).toBe(200);

      const outsider = await app.inject({
        method: 'POST',
        url: `/deployment-access/${deployment.id}/ticket`,
        headers: { authorization: 'Bearer outsider-access-token' },
      });
      expect(outsider.statusCode).toBe(403);

      const issued = await app.inject({
        method: 'POST',
        url: `/deployment-access/${deployment.id}/ticket`,
        headers: { authorization: 'Bearer owner-access-token' },
      });
      expect(issued.statusCode).toBe(200);

      const ticket = issued.json().ticket as string;
      expect(issued.json().exchangeUrl).not.toContain(ticket);

      const exchanged = await app.inject({
        method: 'POST',
        url: `/internal/deployments/${deployment.id}/access/exchange`,
        headers: proxyHeaders,
        payload: { ticket },
      });
      expect(exchanged.statusCode).toBe(204);
      expect(exchanged.headers['cache-control']).toContain('no-store');

      const replay = await app.inject({
        method: 'POST',
        url: `/internal/deployments/${deployment.id}/access/exchange`,
        headers: proxyHeaders,
        payload: { ticket },
      });
      expect(replay.statusCode).toBe(409);
      expect(replay.json().code).toBe('DEPLOYMENT_ACCESS_TICKET_REPLAYED');
    } finally {
      await app.close();
    }
  });

  it('revalidates active workspace membership and invite collaborators on every private request', async () => {
    const { app, store, owner, project, deployment } = await setup();

    try {
      const member = await store.createUser({
        email: 'member-access@example.com',
        name: 'Access Member',
        passwordHash: hashPassword('password123'),
      });

      const organizationId = project.organizationId;
      await store.addMember({ organizationId, userId: member.id, roleKey: 'member', invitedByUserId: owner.id });
      await store.createSession({
        userId: member.id,
        token: 'member-access-token',
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const workspacePolicy = await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/deployments/${deployment.id}/access`,
        headers: { authorization: 'Bearer owner-access-token' },
        payload: { mode: 'WORKSPACE_ONLY', expectedVersion: 1 },
      });
      expect(workspacePolicy.statusCode).toBe(200);

      const issued = await app.inject({
        method: 'POST',
        url: `/deployment-access/${deployment.id}/ticket`,
        headers: { authorization: 'Bearer member-access-token' },
      });
      expect(issued.statusCode).toBe(200);

      const exchanged = await app.inject({
        method: 'POST',
        url: `/internal/deployments/${deployment.id}/access/exchange`,
        headers: proxyHeaders,
        payload: { ticket: issued.json().ticket },
      });

      const userCookie = exchanged.cookies.find((entry) => entry.name === deploymentAccessCookieName(deployment.id));
      expect(userCookie?.value).toBeTruthy();

      const allowed = await app.inject({
        method: 'GET',
        url: `/internal/deployments/${deployment.id}/access/verdict`,
        headers: { ...proxyHeaders, 'x-vibecore-deployment-access-cookie': userCookie!.value },
      });
      expect(allowed.json().decision).toBe('allow');

      await store.removeMember(organizationId, member.id);

      const revokedMembership = await app.inject({
        method: 'GET',
        url: `/internal/deployments/${deployment.id}/access/verdict`,
        headers: { ...proxyHeaders, 'x-vibecore-deployment-access-cookie': userCookie!.value },
      });
      expect(revokedMembership.json().decision).toBe('sign-in-required');

      const invitePolicy = await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/deployments/${deployment.id}/access`,
        headers: { authorization: 'Bearer owner-access-token' },
        payload: { mode: 'INVITE_ONLY', expectedVersion: 2 },
      });
      expect(invitePolicy.statusCode).toBe(200);

      await store.addProjectCollaborator({ projectId: project.id, userId: member.id, roleKey: 'viewer' });

      const collaboratorTicket = await app.inject({
        method: 'POST',
        url: `/deployment-access/${deployment.id}/ticket`,
        headers: { authorization: 'Bearer member-access-token' },
      });
      expect(collaboratorTicket.statusCode).toBe(200);

      await store.removeProjectCollaborator({ projectId: project.id, userId: member.id });

      const revokedCollaborator = await app.inject({
        method: 'POST',
        url: `/deployment-access/${deployment.id}/ticket`,
        headers: { authorization: 'Bearer member-access-token' },
      });
      expect(revokedCollaborator.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('refuses manifests that do not pin the deployment exact access policy', async () => {
    const { app, store, project, deployment } = await setup();

    try {
      await expect(
        store.createReleaseManifest({
          projectId: project.id,
          deploymentId: deployment.id,
          environment: deployment.environment,
          version: 2,
          provider: 'static',
          artifactKind: 'static-snapshot',
          artifactRef: `static-deployments/${deployment.id}`,
          artifactDigest: 'b'.repeat(64),
          accessPolicyVersion: deployment.accessPolicyVersion + 1,
        }),
      ).rejects.toMatchObject({ code: 'RELEASE_ACCESS_POLICY_INVALID' });
    } finally {
      await app.close();
    }
  });

  it('never posts a private ticket to a lookalike deployment hostname', async () => {
    const { app, store, owner, project } = await setup();

    try {
      const lookalike = await store.createDeployment({
        projectId: project.id,
        provider: 'static',
        environment: 'preview',
        status: 'READY',
        accessPolicy: { mode: 'INVITE_ONLY', createdByUserId: owner.id },
      });
      await store.updateDeployment(project.id, lookalike.id, {
        url: `https://s-${lookalike.id}.attacker.${PREVIEW_DOMAIN}/`,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/deployment-access/${lookalike.id}/ticket`,
        headers: { authorization: 'Bearer owner-access-token' },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('DEPLOYMENT_ACCESS_ORIGIN_INVALID');
    } finally {
      await app.close();
    }
  });

  it('refuses protected-policy creation while serving edges are in mixed rollout', async () => {
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = 'false';

    const { app, project, deployment } = await setup();

    try {
      const response = await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/deployments/${deployment.id}/access`,
        headers: { authorization: 'Bearer owner-access-token' },
        payload: { mode: 'WORKSPACE_ONLY', expectedVersion: 1 },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('DEPLOYMENT_ACCESS_ROLLOUT_NOT_ACTIVE');
    } finally {
      await app.close();
    }
  });
});
