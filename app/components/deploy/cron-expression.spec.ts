import { describe, expect, it } from 'vitest';
import { CRON_PRESETS, validateCronExpression } from './cron-expression';

describe('validateCronExpression', () => {
  it('accepts every shipped preset', () => {
    for (const preset of CRON_PRESETS) {
      expect(validateCronExpression(preset.expression), preset.label).toEqual({ valid: true });
    }
  });

  it('accepts common valid forms', () => {
    for (const expr of ['* * * * *', '*/15 * * * *', '0 0,12 * * *', '0 9-17 * * 1-5', '30 1 1 1 *', '0 */2 * * *']) {
      expect(validateCronExpression(expr), expr).toEqual({ valid: true });
    }
  });

  it('rejects the empty expression', () => {
    expect(validateCronExpression('   ').valid).toBe(false);
  });

  it('rejects the wrong field count', () => {
    expect(validateCronExpression('* * * *').valid).toBe(false);
    expect(validateCronExpression('* * * * * *').valid).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(validateCronExpression('60 * * * *').valid).toBe(false); // minute max 59
    expect(validateCronExpression('* 24 * * *').valid).toBe(false); // hour max 23
    expect(validateCronExpression('* * 0 * *').valid).toBe(false); // day-of-month min 1
    expect(validateCronExpression('* * * 13 *').valid).toBe(false); // month max 12
    expect(validateCronExpression('* * * * 7').valid).toBe(false); // weekday max 6
  });

  it('rejects malformed ranges and steps', () => {
    expect(validateCronExpression('5-1 * * * *').valid).toBe(false); // inverted range
    expect(validateCronExpression('*/0 * * * *').valid).toBe(false); // zero step
    expect(validateCronExpression('1-2-3 * * * *').valid).toBe(false); // double range
    expect(validateCronExpression('a * * * *').valid).toBe(false); // non-numeric
    expect(validateCronExpression('0,,5 * * * *').valid).toBe(false); // empty list entry
  });

  it('returns a descriptive error naming the offending field', () => {
    const result = validateCronExpression('* 99 * * *');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('hour');
  });
});
