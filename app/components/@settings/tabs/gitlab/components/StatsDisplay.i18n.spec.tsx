/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatsDisplay } from './StatsDisplay';
import {
  formatGitLabTabDateTime,
  formatGitLabTabNumber,
  formatGitLabTabPlural,
  getGitLabTabCopy,
} from '~/lib/i18n/catalogs/gitlab-tab';
import type { GitLabStats } from '~/types/GitLab';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

function makeStats(overrides: Partial<GitLabStats> = {}): GitLabStats {
  return {
    projects: [],
    recentActivity: [],
    totalSnippets: 0,
    publicProjects: 1,
    privateProjects: 12_345,
    stars: 1,
    forks: 2_345,
    followers: 2,
    snippets: 0,
    groups: [],
    lastUpdated: '2026-08-05T12:34:00.000Z',
    ...overrides,
  };
}

describe('GitLab StatsDisplay i18n surface', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders French headings, plurals, grouped numbers, and date-time formatting', () => {
    language = 'fr';

    const stats = makeStats();

    render(<StatsDisplay stats={stats} onRefresh={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 4, name: 'Statistiques des dépôts' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: 'Statistiques de contribution' })).toBeTruthy();
    expect(screen.getByText('Dépôt public')).toBeTruthy();
    expect(screen.getByText('Dépôts privés')).toBeTruthy();
    expect(screen.getByText('Étoile')).toBeTruthy();
    expect(screen.getByText('Copies comptabilisées')).toBeTruthy();
    expect(screen.getByText('Abonnés')).toBeTruthy();
    expect(screen.getAllByText(/^12[\s\u202f]345$/u)).toHaveLength(1);
    expect(screen.getAllByText(/^2[\s\u202f]345$/u)).toHaveLength(1);
    expect(screen.getByTestId('gitlab-stats-last-updated').textContent).toBe(
      `Dernière actualisation : ${formatGitLabTabDateTime(stats.lastUpdated, 'fr')}`,
    );
    expect(screen.getByRole('button', { name: 'Actualiser les statistiques' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Repository Stats');
    expect(document.body.textContent).not.toContain('Last updated');
  });

  it('updates every product-owned string during a hot French to English switch', () => {
    language = 'fr';

    const { rerender } = render(<StatsDisplay stats={makeStats()} onRefresh={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Statistiques des dépôts' })).toBeTruthy();
    expect(screen.getByText('Dépôts privés')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actualiser les statistiques' })).toBeTruthy();

    language = 'en';
    rerender(<StatsDisplay stats={makeStats()} onRefresh={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Repository statistics' })).toBeTruthy();
    expect(screen.getByText('Private repositories')).toBeTruthy();
    expect(screen.getByText('Forks')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh statistics' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Statistiques des dépôts');
    expect(document.body.textContent).not.toContain('Dernière actualisation');
  });

  it('exposes a localized non-blocking refresh state and a 44px keyboard-accessible action', () => {
    language = 'fr';

    const onRefresh = vi.fn();

    render(<StatsDisplay stats={makeStats()} onRefresh={onRefresh} isRefreshing />);

    const root = screen.getByTestId('gitlab-stats-display');
    const button = screen.getByRole('button', { name: 'Actualisation des statistiques…' });

    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.className).toContain('min-h-11');
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.querySelector('[aria-hidden="true"]')).toBeTruthy();

    fireEvent.click(button);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('renders a localized empty state while keeping all zero counters visible', () => {
    language = 'fr';

    render(
      <StatsDisplay
        stats={makeStats({ publicProjects: 0, privateProjects: 0, stars: 0, forks: 0, followers: 0 })}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByRole('status').textContent).toBe(
      'Ces statistiques GitLab ne comptabilisent encore aucune activité.',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getAllByText('0')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Actualiser les statistiques' })).toBeTruthy();
  });

  it('normalizes invalid provider counters and dates without exposing raw technical values', () => {
    language = 'fr';

    render(
      <StatsDisplay
        stats={makeStats({
          publicProjects: Number.NaN,
          privateProjects: Number.POSITIVE_INFINITY,
          stars: -10,
          forks: 0,
          followers: 0,
          lastUpdated: 'INVALID_PROVIDER_DATE',
        })}
      />,
    );

    expect(screen.getByTestId('gitlab-stats-last-updated').textContent).toBe(
      'Dernière actualisation : Date indisponible',
    );
    expect(screen.getAllByText('0')).toHaveLength(5);
    expect(document.body.textContent).not.toContain('NaN');
    expect(document.body.textContent).not.toContain('Infinity');
    expect(document.body.textContent).not.toContain('-10');
    expect(document.body.textContent).not.toContain('INVALID_PROVIDER_DATE');
  });

  it('falls back to English and safely formats standalone numbers, plurals, and invalid dates', () => {
    const copy = getGitLabTabCopy('de-DE');
    const frenchCopy = getGitLabTabCopy('fr');

    expect(copy['gitLabTab.statistics.repositoriesTitle']).toBe('Repository statistics');
    expect(formatGitLabTabNumber(Number.NaN, 'en')).toBe('0');
    expect(formatGitLabTabDateTime(undefined, 'fr')).toBe('Date indisponible');
    expect(formatGitLabTabDateTime('not-a-date', 'en')).toBe('Date unavailable');
    expect(
      formatGitLabTabPlural('fr', 2, {
        one: frenchCopy['gitLabTab.statistics.followers_one'],
        other: frenchCopy['gitLabTab.statistics.followers_other'],
      }),
    ).toBe('Abonnés');
  });

  it('invokes the refresh action once and never renders an action when none is supplied', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<StatsDisplay stats={makeStats()} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(<StatsDisplay stats={makeStats()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has zero targeted scanner findings and explicit responsive, theme, long-copy, and reduced-motion safeguards', async () => {
    const sourcePath = 'app/components/@settings/tabs/gitlab/components/StatsDisplay.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    render(<StatsDisplay stats={makeStats()} onRefresh={vi.fn()} />);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('min-[420px]:grid-cols-2');
    expect(source).toContain('sm:grid-cols-3');
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('min-h-11');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('bg-bolt-elements-background-depth-2');
    expect(source).toContain('text-bolt-elements-textPrimary');
    expect(source).toContain('aria-busy');
    expect(source).not.toContain('.toLocaleString(');
    expect(source).not.toContain('error.message');
  });
});
