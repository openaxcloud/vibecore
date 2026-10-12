import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_BAN_THRESHOLD,
  APPEALS_EMAIL,
  COMMUNITY_BAN_THRESHOLD,
  STRIKE_EXPIRY_DAYS,
  WARNING_THRESHOLD,
  consequenceForStrikeCount,
  countActiveModerationStrikes,
  countActiveStrikes,
  describeConsequence,
  escalate,
  higherConsequence,
  permissionsForAction,
  type StrikeAction,
  type StrikeRecordLike,
} from '../strike-system.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 16);
const daysAgo = (d: number) => NOW - d * MS_PER_DAY;

describe('consequenceForStrikeCount', () => {
  it('maps counts to the ladder', () => {
    expect(consequenceForStrikeCount(0)).toBe('NONE');
    expect(consequenceForStrikeCount(1)).toBe('WARNING');
    expect(consequenceForStrikeCount(2)).toBe('WARNING');
    expect(consequenceForStrikeCount(COMMUNITY_BAN_THRESHOLD)).toBe('COMMUNITY_BAN');
    expect(consequenceForStrikeCount(ACCOUNT_BAN_THRESHOLD)).toBe('ACCOUNT_BAN');
    expect(consequenceForStrikeCount(100)).toBe('ACCOUNT_BAN');
  });
  it('clamps non-finite/negative to NONE and floors fractions', () => {
    expect(consequenceForStrikeCount(-1)).toBe('NONE');
    expect(consequenceForStrikeCount(Number.NaN)).toBe('NONE');
    expect(consequenceForStrikeCount(Number.POSITIVE_INFINITY)).toBe('NONE');
    expect(consequenceForStrikeCount(2.9)).toBe('WARNING');
    expect(consequenceForStrikeCount(3.1)).toBe('COMMUNITY_BAN');
  });
  it('exposes ordered thresholds + appeals email', () => {
    expect(WARNING_THRESHOLD).toBeLessThan(COMMUNITY_BAN_THRESHOLD);
    expect(COMMUNITY_BAN_THRESHOLD).toBeLessThan(ACCOUNT_BAN_THRESHOLD);
    expect(APPEALS_EMAIL).toContain('@');
  });
});

describe('escalate', () => {
  it('severe jumps to ACCOUNT_BAN; major steps one; minor never demotes', () => {
    expect(escalate('NONE', 'severe')).toBe('ACCOUNT_BAN');
    expect(escalate('WARNING', 'severe')).toBe('ACCOUNT_BAN');
    expect(escalate('NONE', 'major')).toBe('WARNING');
    expect(escalate('WARNING', 'major')).toBe('COMMUNITY_BAN');
    expect(escalate('COMMUNITY_BAN', 'major')).toBe('ACCOUNT_BAN');
    expect(escalate('ACCOUNT_BAN', 'major')).toBe('ACCOUNT_BAN');
    expect(escalate('NONE', 'minor')).toBe('WARNING');
    expect(escalate('COMMUNITY_BAN', 'minor')).toBe('COMMUNITY_BAN');
  });
  it('treats unknown current as NONE and unknown severity as minor', () => {
    const bogus = 'X' as unknown as StrikeAction;
    expect(escalate(bogus, 'major')).toBe('WARNING');
    expect(escalate('NONE', 'mild' as unknown as 'minor')).toBe('WARNING');
  });
});

describe('describeConsequence + permissions', () => {
  it('describes distinctly and gates access', () => {
    expect(describeConsequence('COMMUNITY_BAN').toLowerCase()).toContain('ide');
    expect(describeConsequence('ACCOUNT_BAN').toLowerCase()).toContain('delet');
    expect(describeConsequence('NUKE' as unknown as StrikeAction)).toContain(APPEALS_EMAIL);
    expect(permissionsForAction('WARNING')).toEqual({ canLogin: true, canUseIde: true, canPostPublicly: true });
    expect(permissionsForAction('COMMUNITY_BAN')).toEqual({ canLogin: true, canUseIde: true, canPostPublicly: false });
    expect(permissionsForAction('ACCOUNT_BAN')).toEqual({ canLogin: false, canUseIde: false, canPostPublicly: false });
    expect(permissionsForAction('SHADOW' as unknown as StrikeAction)).toEqual({
      canLogin: false,
      canUseIde: false,
      canPostPublicly: false,
    });
  });
});

describe('countActiveStrikes', () => {
  const strike = (createdAt: string | number | Date): StrikeRecordLike => ({ action: 'WARNING', createdAt });
  it('counts within the expiry window and ignores older', () => {
    expect(
      countActiveStrikes([strike(daysAgo(1)), strike(daysAgo(STRIKE_EXPIRY_DAYS)), strike(daysAgo(181))], NOW),
    ).toBe(2);
  });
  it('is defensive (bad now, non-array, null entries, unparseable=active)', () => {
    expect(countActiveStrikes([strike(daysAgo(1))], Number.NaN)).toBe(0);
    expect(countActiveStrikes(null as unknown as StrikeRecordLike[], NOW)).toBe(0);
    expect(countActiveStrikes([strike(daysAgo(1)), null as unknown as StrikeRecordLike], NOW)).toBe(1);
    expect(countActiveStrikes([strike('not-a-date')], NOW)).toBe(1);
  });
});

describe('countActiveModerationStrikes', () => {
  it('counts the preferences representation and expires old entries', () => {
    expect(
      countActiveModerationStrikes(
        {
          moderationStrikes: [
            { severity: 'minor', createdAt: new Date(daysAgo(1)).toISOString() },
            { severity: 'major', createdAt: new Date(daysAgo(STRIKE_EXPIRY_DAYS + 1)).toISOString() },
          ],
        },
        NOW,
      ),
    ).toBe(1);
  });

  it('fails closed for a present malformed strike collection or entry', () => {
    expect(countActiveModerationStrikes({ moderationStrikes: 'corrupt' }, NOW)).toBe(1);
    expect(countActiveModerationStrikes({ moderationStrikes: [null] }, NOW)).toBe(1);
    expect(() => countActiveModerationStrikes({}, Number.NaN)).toThrow(/clock/);
  });
});

describe('higherConsequence', () => {
  it('returns the more severe action per the ladder', () => {
    expect(higherConsequence('NONE', 'WARNING')).toBe('WARNING');
    expect(higherConsequence('COMMUNITY_BAN', 'WARNING')).toBe('COMMUNITY_BAN');
    expect(higherConsequence('ACCOUNT_BAN', 'COMMUNITY_BAN')).toBe('ACCOUNT_BAN');
    expect(higherConsequence('NONE', 'NONE')).toBe('NONE');
    expect(higherConsequence('WARNING', 'WARNING')).toBe('WARNING');
  });
});
