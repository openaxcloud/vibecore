import { BUILTIN_RATE_CARD } from '@vibecore/billing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MachineSizeError,
  getActiveRateCard,
  machineSizeResources,
  maxSchedulableVcpu,
  resetRateCardCache,
  resolveDeployMachineSize,
} from './rate-card-service.js';

const ORIGINAL_MAX_VCPU = process.env.SERVER_DEPLOY_MAX_VCPU;

describe('getActiveRateCard', () => {
  beforeEach(() => resetRateCardCache());
  afterEach(() => {
    resetRateCardCache();
    vi.restoreAllMocks();
  });

  it('serves the ACTIVE DB card when it validates', async () => {
    const dbCard = { ...BUILTIN_RATE_CARD, version: 7 };
    const store = { getActiveRateCard: vi.fn().mockResolvedValue({ version: 7, data: dbCard }) };

    const card = await getActiveRateCard(store);

    expect(card.version).toBe(7);
  });

  it('falls back to the built-in card when the DB row is malformed', async () => {
    const store = { getActiveRateCard: vi.fn().mockResolvedValue({ version: 9, data: { nonsense: true } }) };

    const card = await getActiveRateCard(store);

    expect(card.version).toBe(BUILTIN_RATE_CARD.version);
  });

  it('falls back to the built-in card when the read throws (pricing never 500s a publish)', async () => {
    const store = { getActiveRateCard: vi.fn().mockRejectedValue(new Error('db down')) };

    const card = await getActiveRateCard(store);

    expect(card.version).toBe(BUILTIN_RATE_CARD.version);
  });

  it('caches for the TTL (one DB read for consecutive calls)', async () => {
    const store = { getActiveRateCard: vi.fn().mockResolvedValue(undefined) };

    await getActiveRateCard(store);
    await getActiveRateCard(store);

    expect(store.getActiveRateCard).toHaveBeenCalledTimes(1);
  });
});

describe('resolveDeployMachineSize', () => {
  beforeEach(() => {
    delete process.env.SERVER_DEPLOY_MAX_VCPU;
  });

  afterEach(() => {
    if (ORIGINAL_MAX_VCPU !== undefined) {
      process.env.SERVER_DEPLOY_MAX_VCPU = ORIGINAL_MAX_VCPU;
    } else {
      delete process.env.SERVER_DEPLOY_MAX_VCPU;
    }
  });

  it('defaults to shared-0.5 when no size is requested', () => {
    expect(resolveDeployMachineSize(BUILTIN_RATE_CARD, undefined, 'free').key).toBe('shared-0.5');
  });

  it('rejects unknown size keys instead of silently downgrading', () => {
    expect(() => resolveDeployMachineSize(BUILTIN_RATE_CARD, 'mega-64', 'pro')).toThrowError(MachineSizeError);

    try {
      resolveDeployMachineSize(BUILTIN_RATE_CARD, 'mega-64', 'pro');
    } catch (error) {
      expect((error as MachineSizeError).code).toBe('MACHINE_SIZE_UNKNOWN');
      expect((error as MachineSizeError).statusCode).toBe(400);
    }
  });

  it('never grants 8 vCPU on the free plan', () => {
    process.env.SERVER_DEPLOY_MAX_VCPU = '8';

    try {
      resolveDeployMachineSize(BUILTIN_RATE_CARD, 'dedicated-8', 'free');
      expect.unreachable('dedicated-8 must be rejected on free');
    } catch (error) {
      expect((error as MachineSizeError).code).toBe('MACHINE_SIZE_PLAN');
    }
  });

  it('rejects sizes above the scheduling ceiling with a capacity code', () => {
    // Default ceiling is 2 vCPU (e2-standard-4 nodes, 3920m allocatable).
    try {
      resolveDeployMachineSize(BUILTIN_RATE_CARD, 'dedicated-4', 'pro');
      expect.unreachable('dedicated-4 must be rejected at the default ceiling');
    } catch (error) {
      expect((error as MachineSizeError).code).toBe('MACHINE_SIZE_CAPACITY');
    }
  });

  it('grants big sizes to paid plans when capacity allows', () => {
    process.env.SERVER_DEPLOY_MAX_VCPU = '8';

    expect(resolveDeployMachineSize(BUILTIN_RATE_CARD, 'dedicated-8', 'pro').key).toBe('dedicated-8');
  });
});

describe('machineSizeResources', () => {
  it('emits requests == limits (the machine you picked is the machine you get)', () => {
    const size = BUILTIN_RATE_CARD.machineSizes.find((candidate) => candidate.key === 'dedicated-1')!;

    expect(machineSizeResources(size)).toEqual({
      cpuRequest: '1000m',
      cpuLimit: '1000m',
      memoryRequest: '4096Mi',
      memoryLimit: '4096Mi',
    });
  });
});

describe('maxSchedulableVcpu', () => {
  afterEach(() => {
    if (ORIGINAL_MAX_VCPU !== undefined) {
      process.env.SERVER_DEPLOY_MAX_VCPU = ORIGINAL_MAX_VCPU;
    } else {
      delete process.env.SERVER_DEPLOY_MAX_VCPU;
    }
  });

  it('defaults to the measured node ceiling (2) and honours the env override', () => {
    delete process.env.SERVER_DEPLOY_MAX_VCPU;
    expect(maxSchedulableVcpu()).toBe(2);

    process.env.SERVER_DEPLOY_MAX_VCPU = '4';
    expect(maxSchedulableVcpu()).toBe(4);

    process.env.SERVER_DEPLOY_MAX_VCPU = 'garbage';
    expect(maxSchedulableVcpu()).toBe(2);
  });
});
