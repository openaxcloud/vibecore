export interface HelpTopicLike {
  title: string;
  description: string;
}

/**
 * Canonical Help Center topics. Single source of truth shared by the Help
 * Center page (which decorates each topic with an icon) and the public
 * /search route (which searches them server-side).
 */
export const HELP_TOPICS: HelpTopicLike[] = [
  {
    title: 'Getting started',
    description: 'Set up your account, create your first project, and ship in minutes.',
  },
  {
    title: 'Workspaces',
    description: 'Manage files, terminals, ports, and live previews in the E-Code IDE.',
  },
  {
    title: 'Deployments',
    description: 'Publish static sites and full-stack apps with custom domains.',
  },
  {
    title: 'Billing',
    description: 'Plans, invoices, usage limits, and how to upgrade or cancel.',
  },
  {
    title: 'AI agent',
    description: 'Prompt the agent, review proposed edits, and iterate on your code.',
  },
  {
    title: 'Integrations',
    description: 'Connect GitHub, MCP servers, and third-party services to your projects.',
  },
];

/**
 * Canonical Help Center popular articles, shared with the public /search
 * route for the same reason as HELP_TOPICS.
 */
export const HELP_POPULAR_ARTICLES: string[] = [
  'How do I create a new project from a prompt?',
  'Connecting a GitHub repository to your workspace',
  'Adding a custom domain to a deployment',
  'Understanding usage limits on the Free plan',
  'Why is my preview stuck on "Starting"?',
  'Accepting and reverting AI agent edits',
  'Inviting teammates to an organization',
  'Configuring an MCP integration',
];

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
