import { hashPassword } from '@vibecore/auth';
import { PLAN_ENTITLEMENTS_VERSION } from '@vibecore/billing';
import { encryptJson } from '@vibecore/security';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The API tsconfig intentionally has no `~/` path alias; runtime ESM tests use package-relative imports.
// eslint-disable-next-line no-restricted-imports
import { buildApiApp, type ApiAppOptions } from '../app.js';
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
import { deterministicServerReleaseFixture } from './deterministic-release-fixture.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';

const ACCESS_SECRET = 'deployment-access-test-secret-with-at-least-32-bytes';
const PROXY_SECRET = 'preview-proxy-test-secret';
const PREVIEW_DOMAIN = 'preview.e-code.test';
const RELEASE_PLAN_ENTITLEMENTS = {
  version: PLAN_ENTITLEMENTS_VERSION,
  plan: 'starter' as const,
  badgeRequired: true,
  publishRegion: 'platform-default',
  publishRegions: 'single' as const,
};

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

  async function setup(options: ApiAppOptions = {}) {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, ...options });

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
    const projectManifest = await store.getLatestProjectManifest(project.id);
    if (!projectManifest) throw new Error('Expected the access fixture project manifest');

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
      metadata: {
        planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
        projectManifestDigest: projectManifest.digest,
      },
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
      artifactRef: `static-artifacts/sha256/${'a'.repeat(64)}`,
      artifactDigest: `sha256:${'a'.repeat(64)}`,
      accessPolicyVersion: deployment.accessPolicyVersion,
      planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
      projectManifestDigest: projectManifest.digest,
    });

    return { app, store, owner, outsider, project, projectManifest, otherProject, deployment };
  }

  const proxyHeaders = { authorization: `Bearer ${PROXY_SECRET}` };

  it('refuses a policy-only server release when the effective database ledger advanced past its source pin', async () => {
    const ledgerA = `sha256:${'1'.repeat(64)}`;
    const ledgerB = `sha256:${'2'.repeat(64)}`;
    let observedLedger = ledgerA;
    const { app, store, owner, project, projectManifest } = await setup({
      migrationLedgerInspector: async () => ({ status: 'EXACT', digest: observedLedger, entries: 1 }),
    });

    try {
      const deployment = await store.createDeployment({
        projectId: project.id,
        provider: 'server',
        environment: 'preview',
        status: 'BUILDING',
        machineSize: 'shared-0.5',
        accessPolicy: { mode: 'PUBLIC', createdByUserId: owner.id },
        metadata: {
          planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
          projectManifestDigest: projectManifest.digest,
        },
      });
      const pins = deterministicServerReleaseFixture({
        organizationId: project.organizationId,
        projectId: project.id,
        projectManifestDigest: projectManifest.digest,
        accessPolicyVersion: deployment.accessPolicyVersion,
        artifactRef: 'registry.example.test/access-policy-server',
        artifactDigest: `sha256:${'3'.repeat(64)}`,
        database: { mode: 'exact-ledger', ledgerDigest: ledgerA },
        planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
      });
      const staged = await store.updateDeployment(project.id, deployment.id, {
        metadata: {
          ...(deployment.metadata as Record<string, unknown>),
          serverDeploy: {
            image: {
              imageRef: 'registry.example.test/access-policy-server',
              imageDigest: `sha256:${'3'.repeat(64)}`,
            },
            promotion: pins.promotion,
            rollbackRuntimeSpec: pins.runtimeSpec,
          },
        },
      });
      const releaseFence = await acquireTestProjectReleaseFence(store, {
        projectId: project.id,
        organizationId: project.organizationId,
        operationId: 'fixture:deployment-access-db-pin',
      });
      await store.commitServerImageRelease({
        projectId: project.id,
        organizationId: project.organizationId,
        deploymentId: deployment.id,
        environment: 'preview',
        artifactRef: 'registry.example.test/access-policy-server',
        artifactDigest: `sha256:${'3'.repeat(64)}`,
        dbMigrationPoint: ledgerA,
        runtimeSpec: pins.runtimeSpec,
        promotionEvidence: pins.promotionEvidence,
        url: `https://d-${deployment.id}.${PREVIEW_DOMAIN}`,
        previewUrl: `https://d-${deployment.id}.${PREVIEW_DOMAIN}`,
        metadata: staged.metadata as Record<string, unknown>,
        logs: [],
        finishedAt: new Date().toISOString(),
        releaseFence: releaseFence.releaseFence,
      });
      await releaseFence.release();
      await store.upsertProjectSecret({
        projectId: project.id,
        expectedOrganizationId: project.organizationId,
        key: 'DATABASE_URL',
        valueEncrypted: encryptJson({ value: 'postgres://user:password@database.test/app' }),
      });

      const manifestCount = (await store.listReleaseManifests(project.id, 'preview')).length;
      const policyCount = store.deploymentAccessPolicies.length;
      observedLedger = ledgerB;
      const refused = await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/deployments/${deployment.id}/access`,
        headers: { authorization: 'Bearer owner-access-token' },
        payload: { mode: 'WORKSPACE_ONLY', expectedVersion: deployment.accessPolicyVersion },
      });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ code: 'ROLLBACK_DB_LEDGER_MISMATCH' });
      expect(await store.listReleaseManifests(project.id, 'preview')).toHaveLength(manifestCount);
      expect(store.deploymentAccessPolicies).toHaveLength(policyCount);
      expect((await store.getDeployment(project.id, deployment.id))?.accessPolicyVersion).toBe(
        deployment.accessPolicyVersion,
      );

      observedLedger = ledgerA;
      const accepted = await app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/deployments/${deployment.id}/access`,
        headers: { authorization: 'Bearer owner-access-token' },
        payload: { mode: 'WORKSPACE_ONLY', expectedVersion: deployment.accessPolicyVersion },
      });
      expect(accepted.statusCode).toBe(200);
      const latest = (await store.listReleaseManifests(project.id, 'preview'))[0]!;
      expect(latest.dbMigrationPoint).toBe(ledgerA);
      expect(latest.accessPolicyVersion).toBe(deployment.accessPolicyVersion + 1);
    } finally {
      await app.close();
    }
  });

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

      await store.addProjectCollaborator({
        projectId: project.id,
        expectedOrganizationId: organizationId,
        userId: member.id,
        roleKey: 'viewer',
      });

      const collaboratorTicket = await app.inject({
        method: 'POST',
        url: `/deployment-access/${deployment.id}/ticket`,
        headers: { authorization: 'Bearer member-access-token' },
      });
      expect(collaboratorTicket.statusCode).toBe(200);

      await store.removeProjectCollaborator({
        projectId: project.id,
        expectedOrganizationId: organizationId,
        userId: member.id,
      });

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
    const { app, store, project, projectManifest, deployment } = await setup();

    try {
      await expect(
        store.createReleaseManifest({
          projectId: project.id,
          deploymentId: deployment.id,
          environment: deployment.environment,
          version: 2,
          provider: 'static',
          artifactKind: 'static-snapshot',
          artifactRef: `static-artifacts/sha256/${'b'.repeat(64)}`,
          artifactDigest: `sha256:${'b'.repeat(64)}`,
          accessPolicyVersion: deployment.accessPolicyVersion + 1,
          planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
          projectManifestDigest: projectManifest.digest,
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
        headers: { authorization: 'Bearer owner-access-token', 'accept-language': 'fr-FR, en;q=0.5' },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('DEPLOYMENT_ACCESS_ORIGIN_INVALID');
      expect(response.json().error).toBe('L’adresse dédiée du déploiement est indisponible.');
      expect(response.headers['content-language']).toBe('fr');
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
