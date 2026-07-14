/*
 * Cron engine for scheduled tasks.
 *
 * Why hand-rolled: the repo already carries two cron *validators* (one in the
 * Workflows panel, one in the Deploy panel) that only ever computed a display
 * value — nothing consumed them. A real executor needs the one thing they never
 * did: a correct "what is the next instant this fires" that survives DST, so a
 * task scheduled for 02:30 Europe/Paris is not silently skipped or double-fired
 * across a clock change.
 *
 * Semantics are standard 5-field cron (minute hour day-of-month month
 * day-of-week), including the classic OR rule: when BOTH day-of-month and
 * day-of-week are restricted, a day matches if EITHER matches. Fields accept
 * `*`, `a`, `a-b`, `*` / `a-b` with a `/step`, and comma lists. Day-of-week
 * accepts 0 and 7 for Sunday. Everything is evaluated in the task's IANA
 * timezone; the result is a UTC instant.
 */

export interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
  domRestricted: boolean;
  dowRestricted: boolean;
}

export interface CronParseResult {
  valid: boolean;
  normalized?: string;
  fields?: CronFields;
  error?: string;
}

interface FieldSpec {
  name: string;
  min: number;
  max: number;
}

const FIELD_SPECS: FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
];

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DAY_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Named aliases accepted in place of a full expression (crontab convention). */
const ALIASES: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

function resolveNamed(token: string, index: number): string {
  const lower = token.toLowerCase();

  if (index === 3 && MONTH_NAMES[lower] !== undefined) {
    return String(MONTH_NAMES[lower]);
  }

  if (index === 4 && DAY_NAMES[lower] !== undefined) {
    return String(DAY_NAMES[lower]);
  }

  return token;
}

function parseField(raw: string, index: number): { values: number[]; restricted: boolean } | { error: string } {
  const spec = FIELD_SPECS[index];
  const values = new Set<number>();

  let restricted = false;

  for (const part of raw.split(',')) {
    const token = part.trim();

    if (!token) {
      return { error: `Invalid ${spec.name} field: empty list entry.` };
    }

    const [rangePart, stepPart, ...extra] = token.split('/');

    if (extra.length > 0) {
      return { error: `Invalid ${spec.name} field: "${token}".` };
    }

    let step = 1;

    if (stepPart !== undefined) {
      step = Number(stepPart);

      if (!Number.isInteger(step) || step < 1) {
        return { error: `Invalid step in ${spec.name} field: "${token}".` };
      }
    }

    let start: number;
    let end: number;

    if (rangePart === '*') {
      start = spec.min;
      end = spec.max;

      if (stepPart !== undefined && step > 1) {
        restricted = true;
      }
    } else {
      const bounds = rangePart.split('-').map((value) => resolveNamed(value.trim(), index));

      if (bounds.length > 2) {
        return { error: `Invalid range in ${spec.name} field: "${token}".` };
      }

      start = Number(bounds[0]);
      end = bounds.length === 2 ? Number(bounds[1]) : start;

      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        return { error: `Invalid ${spec.name} value: "${token}".` };
      }

      if (start < spec.min || start > spec.max || end < spec.min || end > spec.max) {
        return { error: `${spec.name} out of range (${spec.min}-${spec.max}): "${token}".` };
      }

      if (end < start) {
        return { error: `Inverted range in ${spec.name} field: "${token}".` };
      }

      restricted = true;
    }

    for (let value = start; value <= end; value += step) {
      // Cron treats both 0 and 7 as Sunday.
      values.add(index === 4 && value === 7 ? 0 : value);
    }
  }

  if (values.size === 0) {
    return { error: `Invalid ${spec.name} field: "${raw}".` };
  }

  return { values: [...values].sort((left, right) => left - right), restricted };
}

/** Parse + validate a 5-field cron expression (or an `@alias`). */
export function parseCron(expression: string): CronParseResult {
  const trimmed = String(expression ?? '').trim();

  if (!trimmed) {
    return { valid: false, error: 'Schedule is empty.' };
  }

  const expanded = ALIASES[trimmed.toLowerCase()] ?? trimmed;
  const tokens = expanded.split(/\s+/);

  if (tokens.length !== 5) {
    return {
      valid: false,
      error: `A cron schedule needs exactly 5 fields (minute hour day-of-month month day-of-week); got ${tokens.length}.`,
    };
  }

  const parsed: Array<{ values: number[]; restricted: boolean }> = [];

  for (let index = 0; index < 5; index++) {
    const result = parseField(tokens[index], index);

    if ('error' in result) {
      return { valid: false, error: result.error };
    }

    parsed.push(result);
  }

  return {
    valid: true,
    normalized: tokens.join(' '),
    fields: {
      minutes: parsed[0].values,
      hours: parsed[1].values,
      daysOfMonth: parsed[2].values,
      months: parsed[3].values,
      daysOfWeek: parsed[4].values,
      domRestricted: parsed[2].restricted,
      dowRestricted: parsed[4].restricted,
    },
  };
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });

  formatterCache.set(timeZone, formatter);

  return formatter;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock fields of `date` as seen in `timeZone`. */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const lookup: Record<string, string> = {};

  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    weekday: WEEKDAY_INDEX[lookup.weekday] ?? 0,
  };
}

/**
 * The UTC instant for a wall-clock time in `timeZone`, or `null` when that wall
 * time does not exist (the spring-forward gap: 02:30 simply never happens).
 * Skipping a nonexistent local time is the same choice cron implementations make
 * — the alternative (firing at an arbitrary shifted instant) is worse.
 */
export function zonedWallTimeToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date | null {
  const naiveMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);

  // First guess: assume the zone offset at the naive instant, then correct once.
  const offsetAt = (instantMs: number) => {
    const parts = zonedParts(new Date(instantMs), timeZone);

    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instantMs;
  };

  let candidateMs = naiveMs - offsetAt(naiveMs);
  candidateMs = naiveMs - offsetAt(candidateMs);

  const check = zonedParts(new Date(candidateMs), timeZone);

  if (
    check.year !== wall.year ||
    check.month !== wall.month ||
    check.day !== wall.day ||
    check.hour !== wall.hour ||
    check.minute !== wall.minute
  ) {
    return null;
  }

  return new Date(candidateMs);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayMatches(fields: CronFields, year: number, month: number, day: number): boolean {
  if (!fields.months.includes(month)) {
    return false;
  }

  const domHit = fields.daysOfMonth.includes(day);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const dowHit = fields.daysOfWeek.includes(weekday);

  /*
   * Classic cron: with BOTH day fields restricted the match is a UNION, not an
   * intersection (`0 0 13 * 5` = the 13th OR any Friday). With only one
   * restricted, the unrestricted `*` field must not veto.
   */
  if (fields.domRestricted && fields.dowRestricted) {
    return domHit || dowHit;
  }

  if (fields.domRestricted) {
    return domHit;
  }

  if (fields.dowRestricted) {
    return dowHit;
  }

  return true;
}

/** Days scanned before giving up (covers "Feb 29" — the sparsest legal schedule). */
const MAX_DAYS_SCANNED = 366 * 5;

/**
 * The first instant strictly after `from` at which `expression` fires, evaluated
 * in `timeZone`. Returns null when the expression can never match (e.g. Feb 31).
 *
 * Walks candidate DAYS (not minutes): at most ~1800 iterations for the sparsest
 * legal schedule, versus ~2.6M for a minute-by-minute scan — which matters
 * because this is recomputed on every claim, on every tick.
 */
export function nextCronRun(expression: string, from: Date, timeZone = 'UTC'): Date | null {
  const parsed = parseCron(expression);

  if (!parsed.valid || !parsed.fields) {
    return null;
  }

  const fields = parsed.fields;

  // Fire on minute boundaries, strictly after `from`.
  const floorMs = Math.floor(from.getTime() / 60_000) * 60_000;
  const earliestMs = floorMs + 60_000;

  let cursor: ZonedParts;

  try {
    cursor = zonedParts(new Date(earliestMs), timeZone);
  } catch {
    // Unknown IANA zone — fall back to UTC rather than silently never firing.
    cursor = zonedParts(new Date(earliestMs), 'UTC');
    timeZone = 'UTC';
  }

  let { year, month, day } = cursor;

  for (let scanned = 0; scanned < MAX_DAYS_SCANNED; scanned++) {
    if (dayMatches(fields, year, month, day)) {
      for (const hour of fields.hours) {
        for (const minute of fields.minutes) {
          const instant = zonedWallTimeToUtc({ year, month, day, hour, minute }, timeZone);

          // null => this wall time is inside a DST spring-forward gap; skip it.
          if (instant && instant.getTime() >= earliestMs) {
            return instant;
          }
        }
      }
    }

    day += 1;

    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;

      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  return null;
}

/** Convenience for the API/UI: validate and report the next fire time. */
export function describeCron(
  expression: string,
  timeZone = 'UTC',
  from: Date = new Date(),
): { valid: boolean; normalized?: string; nextRunAt?: string; error?: string } {
  const parsed = parseCron(expression);

  if (!parsed.valid) {
    return { valid: false, error: parsed.error };
  }

  const next = nextCronRun(parsed.normalized!, from, timeZone);

  if (!next) {
    return { valid: false, error: 'This schedule never fires (no matching date).' };
  }

  return { valid: true, normalized: parsed.normalized, nextRunAt: next.toISOString() };
}

/**
 * Smallest gap between two consecutive fires, sampled over the next N fires.
 * Used to enforce the per-plan minimum interval — a `* * * * *` on a free plan
 * would otherwise let one project run 1440 sandboxes a day.
 */
export function minIntervalMinutes(expression: string, timeZone = 'UTC', from: Date = new Date(), samples = 12): number {
  let cursor = from;
  let previous: Date | null = null;
  let smallest = Number.POSITIVE_INFINITY;

  for (let index = 0; index < samples; index++) {
    const next = nextCronRun(expression, cursor, timeZone);

    if (!next) {
      break;
    }

    if (previous) {
      smallest = Math.min(smallest, (next.getTime() - previous.getTime()) / 60_000);
    }

    previous = next;
    cursor = next;
  }

  return Number.isFinite(smallest) ? smallest : Number.POSITIVE_INFINITY;
}
