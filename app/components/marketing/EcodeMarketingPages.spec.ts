import { describe, expect, it } from 'vitest';

import {
  comparePages,
  marketingCampaignPages,
  marketingPages,
  newsletterPages,
  solutionPages,
} from './EcodeMarketingPages';
import { ecodeSurfacePages } from './EcodeSurfacePages';
import { publicFooterColumns, publicMarketingMenus } from '~/components/dashboard/SaaSLayout';

describe('E-Code marketing page registry', () => {
  it('covers the public E-Code pages missing from the initial import', () => {
    expect(Object.keys(marketingPages)).toEqual(
      expect.arrayContaining([
        'about',
        'product',
        'features',
        'careers',
        'blog',
        'docs',
        'contact',
        'partners',
        'press',
        'accessibility',
        'mobile',
        'desktop',
        'languages',
        'tutorials',
        'case-studies',
        'customers',
        'help-center',
        'forum',
        'ai',
        'ai-documentation',
        'mcp',
        'polyglot',
        'dpa',
        'commercial-agreement',
        'report-abuse',
        'subprocessors',
        'student-dpa',
        'marketplace',
        'community',
        'explore',
        'search',
        'demo',
        'theme-validation',
        'runtime-test',
      ]),
    );
  });

  it('preserves the imported static E-Code marketing mini-site content as routed pages', () => {
    expect(marketingPages.product.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(['Editor', 'AI', 'Agents', 'Deploy', 'Mobile', 'Collaboration']),
    );
    expect(marketingPages.product.highlights).toEqual(
      expect.arrayContaining(['Editor', 'AI generation', 'Agents', 'Deploy', 'Mobile', 'Collaboration']),
    );

    expect(marketingPages.customers.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(['Internal tools', 'AI products', 'Education']),
    );
    expect(marketingPages.customers.description).toContain('Cloud Run deployment');
  });

  it('covers E-Code solutions, comparison pages, campaigns and newsletter routes', () => {
    expect(Object.keys(solutionPages)).toEqual(
      expect.arrayContaining([
        'app-builder',
        'website-builder',
        'game-builder',
        'dashboard-builder',
        'chatbot-builder',
        'internal-ai-builder',
        'enterprise',
        'startups',
        'freelancers',
      ]),
    );

    expect(Object.keys(comparePages)).toEqual(
      expect.arrayContaining(['github-codespaces', 'glitch', 'heroku', 'codesandbox', 'aws-cloud9']),
    );
    expect(Object.keys(marketingCampaignPages)).toEqual(expect.arrayContaining(['bounties', 'deployments', 'teams']));
    expect(Object.keys(newsletterPages)).toEqual(
      expect.arrayContaining(['index', 'confirmed', 'confirm', 'unsubscribe']),
    );
  });

  it('connects the broader E-Code product surface registry to the marketing import', () => {
    expect(Object.keys(ecodeSurfacePages)).toEqual(
      expect.arrayContaining([
        'apps',
        'teams',
        'runtimes',
        'runtime-diagnostics',
        'database',
        'console',
        'shell',
        'authentication',
        'integrations',
        'solartech-ai-chat',
      ]),
    );
  });

  it('uses the E-Code public navigation and footer groups', () => {
    expect(Object.keys(publicMarketingMenus)).toEqual(['product', 'solutions', 'resources', 'company']);
    expect(publicMarketingMenus.product.map(([label]) => label)).toEqual([
      'AI Agent',
      'Browser IDE',
      'Multiplayer',
      'Mobile App',
      'Desktop App',
      'AI Platform',
      'Deployments',
      'Bounties',
      'Teams',
    ]);
    expect(publicFooterColumns.map((column) => column.title)).toEqual(['Product', 'Resources', 'Company', 'Legal']);
  });
});
