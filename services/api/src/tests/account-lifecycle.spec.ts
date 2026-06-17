import { describe, expect, it } from 'vitest';

import {
  INACTIVITY_DAYS,
  STARTER_PUBLISH_EXPIRY_DAYS,
  daysSince,
  inactivityStage,
  inactivityWarningCrossed,
  isEligibleForInactivityDeletion,
  isStarterPublishExpired,
} from '../account-lifecycle.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 16);
const daysAgo = (d: number) => NOW - d * MS_PER_DAY;

describe('daysSince', () => {
  it('computes whole days, clamps negatives, guards non-finite', () => {
    expect(daysSince(daysAgo(10), NOW)).toBe(10);
    expect(daysSince(NOW + MS_PER_DAY, NOW)).toBe(0);
    expect(daysSince(Number.NaN, NOW)).toBe(0);
  });
});

describe('inactivityStage', () => {
  it('paid accounts are always active', () => {
    expect(inactivityStage({ lastActiveAtMs: daysAgo(1000), nowMs: NOW, isPaid: true })).toBe('active');
  });
  it('free accounts escalate active → warning → eligible', () => {
    expect(inactivityStage({ lastActiveAtMs: daysAgo(10), nowMs: NOW, isPaid: false })).toBe('active');
    expect(inactivityStage({ lastActiveAtMs: daysAgo(340), nowMs: NOW, isPaid: false })).toBe('warning');
    expect(inactivityStage({ lastActiveAtMs: daysAgo(INACTIVITY_DAYS), nowMs: NOW, isPaid: false })).toBe(
      'eligible_for_deletion',
    );
  });
});

describe('isEligibleForInactivityDeletion', () => {
  it('only free + >= 1 year', () => {
    expect(isEligibleForInactivityDeletion({ lastActiveAtMs: daysAgo(400), nowMs: NOW, isPaid: false })).toBe(true);
    expect(isEligibleForInactivityDeletion({ lastActiveAtMs: daysAgo(400), nowMs: NOW, isPaid: true })).toBe(false);
    expect(isEligibleForInactivityDeletion({ lastActiveAtMs: daysAgo(100), nowMs: NOW, isPaid: false })).toBe(false);
  });
});

describe('inactivityWarningCrossed', () => {
  it('returns the highest crossed threshold or null', () => {
    expect(inactivityWarningCrossed(100)).toBeNull();
    expect(inactivityWarningCrossed(340)).toBe(335);
    expect(inactivityWarningCrossed(360)).toBe(358);
  });
});

describe('isStarterPublishExpired', () => {
  it('expires after 30 days', () => {
    expect(isStarterPublishExpired(daysAgo(STARTER_PUBLISH_EXPIRY_DAYS), NOW)).toBe(true);
    expect(isStarterPublishExpired(daysAgo(10), NOW)).toBe(false);
  });
});
