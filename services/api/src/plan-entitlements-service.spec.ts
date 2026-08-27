import { beforeEach, describe, expect, it } from 'vitest';
import { TestApiStore } from './tests/test-api-store.js';
import {
  addProjectCollaboratorWithEntitlements,
  claimPlanEgressAllowance,
  readDeploymentPlanEntitlementsPin,
  resolveDeploymentPlanEntitlementsPin,
  resolveOrganizationEntitlements,
  PARALLEL_AGENTS_OVERRIDE_KEY,
} from './plan-entitlements-service.js';

describe('resolveOrganizationEntitlements', () => {
  let store: TestApiStore;
  let organizationId: string;

  beforeEach(async () => {
    store = new TestApiStore();
    const owner = await store.createUser({
      email: `owner-${crypto.randomUUID()}@example.test`,
      passwordHash: 'hash',
    });
    const organization = await store.createOrganization({
      name: 'Entitlements',
      slug: `entitlements-${crypto.randomUUID()}`,
      ownerUserId: owner.id,
    });
    organizationId = organization.id;
  });

  async function subscribe(key: 'free' | 'starter' | 'pro' | 'core' | 'team' | 'enterprise', monthlyCents: number) {
    await store.upsertBillingPlan({ key, name: key, monthlyCents, limits: {} });
    await store.upsertSubscription({ organizationId, planKey: key, status: 'ACTIVE' });
  }

  function thrownCode(operation: () => unknown): string | undefined {
    try {
      operation();
      return undefined;
    } catch (error) {
      return (error as { code?: string }).code;
    }
  }

  it('defaults an org without an entitled subscription to Starter', async () => {
    await expect(resolveOrganizationEntitlements(store, organizationId)).resolves.toMatchObject({
      plan: 'starter',
      viewers: 0,
      parallelAgents: 1,
    });
  });

  it('uses key+price and downgrades an inconsistent row without escalation', async () => {
    await subscribe('pro', 2_900);
    await expect(resolveOrganizationEntitlements(store, organizationId)).resolves.toMatchObject({
      plan: 'core',
      viewers: 0,
      parallelAgents: 2,
    });

    await store.upsertBillingPlan({ key: 'pro', name: 'corrupt', monthlyCents: 9_999, limits: {} });
    await expect(resolveOrganizationEntitlements(store, organizationId)).resolves.toMatchObject({
      plan: 'starter',
      viewers: 0,
      parallelAgents: 1,
    });
  });

  it('applies only valid Enterprise parallel and org-scoped provisioning overrides', async () => {
    await subscribe('enterprise', 0);
    await store.createQuotaOverride({
      organizationId,
      key: PARALLEL_AGENTS_OVERRIDE_KEY,
      limit: 7,
      reason: 'contract',
    });
    await store.setFeatureFlag({
      organizationId,
      key: 'entitlement.enterprise.security-center',
      enabled: true,
    });
    await store.setFeatureFlag({
      organizationId,
      key: 'entitlement.publishRegion.eu-west-1',
      enabled: true,
    });
    // A global flag is intentionally ignored for tenant provisioning.
    await store.setFeatureFlag({ key: 'entitlement.enterprise.vpc-peering', enabled: true });

    await expect(resolveOrganizationEntitlements(store, organizationId)).resolves.toMatchObject({
      plan: 'enterprise',
      parallelAgents: 7,
      provisionedEnterpriseCapabilities: ['security-center'],
      customPublishRegions: ['eu-west-1'],
    });
  });

  it('expires Enterprise parallel overrides against the authoritative store clock', async () => {
    await subscribe('enterprise', 0);
    const databaseNow = Date.parse('2026-08-27T12:00:00.000Z');
    store.databaseClockNowMs = databaseNow;
    await store.createQuotaOverride({
      organizationId,
      key: PARALLEL_AGENTS_OVERRIDE_KEY,
      limit: 6,
      reason: 'time-bounded contract',
      expiresAt: new Date(databaseNow + 30_000),
    });

    await expect(resolveOrganizationEntitlements(store, organizationId)).resolves.toMatchObject({
      parallelAgents: 6,
    });

    // Move only the database authority beyond expiry. Process time is
    // intentionally unrelated, mirroring skewed API pods.
    store.databaseClockNowMs = databaseNow + 30_001;
    await expect(resolveOrganizationEntitlements(store, organizationId)).resolves.toMatchObject({
      parallelAgents: 10,
    });
  });

  it('uses canonical Plan.monthlyCents for an annual subscription identity', async () => {
    await store.upsertBillingPlan({
      key: 'pro',
      name: 'Pro annual',
      monthlyCents: 10_000,
      limits: {},
      stripePriceAnnualId: 'price_pro_annual',
    });
    await store.upsertSubscription({
      organizationId,
      planKey: 'pro',
      status: 'ACTIVE',
      currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
    });

    await expect(resolveOrganizationEntitlements(store, organizationId)).resolves.toMatchObject({
      plan: 'pro',
      viewers: 50,
      parallelAgents: 10,
    });
  });

  it('enforces viewer 0 / 0 / 50 / unlimited and serializes the last Pro slot', async () => {
    const project = await store.createProject({
      organizationId,
      name: 'Viewer project',
      slug: 'viewer-project',
    });
    const users = await Promise.all(
      Array.from({ length: 52 }, (_, index) =>
        store.createUser({
          email: `viewer-${index}-${crypto.randomUUID()}@example.test`,
          passwordHash: 'hash',
        }),
      ),
    );

    const claim = (userId: string) =>
      addProjectCollaboratorWithEntitlements({ store, project, userId, roleKey: 'viewer' });

    await subscribe('free', 0);
    await expect(claim(users[0]!.id)).resolves.toMatchObject({ allowed: false, limit: 0 });

    await subscribe('core', 2_500);
    await expect(claim(users[0]!.id)).resolves.toMatchObject({ allowed: false, limit: 0 });

    await subscribe('pro', 10_000);
    for (const user of users.slice(0, 49)) {
      await expect(claim(user.id)).resolves.toMatchObject({ allowed: true });
    }
    const contenders = await Promise.all([claim(users[49]!.id), claim(users[50]!.id)]);
    expect(contenders.filter((result) => result.allowed)).toHaveLength(1);
    expect(contenders.filter((result) => !result.allowed)).toHaveLength(1);
    expect(await store.listActiveOrganizationViewerUserIds(organizationId)).toHaveLength(50);

    await subscribe('enterprise', 0);
    await expect(claim(users[51]!.id)).resolves.toMatchObject({ allowed: true });
    expect(await store.listActiveOrganizationViewerUserIds(organizationId)).toHaveLength(51);
  });

  it('atomically splits concurrent Starter egress at 10 GiB and deduplicates references', async () => {
    await subscribe('free', 0);
    const [first, second] = await Promise.all([
      claimPlanEgressAllowance({
        store,
        organizationId,
        egressGib: 6,
        reference: 'egress-a',
        deploymentKind: 'static',
      }),
      claimPlanEgressAllowance({
        store,
        organizationId,
        egressGib: 6,
        reference: 'egress-b',
        deploymentKind: 'scheduled',
      }),
    ]);

    expect(first.includedMib + second.includedMib).toBe(10 * 1_024);
    expect(first.billableMib + second.billableMib).toBe(2 * 1_024);
    expect(await store.sumUsage(organizationId, 'deployment.egressMib')).toBe(12 * 1_024);

    const retry = await claimPlanEgressAllowance({
      store,
      organizationId,
      egressGib: 6,
      reference: 'egress-a',
      deploymentKind: 'static',
    });
    expect(retry.deduplicated).toBe(true);
    expect(await store.sumUsage(organizationId, 'deployment.egressMib')).toBe(12 * 1_024);

    // Plan/version is receipt output, never part of the producer idempotency
    // payload. A response lost during an upgrade must replay the original split.
    await subscribe('core', 2_500);
    await expect(
      claimPlanEgressAllowance({
        store,
        organizationId,
        egressGib: 6,
        reference: 'egress-a',
        deploymentKind: 'static',
      }),
    ).resolves.toMatchObject({ deduplicated: true, plan: 'starter', includedMib: first.includedMib });

    await expect(
      claimPlanEgressAllowance({
        store,
        organizationId,
        egressGib: 7,
        reference: 'egress-a',
        deploymentKind: 'static',
      }),
    ).rejects.toMatchObject({ code: 'PLAN_EGRESS_IDEMPOTENCY_CONFLICT', statusCode: 409 });
    await expect(
      claimPlanEgressAllowance({
        store,
        organizationId,
        egressGib: 6,
        reference: 'egress-a',
        deploymentKind: 'autoscale',
      }),
    ).rejects.toMatchObject({ code: 'PLAN_EGRESS_IDEMPOTENCY_CONFLICT', statusCode: 409 });
  });

  it('applies Core 100 GiB but invents no Pro allowance', async () => {
    await subscribe('core', 2_500);
    await expect(
      claimPlanEgressAllowance({
        store,
        organizationId,
        egressGib: 101,
        reference: 'core-egress',
        deploymentKind: 'autoscale',
      }),
    ).resolves.toMatchObject({
      includedMib: 100 * 1_024,
      billableMib: 1 * 1_024,
      plan: 'core',
    });
  });

  it('bills all observed Pro egress when no allowance is published', async () => {
    await subscribe('pro', 10_000);
    await expect(
      claimPlanEgressAllowance({
        store,
        organizationId,
        egressGib: 3.5,
        reference: 'pro-egress',
        deploymentKind: 'reserved-vm',
      }),
    ).resolves.toMatchObject({ includedMib: 0, billableMib: 3.5 * 1_024, plan: 'pro' });
  });

  it('pins badge and publication-region admission to the exact entitlement version', async () => {
    const starter = await resolveOrganizationEntitlements(store, organizationId);
    expect(
      thrownCode(() =>
        resolveDeploymentPlanEntitlementsPin({
          entitlements: starter,
          providerSupportedRegions: ['eu-west-1', 'us-east-1'],
          removeBrandingBadge: true,
        }),
      ),
    ).toBe('PUBLISH_BADGE_REQUIRED');
    expect(
      thrownCode(() =>
        resolveDeploymentPlanEntitlementsPin({
          entitlements: starter,
          providerSupportedRegions: ['eu-west-1', 'us-east-1'],
          requestedRegion: 'us-east-1',
        }),
      ),
    ).toBe('PUBLISH_REGION_PLAN_RESTRICTED');

    const starterPin = resolveDeploymentPlanEntitlementsPin({
      entitlements: starter,
      providerSupportedRegions: ['eu-west-1', 'us-east-1'],
    });
    expect(starterPin).toMatchObject({
      version: '2026-08-27.1',
      plan: 'starter',
      badgeRequired: true,
      publishRegion: 'eu-west-1',
      publishRegions: 'single',
    });
    expect(readDeploymentPlanEntitlementsPin({ planEntitlements: starterPin })).toEqual(starterPin);
    expect(
      readDeploymentPlanEntitlementsPin({
        planEntitlements: { ...starterPin, version: 'future-unreviewed-contract', badgeRequired: false },
      }),
    ).toBeNull();

    await subscribe('core', 2_500);
    const core = await resolveOrganizationEntitlements(store, organizationId);
    expect(
      resolveDeploymentPlanEntitlementsPin({
        entitlements: core,
        providerSupportedRegions: ['eu-west-1', 'us-east-1'],
        requestedRegion: 'us-east-1',
        removeBrandingBadge: true,
      }),
    ).toMatchObject({ plan: 'core', badgeRequired: false, publishRegion: 'us-east-1', publishRegions: 'all' });
  });
});
