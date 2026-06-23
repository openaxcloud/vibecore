import { describe, expect, it } from 'vitest';
import { isAllSelected } from './selection-dialog-utils';

describe('isAllSelected', () => {
  it('is true when every item is selected', () => {
    expect(isAllSelected(3, 3)).toBe(true);
  });

  it('is true after toggling every item individually (the desync bug)', () => {
    /*
     * Simulates the user manually checking each of 4 items one-by-one.
     * The label must read "Deselect All" once all are checked, even though
     * no Select-All action was ever invoked.
     */
    const total = 4;

    let selected = 0;
    expect(isAllSelected(selected, total)).toBe(false);

    for (let i = 0; i < total; i++) {
      selected += 1;
    }

    expect(isAllSelected(selected, total)).toBe(true);
  });

  it('is false after deselecting one item following a select-all', () => {
    // Select-all then uncheck one => label must revert to "Select All".
    expect(isAllSelected(5, 5)).toBe(true);
    expect(isAllSelected(4, 5)).toBe(false);
  });

  it('is false when no items are selected', () => {
    expect(isAllSelected(0, 3)).toBe(false);
  });

  it('is false for an empty item list', () => {
    expect(isAllSelected(0, 0)).toBe(false);
  });
});
