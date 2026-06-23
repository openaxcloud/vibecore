import { describe, expect, it } from 'vitest';
import { filterFeaturesByCategory } from './Features';

describe('filterFeaturesByCategory', () => {
  const features = [
    { category: 'AI-Powered' },
    { category: 'Creating' },
    { category: 'Creating' },
    { category: 'Learning Together' },
    { category: 'Infrastructure' },
    { category: 'Security' },
    { category: 'Analytics' },
  ];

  it("returns every feature for the 'All' tab", () => {
    expect(filterFeaturesByCategory(features, 'All')).toHaveLength(features.length);
  });

  it('returns only the features matching an exact category', () => {
    expect(filterFeaturesByCategory(features, 'Creating')).toEqual([
      { category: 'Creating' },
      { category: 'Creating' },
    ]);
    expect(filterFeaturesByCategory(features, 'AI-Powered')).toEqual([{ category: 'AI-Powered' }]);
  });

  it('returns an empty array when no feature matches (drives the empty-state UI)', () => {
    expect(filterFeaturesByCategory(features, 'Nonexistent')).toEqual([]);
  });

  it("never yields an empty grid for a tab that isn't 'All' when categories match the data", () => {
    /*
     * Regression guard: the tab list must be a subset of the data categories
     * (plus 'All'), otherwise a tab renders a dead, blank grid.
     */
    const tabCategories = [
      'All',
      'AI-Powered',
      'Creating',
      'Learning Together',
      'Infrastructure',
      'Security',
      'Analytics',
    ];

    const dataCategories = new Set(features.map((f) => f.category));

    for (const tab of tabCategories) {
      if (tab === 'All') {
        continue;
      }

      expect(dataCategories.has(tab)).toBe(true);
      expect(filterFeaturesByCategory(features, tab).length).toBeGreaterThan(0);
    }
  });
});
