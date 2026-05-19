import { describe, expect, it } from 'vitest';

import {
  comparePages,
  marketingCampaignPages,
  marketingPages,
  newsletterPages,
  solutionPages,
} from './EcodeMarketingPages';

describe('E-Code marketing page registry', () => {
  it('covers the public E-Code pages missing from the initial import', () => {
    expect(Object.keys(marketingPages)).toEqual(
      expect.arrayContaining([
        'about',
        'careers',
        'blog',
        'contact',
        'partners',
        'press',
        'accessibility',
        'mobile',
        'desktop',
        'languages',
        'tutorials',
        'case-studies',
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
      ]),
    );
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
    expect(Object.keys(newsletterPages)).toEqual(expect.arrayContaining(['confirmed', 'confirm', 'unsubscribe']));
  });
});
