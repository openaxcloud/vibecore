import { describe, expect, it } from 'vitest';
import {
  meterAllObjectStorage,
  meterDatabaseCompute,
  meterDeployment,
  meterObjectStorage,
  meterWorkspaceCompute,
} from '../metering-service.js';
import { TestApiStore } from './test-api-store.js';

const NOW = 2_000_000_000_000;

describe('meterAllObjectStorage (daily sweep)', () => {
  it('sums real stored bytes per org and meters a day of GiB-months', async () => {
    const store = new TestApiStore();
    const project = await store.createProject({ organizationId: 'org_1', name: 'p', slug: 'p' });
    const GIB = 1024 ** 3;
    // 60 GiB stored → one day = 60/30 = 2 GiB-months (ceil → metered as 2).
    await store.putProjectStorageObject({
      projectId: project.id,
      expectedOrganizationId: project.organizationId,
      key: 'k1',
      kind: 'snapshot',
      contentBase64: '',
      byteLength: 60 * GIB,
      contentHash: 'h1',
    });

    const result = await meterAllObjectStorage(store, { shadow: true, nowMs: NOW, daysInPeriod: 30 });

    expect(result.orgsMetered).toBe(1);
    expect(result.totalBytes).toBe(60 * GIB);
    expect(result.shadow).toBe(true);
    // 60 GiB / 30 days = 2 GiB-months recorded today (meterObjectStorage ceils).
    expect(await store.sumUsage('org_1', 'storage.objectGiBMonths')).toBe(2);
  });

  it('meters nothing when there are no stored objects', async () => {
    const store = new TestApiStore();
    const result = await meterAllObjectStorage(store, { shadow: true, nowMs: NOW });
    expect(result.orgsMetered).toBe(0);
    expect(result.totalBytes).toBe(0);
  });

  it('is idempotent within the UTC day — a second run does not double-meter', async () => {
    const store = new TestApiStore();
    const project = await store.createProject({ organizationId: 'org_1', name: 'p', slug: 'p' });
    const GIB = 1024 ** 3;
    await store.putProjectStorageObject({
      projectId: project.id,
      expectedOrganizationId: project.organizationId,
      key: 'k1',
      kind: 'snapshot',
      contentBase64: '',
      byteLength: 60 * GIB,
      contentHash: 'h1',
    });

    // Real clock so the recorded usage event's createdAt shares the dedup day window.
    const t = Date.now();
    const first = await meterAllObjectStorage(store, { shadow: true, nowMs: t, daysInPeriod: 30 });
    expect(first.orgsMetered).toBe(1);

    // Same UTC day → org already metered for storage → skipped, no second event.
    const second = await meterAllObjectStorage(store, { shadow: true, nowMs: t, daysInPeriod: 30 });
    expect(second.orgsMetered).toBe(0);
    expect((await store.listUsageEvents('org_1')).filter((e) => e.type === 'storage.objectGiBMonths').length).toBe(1);
  });
});

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
