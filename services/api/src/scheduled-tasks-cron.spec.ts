import { describe, expect, it } from 'vitest';
import { describeCron, minIntervalMinutes, nextCronRun, parseCron, zonedWallTimeToUtc } from './scheduled-tasks-cron.js';

describe('parseCron', () => {
  it('accepts a standard 5-field expression', () => {
    const parsed = parseCron('*/5 * * * *');

    expect(parsed.valid).toBe(true);
    expect(parsed.fields?.minutes).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it('accepts ranges, lists, steps and names', () => {
    const parsed = parseCron('0,30 9-17/4 * jan-mar mon,fri');

    expect(parsed.valid).toBe(true);
    expect(parsed.fields?.minutes).toEqual([0, 30]);
    expect(parsed.fields?.hours).toEqual([9, 13, 17]);
    expect(parsed.fields?.months).toEqual([1, 2, 3]);
    expect(parsed.fields?.daysOfWeek).toEqual([1, 5]);
  });

  it('treats day-of-week 7 as Sunday', () => {
    expect(parseCron('0 0 * * 7').fields?.daysOfWeek).toEqual([0]);
  });

  it('expands @aliases', () => {
    expect(parseCron('@daily').normalized).toBe('0 0 * * *');
  });

  it('rejects the wrong number of fields', () => {
    expect(parseCron('* * *').valid).toBe(false);
  });

  it('rejects out-of-range and inverted values', () => {
    expect(parseCron('60 * * * *').valid).toBe(false);
    expect(parseCron('* 25 * * *').valid).toBe(false);
    expect(parseCron('* * * * *'.replace('* *', '30-10 *')).valid).toBe(false);
  });

  it('rejects a zero or negative step', () => {
    expect(parseCron('*/0 * * * *').valid).toBe(false);
  });
});

describe('nextCronRun', () => {
  it('fires strictly after `from`, on the minute', () => {
    const next = nextCronRun('*/5 * * * *', new Date('2026-07-14T10:05:00.000Z'));

    expect(next?.toISOString()).toBe('2026-07-14T10:10:00.000Z');
  });

  it('does not return `from` itself even when `from` matches', () => {
    const next = nextCronRun('0 * * * *', new Date('2026-07-14T10:00:00.000Z'));

    expect(next?.toISOString()).toBe('2026-07-14T11:00:00.000Z');
  });

  it('rolls to the next day, month and year', () => {
    expect(nextCronRun('30 23 * * *', new Date('2026-12-31T23:45:00.000Z'))?.toISOString()).toBe(
      '2027-01-01T23:30:00.000Z',
    );
  });

  it('honours day-of-month', () => {
    expect(nextCronRun('0 0 1 * *', new Date('2026-07-14T10:00:00.000Z'))?.toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('honours day-of-week (2026-07-14 is a Tuesday)', () => {
    expect(nextCronRun('0 9 * * mon', new Date('2026-07-14T10:00:00.000Z'))?.toISOString()).toBe(
      '2026-07-20T09:00:00.000Z',
    );
  });

  it('unions day-of-month and day-of-week when BOTH are restricted (classic cron)', () => {
    // The 20th is a Monday; the 17th is a Friday. `13 * 5` must hit the nearest Friday first.
    const next = nextCronRun('0 0 20 * 5', new Date('2026-07-14T00:00:00.000Z'));

    expect(next?.toISOString()).toBe('2026-07-17T00:00:00.000Z');
  });

  it('finds a leap day', () => {
    expect(nextCronRun('0 0 29 2 *', new Date('2026-07-14T00:00:00.000Z'))?.toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });

  it('returns null for an impossible date', () => {
    expect(nextCronRun('0 0 30 2 *', new Date('2026-07-14T00:00:00.000Z'))).toBeNull();
  });

  it('returns null for an invalid expression', () => {
    expect(nextCronRun('nope', new Date())).toBeNull();
  });
});

describe('nextCronRun — timezones', () => {
  it('interprets the cron in the task timezone, not UTC', () => {
    // 09:00 Europe/Paris in July (UTC+2) is 07:00Z.
    const next = nextCronRun('0 9 * * *', new Date('2026-07-14T00:00:00.000Z'), 'Europe/Paris');

    expect(next?.toISOString()).toBe('2026-07-14T07:00:00.000Z');
  });

  it('tracks a DST fall-back: the same wall clock maps to a different UTC instant', () => {
    // Paris leaves DST on 2026-10-25. 09:00 local is 07:00Z before, 08:00Z after.
    const before = nextCronRun('0 9 * * *', new Date('2026-10-20T00:00:00.000Z'), 'Europe/Paris');
    const after = nextCronRun('0 9 * * *', new Date('2026-10-26T00:00:00.000Z'), 'Europe/Paris');

    expect(before?.toISOString()).toBe('2026-10-20T07:00:00.000Z');
    expect(after?.toISOString()).toBe('2026-10-26T08:00:00.000Z');
  });

  it('skips a wall time that does not exist in the spring-forward gap', () => {
    /*
     * Paris springs forward on 2026-03-29: 02:00 -> 03:00 local, so 02:30 never
     * happens that day. The next fire must be 02:30 on the 30th, NOT some
     * arbitrarily shifted instant on the 29th.
     */
    const next = nextCronRun('30 2 * * *', new Date('2026-03-28T23:00:00.000Z'), 'Europe/Paris');

    expect(next?.toISOString()).toBe('2026-03-30T00:30:00.000Z');
  });

  it('falls back to UTC for an unknown timezone rather than never firing', () => {
    const next = nextCronRun('0 9 * * *', new Date('2026-07-14T00:00:00.000Z'), 'Mars/Olympus');

    expect(next?.toISOString()).toBe('2026-07-14T09:00:00.000Z');
  });
});

describe('zonedWallTimeToUtc', () => {
  it('returns null inside the DST gap', () => {
    expect(
      zonedWallTimeToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, 'Europe/Paris'),
    ).toBeNull();
  });

  it('resolves a normal wall time', () => {
    expect(
      zonedWallTimeToUtc({ year: 2026, month: 7, day: 14, hour: 9, minute: 0 }, 'Europe/Paris')?.toISOString(),
    ).toBe('2026-07-14T07:00:00.000Z');
  });
});

describe('minIntervalMinutes', () => {
  it('measures the tightest cadence a schedule can produce', () => {
    const from = new Date('2026-07-14T00:00:00.000Z');

    expect(minIntervalMinutes('* * * * *', 'UTC', from)).toBe(1);
    expect(minIntervalMinutes('*/15 * * * *', 'UTC', from)).toBe(15);
    expect(minIntervalMinutes('0 3 * * *', 'UTC', from)).toBe(1440);
  });

  it('catches a schedule that is dense within an hour but sparse overall', () => {
    // Every minute of the 03:00 hour: the tightest gap is 1 minute, not 1440.
    expect(minIntervalMinutes('* 3 * * *', 'UTC', new Date('2026-07-14T00:00:00.000Z'))).toBe(1);
  });
});

describe('describeCron', () => {
  it('reports the next run for a valid expression', () => {
    const described = describeCron('0 3 * * *', 'UTC', new Date('2026-07-14T10:00:00.000Z'));

    expect(described).toMatchObject({ valid: true, normalized: '0 3 * * *', nextRunAt: '2026-07-15T03:00:00.000Z' });
  });

  it('reports the error for an invalid expression', () => {
    expect(describeCron('* * *').valid).toBe(false);
  });
});
