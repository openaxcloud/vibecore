import { describe, expect, it } from 'vitest';
import { projectSelectionToPersist } from './project-selection-to-persist';

describe('selection persistence during archive hydration', () => {
  it('does not replace pending audit with the temporary README fallback', () => {
    const pending = '/home/project/audit.txt';
    expect(projectSelectionToPersist('/home/project/README.md', pending)).toBe(pending);
    expect(projectSelectionToPersist(undefined, pending)).toBe(pending);
    expect(projectSelectionToPersist(pending, undefined)).toBe(pending);
  });

  it('persists an explicit selection normally after restoration has resolved', () => {
    expect(projectSelectionToPersist('/home/project/other.txt', undefined)).toBe('/home/project/other.txt');
    expect(projectSelectionToPersist(undefined, undefined)).toBeUndefined();
  });
});
