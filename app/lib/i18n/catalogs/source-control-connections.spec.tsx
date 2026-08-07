import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  formatRepositoryTooltip,
  formatSourceControlDateTime,
  formatSourceControlMegabytes,
  formatSourceControlNumber,
  getSourceControlConnectionsCopy,
  interpolateSourceControlCopy,
  sourceControlConnectionsEn,
  sourceControlConnectionsFr,
} from './source-control-connections';

const renderedSources = [
  '../../../components/@settings/tabs/github/components/GitHubStats.tsx',
  '../../../components/@settings/tabs/github/components/GitHubConnection.tsx',
  '../../../components/@settings/tabs/gitlab/components/GitLabConnection.tsx',
  '../../../components/@settings/tabs/github/components/GitHubOauthConnectButton.tsx',
  '../../../components/@settings/tabs/github/components/GitHubErrorBoundary.tsx',
] as const;

describe('source-control connection catalog', () => {
  it('keeps flat EN/FR resources in exact structural parity', () => {
    expect(Object.keys(sourceControlConnectionsFr)).toEqual(Object.keys(sourceControlConnectionsEn));
    expect(Object.values(sourceControlConnectionsEn).every((value) => typeof value === 'string')).toBe(true);
    expect(Object.values(sourceControlConnectionsFr).every((value) => typeof value === 'string')).toBe(true);
  });

  it('provides professional French while preserving required provider identifiers', () => {
    const intentionallyStableIdentifiers = new Set<keyof typeof sourceControlConnectionsEn>([
      'sourceControl.github.scopes.classic',
      'sourceControl.gitlab.scopes',
    ]);

    for (const key of Object.keys(sourceControlConnectionsEn) as (keyof typeof sourceControlConnectionsEn)[]) {
      if (intentionallyStableIdentifiers.has(key)) {
        expect(sourceControlConnectionsFr[key], key).toBe(sourceControlConnectionsEn[key]);
      } else {
        expect(sourceControlConnectionsFr[key], key).not.toBe(sourceControlConnectionsEn[key]);
      }
    }

    expect(sourceControlConnectionsFr['sourceControl.github.scopes.classic']).toBe('repo, read:org, read:user');
    expect(sourceControlConnectionsFr['sourceControl.gitlab.scopes']).toBe('api, read_repository');
    expect(sourceControlConnectionsFr['sourceControl.github.stats.pullRequests']).toContain('Pull request');
    expect(sourceControlConnectionsFr['sourceControl.github.oauth.description']).toContain('E-Code');
  });

  it('falls back to English without exposing raw catalog keys', () => {
    const copy = getSourceControlConnectionsCopy('es-MX');

    expect(copy['sourceControl.common.connect']).toBe('Connect');
    expect(JSON.stringify(copy)).not.toContain('missing.translation');
  });

  it('formats French numbers, storage sizes, dates and plurals', () => {
    expect(formatSourceControlNumber(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(formatSourceControlMegabytes(1024 * 1024, 'fr')).toBe('1,00');
    expect(formatSourceControlDateTime(new Date('2026-08-05T12:34:00.000Z'), 'fr')).toMatch(/août 2026/u);
    expect(
      formatRepositoryTooltip('fr', {
        languageName: 'TypeScript',
        bytes: 1024 * 1024,
        repositoryCount: 1,
      }),
    ).toBe('TypeScript : 1,00 Mo dans 1 dépôt');
    expect(
      formatRepositoryTooltip('fr', {
        languageName: 'Go',
        bytes: 2 * 1024 * 1024,
        repositoryCount: 2,
      }),
    ).toBe('Go : 2,00 Mo dans 2 dépôts');
  });

  it('interpolates platform copy without translating provider or user data', () => {
    expect(
      interpolateSourceControlCopy('{language} · {count}', {
        language: 'My Custom DSL',
        count: 7,
      }),
    ).toBe('My Custom DSL · 7');
  });

  it('leaves zero source-scanner findings across every rendered component', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    for (const relativePath of renderedSources) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
    }
  });

  it('masks raw provider errors while preserving URLs, scopes and environment identifiers', () => {
    const githubConnection = readFileSync(
      new URL('../../../components/@settings/tabs/github/components/GitHubConnection.tsx', import.meta.url),
      'utf8',
    );
    const gitlabConnection = readFileSync(
      new URL('../../../components/@settings/tabs/gitlab/components/GitLabConnection.tsx', import.meta.url),
      'utf8',
    );
    const oauth = readFileSync(
      new URL('../../../components/@settings/tabs/github/components/GitHubOauthConnectButton.tsx', import.meta.url),
      'utf8',
    );
    const boundary = readFileSync(
      new URL('../../../components/@settings/tabs/github/components/GitHubErrorBoundary.tsx', import.meta.url),
      'utf8',
    );

    expect(githubConnection).not.toContain('>{error}</p>');
    expect(gitlabConnection).not.toContain('>{error}</p>');
    expect(oauth).not.toContain('event.data.errorMessage');
    expect(oauth).not.toContain('payload.error');
    expect(oauth).not.toContain('caught.message');
    expect(boundary).not.toContain('this.state.error.message');
    expect(githubConnection).toContain('https://github.com/settings/tokens');
    expect(githubConnection).toContain("copy['sourceControl.github.scopes.classic']");
    expect(githubConnection).not.toContain("? 'repo, read:org, read:user'");
    expect(githubConnection).toContain('VITE_GITHUB_ACCESS_TOKEN');
    expect(gitlabConnection).toContain('https://gitlab.com');
    expect(gitlabConnection).toContain('VITE_GITLAB_ACCESS_TOKEN');
  });

  it('contains responsive, touch-target, recovery and light/dark safeguards', () => {
    const combined = renderedSources
      .map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8'))
      .join('\n');

    expect(combined).toContain('grid-cols-1');
    expect(combined).toContain('sm:flex-row');
    expect(combined).toContain('min-h-11');
    expect(combined).toContain('whitespace-normal');
    expect(combined).toContain('dark:');
    expect(combined).toContain('role="status"');
    expect(combined).toContain('role="alert"');
    expect(combined).toContain('var(--status-error-bg)');
  });
});
