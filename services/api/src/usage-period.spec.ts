import { describe, expect, it } from 'vitest';
import { monthlyUsagePeriodStart } from './usage-period.js';

function period(start: string, end: string | undefined, now: string) {
  return monthlyUsagePeriodStart(
    { status: 'ACTIVE', currentPeriodStart: start, currentPeriodEnd: end },
    new Date(now),
  ).toISOString();
}

describe('monthly allowances within an annual subscription', () => {
  it.each([
    ['2026-01-15T10:30:00.000Z', '2026-01-15T10:30:00.000Z'],
    ['2026-02-15T10:29:59.999Z', '2026-01-15T10:30:00.000Z'],
    ['2026-02-15T10:30:00.000Z', '2026-02-15T10:30:00.000Z'],
    ['2026-12-20T00:00:00.000Z', '2026-12-15T10:30:00.000Z'],
    ['2027-01-15T10:30:00.000Z', '2026-12-15T10:30:00.000Z'],
    ['2028-01-15T10:30:00.000Z', '2026-12-15T10:30:00.000Z'],
  ])('at %s counts from %s without renewing an expired annual period', (now, expected) => {
    expect(period('2026-01-15T10:30:00.000Z', '2027-01-15T10:30:00.000Z', now)).toBe(expected);
  });

  it.each([
    ['2026-01-31', '2026-02-28', '2026-02-28'],
    ['2026-01-31', '2026-03-30', '2026-02-28'],
    ['2026-01-31', '2026-03-31', '2026-03-31'],
    ['2024-01-31', '2024-02-28', '2024-01-31'],
    ['2024-01-31', '2024-02-29', '2024-02-29'],
    ['2024-01-31', '2024-03-31', '2024-03-31'],
    ['2024-02-29', '2024-03-29', '2024-03-29'],
    ['2025-12-31', '2026-01-31', '2026-01-31'],
  ])('anchors %s at %s without end-of-month drift', (start, now, expected) => {
    const end = new Date(start);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    expect(period(start, end.toISOString(), now)).toBe(`${expected}T00:00:00.000Z`);
  });

  it.each(['ACTIVE', 'TRIALING', 'PAST_DUE'] as const)('renews monthly for entitled status %s', (status) => {
    expect(
      monthlyUsagePeriodStart(
        { status, currentPeriodStart: '2026-01-15', currentPeriodEnd: '2027-01-15' },
        new Date('2026-02-16'),
      ).toISOString(),
    ).toBe('2026-02-15T00:00:00.000Z');
  });

  it.each([28, 29, 30, 31, 32, 45])('preserves a %s-day short period even when its webhook is late', (days) => {
    const start = '2026-01-15T10:30:00.000Z';
    const end = new Date(Date.parse(start) + days * 86_400_000).toISOString();
    expect(period(start, end, '2026-04-20')).toBe(start);
  });

  it('preserves a monthly period plus one hour', () => {
    expect(period('2026-01-15T10:30:00Z', '2026-02-15T11:30:00Z', '2026-04-20')).toBe('2026-01-15T10:30:00.000Z');
  });

  it.each([undefined, 'invalid', '2026-01-01'])('does not infer a long period from invalid end %s', (end) => {
    expect(period('2026-01-15', end, '2026-04-20')).toBe('2026-01-15T00:00:00.000Z');
  });

  it.each(['CANCELED', 'UNPAID'] as const)('uses the free calendar month for %s', (status) => {
    expect(
      monthlyUsagePeriodStart(
        { status, currentPeriodStart: '2026-01-15', currentPeriodEnd: '2027-01-15' },
        new Date('2026-02-16'),
      ).toISOString(),
    ).toBe('2026-02-01T00:00:00.000Z');
  });

  it('uses the free calendar month without a subscription or with an invalid start', () => {
    const now = new Date('2026-02-16');
    expect(monthlyUsagePeriodStart(undefined, now).toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(monthlyUsagePeriodStart({ status: 'ACTIVE', currentPeriodStart: 'invalid' }, now).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
  });

  it('preserves a future subscription start without inventing a current paid period', () => {
    expect(period('2027-01-15', '2028-01-15', '2026-02-16')).toBe('2027-01-15T00:00:00.000Z');
  });

  it('resumes the same monthly anchor after entitlement reactivation', () => {
    const subscription = { currentPeriodStart: '2026-01-15', currentPeriodEnd: '2027-01-15' };
    const now = new Date('2026-02-16');
    expect(monthlyUsagePeriodStart({ ...subscription, status: 'UNPAID' }, now).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
    expect(monthlyUsagePeriodStart({ ...subscription, status: 'ACTIVE' }, now).toISOString()).toBe(
      '2026-02-15T00:00:00.000Z',
    );
  });
});
