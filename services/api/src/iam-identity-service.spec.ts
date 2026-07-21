import { describe, expect, it } from 'vitest';
import { createInMemoryCloudGovernanceStore, FakeGcpCloudClient } from './cloud-governance-fakes.js';
import {
  auditPersistentKeys,
  ensureBuildIdentity,
  ensurePromotionIdentity,
  ensureRuntimeIdentity,
  MAX_IMPERSONATION_LIFETIME_SECONDS,
  recordImpersonation,
  serviceAccountIdForBoundary,
  verifyIdentitySeparation,
} from './iam-identity-service.js';

const BOUNDARY = {
  app: 'demo-app',
  environment: 'production',
  privilegeBoundary: 'app-runtime',
  gcpProjectId: 'pj-iam',
};

function setup() {
  const store = createInMemoryCloudGovernanceStore();
  const gcp = new FakeGcpCloudClient();
  gcp.seedProject('pj-iam');

  return { store, gcp };
}

describe('I-IAM-1 — RuntimeIdentity is reused by revisions, never minted per deployment', () => {
  it('two successive revisions acquire ONE identity: one SA created, not two', async () => {
    const { store, gcp } = setup();

    const first = await ensureRuntimeIdentity(store, gcp, BOUNDARY);
    const second = await ensureRuntimeIdentity(store, gcp, BOUNDARY);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.identity.id).toBe(first.identity.id);
    expect(second.identity.gcpServiceAccountEmail).toBe(first.identity.gcpServiceAccountEmail);
    expect(second.identity.revisionsServed).toBe(2);

    // The control plane saw exactly ONE service-account creation.
    expect(gcp.createdServiceAccountCount).toBe(1);
    expect(await gcp.listServiceAccounts('pj-iam')).toHaveLength(1);
  });

  it('a DIFFERENT privilege boundary is a DIFFERENT identity (boundaries, not revisions)', async () => {
    const { store, gcp } = setup();

    await ensureRuntimeIdentity(store, gcp, BOUNDARY);
    const other = await ensureRuntimeIdentity(store, gcp, { ...BOUNDARY, privilegeBoundary: 'app-jobs' });

    expect(other.created).toBe(true);
    expect(gcp.createdServiceAccountCount).toBe(2);
  });

  it('refuses an incomplete boundary — a per-deployment identity has no shape here', async () => {
    const { store, gcp } = setup();

    await expect(ensureRuntimeIdentity(store, gcp, { ...BOUNDARY, app: '' })).rejects.toMatchObject({
      code: 'IAM_BOUNDARY_INCOMPLETE',
    });
    await expect(ensureRuntimeIdentity(store, gcp, { ...BOUNDARY, environment: '' })).rejects.toMatchObject({
      code: 'IAM_BOUNDARY_INCOMPLETE',
    });
  });

  it('adopts the existing SA (deterministic id) instead of minting a second one when the DB row was lost', async () => {
    const { store, gcp } = setup();

    const first = await ensureRuntimeIdentity(store, gcp, BOUNDARY);
    store.identities.clear(); // simulate DB loss

    const again = await ensureRuntimeIdentity(store, gcp, BOUNDARY);
    expect(again.identity.gcpServiceAccountEmail).toBe(first.identity.gcpServiceAccountEmail);
    expect(gcp.createdServiceAccountCount).toBe(1);
  });

  it('service-account ids are deterministic, ≤30 chars and letter-led', () => {
    const id = serviceAccountIdForBoundary({ kind: 'RUNTIME', ...BOUNDARY });
    expect(id).toBe(serviceAccountIdForBoundary({ kind: 'RUNTIME', ...BOUNDARY }));
    expect(id.length).toBeLessThanOrEqual(30);
    expect(id).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
  });
});

describe('I-IAM-2 — zero persistent keys', () => {
  it('an out-of-band USER_MANAGED key flips the identity into violation on next acquisition', async () => {
    const { store, gcp } = setup();

    const { identity } = await ensureRuntimeIdentity(store, gcp, BOUNDARY);
    gcp.projects
      .get('pj-iam')!
      .serviceAccounts.get(identity.gcpServiceAccountEmail)!
      .keys.push({ name: 'keys/rogue', keyType: 'USER_MANAGED' });

    await expect(ensureRuntimeIdentity(store, gcp, BOUNDARY)).rejects.toMatchObject({
      code: 'IAM_PERSISTENT_KEY_FORBIDDEN',
    });

    // The drift is recorded on the identity row, not just thrown away.
    const audit = await auditPersistentKeys(store, gcp, 'pj-iam');
    expect(audit).toHaveLength(1);
    expect(audit[0].persistentKeys).toBe(1);
  });

  it('SYSTEM_MANAGED (Google-rotated) keys are not violations', async () => {
    const { store, gcp } = setup();

    const { identity } = await ensureRuntimeIdentity(store, gcp, BOUNDARY);
    gcp.projects
      .get('pj-iam')!
      .serviceAccounts.get(identity.gcpServiceAccountEmail)!
      .keys.push({ name: 'keys/google', keyType: 'SYSTEM_MANAGED' });

    const again = await ensureRuntimeIdentity(store, gcp, BOUNDARY);
    expect(again.identity.persistentKeys).toBe(0);
  });

  it('caps impersonation lifetimes at 1h and refuses non-positive ones', async () => {
    const { store, gcp } = setup();
    const { identity } = await ensureRuntimeIdentity(store, gcp, BOUNDARY);

    await expect(
      recordImpersonation(store, {
        identityId: identity.id,
        actorPrincipal: 'serviceAccount:control-plane@platform.iam.gserviceaccount.com',
        purpose: 'deploy revision',
        tokenLifetimeSeconds: MAX_IMPERSONATION_LIFETIME_SECONDS + 1,
      }),
    ).rejects.toMatchObject({ code: 'IAM_IMPERSONATION_LIFETIME' });

    await recordImpersonation(store, {
      identityId: identity.id,
      actorPrincipal: 'serviceAccount:control-plane@platform.iam.gserviceaccount.com',
      purpose: 'deploy revision',
      tokenLifetimeSeconds: 600,
    });

    expect(await store.listImpersonations(identity.id)).toHaveLength(1);
  });
});

describe('I-IAM-3 — build cannot promote, promotion cannot build', () => {
  it('reports violations from the LIVE policy and passes a clean separation', async () => {
    const { store, gcp } = setup();

    const build = await ensureBuildIdentity(store, gcp, 'pj-iam');
    const promotion = await ensurePromotionIdentity(store, gcp, 'pj-iam');

    const project = gcp.projects.get('pj-iam')!;
    project.policy.bindings = [
      { role: 'roles/artifactregistry.writer', members: [`serviceAccount:${build.identity.gcpServiceAccountEmail}`] },
      { role: 'roles/run.admin', members: [`serviceAccount:${promotion.identity.gcpServiceAccountEmail}`] },
    ];

    // Clean split: no violations.
    expect(await verifyIdentitySeparation(store, gcp, 'pj-iam')).toEqual([]);

    // Build gains a promote-capable role → violation.
    project.policy.bindings.push({
      role: 'roles/run.admin',
      members: [`serviceAccount:${build.identity.gcpServiceAccountEmail}`],
    });

    // Promotion gains a build-capable role → violation.
    project.policy.bindings.push({
      role: 'roles/cloudbuild.builds.editor',
      members: [`serviceAccount:${promotion.identity.gcpServiceAccountEmail}`],
    });

    const violations = await verifyIdentitySeparation(store, gcp, 'pj-iam');
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.reason)).toEqual([
      expect.stringContaining('BuildIdentity must not be able to promote'),
      expect.stringContaining('PromotionIdentity must not be able to build'),
    ]);
  });

  it('BUILD and PROMOTION are singletons per project with distinct SAs', async () => {
    const { store, gcp } = setup();

    const build1 = await ensureBuildIdentity(store, gcp, 'pj-iam');
    const build2 = await ensureBuildIdentity(store, gcp, 'pj-iam');
    const promotion = await ensurePromotionIdentity(store, gcp, 'pj-iam');

    expect(build2.created).toBe(false);
    expect(build2.identity.id).toBe(build1.identity.id);
    expect(promotion.identity.gcpServiceAccountEmail).not.toBe(build1.identity.gcpServiceAccountEmail);
    expect(gcp.createdServiceAccountCount).toBe(2);
  });
});
