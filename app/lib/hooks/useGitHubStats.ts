import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import {
  formatClientRuntimeResidualCopy,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';
import { gitHubApiService } from '~/lib/services/githubApiService';
import type { GitHubStats, GitHubConnection } from '~/types/GitHub';

export interface UseGitHubStatsState {
  stats: GitHubStats | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export interface UseGitHubStatsOptions {
  autoFetch?: boolean;
  refreshInterval?: number; // in milliseconds
  cacheTimeout?: number; // in milliseconds
}

export interface UseGitHubStatsReturn extends UseGitHubStatsState {
  fetchStats: () => Promise<void>;
  refreshStats: () => Promise<void>;
  clearStats: () => void;
  isStale: boolean;
}

const STATS_CACHE_KEY = 'github_stats_cache';
const DEFAULT_CACHE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

type GitHubStatsErrorKind = 'connection_unavailable' | 'authentication_required' | 'api_unavailable' | 'fetch_failed';

class GitHubStatsDisplayError extends Error {
  constructor(
    message: string,
    readonly kind: GitHubStatsErrorKind,
  ) {
    super(message);
  }
}

export function useGitHubStats(
  connection: GitHubConnection | null,
  options: UseGitHubStatsOptions = {},
  isServerSide: boolean = false,
): UseGitHubStatsReturn {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getClientRuntimeResidualCopy(language);
  const { autoFetch = false, refreshInterval, cacheTimeout = DEFAULT_CACHE_TIMEOUT } = options;

  const [state, setState] = useState<UseGitHubStatsState>({
    stats: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
    lastUpdated: null,
  });

  const [errorKind, setErrorKind] = useState<GitHubStatsErrorKind | null>(null);

  const localizedError =
    errorKind === 'connection_unavailable'
      ? formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsUnavailable'], { provider: 'GitHub' })
      : errorKind === 'authentication_required'
        ? formatClientRuntimeResidualCopy(copy['clientRuntime.connection.authenticationRequired'], {
            provider: 'GitHub',
          })
        : errorKind === 'api_unavailable'
          ? formatClientRuntimeResidualCopy(copy['clientRuntime.connection.apiUnavailable'], { provider: 'GitHub' })
          : errorKind === 'fetch_failed'
            ? formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsFetchFailed'], {
                provider: 'GitHub',
              })
            : null;

  // Configure API service when connection is available
  const apiService = useMemo(() => {
    if (!connection?.token) {
      return null;
    }

    // Configure the singleton instance with the current connection
    gitHubApiService.configure({
      token: connection.token,
      tokenType: connection.tokenType,
    });

    return gitHubApiService;
  }, [connection?.token, connection?.tokenType]);

  // Check if stats are stale
  const isStale = useMemo(() => {
    if (!state.lastUpdated || !state.stats) {
      return true;
    }

    return Date.now() - state.lastUpdated.getTime() > cacheTimeout;
  }, [state.lastUpdated, state.stats, cacheTimeout]);

  // Load cached stats on mount
  useEffect(() => {
    loadCachedStats();
  }, []);

  // Auto-fetch stats when connection changes - with better handling
  useEffect(() => {
    if (autoFetch && connection && (!state.stats || isStale)) {
      /*
       * For server-side connections, always try to fetch
       * For client-side connections, only fetch if we have an API service
       */
      if (isServerSide || apiService) {
        // Use a timeout to prevent immediate fetching on mount
        const timeoutId = setTimeout(() => {
          fetchStats().catch((error) => {
            console.warn('Failed to auto-fetch stats:', error);

            // Don't throw error on auto-fetch to prevent crashes
          });
        }, 100);

        return () => clearTimeout(timeoutId);
      }
    }

    return undefined;
  }, [autoFetch, connection, apiService, state.stats, isStale, isServerSide]);

  // Set up refresh interval if provided
  useEffect(() => {
    if (!refreshInterval || !connection) {
      return undefined;
    }

    const interval = setInterval(() => {
      if (isStale) {
        /*
         * refreshStats() awaits fetchStats(), which re-throws on a GitHub API
         * error. Without a .catch() every failed auto-refresh tick is an
         * unhandled browser rejection.
         */
        refreshStats().catch((error) => {
          console.warn('GitHub stats auto-refresh failed:', error);
        });
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, connection, isStale]);

  const loadCachedStats = useCallback(() => {
    try {
      const cached = localStorage.getItem(STATS_CACHE_KEY);

      if (cached) {
        const { stats, timestamp, userLogin } = JSON.parse(cached);

        // Only use cached data if it's for the current user
        if (userLogin === connection?.user?.login) {
          setState((prev) => ({
            ...prev,
            stats,
            lastUpdated: new Date(timestamp),
          }));
        }
      }
    } catch (error) {
      console.error('Error loading cached stats:', error);

      // Clear corrupted cache
      localStorage.removeItem(STATS_CACHE_KEY);
    }
  }, [connection?.user?.login]);

  const saveCachedStats = useCallback((stats: GitHubStats, userLogin: string) => {
    try {
      const cacheData = {
        stats,
        timestamp: Date.now(),
        userLogin,
      };
      localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error saving stats to cache:', error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    if (!connection?.user) {
      setErrorKind('connection_unavailable');
      setState((prev) => ({
        ...prev,
        error: null,
        isLoading: false,
        isRefreshing: false,
      }));

      return;
    }

    let isRefreshing = false;
    setErrorKind(null);

    setState((prev) => {
      isRefreshing = !!prev.stats; // Show refreshing (and toasts) only when stats already exist

      return {
        ...prev,
        isLoading: !prev.stats, // Show loading only if no stats yet
        isRefreshing,
        error: null,
      };
    });

    try {
      let stats: GitHubStats;

      if (isServerSide || !connection.token) {
        // Use server-side API for stats
        const response = await fetch('/api/github-stats');

        if (!response.ok) {
          if (response.status === 401) {
            throw new GitHubStatsDisplayError(
              formatClientRuntimeResidualCopy(copy['clientRuntime.connection.authenticationRequired'], {
                provider: 'GitHub',
              }),
              'authentication_required',
            );
          }

          await response.json().catch(() => undefined);
          throw new GitHubStatsDisplayError(
            formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsFetchFailed'], {
              provider: 'GitHub',
            }),
            'fetch_failed',
          );
        }

        stats = await response.json();
      } else {
        // Use client-side API service for stats
        if (!apiService) {
          throw new GitHubStatsDisplayError(
            formatClientRuntimeResidualCopy(copy['clientRuntime.connection.apiUnavailable'], { provider: 'GitHub' }),
            'api_unavailable',
          );
        }

        stats = await apiService.generateComprehensiveStats(connection.user);
      }

      const now = new Date();

      setState((prev) => ({
        ...prev,
        stats,
        isLoading: false,
        isRefreshing: false,
        lastUpdated: now,
        error: null,
      }));
      setErrorKind(null);

      // Cache the stats
      saveCachedStats(stats, connection.user.login);

      // Update the connection object with stats if needed
      if (connection.stats?.lastUpdated !== stats.lastUpdated) {
        const updatedConnection = {
          ...connection,
          stats,
        };
        localStorage.setItem('github_connection', JSON.stringify(updatedConnection));
      }

      // Only show success toast for manual refreshes, not auto-fetches
      if (isRefreshing) {
        toast.success(
          formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsUpdated'], { provider: 'GitHub' }),
        );
      }
    } catch (error) {
      console.error('Error fetching GitHub stats:', error);

      const errorMessage =
        error instanceof GitHubStatsDisplayError
          ? error.message
          : formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsFetchFailed'], {
              provider: 'GitHub',
            });
      setErrorKind(error instanceof GitHubStatsDisplayError ? error.kind : 'fetch_failed');

      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: null,
      }));

      // Only show error toast for manual actions, not auto-fetches
      if (isRefreshing) {
        toast.error(
          formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsUpdateFailed'], { provider: 'GitHub' }),
        );
      }

      throw new GitHubStatsDisplayError(
        errorMessage,
        error instanceof GitHubStatsDisplayError ? error.kind : 'fetch_failed',
      );
    }
  }, [apiService, connection, copy, saveCachedStats, isServerSide]);

  const refreshStats = useCallback(async () => {
    if (state.isRefreshing || state.isLoading) {
      return; // Prevent multiple simultaneous requests
    }

    await fetchStats();
  }, [fetchStats, state.isRefreshing, state.isLoading]);

  const clearStats = useCallback(() => {
    setErrorKind(null);
    setState({
      stats: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
      lastUpdated: null,
    });

    // Clear cache
    localStorage.removeItem(STATS_CACHE_KEY);
  }, []);

  return {
    ...state,
    error: localizedError,
    fetchStats,
    refreshStats,
    clearStats,
    isStale,
  };
}

// Helper hook for lightweight stats fetching (just repositories)
export function useGitHubRepositories(connection: GitHubConnection | null) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getClientRuntimeResidualCopy(language);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<'connection_unavailable' | 'fetch_failed' | null>(null);

  const error =
    errorKind === 'connection_unavailable'
      ? formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsUnavailable'], { provider: 'GitHub' })
      : errorKind === 'fetch_failed'
        ? formatClientRuntimeResidualCopy(copy['clientRuntime.connection.repositoriesFetchFailed'], {
            provider: 'GitHub',
          })
        : null;

  const apiService = useMemo(() => {
    if (!connection?.token) {
      return null;
    }

    // Configure the singleton instance with the current connection
    gitHubApiService.configure({
      token: connection.token,
      tokenType: connection.tokenType,
    });

    return gitHubApiService;
  }, [connection?.token, connection?.tokenType]);

  const fetchRepositories = useCallback(async () => {
    if (!apiService) {
      setErrorKind('connection_unavailable');
      return;
    }

    setIsLoading(true);
    setErrorKind(null);

    try {
      const repos = await apiService.getAllUserRepositories();
      setRepositories(repos);
    } catch (error) {
      console.error('Error fetching repositories:', error);

      const errorMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.repositoriesFetchFailed'], {
        provider: 'GitHub',
      });
      setErrorKind('fetch_failed');
      throw new GitHubStatsDisplayError(errorMessage, 'fetch_failed');
    } finally {
      setIsLoading(false);
    }
  }, [apiService, copy]);

  return {
    repositories,
    isLoading,
    error,
    fetchRepositories,
  };
}
