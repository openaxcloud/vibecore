import { describe, expect, it } from 'vitest';
import { parseSessionLockState } from './session';

const safeDefault = { locked: false, biometricEnabled: false };

describe('parseSessionLockState corrupt-storage resilience', () => {
  it('falls back to the safe locked-out default on truncated/corrupt JSON', () => {
    // Interrupted write / OS migration / external tampering can leave a
    // half-written value. JSON.parse would throw and break session-lock init.
    expect(parseSessionLockState('{"locked":true,"biometricEna')).toEqual(safeDefault);
    expect(parseSessionLockState('not json at all')).toEqual(safeDefault);
    expect(parseSessionLockState('')).toEqual(safeDefault);
  });

  it('falls back to the safe default for non-object JSON values', () => {
    expect(parseSessionLockState('null')).toEqual(safeDefault);
    expect(parseSessionLockState('42')).toEqual(safeDefault);
    expect(parseSessionLockState('"locked"')).toEqual(safeDefault);
    expect(parseSessionLockState('true')).toEqual(safeDefault);
  });

  it('still parses valid persisted lock state', () => {
    expect(
      parseSessionLockState(
        JSON.stringify({ locked: true, biometricEnabled: true, userHint: 'ada@example.com' }),
      ),
    ).toEqual({ locked: true, biometricEnabled: true, userHint: 'ada@example.com' });
  });
});
