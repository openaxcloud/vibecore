import { describe, expect, it } from 'vitest';

import {
  MIN_ACCOUNT_AGE_DAYS_FOR_TRUSTED,
  REPUTATION_TIER_POLICIES,
  REPUTATION_TIER_RANK,
  UNLIMITED_TIER_CAP,
  assertTenantActionContext,
  assertTenantAdmission,
  deriveReputationTier,
  evaluateTenantAdmission,
  isBindingUsable,
  policyForTier,
  resolveBillingAccountBinding,
  type BillingAccountBinding,
  type GuardedAction,
  type ReputationTier,
} from './tenant-guardrails.js';

/** A usable binding, so tests can isolate the axis they actually exercise. */
function boundBinding(tier: ReputationTier = 'VERIFIED'): BillingAccountBinding {
  return {
    organizationId: 'org-1',
    state: 'BOUND',
    provider: 'stripe',
    externalId: 'cus_123',
    billingAccountKey: policyForTier(tier).billingAccountKey,
  };
}

function unboundBinding(tier: ReputationTier = 'BASIC'): BillingAccountBinding {
  return {
    organizationId: 'org-1',
    state: 'UNBOUND',
    billingAccountKey: policyForTier(tier).billingAccountKey,
  };
}

describe('named multi-tenant contracts exist and are anchored', () => {
  it('defines all five reputation tiers in a strict trust order', () => {
    expect(Object.keys(REPUTATION_TIER_POLICIES)).toEqual(['UNTRUSTED', 'BASIC', 'VERIFIED', 'TRUSTED', 'FIRST_PARTY']);
    expect(REPUTATION_TIER_RANK.UNTRUSTED).toBeLessThan(REPUTATION_TIER_RANK.BASIC);
    expect(REPUTATION_TIER_RANK.TRUSTED).toBeLessThan(REPUTATION_TIER_RANK.FIRST_PARTY);
  });

  it('GCP-14: a DIFFERENT billing account per reputation tier', () => {
    const keys = Object.values(REPUTATION_TIER_POLICIES).map((p) => p.billingAccountKey);

    // untrusted+basic deliberately share the untrusted account; the rest are distinct.
    expect(new Set(keys).size).toBe(4);
    expect(REPUTATION_TIER_POLICIES.UNTRUSTED.billingAccountKey).not.toBe(
      REPUTATION_TIER_POLICIES.TRUSTED.billingAccountKey,
    );
    expect(REPUTATION_TIER_POLICIES.FIRST_PARTY.billingAccountKey).not.toBe(
      REPUTATION_TIER_POLICIES.UNTRUSTED.billingAccountKey,
    );
  });

  it('GCP-14: only first-party code lands in the first-party isolation folder', () => {
    expect(REPUTATION_TIER_POLICIES.FIRST_PARTY.isolationFolder).toBe('first-party');

    for (const tier of ['UNTRUSTED', 'BASIC', 'VERIFIED', 'TRUSTED'] as const) {
      expect(REPUTATION_TIER_POLICIES[tier].isolationFolder).toBe('untrusted');
    }
  });

  it('ceilings are monotonically non-decreasing with trust', () => {
    const order: ReputationTier[] = ['UNTRUSTED', 'BASIC', 'VERIFIED', 'TRUSTED', 'FIRST_PARTY'];

    for (let i = 1; i < order.length; i++) {
      const lower = REPUTATION_TIER_POLICIES[order[i - 1]];
      const higher = REPUTATION_TIER_POLICIES[order[i]];
      expect(higher.maxProjects).toBeGreaterThanOrEqual(lower.maxProjects);
      expect(higher.projectCreatesPerHour).toBeGreaterThanOrEqual(lower.projectCreatesPerHour);
      expect(higher.deploymentCreatesPerHour).toBeGreaterThanOrEqual(lower.deploymentCreatesPerHour);
    }
  });
});

describe('reputation tier derivation', () => {
  it('a brand-new unverified account is UNTRUSTED', () => {
    expect(deriveReputationTier({})).toBe('UNTRUSTED');
    expect(deriveReputationTier({ emailVerified: false, accountAgeDays: 400 })).toBe('UNTRUSTED');
  });

  it('a verified but unbound account is BASIC', () => {
    expect(deriveReputationTier({ emailVerified: true, accountAgeDays: 5 })).toBe('BASIC');
  });

  it('a day-one verified signup is already BASIC — no age gate below TRUSTED', () => {
    // Regression guard: an age gate here would cap every legitimate new signup
    // at the UNTRUSTED ceiling of 2 projects on their first day.
    expect(deriveReputationTier({ emailVerified: true, accountAgeDays: 0 })).toBe('BASIC');
  });

  it('verified + bound is VERIFIED; paid + aged is TRUSTED', () => {
    expect(deriveReputationTier({ emailVerified: true, accountAgeDays: 5, billingAccountBound: true })).toBe(
      'VERIFIED',
    );
    expect(
      deriveReputationTier({
        emailVerified: true,
        accountAgeDays: MIN_ACCOUNT_AGE_DAYS_FOR_TRUSTED,
        billingAccountBound: true,
        subscriptionActive: true,
      }),
    ).toBe('TRUSTED');
  });

  it('a paid subscription on a YOUNG account does NOT reach TRUSTED', () => {
    expect(
      deriveReputationTier({
        emailVerified: true,
        accountAgeDays: MIN_ACCOUNT_AGE_DAYS_FOR_TRUSTED - 1,
        billingAccountBound: true,
        subscriptionActive: true,
      }),
    ).toBe('VERIFIED');
  });

  // The load-bearing rule: money must not buy a way past the guardrails.
  it('DEMOTION WINS — a strike drops even a paying, aged, bound tenant to UNTRUSTED', () => {
    const paying = {
      emailVerified: true,
      accountAgeDays: 3650,
      billingAccountBound: true,
      subscriptionActive: true,
    };
    expect(deriveReputationTier(paying)).toBe('TRUSTED');
    expect(deriveReputationTier({ ...paying, activeStrikes: 1 })).toBe('UNTRUSTED');
    expect(deriveReputationTier({ ...paying, recentSevereAbuseEvents: 1 })).toBe('UNTRUSTED');
  });

  it('demotion also wins for an allowlisted first-party tenant', () => {
    expect(deriveReputationTier({ firstParty: true, activeStrikes: 99 })).toBe('UNTRUSTED');
    expect(deriveReputationTier({ firstParty: true })).toBe('FIRST_PARTY');
  });
});

describe('BillingAccountBinding', () => {
  it('no billing customer ⇒ UNBOUND and not usable', () => {
    const binding = resolveBillingAccountBinding({ organizationId: 'org-1', tier: 'BASIC' });
    expect(binding.state).toBe('UNBOUND');
    expect(isBindingUsable(binding)).toBe(false);
  });

  it('fails closed when a billing customer identifier is blank or has no provider', () => {
    expect(
      resolveBillingAccountBinding({
        organizationId: 'org-1',
        tier: 'BASIC',
        customer: { provider: 'stripe', externalId: '   ' },
      }).state,
    ).toBe('UNBOUND');
    expect(
      resolveBillingAccountBinding({
        organizationId: 'org-1',
        tier: 'BASIC',
        customer: { externalId: 'cus_without_provider' },
      }).state,
    ).toBe('UNBOUND');
  });

  it('an existing billing customer ⇒ BOUND, carrying the tier billing account', () => {
    const binding = resolveBillingAccountBinding({
      organizationId: 'org-1',
      tier: 'TRUSTED',
      customer: { provider: 'stripe', externalId: 'cus_abc' },
    });
    expect(binding.state).toBe('BOUND');
    expect(binding.externalId).toBe('cus_abc');
    expect(binding.billingAccountKey).toBe(REPUTATION_TIER_POLICIES.TRUSTED.billingAccountKey);
    expect(isBindingUsable(binding)).toBe(true);
  });

  it('delinquent and revoked bindings are NOT usable', () => {
    const delinquent = resolveBillingAccountBinding({
      organizationId: 'org-1',
      tier: 'VERIFIED',
      customer: { provider: 'stripe', externalId: 'cus_abc' },
      delinquent: true,
    });
    expect(delinquent.state).toBe('DELINQUENT');
    expect(isBindingUsable(delinquent)).toBe(false);

    const revoked = resolveBillingAccountBinding({
      organizationId: 'org-1',
      tier: 'VERIFIED',
      customer: { provider: 'stripe', externalId: 'cus_abc' },
      revoked: true,
    });
    expect(revoked.state).toBe('REVOKED');
    expect(isBindingUsable(revoked)).toBe(false);
  });
});

describe('admission — the happy paths', () => {
  it('lets an untrusted tenant create its first project (try-before-you-buy)', () => {
    const decision = evaluateTenantAdmission({
      action: 'project.create',
      tier: 'UNTRUSTED',
      binding: unboundBinding('UNTRUSTED'),
      usage: { projects: 0 },
      recentCreates: { 'project.create': 0 },
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBeUndefined();
  });

  it('lets a trusted tenant deploy well within its ceiling', () => {
    const decision = evaluateTenantAdmission({
      action: 'deployment.create',
      tier: 'TRUSTED',
      binding: boundBinding('TRUSTED'),
      usage: {},
      recentCreates: { 'deployment.create': 5 },
    });
    expect(decision.allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* NEGATIVE TESTS — every wall must actually block.                    */
/* ------------------------------------------------------------------ */

describe('NEGATIVE — billing account binding required to consume', () => {
  it('BASIC tenant without a bound billing account CANNOT deploy → 402', () => {
    const decision = evaluateTenantAdmission({
      action: 'deployment.create',
      tier: 'BASIC',
      binding: unboundBinding('BASIC'),
      usage: {},
      recentCreates: { 'deployment.create': 0 },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('BILLING_ACCOUNT_REQUIRED');
    expect(decision.statusCode).toBe(402);
    expect(decision.details).toEqual({ action: 'deployment.create' });
  });

  it('the SAME tenant CAN deploy once the billing account is bound', () => {
    const decision = evaluateTenantAdmission({
      action: 'deployment.create',
      tier: 'BASIC',
      binding: boundBinding('BASIC'),
      usage: {},
      recentCreates: { 'deployment.create': 0 },
    });
    expect(decision.allowed).toBe(true);
  });

  it('a DELINQUENT binding blocks new consumption → 402', () => {
    const decision = evaluateTenantAdmission({
      action: 'workspace.start',
      tier: 'TRUSTED',
      binding: { ...boundBinding('TRUSTED'), state: 'DELINQUENT' },
      usage: { concurrentWorkspaces: 0 },
      recentCreates: {},
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('BILLING_ACCOUNT_DELINQUENT');
    expect(decision.statusCode).toBe(402);
  });

  it('a REVOKED binding is terminal — even an explicit override cannot lift it', () => {
    const decision = evaluateTenantAdmission({
      action: 'project.create',
      tier: 'TRUSTED',
      binding: { ...boundBinding('TRUSTED'), state: 'REVOKED' },
      usage: { projects: 0 },
      recentCreates: { 'project.create': 0 },
      overrideActive: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('BILLING_ACCOUNT_REVOKED');
    expect(decision.statusCode).toBe(403);
  });
});

describe('NEGATIVE — per-tier caps block on exceed', () => {
  it('UNTRUSTED tenant at its 2-project cap is refused a 3rd → 429', () => {
    const decision = evaluateTenantAdmission({
      action: 'project.create',
      tier: 'UNTRUSTED',
      binding: unboundBinding('UNTRUSTED'),
      usage: { projects: REPUTATION_TIER_POLICIES.UNTRUSTED.maxProjects },
      recentCreates: { 'project.create': 0 },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('TENANT_CAP_EXCEEDED');
    expect(decision.statusCode).toBe(429);
    expect(decision.details).toEqual({ action: 'project.create', cap: 2, used: 2, capacityIncrement: 1 });
  });

  it('the cap is inclusive — the LAST allowed create still passes, the next does not', () => {
    const cap = REPUTATION_TIER_POLICIES.UNTRUSTED.maxProjects;
    const at = (projects: number) =>
      evaluateTenantAdmission({
        action: 'project.create',
        tier: 'UNTRUSTED',
        binding: unboundBinding('UNTRUSTED'),
        usage: { projects },
        recentCreates: { 'project.create': 0 },
      }).allowed;

    expect(at(cap - 1)).toBe(true); // creating the 2nd of 2
    expect(at(cap)).toBe(false); // creating the 3rd
  });

  it('UNTRUSTED tenant at its concurrent-workspace cap is refused → 429', () => {
    const decision = evaluateTenantAdmission({
      action: 'workspace.start',
      tier: 'UNTRUSTED',
      binding: unboundBinding('UNTRUSTED'),
      usage: { concurrentWorkspaces: REPUTATION_TIER_POLICIES.UNTRUSTED.maxConcurrentWorkspaces },
      recentCreates: { 'workspace.start': 0 },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('TENANT_CAP_EXCEEDED');
  });

  it('checks an active workspace restart against burst limits without double-counting concurrency', () => {
    const allowed = evaluateTenantAdmission({
      action: 'workspace.start',
      tier: 'UNTRUSTED',
      binding: unboundBinding('UNTRUSTED'),
      usage: { concurrentWorkspaces: REPUTATION_TIER_POLICIES.UNTRUSTED.maxConcurrentWorkspaces },
      recentCreates: { 'workspace.start': 0 },
      capacityIncrement: 0,
    });
    const burstRefused = evaluateTenantAdmission({
      action: 'workspace.start',
      tier: 'UNTRUSTED',
      binding: unboundBinding('UNTRUSTED'),
      usage: { concurrentWorkspaces: REPUTATION_TIER_POLICIES.UNTRUSTED.maxConcurrentWorkspaces },
      recentCreates: { 'workspace.start': REPUTATION_TIER_POLICIES.UNTRUSTED.workspaceStartsPerHour },
      capacityIncrement: 0,
    });

    expect(allowed.allowed).toBe(true);
    expect(burstRefused.code).toBe('TENANT_BURST_EXCEEDED');
  });
});

describe('NEGATIVE — burst walls and abuse signals', () => {
  it('an UNVERIFIED account can NEVER publish, whatever it pays → burst ceiling 0', () => {
    const decision = evaluateTenantAdmission({
      action: 'deployment.create',
      tier: 'UNTRUSTED',
      binding: boundBinding('UNTRUSTED'), // card on file, still refused
      usage: {},
      recentCreates: { 'deployment.create': 0 },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('TENANT_BURST_EXCEEDED');
    expect(decision.details).toEqual({
      action: 'deployment.create',
      burstCap: 0,
      recent: 0,
      windowSeconds: 3600,
    });
  });

  it('exceeding the hourly project burst blocks AND raises an abuse signal', () => {
    const decision = evaluateTenantAdmission({
      action: 'project.create',
      tier: 'BASIC',
      binding: unboundBinding('BASIC'),
      usage: { projects: 0 },
      recentCreates: { 'project.create': REPUTATION_TIER_POLICIES.BASIC.projectCreatesPerHour },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('TENANT_BURST_EXCEEDED');
    expect(decision.statusCode).toBe(429);

    // Feeds the already-wired recordAbuseSignal → AbuseEvent pipeline.
    expect(decision.abuseSignal).toBeDefined();
    expect(decision.abuseSignal?.type).toBe('project_creation_spike');
    expect(decision.abuseSignal?.severity).toBe('high');
    expect(decision.abuseSignal?.action).toBe('throttle');
  });

  it('deployment burst raises a deployment_creation_spike signal', () => {
    const decision = evaluateTenantAdmission({
      action: 'deployment.create',
      tier: 'VERIFIED',
      binding: boundBinding('VERIFIED'),
      usage: {},
      recentCreates: { 'deployment.create': REPUTATION_TIER_POLICIES.VERIFIED.deploymentCreatesPerHour },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.abuseSignal?.type).toBe('deployment_creation_spike');
  });

  it('an audited override lifts the burst wall but NOT the binding wall', () => {
    const burst = {
      action: 'project.create' as GuardedAction,
      tier: 'BASIC' as ReputationTier,
      usage: { projects: 0 },
      recentCreates: { 'project.create': REPUTATION_TIER_POLICIES.BASIC.projectCreatesPerHour },
    };

    expect(evaluateTenantAdmission({ ...burst, binding: unboundBinding('BASIC') }).allowed).toBe(false);
    expect(evaluateTenantAdmission({ ...burst, binding: unboundBinding('BASIC'), overrideActive: true }).allowed).toBe(
      true,
    );

    // ...but the override does not rescue a deploy that needs a binding.
    const needsBinding = evaluateTenantAdmission({
      action: 'deployment.create',
      tier: 'BASIC',
      binding: unboundBinding('BASIC'),
      usage: {},
      recentCreates: { 'deployment.create': 0 },
      overrideActive: true,
    });
    expect(needsBinding.allowed).toBe(false);
    expect(needsBinding.code).toBe('BILLING_ACCOUNT_REQUIRED');
  });
});

describe('NEGATIVE — fail-closed behaviour', () => {
  it('an unknown tier falls back to the STRICTEST policy, not the loosest', () => {
    const policy = policyForTier('NOPE' as ReputationTier);
    expect(policy.tier).toBe('UNTRUSTED');
    expect(policy.maxProjects).toBe(REPUTATION_TIER_POLICIES.UNTRUSTED.maxProjects);
  });

  it('missing usage counters are treated as zero, never as "unlimited"', () => {
    const decision = evaluateTenantAdmission({
      action: 'project.create',
      tier: 'UNTRUSTED',
      binding: unboundBinding('UNTRUSTED'),
      usage: {},
    });
    // Allowed because 0 used, but the ceiling still came from the strict tier.
    expect(decision.allowed).toBe(true);
    expect(decision.policy.maxProjects).toBe(2);
  });

  it('first-party is the ONLY tier that is effectively uncapped', () => {
    expect(REPUTATION_TIER_POLICIES.FIRST_PARTY.maxProjects).toBe(UNLIMITED_TIER_CAP);

    for (const tier of ['UNTRUSTED', 'BASIC', 'VERIFIED', 'TRUSTED'] as const) {
      expect(REPUTATION_TIER_POLICIES[tier].maxProjects).toBeLessThan(UNLIMITED_TIER_CAP);
    }
  });

  it('rejects a deployment provider outside the tier allowlist', () => {
    const decision = evaluateTenantAdmission({
      action: 'deployment.create',
      tier: 'VERIFIED',
      binding: boundBinding('VERIFIED'),
      usage: {},
      recentCreates: { 'deployment.create': 0 },
      context: {
        action: 'deployment.create',
        provider: 'docker',
        vcpu: 1,
        artifactSizeMb: 100,
        timeoutSeconds: 600,
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('TENANT_PROVIDER_NOT_ALLOWED');
    expect(decision.statusCode).toBe(403);
  });

  it('rejects deployment and workspace requests above their cost ceilings', () => {
    const deployment = evaluateTenantAdmission({
      action: 'deployment.create',
      tier: 'VERIFIED',
      binding: boundBinding('VERIFIED'),
      usage: {},
      recentCreates: { 'deployment.create': 0 },
      context: {
        action: 'deployment.create',
        provider: 'server',
        vcpu: 4,
        artifactSizeMb: 100,
        timeoutSeconds: 600,
      },
    });
    const workspace = evaluateTenantAdmission({
      action: 'workspace.start',
      tier: 'UNTRUSTED',
      binding: unboundBinding('UNTRUSTED'),
      usage: { concurrentWorkspaces: 0 },
      recentCreates: { 'workspace.start': 0 },
      context: {
        action: 'workspace.start',
        cpuMillicores: 2000,
        ramMb: 1024,
        storageGb: 2,
      },
    });

    expect(deployment.code).toBe('TENANT_RESOURCE_LIMIT_EXCEEDED');
    expect(workspace.code).toBe('TENANT_RESOURCE_LIMIT_EXCEEDED');
  });

  it('fails closed when the API omits or mismatches the action context', () => {
    const readGuardError = (context: Parameters<typeof assertTenantActionContext>[1]) => {
      try {
        assertTenantActionContext('project.create', context);
        throw new Error('expected guard to fail');
      } catch (error) {
        return error;
      }
    };

    expect(readGuardError(undefined)).toMatchObject({
      code: 'TENANT_GUARDRAIL_CONTEXT_INVALID',
      statusCode: 503,
    });
    expect(
      readGuardError({
        action: 'workspace.start',
        cpuMillicores: 1000,
        ramMb: 1024,
        storageGb: 2,
      }),
    ).toMatchObject({
      code: 'TENANT_GUARDRAIL_CONTEXT_INVALID',
      statusCode: 503,
    });

    const mismatch = evaluateTenantAdmission({
      action: 'project.create',
      tier: 'UNTRUSTED',
      binding: unboundBinding('UNTRUSTED'),
      usage: { projects: 0 },
      context: {
        action: 'workspace.start',
        cpuMillicores: 1000,
        ramMb: 1024,
        storageGb: 2,
      },
    });
    expect(mismatch.code).toBe('TENANT_GUARDRAIL_CONTEXT_INVALID');
    expect(mismatch.statusCode).toBe(503);
  });

  it('fails closed on cross-organization bindings, wrong tier billing keys and corrupt counters', () => {
    const base = {
      action: 'project.create' as const,
      tier: 'VERIFIED' as const,
      organizationId: 'org-1',
      usage: { projects: 0 },
      recentCreates: { 'project.create': 0 },
      context: { action: 'project.create' as const },
    };

    const crossTenant = evaluateTenantAdmission({
      ...base,
      binding: { ...boundBinding('VERIFIED'), organizationId: 'org-2' },
    });
    const wrongBillingTier = evaluateTenantAdmission({
      ...base,
      binding: { ...boundBinding('VERIFIED'), billingAccountKey: policyForTier('TRUSTED').billingAccountKey },
    });
    const corruptCounter = evaluateTenantAdmission({
      ...base,
      binding: boundBinding('VERIFIED'),
      usage: { projects: Number.NaN },
    });
    const corruptOverride = evaluateTenantAdmission({
      ...base,
      binding: boundBinding('VERIFIED'),
      overrideActive: 'false' as unknown as boolean,
    });
    const corruptCapacityIncrement = evaluateTenantAdmission({
      ...base,
      binding: boundBinding('VERIFIED'),
      capacityIncrement: 2 as 0 | 1,
    });

    for (const decision of [crossTenant, wrongBillingTier, corruptCounter, corruptOverride, corruptCapacityIncrement]) {
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe('TENANT_GUARDRAIL_CONTEXT_INVALID');
      expect(decision.statusCode).toBe(503);
    }
  });
});

describe('assertTenantAdmission throws the house error shape', () => {
  it('throws with statusCode + code, matching assertQuota', () => {
    expect(() =>
      assertTenantAdmission({
        action: 'deployment.create',
        tier: 'BASIC',
        binding: unboundBinding('BASIC'),
        usage: {},
        recentCreates: { 'deployment.create': 0 },
      }),
    ).toThrowError('BILLING_ACCOUNT_REQUIRED');

    try {
      assertTenantAdmission({
        action: 'project.create',
        tier: 'UNTRUSTED',
        binding: unboundBinding('UNTRUSTED'),
        usage: { projects: 5 },
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      const err = error as Error & { statusCode?: number; code?: string; tier?: string };
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('TENANT_CAP_EXCEEDED');
      expect(err.tier).toBe('UNTRUSTED');
    }
  });

  it('returns the decision (does not throw) when admitted', () => {
    const decision = assertTenantAdmission({
      action: 'project.create',
      tier: 'VERIFIED',
      binding: boundBinding('VERIFIED'),
      usage: { projects: 1 },
      recentCreates: { 'project.create': 1 },
    });
    expect(decision.allowed).toBe(true);
    expect(decision.tier).toBe('VERIFIED');
  });
});
