import {
  getMarketingExactHelpCenterCopy,
  type HelpCenterTopicId,
} from '~/lib/i18n/catalogs/marketing-exact-help-center';

export interface HelpTopicLike {
  title: string;
  description: string;
}

export interface HelpSearchTopic extends HelpTopicLike {
  id: HelpCenterTopicId;
}

export interface HelpSearchContent {
  topics: readonly HelpSearchTopic[];
  popularArticles: readonly string[];
}

/**
 * Returns the localized Help Center corpus used by both the Help Center page
 * and the server-backed public search route. The exact marketing catalog is
 * the only source of rendered topic and article copy.
 */
export function getHelpSearchContent(language?: string | null): HelpSearchContent {
  const copy = getMarketingExactHelpCenterCopy(language).exactHelpCenter;

  return {
    topics: copy.topics,
    popularArticles: copy.popularArticles,
  };
}

/**
 * English compatibility exports for callers that have not opted into locale
 * selection yet. They are derived from the catalog instead of duplicating
 * user-visible copy in this module.
 */
const englishHelpSearchContent = getHelpSearchContent('en');

export const HELP_TOPICS: readonly HelpSearchTopic[] = englishHelpSearchContent.topics;

export const HELP_POPULAR_ARTICLES: readonly string[] = englishHelpSearchContent.popularArticles;

/** Trim and case-fold a raw query while preserving its user-visible accents. */
export function normalizeHelpQuery(query: string): string {
  return query.trim().toLowerCase();
}

function normalizeHelpSearchText(value: string): string {
  return normalizeHelpQuery(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Filters localized Help Center topics without mutating the catalog arrays.
 * Matching is case- and diacritic-insensitive for natural French searches.
 */
export function filterHelpTopics<T extends HelpTopicLike>(topics: readonly T[], query: string): T[] {
  const normalized = normalizeHelpSearchText(query);

  if (normalized === '') {
    return [...topics];
  }

  return topics.filter(
    (topic) =>
      normalizeHelpSearchText(topic.title).includes(normalized) ||
      normalizeHelpSearchText(topic.description).includes(normalized),
  );
}

/**
 * Filters localized Help Center article titles without mutating the catalog
 * array. Matching is case- and diacritic-insensitive.
 */
export function filterHelpArticles(articles: readonly string[], query: string): string[] {
  const normalized = normalizeHelpSearchText(query);

  if (normalized === '') {
    return [...articles];
  }

  return articles.filter((article) => normalizeHelpSearchText(article).includes(normalized));
}
