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
export type CronFieldName = 'minute' | 'hour' | 'day-of-month' | 'month' | 'day-of-week';

export interface CronField {
  name: CronFieldName;
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

export type CronValidationErrorCode =
  | 'required'
  | 'field-count'
  | 'not-number'
  | 'out-of-range'
  | 'positive-step'
  | 'malformed-step'
  | 'malformed-range'
  | 'range-order'
  | 'empty-list-value';

export type CronValidationResult =
  | { valid: true }
  | {
      valid: false;
      errorCode: CronValidationErrorCode;
      field?: CronFieldName;
      token?: string;
      value?: number;
      min?: number;
      max?: number;
      expected?: number;
      actual?: number;
      start?: string;
      end?: string;
    };

type CronValidationError = Extract<CronValidationResult, { valid: false }>;

function validateNumber(token: string, field: CronField): CronValidationError | null {
  if (!/^\d+$/.test(token)) {
    return { valid: false, errorCode: 'not-number', field: field.name, token };
  }

  const value = Number(token);

  if (value < field.min || value > field.max) {
    return {
      valid: false,
      errorCode: 'out-of-range',
      field: field.name,
      value,
      min: field.min,
      max: field.max,
    };
  }

  return null;
}

function validateStep(step: string, field: CronField): CronValidationError | null {
  if (!/^\d+$/.test(step) || Number(step) < 1) {
    return { valid: false, errorCode: 'positive-step', field: field.name, token: step };
  }

  return null;
}

function validatePart(part: string, field: CronField): CronValidationError | null {
  // `*` matches the whole range.
  if (part === '*') {
    return null;
  }

  // `<range-or-*>/<step>`
  if (part.includes('/')) {
    const [range, step, ...rest] = part.split('/');

    if (rest.length > 0 || step === undefined || step === '') {
      return { valid: false, errorCode: 'malformed-step', field: field.name, token: part };
    }

    const stepError = validateStep(step, field);

    if (stepError) {
      return stepError;
    }

    return range === '*' ? null : validateRangeOrNumber(range, field);
  }

  return validateRangeOrNumber(part, field);
}

function validateRangeOrNumber(token: string, field: CronField): CronValidationError | null {
  if (token.includes('-')) {
    const [start, end, ...rest] = token.split('-');

    if (rest.length > 0 || start === undefined || end === undefined) {
      return { valid: false, errorCode: 'malformed-range', field: field.name, token };
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
      return { valid: false, errorCode: 'range-order', field: field.name, start, end };
    }

    return null;
  }

  return validateNumber(token, field);
}

export function validateCronExpression(expression: string): CronValidationResult {
  const trimmed = expression.trim();

  if (!trimmed) {
    return { valid: false, errorCode: 'required' };
  }

  const fields = trimmed.split(/\s+/);

  if (fields.length !== CRON_FIELDS.length) {
    return {
      valid: false,
      errorCode: 'field-count',
      expected: CRON_FIELDS.length,
      actual: fields.length,
    };
  }

  for (let i = 0; i < CRON_FIELDS.length; i++) {
    const field = CRON_FIELDS[i];

    for (const part of fields[i].split(',')) {
      if (part === '') {
        return { valid: false, errorCode: 'empty-list-value', field: field.name };
      }

      const validationError = validatePart(part, field);

      if (validationError) {
        return validationError;
      }
    }
  }

  return { valid: true };
}

/** A few presets to seed the Scheduled tier UI. */
export const CRON_PRESETS = [
  { id: 'every-15-minutes', expression: '*/15 * * * *' },
  { id: 'hourly', expression: '0 * * * *' },
  { id: 'daily-02', expression: '0 2 * * *' },
  { id: 'weekly-monday-09', expression: '0 9 * * 1' },
] as const;

export type CronPresetId = (typeof CRON_PRESETS)[number]['id'];
