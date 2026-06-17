import { describe, expect, it } from 'vitest';

import {
  DELETION_GRACE_PERIOD_DAYS,
  FINANCIAL_RETENTION_DAYS,
  canCancelDeletion,
  canPurgeFinancialRecord,
  deletionScope,
  deletionStatus,
  purgeDueAtMs,
} from '../data-deletion.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 16);
const daysAgo = (d: number) => NOW - d * MS_PER_DAY;

describe('deletionStatus', () => {
  it('none when not requested, purged when purged', () => {
    expect(deletionStatus({ requestedAtMs: null, purgedAtMs: null, nowMs: NOW })).toBe('none');
    expect(deletionStatus({ requestedAtMs: daysAgo(30), purgedAtMs: daysAgo(1), nowMs: NOW })).toBe('purged');
  });
  it('grace_period within window, ready_to_purge after', () => {
    expect(deletionStatus({ requestedAtMs: daysAgo(2), purgedAtMs: null, nowMs: NOW })).toBe('grace_period');
    expect(deletionStatus({ requestedAtMs: daysAgo(DELETION_GRACE_PERIOD_DAYS + 1), purgedAtMs: null, nowMs: NOW })).toBe(
      'ready_to_purge',
    );
  });
});

describe('canCancelDeletion', () => {
  it('only within the grace period', () => {
    expect(canCancelDeletion({ requestedAtMs: daysAgo(2), purgedAtMs: null, nowMs: NOW })).toBe(true);
    expect(canCancelDeletion({ requestedAtMs: daysAgo(30), purgedAtMs: null, nowMs: NOW })).toBe(false);
    expect(canCancelDeletion({ requestedAtMs: null, purgedAtMs: null, nowMs: NOW })).toBe(false);
  });
});

describe('purgeDueAtMs + scope', () => {
  it('purge due = request + grace', () => {
    const req = daysAgo(0);
    expect(purgeDueAtMs(req)).toBe(req + DELETION_GRACE_PERIOD_DAYS * MS_PER_DAY);
  });
  it('scope lists deleted and retained', () => {
    const scope = deletionScope();
    expect(scope.deleted.length).toBeGreaterThan(0);
    expect(scope.retained.length).toBeGreaterThan(0);
  });
});

describe('canPurgeFinancialRecord', () => {
  it('only after the retention window; fails closed on bad input', () => {
    expect(canPurgeFinancialRecord(daysAgo(FINANCIAL_RETENTION_DAYS + 1), NOW)).toBe(true);
    expect(canPurgeFinancialRecord(daysAgo(100), NOW)).toBe(false);
    expect(canPurgeFinancialRecord(Number.NaN, NOW)).toBe(false);
  });
});
