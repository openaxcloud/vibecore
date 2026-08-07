import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  filterHelpArticles,
  filterHelpTopics,
  getHelpSearchContent,
  HELP_POPULAR_ARTICLES,
  HELP_TOPICS,
  normalizeHelpQuery,
} from './help-search';

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

describe('localized Help Center search corpus', () => {
  it('keeps complete EN/FR coverage with stable topic identifiers', () => {
    const english = getHelpSearchContent('en-US');
    const french = getHelpSearchContent('fr-CA');

    expect(english.topics).toHaveLength(6);
    expect(french.topics).toHaveLength(english.topics.length);
    expect(french.popularArticles).toHaveLength(english.popularArticles.length);
    expect(french.topics.map(({ id }) => id)).toEqual(english.topics.map(({ id }) => id));
    expect(french.topics.map(({ title }) => title)).toEqual([
      'Premiers pas',
      'Espaces de travail',
      'Déploiements',
      'Facturation',
      'Agent IA',
      'Intégrations',
    ]);
  });

  it('falls back to English and keeps compatibility exports catalog-derived', () => {
    const english = getHelpSearchContent('de-DE');

    expect(english.topics[0]?.title).toBe('Getting started');
    expect(english.popularArticles[0]).toBe('How do I create a new project from a prompt?');
    expect(HELP_TOPICS).toBe(getHelpSearchContent('en').topics);
    expect(HELP_POPULAR_ARTICLES).toBe(getHelpSearchContent('en').popularArticles);
  });

  it('preserves brands and technical terms in the localized corpus', () => {
    const french = getHelpSearchContent('fr');
    const workspace = french.topics.find(({ id }) => id === 'workspaces');
    const integrations = french.topics.find(({ id }) => id === 'integrations');

    expect(workspace?.description).toContain('IDE E-Code');
    expect(integrations?.description).toContain('GitHub');
    expect(integrations?.description).toContain('MCP');
    expect(french.popularArticles).toContain('Comprendre les limites d’utilisation du forfait Free');
  });
});

describe('normalizeHelpQuery', () => {
  it('trims and lower-cases the query without changing user-visible accents', () => {
    expect(normalizeHelpQuery('  Déploiements  ')).toBe('déploiements');
  });

  it('reduces a whitespace-only query to an empty string', () => {
    expect(normalizeHelpQuery('   ')).toBe('');
  });
});

describe('filterHelpTopics', () => {
  it('returns all topics for an empty or whitespace-only query', () => {
    expect(filterHelpTopics(topics, '')).toEqual(topics);
    expect(filterHelpTopics(topics, '   ')).toEqual(topics);
  });

  it('matches localized titles case- and diacritic-insensitively', () => {
    const french = getHelpSearchContent('fr');

    expect(filterHelpTopics(french.topics, 'DEPLOIEMENTS').map(({ id }) => id)).toEqual(['deployments']);
  });

  it('matches against topic titles and descriptions', () => {
    expect(filterHelpTopics(topics, 'billing')).toEqual([
      { title: 'Billing', description: 'Plans, invoices, usage limits, and upgrades.' },
    ]);
    expect(filterHelpTopics(topics, 'custom domains')).toEqual([
      {
        title: 'Deployments',
        description: 'Publish static sites and full-stack apps with custom domains.',
      },
    ]);
  });

  it('returns no match when the corpus does not contain the query', () => {
    expect(filterHelpTopics(topics, 'kubernetes')).toEqual([]);
  });

  it('does not mutate the catalog array', () => {
    const original = [...topics];

    filterHelpTopics(topics, 'billing');

    expect(topics).toEqual(original);
  });
});

describe('filterHelpArticles', () => {
  it('returns all articles for an empty query', () => {
    expect(filterHelpArticles(articles, '')).toEqual(articles);
  });

  it('matches English and French article titles case- and diacritic-insensitively', () => {
    const french = getHelpSearchContent('fr');

    expect(filterHelpArticles(articles, 'CUSTOM DOMAIN')).toEqual(['Adding a custom domain to a deployment']);
    expect(filterHelpArticles(french.popularArticles, 'domaine personnalise')).toEqual([
      'Ajouter un domaine personnalisé à un déploiement',
    ]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterHelpArticles(articles, 'nonexistent')).toEqual([]);
  });
});

describe('help-search source guard', () => {
  it('has zero scanner findings and no duplicated rendered English corpus', async () => {
    const sourcePath = 'app/components/marketing/ecode-exact/pages/help-search.ts';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('getMarketingExactHelpCenterCopy');
    expect(source).not.toContain("title: 'Getting started'");
    expect(source).not.toContain("title: 'Workspaces'");
    expect(source).not.toContain('Set up your account, create your first project');
    expect(source).not.toContain('Connecting a GitHub repository');
  });
});
