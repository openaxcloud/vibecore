import { afterEach, describe, expect, it } from 'vitest';
import {
  databaseRollbackEntitlement,
  isDatabaseRollbackEnabled,
  retentionFloorMs,
  snapshotExpiryMs,
  validateRestoreTarget,
} from '../database-rollback-service.js';

const NOW = 2_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const ORIGINAL_FLAG = process.env.DB_ROLLBACK_ENABLED;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;
  } else {
    process.env.DB_ROLLBACK_ENABLED = ORIGINAL_FLAG;
  }
});

describe('isDatabaseRollbackEnabled', () => {
  it('is off unless the flag is exactly "true"', () => {
    delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;
    expect(isDatabaseRollbackEnabled()).toBe(false);
    process.env.DB_ROLLBACK_ENABLED = '1';
    expect(isDatabaseRollbackEnabled()).toBe(false);
    process.env.DB_ROLLBACK_ENABLED = 'true';
    expect(isDatabaseRollbackEnabled()).toBe(true);
  });
});

describe('databaseRollbackEntitlement', () => {
  it('grants 28 days on Pro and Enterprise', () => {
    expect(databaseRollbackEntitlement('pro')).toEqual({ allowed: true, retentionDays: 28 });
    expect(databaseRollbackEntitlement('enterprise')).toEqual({ allowed: true, retentionDays: 28 });
  });

  it('grants nothing on Starter / Core / unknown plans', () => {
    expect(databaseRollbackEntitlement('starter')).toEqual({ allowed: false, retentionDays: 0 });
    expect(databaseRollbackEntitlement('core')).toEqual({ allowed: false, retentionDays: 0 });
    expect(databaseRollbackEntitlement('mystery')).toEqual({ allowed: false, retentionDays: 0 });
  });
});

describe('retentionFloorMs', () => {
  it('is now minus the retention window', () => {
    expect(retentionFloorMs(28, NOW)).toBe(NOW - 28 * DAY);
    expect(retentionFloorMs(0, NOW)).toBe(NOW);
  });
});

describe('validateRestoreTarget', () => {
  const pro = databaseRollbackEntitlement('pro');

  it('accepts a target inside the 28-day window', () => {
    const result = validateRestoreTarget({
      enabled: true,
      entitlement: pro,
      targetTimestampMs: NOW - 5 * DAY,
      nowMs: NOW,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects when the feature flag is off', () => {
    const result = validateRestoreTarget({
      enabled: false,
      entitlement: pro,
      targetTimestampMs: NOW - DAY,
      nowMs: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: 'ROLLBACK_DISABLED' });
  });

  it('rejects when the plan is not eligible', () => {
    const result = validateRestoreTarget({
      enabled: true,
      entitlement: databaseRollbackEntitlement('starter'),
      targetTimestampMs: NOW - DAY,
      nowMs: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: 'PLAN_NOT_ELIGIBLE' });
  });

  it('rejects a future target', () => {
    const result = validateRestoreTarget({ enabled: true, entitlement: pro, targetTimestampMs: NOW + DAY, nowMs: NOW });
    expect(result).toMatchObject({ ok: false, code: 'TARGET_IN_FUTURE' });
  });

  it('rejects a target older than the retention window', () => {
    const result = validateRestoreTarget({
      enabled: true,
      entitlement: pro,
      targetTimestampMs: NOW - 29 * DAY,
      nowMs: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: 'TARGET_TOO_OLD' });
  });

  it('accepts a target exactly at the retention floor (inclusive boundary)', () => {
    const result = validateRestoreTarget({
      enabled: true,
      entitlement: pro,
      targetTimestampMs: NOW - 28 * DAY,
      nowMs: NOW,
    });
    expect(result).toEqual({ ok: true });
  });

  it('accepts a target exactly at now (inclusive upper boundary)', () => {
    const result = validateRestoreTarget({ enabled: true, entitlement: pro, targetTimestampMs: NOW, nowMs: NOW });
    expect(result).toEqual({ ok: true });
  });
});

describe('snapshotExpiryMs', () => {
  it('expires retentionDays after creation', () => {
    expect(snapshotExpiryMs(NOW, 28)).toBe(NOW + 28 * DAY);
  });

  it('returns null when there is no retention window', () => {
    expect(snapshotExpiryMs(NOW, 0)).toBeNull();
  });
});
