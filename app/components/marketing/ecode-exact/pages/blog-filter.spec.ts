import { describe, expect, it } from 'vitest';
import { filterPostsByCategory } from './blog-filter';

const posts = [
  { category: 'AI Agent', title: 'a' },
  { category: 'Deployments', title: 'b' },
  { category: 'Product', title: 'c' },
  { category: 'Product', title: 'd' },
];

describe('filterPostsByCategory', () => {
  it("returns all posts when the 'All' sentinel is selected", () => {
    expect(filterPostsByCategory(posts, 'All')).toEqual(posts);
  });

  it('returns only posts matching the selected category', () => {
    expect(filterPostsByCategory(posts, 'Product')).toEqual([
      { category: 'Product', title: 'c' },
      { category: 'Product', title: 'd' },
    ]);
  });

  it('returns a single post for a category with one match', () => {
    expect(filterPostsByCategory(posts, 'AI Agent')).toEqual([{ category: 'AI Agent', title: 'a' }]);
  });

  it('returns an empty array for a category with no posts', () => {
    expect(filterPostsByCategory(posts, 'Pricing')).toEqual([]);
  });

  it('matches case-sensitively to mirror the rendered labels', () => {
    expect(filterPostsByCategory(posts, 'product')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const original = [...posts];
    filterPostsByCategory(posts, 'Product');
    expect(posts).toEqual(original);
  });
});
