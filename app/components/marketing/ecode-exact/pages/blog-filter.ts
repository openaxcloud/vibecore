export interface BlogPostLike {
  category: string;
}

/**
 * Filters blog posts by a selected category.
 *
 * The sentinel category 'All' (the default selection) returns every post.
 * Matching is exact and case-sensitive to mirror the category labels rendered
 * in the filter pills.
 */
export function filterPostsByCategory<T extends BlogPostLike>(posts: T[], selectedCategory: string): T[] {
  if (selectedCategory === 'All') {
    return posts;
  }

  return posts.filter((post) => post.category === selectedCategory);
}
