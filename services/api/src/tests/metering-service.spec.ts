import { describe, expect, it } from 'vitest';
import {
  meterDatabaseCompute,
  meterDeployment,
  meterObjectStorage,
  meterWorkspaceCompute,
} from '../metering-service.js';
import { TestApiStore } from './test-api-store.js';

const NOW = 2_000_000_000_000;

describe('meterWorkspaceCompute', () => {
  it('records runtime minutes and debits compute at Replit CU rate', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 100_000, kind: 'GRANT', reason: 'grant' });

    // 1 vCPU + 1 GB for 1 hour (3600s) = 3600*18 + 3600*2 = 72000 CU → 72000*0.00032 = 23.04¢ → 24¢
    const result = await meterWorkspaceCompute(store, {
      organizationId: 'org_1',
      cpuMillicores: 1000,
      ramMb: 1024,
      seconds: 3600,
      nowMs: NOW,
    });

    expect(result.computeUnits).toBeCloseTo(72_000, 3);
    expect(result.minutes).toBe(60);
    expect(result.costCents).toBe(24);
    expect(result.fromBalance).toBe(24);

    const runtime = await store.sumUsage('org_1', 'workspaces.runtimeMinutes');
    expect(runtime).toBe(60);
  });

  it('shadow mode records usage but debits nothing', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 100_000, kind: 'GRANT', reason: 'grant' });
    const result = await meterWorkspaceCompute(store, {
      organizationId: 'org_1',
      cpuMillicores: 1000,
      ramMb: 1024,
      seconds: 3600,
      shadow: true,
      nowMs: NOW,
    });
    expect(result.shadow).toBe(true);
    expect(result.fromBalance).toBe(0);
    expect((await store.getCreditWallet('org_1'))?.balanceCents).toBe(100_000);
    expect(await store.sumUsage('org_1', 'workspaces.runtimeMinutes')).toBe(60);
  });
});

describe('meterObjectStorage', () => {
  it('charges storage + transfer + ops', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 100_000, kind: 'GRANT', reason: 'grant' });
    // 10 GiB-months (30¢) + 5 GiB transfer (50¢) = 80¢
    const result = await meterObjectStorage(store, {
      organizationId: 'org_1',
      gibMonths: 10,
      transferGib: 5,
      nowMs: NOW,
    });
    expect(result.costCents).toBe(80);
    expect(result.fromBalance).toBe(80);
  });
});

describe('meterDeployment', () => {
  it('prices autoscale usage and reserved VM exactly', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 100_000, kind: 'GRANT', reason: 'grant' });

    // 1M CU ($3.20=320¢) + 1M requests ($1.20=120¢) = 440¢
    const autoscale = await meterDeployment(store, {
      organizationId: 'org_1',
      kind: 'autoscale',
      computeUnits: 1_000_000,
      requests: 1_000_000,
      nowMs: NOW,
    });
    expect(autoscale.costCents).toBe(440);

    const vm = await meterDeployment(store, {
      organizationId: 'org_1',
      kind: 'reserved-vm',
      reservedTier: 'dedicated-2',
      nowMs: NOW,
    });
    expect(vm.costCents).toBe(8000);
  });
});

describe('meterDatabaseCompute', () => {
  it('records active hours and charges compute', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 100_000, kind: 'GRANT', reason: 'grant' });
    const result = await meterDatabaseCompute(store, {
      organizationId: 'org_1',
      cpuMillicores: 500,
      ramMb: 512,
      hours: 2,
      nowMs: NOW,
    });
    expect(result.costCents).toBeGreaterThan(0);
    expect(await store.sumUsage('org_1', 'database.activeHours')).toBe(2);
  });
});
