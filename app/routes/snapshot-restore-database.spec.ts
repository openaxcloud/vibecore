import { describe, expect, it } from 'vitest';
import { shouldRestoreDatabase } from './snapshot-restore-database';

describe('shouldRestoreDatabase', () => {
  it('triggers a restore only for explicit truthy values', () => {
    expect(shouldRestoreDatabase('true')).toBe(true);
    expect(shouldRestoreDatabase(true)).toBe(true);
    expect(shouldRestoreDatabase('TRUE')).toBe(true);
    expect(shouldRestoreDatabase('1')).toBe(true);
    expect(shouldRestoreDatabase('on')).toBe(true);
    expect(shouldRestoreDatabase('yes')).toBe(true);
  });

  it('does not trigger a restore for falsy, missing, or unrelated values', () => {
    expect(shouldRestoreDatabase('false')).toBe(false);
    expect(shouldRestoreDatabase(false)).toBe(false);
    expect(shouldRestoreDatabase('')).toBe(false);
    expect(shouldRestoreDatabase('0')).toBe(false);
    expect(shouldRestoreDatabase(undefined)).toBe(false);
    expect(shouldRestoreDatabase(null)).toBe(false);

    /* The literal string the rollback modal posts when the box is unchecked. */
    expect(shouldRestoreDatabase('false')).toBe(false);
  });
});
