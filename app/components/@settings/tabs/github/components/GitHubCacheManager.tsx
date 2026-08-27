import { AlertCircle, CheckCircle, Clock, Database, HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import {
  formatGitHubTabCacheEntriesHeading,
  formatGitHubTabCacheSize,
  formatGitHubTabDate,
  formatGitHubTabDateTime,
  formatGitHubTabExpiredCacheResult,
  formatGitHubTabNumber,
  formatGitHubTabTime,
  getGitHubTabCacheSafeError,
  getGitHubTabCopy,
  interpolateGitHubTabCopy,
} from '~/lib/i18n/catalogs/github-tab';
import { classNames } from '~/utils/classNames';

interface CacheEntry {
  key: string;
  size: number;

  /**
   * The real creation timestamp persisted in the cached value, if any. Some cache keys
   * (e.g. github_connection) store a raw object with no timestamp field — for those this
   * is left undefined rather than substituted with Date.now(), so that "oldest" and
   * expiry calculations don't treat every timestamp-less entry as freshly created.
   */
  timestamp?: number;
  lastAccessed: number;
  data: unknown;
}

interface CacheStats {
  totalSize: number;
  totalEntries: number;
  oldestEntry: number;
  newestEntry: number;
}

interface GitHubCacheManagerProps {
  className?: string;
  showStats?: boolean;
}

type CacheOperation = 'refresh' | 'clear-all' | 'clear-expired' | 'compact' | 'clear-entry' | null;

type CacheFeedback =
  | { kind: 'cleared-all'; time: number }
  | { kind: 'cleared-expired'; count: number }
  | { kind: 'compacted' }
  | { kind: 'removed-entry'; key: string }
  | { kind: 'error' };

// Cache management utilities
export class CacheManagerService {
  private static readonly _cacheKeys = [
    'github_connection',
    'github_stats_cache',
    'github_repositories_cache',
    'github_user_cache',
    'github_rate_limits',
  ];

  static getCacheEntries(): CacheEntry[] {
    const entries: CacheEntry[] = [];

    for (const key of this._cacheKeys) {
      try {
        const data = localStorage.getItem(key);

        if (data) {
          const parsed: unknown = JSON.parse(data);
          const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
          const rawTimestamp = typeof record?.timestamp === 'number' ? record.timestamp : undefined;
          const rawLastAccessed = typeof record?.lastAccessed === 'number' ? record.lastAccessed : undefined;
          entries.push({
            key,
            size: new Blob([data]).size,

            // Only carry a timestamp when the cached value actually has one; do not fabricate Date.now().
            timestamp: rawTimestamp,

            // lastAccessed is purely a display/sort hint, so falling back to now() is acceptable here.
            lastAccessed: rawLastAccessed ?? Date.now(),
            data: parsed,
          });
        }
      } catch (error) {
        console.warn(`Failed to parse cache entry: ${key}`, error);

        if (!(error instanceof SyntaxError)) {
          throw error;
        }
      }
    }

    return entries.sort((a, b) => b.lastAccessed - a.lastAccessed);
  }

  static getCacheStats(entries: readonly CacheEntry[] = this.getCacheEntries()): CacheStats {
    if (entries.length === 0) {
      return {
        totalSize: 0,
        totalEntries: 0,
        oldestEntry: 0,
        newestEntry: 0,
      };
    }

    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);

    /*
     * Only entries with a real persisted timestamp contribute to oldest/newest. Entries
     * without one (e.g. github_connection) would otherwise pin the range to "now".
     */
    const timestamps = entries.map((e) => e.timestamp).filter((t): t is number => typeof t === 'number');

    return {
      totalSize,
      totalEntries: entries.length,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    };
  }

  static clearCache(keys?: string[]): void {
    const keysToRemove = keys || this._cacheKeys;

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }

  static clearExpiredCache(maxAge: number = 24 * 60 * 60 * 1000): number {
    const entries = this.getCacheEntries();
    const now = Date.now();

    let removedCount = 0;

    for (const entry of entries) {
      /*
       * Skip entries without a real timestamp — we can't know whether they're expired,
       * and defaulting to now() would make them appear permanently fresh.
       */
      if (typeof entry.timestamp !== 'number') {
        continue;
      }

      if (now - entry.timestamp > maxAge) {
        localStorage.removeItem(entry.key);
        removedCount++;
      }
    }

    return removedCount;
  }

  static compactCache(): void {
    const entries = this.getCacheEntries();

    for (const entry of entries) {
      try {
        if (!entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data)) {
          continue;
        }

        // Re-serialize with minimal data
        const compacted = {
          ...entry.data,
          lastAccessed: Date.now(),
        };
        localStorage.setItem(entry.key, JSON.stringify(compacted));
      } catch (error) {
        console.warn(`Failed to compact cache entry: ${entry.key}`, error);
        throw error;
      }
    }
  }

  static formatSize(bytes: number, language?: string | null): string {
    return formatGitHubTabCacheSize(bytes, language);
  }
}

export function GitHubCacheManager({ className = '', showStats = true }: GitHubCacheManagerProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getGitHubTabCopy(language);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>('loading');
  const [operation, setOperation] = useState<CacheOperation>(null);
  const [feedback, setFeedback] = useState<CacheFeedback | null>(null);

  const refreshCacheData = useCallback(() => {
    const nextEntries = CacheManagerService.getCacheEntries();

    setCacheEntries(nextEntries);
    setLoadState('success');
  }, []);

  useEffect(() => {
    try {
      refreshCacheData();
    } catch (error) {
      console.error('GitHub cache read failed', error);
      setCacheEntries([]);
      setLoadState('error');
    }
  }, [refreshCacheData]);

  const cacheStats = useMemo(() => CacheManagerService.getCacheStats(cacheEntries), [cacheEntries]);
  const isBusy = operation !== null;

  const feedbackMessage = useMemo(() => {
    if (!feedback) {
      return null;
    }

    switch (feedback.kind) {
      case 'cleared-all':
        return interpolateGitHubTabCopy(copy['githubTab.cache.feedback.clearedAll'], {
          time: formatGitHubTabTime(feedback.time, language),
        });
      case 'cleared-expired':
        return formatGitHubTabExpiredCacheResult(feedback.count, language);
      case 'compacted':
        return copy['githubTab.cache.feedback.compacted'];
      case 'removed-entry':
        return interpolateGitHubTabCopy(copy['githubTab.cache.feedback.removedEntry'], { key: feedback.key });
      case 'error':
        return getGitHubTabCacheSafeError(language);
    }

    return null;
  }, [copy, feedback, language]);

  const handleRefresh = useCallback(() => {
    setOperation('refresh');
    setFeedback(null);
    setLoadState('loading');

    try {
      refreshCacheData();
    } catch (error) {
      console.error('GitHub cache refresh failed', error);
      setCacheEntries([]);
      setLoadState('error');
    } finally {
      setOperation(null);
    }
  }, [refreshCacheData]);

  const handleClearAll = useCallback(() => {
    setOperation('clear-all');
    setFeedback(null);

    try {
      CacheManagerService.clearCache();
      refreshCacheData();
      setFeedback({ kind: 'cleared-all', time: Date.now() });

      // Trigger a page refresh to update all components
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Failed to clear cache:', error);
      setFeedback({ kind: 'error' });
    } finally {
      setOperation(null);
    }
  }, [refreshCacheData]);

  const handleClearExpired = useCallback(() => {
    setOperation('clear-expired');
    setFeedback(null);

    try {
      const removedCount = CacheManagerService.clearExpiredCache();
      refreshCacheData();
      setFeedback({ kind: 'cleared-expired', count: removedCount });
    } catch (error) {
      console.error('Failed to clear expired cache:', error);
      setFeedback({ kind: 'error' });
    } finally {
      setOperation(null);
    }
  }, [refreshCacheData]);

  const handleCompactCache = useCallback(() => {
    setOperation('compact');
    setFeedback(null);

    try {
      CacheManagerService.compactCache();
      refreshCacheData();
      setFeedback({ kind: 'compacted' });
    } catch (error) {
      console.error('Failed to compact cache:', error);
      setFeedback({ kind: 'error' });
    } finally {
      setOperation(null);
    }
  }, [refreshCacheData]);

  const handleClearSpecific = useCallback(
    (key: string) => {
      setOperation('clear-entry');
      setFeedback(null);

      try {
        CacheManagerService.clearCache([key]);
        refreshCacheData();
        setFeedback({ kind: 'removed-entry', key: key.replace(/^github_/u, '') });
      } catch (error) {
        console.error(`Failed to clear cache key: ${key}`, error);
        setFeedback({ kind: 'error' });
      } finally {
        setOperation(null);
      }
    },
    [refreshCacheData],
  );

  return (
    <section
      className={classNames(
        'min-w-0 space-y-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4',
        className,
      )}
      aria-labelledby="github-cache-manager-title"
      aria-busy={loadState === 'loading' || isBusy}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Database className="h-4 w-4 shrink-0 text-bolt-elements-item-contentAccent" aria-hidden="true" />
          <h3
            id="github-cache-manager-title"
            className="min-w-0 break-words text-sm font-medium text-bolt-elements-textPrimary"
          >
            {copy['githubTab.cache.title']}
          </h3>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isBusy}
          aria-label={copy['githubTab.cache.refresh']}
          title={copy['githubTab.cache.refresh']}
          className="!h-11 !w-11 shrink-0 p-0"
        >
          <RefreshCw
            className={classNames('h-4 w-4', operation === 'refresh' || loadState === 'loading' ? 'animate-spin' : '')}
            aria-hidden="true"
          />
        </Button>
      </div>

      {loadState === 'loading' ? (
        <div role="status" aria-live="polite">
          <p className="break-words text-sm text-bolt-elements-textSecondary">{copy['githubTab.cache.loading']}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
            {Array.from({ length: showStats ? 4 : 2 }, (_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-bolt-elements-background-depth-2" />
            ))}
          </div>
        </div>
      ) : loadState === 'error' ? (
        <div
          className="flex min-w-0 flex-col items-start gap-3 rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 sm:flex-row sm:justify-between"
          role="alert"
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-error-text)]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-[var(--status-error-text)]">
                {copy['githubTab.cache.errorTitle']}
              </p>
              <p className="mt-1 break-words text-sm text-[var(--status-error-text)]">
                {copy['githubTab.cache.errorDescription']}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            className="!h-auto min-h-11 max-w-full shrink-0 !whitespace-normal break-words py-2 text-center leading-tight"
          >
            {copy['githubTab.cache.retry']}
          </Button>
        </div>
      ) : (
        <>
          {showStats && (
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0 rounded-lg bg-bolt-elements-background-depth-2 p-3">
                <div className="mb-1 flex min-w-0 items-center gap-2">
                  <HardDrive className="h-3 w-3 shrink-0 text-bolt-elements-textSecondary" aria-hidden="true" />
                  <span className="min-w-0 break-words text-xs font-medium text-bolt-elements-textSecondary">
                    {copy['githubTab.cache.stats.totalSize']}
                  </span>
                </div>
                <p className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
                  {CacheManagerService.formatSize(cacheStats.totalSize, language)}
                </p>
              </div>

              <div className="min-w-0 rounded-lg bg-bolt-elements-background-depth-2 p-3">
                <div className="mb-1 flex min-w-0 items-center gap-2">
                  <Database className="h-3 w-3 shrink-0 text-bolt-elements-textSecondary" aria-hidden="true" />
                  <span className="min-w-0 break-words text-xs font-medium text-bolt-elements-textSecondary">
                    {copy['githubTab.cache.stats.entries']}
                  </span>
                </div>
                <p className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
                  {formatGitHubTabNumber(cacheStats.totalEntries, language)}
                </p>
              </div>

              <div className="min-w-0 rounded-lg bg-bolt-elements-background-depth-2 p-3">
                <div className="mb-1 flex min-w-0 items-center gap-2">
                  <Clock className="h-3 w-3 shrink-0 text-bolt-elements-textSecondary" aria-hidden="true" />
                  <span className="min-w-0 break-words text-xs font-medium text-bolt-elements-textSecondary">
                    {copy['githubTab.cache.stats.oldest']}
                  </span>
                </div>
                <p className="break-words text-xs text-bolt-elements-textSecondary">
                  {cacheStats.oldestEntry
                    ? formatGitHubTabDate(cacheStats.oldestEntry, language)
                    : copy['githubTab.cache.notAvailable']}
                </p>
              </div>

              <div className="min-w-0 rounded-lg bg-bolt-elements-background-depth-2 p-3">
                <div className="mb-1 flex min-w-0 items-center gap-2">
                  <CheckCircle className="h-3 w-3 shrink-0 text-bolt-elements-textSecondary" aria-hidden="true" />
                  <span className="min-w-0 break-words text-xs font-medium text-bolt-elements-textSecondary">
                    {copy['githubTab.cache.stats.status']}
                  </span>
                </div>
                <p
                  className={classNames(
                    'break-words text-xs',
                    cacheStats.totalEntries > 0
                      ? 'text-[var(--status-success-text)]'
                      : 'text-bolt-elements-textSecondary',
                  )}
                >
                  {cacheStats.totalEntries > 0
                    ? copy['githubTab.cache.stats.active']
                    : copy['githubTab.cache.stats.empty']}
                </p>
              </div>
            </div>
          )}

          {cacheEntries.length === 0 ? (
            <div
              className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
              role="status"
            >
              <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
                {copy['githubTab.cache.emptyTitle']}
              </p>
              <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
                {copy['githubTab.cache.emptyDescription']}
              </p>
            </div>
          ) : (
            <div className="min-w-0 space-y-2">
              <h4 className="break-words text-xs font-medium text-bolt-elements-textSecondary">
                {formatGitHubTabCacheEntriesHeading(cacheEntries.length, language)}
              </h4>

              <div className="max-h-48 space-y-2 overflow-y-auto">
                {cacheEntries.map((entry) => {
                  const displayKey = entry.key.replace(/^github_/u, '');

                  return (
                    <div
                      key={entry.key}
                      className="flex min-w-0 flex-col items-stretch justify-between gap-2 rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 min-[360px]:flex-row min-[360px]:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-all text-xs font-medium text-bolt-elements-textPrimary">{displayKey}</p>
                        <p className="mt-0.5 break-words text-xs text-bolt-elements-textSecondary">
                          {CacheManagerService.formatSize(entry.size, language)} ·{' '}
                          {formatGitHubTabDateTime(new Date(entry.lastAccessed), language)}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleClearSpecific(entry.key)}
                        disabled={isBusy}
                        aria-label={interpolateGitHubTabCopy(copy['githubTab.cache.entry.remove'], {
                          key: displayKey,
                        })}
                        title={interpolateGitHubTabCopy(copy['githubTab.cache.entry.remove'], {
                          key: displayKey,
                        })}
                        className="!h-11 !w-11 shrink-0 self-end p-0 min-[360px]:self-auto"
                      >
                        <Trash2 className="h-4 w-4 text-[var(--status-error-text)]" aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-2 border-t border-bolt-elements-borderColor pt-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearExpired}
              disabled={isBusy || cacheEntries.length === 0}
              className="!h-auto min-h-11 max-w-full gap-1 !whitespace-normal break-words py-2 text-center leading-tight"
            >
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-xs">{copy['githubTab.cache.actions.clearExpired']}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCompactCache}
              disabled={isBusy || cacheEntries.length === 0}
              className="!h-auto min-h-11 max-w-full gap-1 !whitespace-normal break-words py-2 text-center leading-tight"
            >
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-xs">{copy['githubTab.cache.actions.compact']}</span>
            </Button>

            {cacheEntries.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={isBusy}
                className="!h-auto min-h-11 max-w-full gap-1 border-[var(--status-error-border)] !whitespace-normal break-words py-2 text-center text-[var(--status-error-text)] leading-tight hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-text)]"
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="text-xs">{copy['githubTab.cache.actions.clearAll']}</span>
              </Button>
            )}
          </div>
        </>
      )}

      {feedbackMessage && (
        <div
          className={classNames(
            'flex min-w-0 items-start gap-2 rounded border p-3 text-xs',
            feedback?.kind === 'error'
              ? 'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]'
              : 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
          )}
          role={feedback?.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {feedback?.kind === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 break-words">{feedbackMessage}</span>
        </div>
      )}
    </section>
  );
}
