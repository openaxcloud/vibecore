import { describe, it, expect } from 'vitest';
import { clampPage } from './GitHubRepositorySelector';

describe('clampPage', () => {
  it('keeps an in-range page unchanged', () => {
    expect(clampPage(2, 5)).toBe(2);
    expect(clampPage(1, 1)).toBe(1);
    expect(clampPage(5, 5)).toBe(5);
  });

  it('clamps a page that is now past the end after the list shrinks', () => {
    // User was on page 3, refresh shrank the list so only 1 page remains.
    expect(clampPage(3, 1)).toBe(1);
    expect(clampPage(4, 2)).toBe(2);
  });

  it('returns 1 when there are zero pages (empty list)', () => {
    expect(clampPage(3, 0)).toBe(1);
    expect(clampPage(1, 0)).toBe(1);
  });

  it('floors a page below 1 back to 1', () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-2, 5)).toBe(1);
  });
});
