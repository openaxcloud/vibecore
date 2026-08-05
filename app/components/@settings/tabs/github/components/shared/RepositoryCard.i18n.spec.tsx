/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryCard } from './RepositoryCard';
import {
  formatRepositoryCardCopy,
  formatRepositoryCardNumber,
  formatRepositoryCardPercentage,
  formatRepositoryCardSize,
  formatRepositoryCardUpdatedAt,
  getRepositoryCardCopy,
  repositoryCardEn,
  repositoryCardFr,
} from '~/lib/i18n/catalogs/repository-card';
import type { GitHubRepoInfo } from '~/types/GitHub';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

const repository: GitHubRepoInfo = {
  id: 'repository-user-id',
  name: 'customer-owned-super-long-repository-name-without-spaces',
  full_name: 'customer/customer-owned-super-long-repository-name-without-spaces',
  html_url: 'https://github.com/customer/customer-owned-super-long-repository-name-without-spaces',
  description: 'User-provided English repository description — preserve exactly.',
  stargazers_count: 12_345,
  forks_count: 2_345,
  default_branch: 'feature/customer-owned-branch',
  updated_at: '2026-08-03T12:00:00.000Z',
  language: 'TypeScript',
  languages_url: 'https://api.github.com/repos/customer/repository/languages',
  private: true,
  fork: true,
  archived: true,
  size: 2_048,
  contributors_count: 42,
  branches_count: 1_234,
  issues_count: 7,
  pull_requests_count: 3,
  license: { name: 'MIT License', spdx_id: 'MIT' },
  topics: ['customer-topic', 'api-v2', 'third-user-topic'],
};

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('RepositoryCard i18n', () => {
  beforeEach(() => {
    language = 'en';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps catalog parity, interpolation, formatting, and English fallback', () => {
    expect(Object.keys(repositoryCardFr).sort()).toEqual(Object.keys(repositoryCardEn).sort());

    for (const key of Object.keys(repositoryCardEn) as Array<keyof typeof repositoryCardEn>) {
      expect(repositoryCardEn[key].trim().length, key).toBeGreaterThan(0);
      expect(repositoryCardFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(repositoryCardFr[key]), key).toEqual(interpolationTokens(repositoryCardEn[key]));
    }

    expect(getRepositoryCardCopy('de-DE')['repositoryCard.action.view']).toBe('View');
    expect(formatRepositoryCardNumber(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(formatRepositoryCardPercentage(83, 'fr')).toMatch(/^83[\s\u00a0]%$/u);
    expect(formatRepositoryCardSize(2_048, 'fr')).toBe('2,0 Mo');
    expect(
      formatRepositoryCardCopy(repositoryCardFr['repositoryCard.action.open'], {
        repository: repository.name,
      }),
    ).toBe(`Ouvrir le dépôt ${repository.name}`);
    expect(formatRepositoryCardUpdatedAt('2026-08-05T08:00:00.000Z', 'fr', '2026-08-05T12:00:00.000Z')).toBe(
      'Aujourd’hui',
    );
    expect(formatRepositoryCardUpdatedAt('2026-08-04T12:00:00.000Z', 'fr', '2026-08-05T12:00:00.000Z')).toBe(
      'Il y a 1 jour',
    );
    expect(formatRepositoryCardUpdatedAt('2026-07-22T12:00:00.000Z', 'fr', '2026-08-05T12:00:00.000Z')).toBe(
      'Il y a 2 semaines',
    );
    expect(formatRepositoryCardUpdatedAt('not-a-date', 'fr')).toBe('Date indisponible');
  });

  it('renders the compact card fully localized while preserving provider and user values', () => {
    language = 'fr';

    const onSelect = vi.fn();

    render(<RepositoryCard repository={repository} variant="compact" onSelect={onSelect} />);

    const button = screen.getByRole('button', { name: `Ouvrir le dépôt ${repository.name}` });

    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('min-h-11');
    expect(button.className).toContain('min-w-0');
    expect(button.querySelector('.min-\\[420px\\]\\:flex-row')).toBeTruthy();
    expect(screen.getByText(repository.name)).toBeTruthy();
    expect(screen.getByText(repository.description)).toBeTruthy();
    expect(screen.getByText(repository.language)).toBeTruthy();
    expect(screen.getByTitle('Dépôt privé')).toBeTruthy();
    expect(screen.getByTitle('Dépôt dupliqué')).toBeTruthy();
    expect(screen.getByTitle('Dépôt archivé')).toBeTruthy();
    expect(screen.getByTitle(/Étoiles.*12[\s\u202f]345/u)).toBeTruthy();
    expect(screen.getByTitle(/Copies.*2[\s\u202f]345/u)).toBeTruthy();
    expect(screen.getByTitle(/Langage principal\s*:\s*TypeScript/u)).toBeTruthy();
    expect(screen.getByTitle(/Taille.*2,0[\s\u00a0]Mo/u)).toBeTruthy();
    expect(screen.getByText('Il y a 2 jours')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByTitle('Private repository')).toBeNull();

    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(repository.html_url).toBe(
      'https://github.com/customer/customer-owned-super-long-repository-name-without-spaces',
    );
  });

  it('localizes detailed metrics, health, badges, tooltips and zero-safe extended states', () => {
    language = 'fr';

    const onSelect = vi.fn();

    render(
      <RepositoryCard
        repository={{ ...repository, branches_count: 0, contributors_count: 0 }}
        variant="detailed"
        onSelect={onSelect}
        showHealthScore
        showExtendedMetrics
      />,
    );

    expect(screen.getByRole('button', { name: `Ouvrir le dépôt ${repository.name}` })).toBeTruthy();
    expect(screen.getByRole('img', { name: /État du dépôt.*Archivé/u })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Score de santé.*83[\s\u00a0]%.*5\/6/u })).toBeTruthy();
    expect(screen.getByTitle(/Branche par défaut\s*:\s*feature\/customer-owned-branch/u)).toBeTruthy();
    expect(screen.getByTitle(/Nombre total de branches\s*:\s*0/u)).toBeTruthy();
    expect(screen.getByTitle(/Contributeurs\s*:\s*0/u)).toBeTruthy();
    expect(screen.getByTitle(/Tickets ouverts\s*:\s*7/u)).toBeTruthy();
    expect(screen.getByTitle(/Pull requests\s*:\s*3/u)).toBeTruthy();
    expect(screen.getByTitle(/Sujets\s*:\s*customer-topic, api-v2, third-user-topic/u)).toBeTruthy();
    expect(screen.getByText('Archivé')).toBeTruthy();
    expect(screen.getByText('Dupliqué')).toBeTruthy();
    expect(screen.getByText('Voir')).toBeTruthy();
    expect(screen.getByText('MIT')).toBeTruthy();
    expect(screen.getByText('customer-topic')).toBeTruthy();
    expect(screen.getByText('api-v2')).toBeTruthy();
    expect(screen.queryByText('Archived')).toBeNull();
    expect(screen.queryByText('View')).toBeNull();
  });

  it('uses a localized invalid-date fallback and keeps a noninteractive card noninteractive', () => {
    language = 'fr';

    const { container } = render(
      <RepositoryCard
        repository={{ ...repository, archived: false, updated_at: 'invalid-provider-date' }}
        variant="detailed"
        showHealthScore
      />,
    );

    expect(screen.getByText('Date indisponible')).toBeTruthy();
    expect(screen.getByRole('img', { name: /État du dépôt.*À surveiller/u })).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const file = 'app/components/@settings/tabs/github/components/shared/RepositoryCard.tsx';
    const source = readFileSync(file, 'utf8');
    const { scanSource } = await import('../../../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('min-h-11');
    expect(source).toContain('min-[420px]:flex-row');
    expect(source).toContain('flex-wrap');
    expect(source).toContain('break-all');
    expect(source).toContain('dark:');
    expect(source).toContain('aria-label');
    expect(source).toContain('aria-hidden="true"');
    expect(source).not.toContain('formatTimeAgo');
  });
});
