import { describe, expect, it } from 'vitest';
import { filterHelpArticles, filterHelpTopics, normalizeHelpQuery } from './help-search';

const topics = [
  { title: 'Getting started', description: 'Set up your account and ship in minutes.' },
  { title: 'Deployments', description: 'Publish static sites and full-stack apps with custom domains.' },
  { title: 'Billing', description: 'Plans, invoices, usage limits, and upgrades.' },
];

const articles = [
  'How do I create a new project from a prompt?',
  'Adding a custom domain to a deployment',
  'Understanding usage limits on the Free plan',
];

describe('normalizeHelpQuery', () => {
  it('trims and lower-cases the query', () => {
    expect(normalizeHelpQuery('  Custom Domain  ')).toBe('custom domain');
  });

  it('reduces a whitespace-only query to an empty string', () => {
    expect(normalizeHelpQuery('   ')).toBe('');
  });
});

describe('filterHelpTopics', () => {
  it('returns all topics for an empty query', () => {
    expect(filterHelpTopics(topics, '')).toEqual(topics);
  });

  it('returns all topics for a whitespace-only query', () => {
    expect(filterHelpTopics(topics, '   ')).toEqual(topics);
  });

  it('matches against the topic title case-insensitively', () => {
    expect(filterHelpTopics(topics, 'billing')).toEqual([
      { title: 'Billing', description: 'Plans, invoices, usage limits, and upgrades.' },
    ]);
  });

  it('matches against the topic description', () => {
    expect(filterHelpTopics(topics, 'custom domains')).toEqual([
      {
        title: 'Deployments',
        description: 'Publish static sites and full-stack apps with custom domains.',
      },
    ]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterHelpTopics(topics, 'kubernetes')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const original = [...topics];
    filterHelpTopics(topics, 'billing');
    expect(topics).toEqual(original);
  });
});

describe('filterHelpArticles', () => {
  it('returns all articles for an empty query', () => {
    expect(filterHelpArticles(articles, '')).toEqual(articles);
  });

  it('matches articles case-insensitively', () => {
    expect(filterHelpArticles(articles, 'CUSTOM DOMAIN')).toEqual(['Adding a custom domain to a deployment']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterHelpArticles(articles, 'nonexistent')).toEqual([]);
  });
});
