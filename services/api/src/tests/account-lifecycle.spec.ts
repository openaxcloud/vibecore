import { describe, expect, it } from 'vitest';

import {
  INACTIVITY_DAYS,
  STARTER_PUBLISH_EXPIRY_DAYS,
  daysSince,
  inactivityStage,
  inactivityWarningCrossed,
  inactivityWarningEmailContent,
  isEligibleForInactivityDeletion,
  isStarterPublishExpired,
  shouldSendInactivityWarning,
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

describe('inactivityWarningEmailContent', () => {
  it('states the days left before deletion', () => {
    const content = inactivityWarningEmailContent(340, { nowMs: NOW, timeZone: 'UTC' });
    expect(content.subject).toContain(`${INACTIVITY_DAYS - 340} days`);
    expect(content.text).toContain('340 days');
    expect(content.html).toContain('<strong>');
  });

  it('renders professional French copy with localized plural and date', () => {
    const content = inactivityWarningEmailContent(364, {
      locale: 'fr',
      nowMs: Date.parse('2026-08-04T12:00:00.000Z'),
      timeZone: 'UTC',
    });

    expect(content.subject).toContain('1 jour');
    expect(content.text).toContain('5 août 2026');
    expect(content.text).toContain('Connectez-vous');
  });
});

describe('shouldSendInactivityWarning (email de-dup)', () => {
  it('sends when never warned at this threshold', () => {
    expect(shouldSendInactivityWarning(null, 335, NOW)).toBe(true);
    expect(shouldSendInactivityWarning({ inactivityWarnings: {} }, 335, NOW)).toBe(true);
  });

  it('does not re-send within the renotify window', () => {
    const prefs = { inactivityWarnings: { d335: new Date(NOW - 2 * MS_PER_DAY).toISOString() } };
    expect(shouldSendInactivityWarning(prefs, 335, NOW)).toBe(false);
  });

  it('re-sends after the renotify window', () => {
    const prefs = { inactivityWarnings: { d335: new Date(NOW - 10 * MS_PER_DAY).toISOString() } };
    expect(shouldSendInactivityWarning(prefs, 335, NOW)).toBe(true);
  });

  it('treats a different threshold independently', () => {
    const prefs = { inactivityWarnings: { d335: new Date(NOW).toISOString() } };
    expect(shouldSendInactivityWarning(prefs, 358, NOW)).toBe(true);
  });
});
