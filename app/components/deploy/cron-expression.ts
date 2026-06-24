/**
 * Standard 5-field cron validation for the Scheduled deployment tier.
 *
 * Fields: minute hour day-of-month month day-of-week.
 * Supported tokens per field: wildcard, wildcard-with-step, ranges (a-b),
 * ranges-with-step, comma lists (a,b,c), and plain integers — the subset every
 * cluster CronJob scheduler accepts. This is
 * pure client-side validation so the Scheduled tier UI can give immediate
 * feedback; it does NOT schedule anything (no runtime exists yet).
 */
export interface CronField {
  name: string;
  min: number;
  max: number;
}

export const CRON_FIELDS: readonly CronField[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day-of-week', min: 0, max: 6 },
];

export interface CronValidationResult {
  valid: boolean;
  error?: string;
}

function validateNumber(token: string, field: CronField): string | null {
  if (!/^\d+$/.test(token)) {
    return `${field.name}: "${token}" is not a number`;
  }

  const value = Number(token);

  if (value < field.min || value > field.max) {
    return `${field.name}: ${value} is out of range (${field.min}-${field.max})`;
  }

  return null;
}

function validateStep(step: string, field: CronField): string | null {
  if (!/^\d+$/.test(step) || Number(step) < 1) {
    return `${field.name}: step "${step}" must be a positive integer`;
  }

  return null;
}

function validatePart(part: string, field: CronField): string | null {
  // `*` matches the whole range.
  if (part === '*') {
    return null;
  }

  // `<range-or-*>/<step>`
  if (part.includes('/')) {
    const [range, step, ...rest] = part.split('/');

    if (rest.length > 0 || step === undefined || step === '') {
      return `${field.name}: malformed step expression "${part}"`;
    }

    const stepError = validateStep(step, field);

    if (stepError) {
      return stepError;
    }

    return range === '*' ? null : validateRangeOrNumber(range, field);
  }

  return validateRangeOrNumber(part, field);
}

function validateRangeOrNumber(token: string, field: CronField): string | null {
  if (token.includes('-')) {
    const [start, end, ...rest] = token.split('-');

    if (rest.length > 0 || start === undefined || end === undefined) {
      return `${field.name}: malformed range "${token}"`;
    }

    const startError = validateNumber(start, field);

    if (startError) {
      return startError;
    }

    const endError = validateNumber(end, field);

    if (endError) {
      return endError;
    }

    if (Number(start) > Number(end)) {
      return `${field.name}: range start ${start} is greater than end ${end}`;
    }

    return null;
  }

  return validateNumber(token, field);
}

export function validateCronExpression(expression: string): CronValidationResult {
  const trimmed = expression.trim();

  if (!trimmed) {
    return { valid: false, error: 'Cron expression is required' };
  }

  const fields = trimmed.split(/\s+/);

  if (fields.length !== CRON_FIELDS.length) {
    return {
      valid: false,
      error: `Expected ${CRON_FIELDS.length} fields (minute hour day month weekday), got ${fields.length}`,
    };
  }

  for (let i = 0; i < CRON_FIELDS.length; i++) {
    const field = CRON_FIELDS[i];

    for (const part of fields[i].split(',')) {
      if (part === '') {
        return { valid: false, error: `${field.name}: empty value in list` };
      }

      const error = validatePart(part, field);

      if (error) {
        return { valid: false, error };
      }
    }
  }

  return { valid: true };
}

/** A few presets to seed the Scheduled tier UI. */
export const CRON_PRESETS: readonly { label: string; expression: string }[] = [
  { label: 'Every 15 minutes', expression: '*/15 * * * *' },
  { label: 'Hourly', expression: '0 * * * *' },
  { label: 'Daily at 02:00', expression: '0 2 * * *' },
  { label: 'Weekly (Mon 09:00)', expression: '0 9 * * 1' },
];
