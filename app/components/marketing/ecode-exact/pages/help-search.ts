export interface HelpTopicLike {
  title: string;
  description: string;
}

/**
 * Normalizes a raw search query for matching: trims surrounding whitespace and
 * lower-cases it so matching is case-insensitive.
 */
export function normalizeHelpQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Filters Help Center topics by a free-text query.
 *
 * An empty (or whitespace-only) query returns every topic so the page renders
 * its full default state. Otherwise topics are matched case-insensitively
 * against their title and description.
 */
export function filterHelpTopics<T extends HelpTopicLike>(topics: T[], query: string): T[] {
  const normalized = normalizeHelpQuery(query);

  if (normalized === '') {
    return topics;
  }

  return topics.filter(
    (topic) => topic.title.toLowerCase().includes(normalized) || topic.description.toLowerCase().includes(normalized),
  );
}

/**
 * Filters Help Center popular articles (plain strings) by a free-text query.
 *
 * An empty (or whitespace-only) query returns every article. Otherwise articles
 * are matched case-insensitively against their text.
 */
export function filterHelpArticles(articles: string[], query: string): string[] {
  const normalized = normalizeHelpQuery(query);

  if (normalized === '') {
    return articles;
  }

  return articles.filter((article) => article.toLowerCase().includes(normalized));
}
