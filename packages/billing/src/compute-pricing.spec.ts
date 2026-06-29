import { describe, expect, it } from 'vitest';
import {
  autoscaleUsageCents,
  computeUnits,
  computeUnitsCents,
  databaseComputeCents,
  databaseBillableStorageGib,
  egressCents,
  objectStorageCents,
  reservedVmCents,
  workspaceComputeUnits,
  ceilCents,
  COMPUTE_UNIT_CENTS,
  REQUEST_CENTS,
  DATABASE_STORAGE_FLOOR_MB,
  DATABASE_STORAGE_CAP_GIB,
  DATABASE_IDLE_TIMEOUT_SECONDS,
} from './compute-pricing.js';

describe('compute units', () => {
  it('converts CPU-seconds and GB-seconds per Replit (18 / 2)', () => {
    // 1 CPU-s = 18 CU, 1 GB-s = 2 CU
    expect(computeUnits(1, 0)).toBe(18);
    expect(computeUnits(0, 1)).toBe(2);
    expect(computeUnits(10, 5)).toBe(10 * 18 + 5 * 2);
  });

  it('attributes workspace runtime by pod allocation', () => {
    // 1000 millicores (1 vCPU) + 1024 MB (1 GB) for 60s = 60 CPU-s + 60 GB-s
    const units = workspaceComputeUnits(1000, 1024, 60);
    expect(units).toBeCloseTo(60 * 18 + 60 * 2, 6);
  });

  it('clamps negative / non-finite inputs', () => {
    expect(workspaceComputeUnits(-1, Number.NaN, 60)).toBe(0);
  });
});

describe('rates', () => {
  it('prices compute units at $3.20/M', () => {
    expect(computeUnitsCents(1_000_000)).toBeCloseTo(320, 6);
    expect(COMPUTE_UNIT_CENTS).toBeCloseTo(0.00032, 9);
  });

  it('prices requests at $1.20/M (0.00012¢ each)', () => {
    expect(REQUEST_CENTS).toBeCloseTo(0.00012, 9);
    // 1M requests = $1.20 = 120¢
    expect(1_000_000 * REQUEST_CENTS).toBeCloseTo(120, 6);
  });
});

describe('autoscale', () => {
  it('sums compute + requests, base optional', () => {
    const usage = autoscaleUsageCents({ computeUnits: 1_000_000, requests: 1_000_000 });
    expect(usage).toBeCloseTo(320 + 120, 6);
    const withBase = autoscaleUsageCents({ computeUnits: 1_000_000, requests: 1_000_000, includeBase: true });
    expect(withBase).toBeCloseTo(100 + 320 + 120, 6);
  });
});

describe('reserved VM', () => {
  it('returns exact Replit flat tiers', () => {
    expect(reservedVmCents('shared-0.5')).toBe(2000);
    expect(reservedVmCents('dedicated-1')).toBe(4000);
    expect(reservedVmCents('dedicated-2')).toBe(8000);
    expect(reservedVmCents('dedicated-4')).toBe(16_000);
  });
});

describe('object storage', () => {
  it('prices storage, transfer and ops exactly', () => {
    // 10 GiB-months storage = $0.30 = 30¢; 5 GiB transfer = 50¢
    expect(objectStorageCents({ gibMonths: 10, transferGib: 5 })).toBeCloseTo(30 + 50, 6);
    // Replit convention: Class A (advanced/write) is the EXPENSIVE class.
    // 1M Class A ops = $7.50 = 750¢ ($0.0075/1k); 1M Class B = $0.60 = 60¢ ($0.0006/1k).
    expect(objectStorageCents({ gibMonths: 0, classAOps: 1_000_000 })).toBeCloseTo(750, 6);
    expect(objectStorageCents({ gibMonths: 0, classBOps: 1_000_000 })).toBeCloseTo(60, 6);
  });
});

describe('database guard-rails', () => {
  it('exposes Replit floor / cap / idle constants', () => {
    expect(DATABASE_STORAGE_FLOOR_MB).toBe(33);
    expect(DATABASE_STORAGE_CAP_GIB).toBe(10);
    expect(DATABASE_IDLE_TIMEOUT_SECONDS).toBe(300);
  });

  it('applies the 33 MB floor and 10 GiB cap to billable storage', () => {
    // Empty DB still bills the 33 MB floor.
    expect(databaseBillableStorageGib(0)).toBeCloseTo(33 / 1024, 9);
    // A mid-range value passes through unchanged.
    expect(databaseBillableStorageGib(2048)).toBeCloseTo(2, 9);
    // Above the cap clamps to 10 GiB.
    expect(databaseBillableStorageGib(50 * 1024)).toBe(10);
    // Negative / non-finite falls back to the floor.
    expect(databaseBillableStorageGib(Number.NaN)).toBeCloseTo(33 / 1024, 9);
  });
});

describe('egress + database', () => {
  it('prices egress at $0.10/GiB', () => {
    expect(egressCents(10)).toBeCloseTo(100, 6);
  });

  it('prices DB compute by active hours', () => {
    // 1 vCPU + 1 GB for 1 hour
    const cents = databaseComputeCents({ cpuMillicores: 1000, ramMb: 1024, hours: 1 });
    const units = (3600 * 18) + (3600 * 2);
    expect(cents).toBeCloseTo(units * COMPUTE_UNIT_CENTS, 6);
  });
});

describe('ceilCents', () => {
  it('rounds fractional cents up and clamps negatives', () => {
    expect(ceilCents(0.0001)).toBe(1);
    expect(ceilCents(12.0)).toBe(12);
    expect(ceilCents(-5)).toBe(0);
  });
});
