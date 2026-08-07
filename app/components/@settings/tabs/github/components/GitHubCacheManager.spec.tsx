/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheManagerService, GitHubCacheManager } from './GitHubCacheManager';
import {
  formatGitHubTabCacheEntriesHeading,
  formatGitHubTabCacheSize,
  formatGitHubTabExpiredCacheResult,
  getGitHubTabCacheSafeError,
} from '~/lib/i18n/catalogs/github-tab';

/*
 * Regression coverage for the "Oldest timestamp is meaningless for entries without a
 * timestamp field" bug. Keys like github_connection store a raw object with no
 * `timestamp`, so the previous `parsed.timestamp || Date.now()` fallback pinned the
 * oldest date to "now" and made clearExpiredCache() never expire those entries.
 */

const KEY_WITH_TS = 'github_stats_cache';
const KEY_NO_TS = 'github_connection';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  language = 'en';
  localStorage.clear();
});

describe('CacheManagerService.getCacheEntries', () => {
  it('leaves timestamp undefined for entries that have no timestamp field', () => {
    localStorage.setItem(KEY_NO_TS, JSON.stringify({ user: { login: 'octocat' }, token: 'tok' }));

    const entries = CacheManagerService.getCacheEntries();
    const entry = entries.find((e) => e.key === KEY_NO_TS);

    expect(entry).toBeDefined();
    expect(entry?.timestamp).toBeUndefined();
  });

  it('keeps the real timestamp for entries that have one', () => {
    const ts = 1_000_000;
    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: ts, value: 1 }));

    const entries = CacheManagerService.getCacheEntries();
    const entry = entries.find((e) => e.key === KEY_WITH_TS);

    expect(entry?.timestamp).toBe(ts);
  });
});

describe('CacheManagerService.getCacheStats', () => {
  it('ignores timestamp-less entries when computing oldest/newest', () => {
    const realTs = 1_000_000;

    // Has a real timestamp far in the past.
    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: realTs }));

    // No timestamp at all — must NOT influence oldest/newest.
    localStorage.setItem(KEY_NO_TS, JSON.stringify({ user: { login: 'octocat' } }));

    const stats = CacheManagerService.getCacheStats();

    expect(stats.totalEntries).toBe(2);
    expect(stats.oldestEntry).toBe(realTs);
    expect(stats.newestEntry).toBe(realTs);
  });

  it('reports oldest/newest as 0 when no entry has a real timestamp', () => {
    localStorage.setItem(KEY_NO_TS, JSON.stringify({ user: { login: 'octocat' } }));

    const stats = CacheManagerService.getCacheStats();

    expect(stats.totalEntries).toBe(1);
    expect(stats.oldestEntry).toBe(0);
    expect(stats.newestEntry).toBe(0);
  });
});

describe('CacheManagerService.clearExpiredCache', () => {
  it('never expires entries that lack a timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    localStorage.setItem(KEY_NO_TS, JSON.stringify({ user: { login: 'octocat' } }));

    const removed = CacheManagerService.clearExpiredCache(24 * 60 * 60 * 1000);

    expect(removed).toBe(0);
    expect(localStorage.getItem(KEY_NO_TS)).not.toBeNull();
  });

  it('expires entries whose real timestamp is older than maxAge', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));

    const dayMs = 24 * 60 * 60 * 1000;
    const twoDaysAgo = Date.now() - 2 * dayMs;

    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: twoDaysAgo }));

    const removed = CacheManagerService.clearExpiredCache(dayMs);

    expect(removed).toBe(1);
    expect(localStorage.getItem(KEY_WITH_TS)).toBeNull();
  });

  it('keeps entries whose real timestamp is within maxAge', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));

    const dayMs = 24 * 60 * 60 * 1000;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: oneHourAgo }));

    const removed = CacheManagerService.clearExpiredCache(dayMs);

    expect(removed).toBe(0);
    expect(localStorage.getItem(KEY_WITH_TS)).not.toBeNull();
  });
});

describe('GitHubCacheManager i18n surface', () => {
  it('renders a localized explicit empty state and responsive statistics', async () => {
    language = 'fr';

    render(<GitHubCacheManager />);

    await waitFor(() => expect(screen.getByText('Le cache GitHub est vide')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Gestion du cache GitHub' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actualiser les informations du cache' })).toBeTruthy();
    expect(screen.getByText('Taille totale')).toBeTruthy();
    expect(screen.getByText(/^0 o$/u)).toBeTruthy();
    expect(screen.getByText('Plus ancienne')).toBeTruthy();
    expect(screen.getByText('Indisponible')).toBeTruthy();
    expect(screen.getByText('État')).toBeTruthy();
    expect(screen.getByText('Vide')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Effacer les entrées expirées' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Compacter le cache' }).hasAttribute('disabled')).toBe(true);
  });

  it('localizes cache metadata and safely removes a specific technical key', async () => {
    language = 'fr';
    localStorage.setItem(
      KEY_WITH_TS,
      JSON.stringify({ timestamp: Date.parse('2026-08-05T12:00:00.000Z'), lastAccessed: 1_786_018_500_000 }),
    );

    render(<GitHubCacheManager />);

    await waitFor(() => expect(screen.getByText('Entrée en cache (1)')).toBeTruthy());
    expect(screen.getByText('stats_cache')).toBeTruthy();
    expect(screen.getByText('Actif')).toBeTruthy();
    expect(screen.getAllByText(/août 2026/u).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer stats_cache du cache' }));

    await waitFor(() => expect(screen.getByText('stats_cache a été retiré du cache.')).toBeTruthy());
    expect(localStorage.getItem(KEY_WITH_TS)).toBeNull();
    expect(screen.getByText('Le cache GitHub est vide')).toBeTruthy();
  });

  it('reports the French plural result when expired entries are cleared', async () => {
    language = 'fr';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));

    const expiredTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000;
    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: expiredTimestamp }));
    localStorage.setItem('github_user_cache', JSON.stringify({ timestamp: expiredTimestamp }));

    render(<GitHubCacheManager />);

    expect(screen.getByText('Entrées en cache (2)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les entrées expirées' }));

    expect(screen.getByText('2 entrées de cache expirées ont été supprimées.')).toBeTruthy();
    expect(localStorage.getItem(KEY_WITH_TS)).toBeNull();
    expect(localStorage.getItem('github_user_cache')).toBeNull();
  });

  it('masks operation failures instead of rendering raw storage exceptions', async () => {
    language = 'fr';
    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: 1_000_000 }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(CacheManagerService, 'clearExpiredCache').mockImplementation(() => {
      throw new Error('Raw English storage error secret=github-cache-private');
    });

    render(<GitHubCacheManager />);
    await waitFor(() => expect(screen.getByText('Entrée en cache (1)')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Effacer les entrées expirées' }));

    expect(screen.getByRole('alert').textContent).toContain('Impossible d’effectuer l’opération sur le cache');
    expect(document.body.textContent).not.toContain('github-cache-private');
    expect(document.body.textContent).not.toContain('Raw English');
  });

  it('shows a safe localized read error, switches locale live, and retries', async () => {
    language = 'fr';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const getEntries = vi
      .spyOn(CacheManagerService, 'getCacheEntries')
      .mockImplementationOnce(() => {
        throw new Error('Raw English read error secret=cache-read-private');
      })
      .mockReturnValueOnce([]);

    const { rerender } = render(<GitHubCacheManager />);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Impossible de charger'));
    expect(document.body.textContent).not.toContain('cache-read-private');

    language = 'en';
    rerender(<GitHubCacheManager />);
    expect(screen.getByRole('alert').textContent).toContain('Cache information could not be loaded');

    language = 'fr';
    rerender(<GitHubCacheManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Le cache GitHub est vide')).toBeTruthy());
    expect(getEntries).toHaveBeenCalledTimes(2);
  });

  it('formats French sizes and plural messages with an English fallback', () => {
    expect(CacheManagerService.formatSize(1_536, 'fr')).toBe('1,5 Ko');
    expect(formatGitHubTabCacheSize(1_536, 'en')).toBe('1.5 KB');
    expect(formatGitHubTabCacheEntriesHeading(0, 'fr')).toBe('Entrées en cache (0)');
    expect(formatGitHubTabCacheEntriesHeading(1_200, 'fr')).toMatch(/^Entrées en cache \(1[\s\u202f]200\)$/u);
    expect(formatGitHubTabExpiredCacheResult(0, 'fr')).toBe('Aucune entrée de cache expirée n’a été trouvée.');
    expect(formatGitHubTabExpiredCacheResult(1, 'fr')).toBe('1 entrée de cache expirée a été supprimée.');
    expect(formatGitHubTabCacheEntriesHeading(1, 'de-DE')).toBe('Cache entry (1)');
    expect(getGitHubTabCacheSafeError('fr', new Error('secret=private'))).not.toContain('private');
  });

  it('has zero scanner findings and explicit loading, empty, error, responsive, and theme safeguards', async () => {
    const sourcePath = 'app/components/@settings/tabs/github/components/GitHubCacheManager.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain("useState<'loading' | 'success' | 'error'>");
    expect(source).toContain('animate-pulse');
    expect(source).toContain('min-[360px]:grid-cols-2');
    expect(source).toContain('xl:grid-cols-4');
    expect(source).toContain('min-h-11');
    expect(source).toContain('status-success');
    expect(source).toContain('status-error');
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('role="alert"');
    expect(source).not.toContain('error.message');
  });
});
