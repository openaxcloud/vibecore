import { motion } from 'framer-motion';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import GitLabConnection from './components/GitLabConnection';
import { RepositoryList } from './components/RepositoryList';
import { StatsDisplay } from './components/StatsDisplay';
import { GitLabOauthConnectButton } from '~/components/@settings/shared/connectors';
import { useGitLabConnection } from '~/lib/hooks';
import {
  formatGitLabTabDateTime,
  formatGitLabTabNumber,
  getGitLabTabCopy,
  interpolateGitLabTabCopy,
} from '~/lib/i18n/catalogs/gitlab-tab';
import type { GitLabTabCopy } from '~/lib/i18n/catalogs/gitlab-tab';

// GitLab logo SVG component
const GitLabLogo = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"
    />
  </svg>
);

interface ConnectionTestResult {
  status: 'success' | 'error' | 'testing';
  message: string;
  timestamp?: number;
}

interface ConnectionTestState {
  status: ConnectionTestResult['status'];
  outcome: 'noConnection' | 'testing' | 'success' | 'failed';
  username?: string;
  timestamp?: number;
}

function getConnectionTestMessage(state: ConnectionTestState, copy: GitLabTabCopy): string {
  switch (state.outcome) {
    case 'noConnection':
      return copy['gitLabTab.connectionTest.noConnection'];
    case 'testing':
      return copy['gitLabTab.connectionTest.testing'];
    case 'success':
      return interpolateGitLabTabCopy(copy['gitLabTab.connectionTest.success'], {
        username: state.username ?? copy['gitLabTab.user.fallbackName'],
      });
    case 'failed':
      return copy['gitLabTab.connectionTest.failed'];
    default:
      return copy['gitLabTab.connectionTest.failed'];
  }
}

export default function GitLabTab() {
  const { connection, isConnected, isLoading, error, testConnection, refreshStats } = useGitLabConnection();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getGitLabTabCopy(language);
  const [connectionTestState, setConnectionTestState] = useState<ConnectionTestState | null>(null);
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
  const [hasRefreshError, setHasRefreshError] = useState(false);

  const connectionTest: ConnectionTestResult | null = connectionTestState
    ? {
        status: connectionTestState.status,
        message: getConnectionTestMessage(connectionTestState, copy),
        timestamp: connectionTestState.timestamp,
      }
    : null;

  const handleTestConnection = async () => {
    if (!connection?.user) {
      setConnectionTestState({
        status: 'error',
        outcome: 'noConnection',
        timestamp: Date.now(),
      });
      return;
    }

    setConnectionTestState({
      status: 'testing',
      outcome: 'testing',
    });

    try {
      const isValid = await testConnection();

      if (isValid) {
        setConnectionTestState({
          status: 'success',
          outcome: 'success',
          username: connection.user.username,
          timestamp: Date.now(),
        });
      } else {
        setConnectionTestState({
          status: 'error',
          outcome: 'failed',
          timestamp: Date.now(),
        });
      }
    } catch {
      setConnectionTestState({
        status: 'error',
        outcome: 'failed',
        timestamp: Date.now(),
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshingStats(true);
    setHasRefreshError(false);

    try {
      await refreshStats();
    } catch {
      setHasRefreshError(true);
    } finally {
      setIsRefreshingStats(false);
    }
  };

  // Loading state for initial connection check
  if (isLoading) {
    return (
      <div className="min-w-0 space-y-6">
        <div className="flex min-w-0 items-center gap-2">
          <GitLabLogo />
          <h2 className="min-w-0 break-words text-lg font-medium text-bolt-elements-textPrimary">
            {copy['gitLabTab.title']}
          </h2>
        </div>
        <div className="flex items-center justify-center p-4" role="status" aria-live="polite" aria-busy="true">
          <div className="flex items-center gap-2">
            <div className="i-ph:spinner-gap-bold h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="break-words text-bolt-elements-textSecondary">{copy['gitLabTab.loading.connection']}</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state for connection issues
  if (error && !connection) {
    return (
      <div className="min-w-0 space-y-6">
        <div className="flex min-w-0 items-center gap-2">
          <GitLabLogo />
          <h2 className="min-w-0 break-words text-lg font-medium text-bolt-elements-textPrimary">
            {copy['gitLabTab.title']}
          </h2>
        </div>
        <div
          className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
          role="alert"
        >
          <div className="flex min-w-0 items-start gap-2">
            <div className="i-ph:warning-circle mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <p className="break-words font-medium">{copy['gitLabTab.connection.errorTitle']}</p>
              <p className="break-words">{copy['gitLabTab.connection.errorDescription']}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 max-w-full items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-center font-medium whitespace-normal transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:border-red-700 dark:hover:bg-red-900/40"
          >
            {copy['gitLabTab.connection.reload']}
          </button>
        </div>
      </div>
    );
  }

  // Not connected state
  if (!isConnected || !connection) {
    return (
      <div className="min-w-0 space-y-6">
        <div className="flex min-w-0 items-center gap-2">
          <GitLabLogo />
          <h2 className="min-w-0 break-words text-lg font-medium text-bolt-elements-textPrimary">
            {copy['gitLabTab.title']}
          </h2>
        </div>
        <p className="break-words text-sm text-bolt-elements-textSecondary">
          {copy['gitLabTab.connection.disconnectedDescription']}
        </p>
        <div className="space-y-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
            {copy['gitLabTab.oauth.title']}
          </p>
          <p className="break-words text-xs leading-relaxed text-bolt-elements-textSecondary">
            {copy['gitLabTab.oauth.description']}
          </p>
          <GitLabOauthConnectButton />
        </div>
        <GitLabConnection connectionTest={connectionTest} onTestConnection={handleTestConnection} />
      </div>
    );
  }

  const userDisplayName = connection.user?.name || connection.user?.username || copy['gitLabTab.user.fallbackName'];
  const userInitial = userDisplayName.charAt(0).toLocaleUpperCase(language);

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <motion.div
        className="flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GitLabLogo />
          <h2 className="min-w-0 break-words text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
            {copy['gitLabTab.title']}
          </h2>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2 sm:justify-end">
          {connection?.rateLimit && (
            <div className="flex max-w-full items-center gap-2 rounded-lg bg-bolt-elements-background-depth-1 px-3 py-1 text-xs">
              <div className="i-ph:cloud h-4 w-4 shrink-0 text-bolt-elements-textSecondary" aria-hidden="true" />
              <span className="break-words text-bolt-elements-textSecondary">
                {interpolateGitLabTabCopy(copy['gitLabTab.rateLimit'], {
                  remaining: formatGitLabTabNumber(connection.rateLimit.remaining, language),
                  limit: formatGitLabTabNumber(connection.rateLimit.limit, language),
                })}
              </span>
            </div>
          )}
        </div>
      </motion.div>

      <p className="break-words text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
        {copy['gitLabTab.connection.connectedDescription']}
      </p>

      {/* Connection Test Results */}
      {connectionTest && (
        <div
          className={`rounded-lg border p-3 ${
            connectionTest.status === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : connectionTest.status === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
          }`}
          role={connectionTest.status === 'error' ? 'alert' : 'status'}
          aria-live={connectionTest.status === 'error' ? 'assertive' : 'polite'}
          aria-busy={connectionTest.status === 'testing'}
        >
          <div className="flex min-w-0 items-start gap-2">
            <div
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                connectionTest.status === 'success'
                  ? 'text-green-600'
                  : connectionTest.status === 'error'
                    ? 'text-red-600'
                    : 'text-blue-600'
              }`}
              aria-hidden="true"
            >
              {connectionTest.status === 'success' ? (
                <div className="i-ph:check-circle" />
              ) : connectionTest.status === 'error' ? (
                <div className="i-ph:x-circle" />
              ) : (
                <div className="i-ph:spinner animate-spin" />
              )}
            </div>
            <div
              className={`min-w-0 text-sm ${
                connectionTest.status === 'success'
                  ? 'text-green-800 dark:text-green-200'
                  : connectionTest.status === 'error'
                    ? 'text-red-800 dark:text-red-200'
                    : 'text-blue-800 dark:text-blue-200'
              }`}
            >
              <p className="break-words">{connectionTest.message}</p>
              {connectionTest.timestamp && (
                <p className="mt-1 break-words text-xs opacity-80">
                  {interpolateGitLabTabCopy(copy['gitLabTab.connectionTest.checkedAt'], {
                    date: formatGitLabTabDateTime(connectionTest.timestamp, language),
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GitLab Connection Component */}
      <GitLabConnection connectionTest={connectionTest} onTestConnection={handleTestConnection} />

      {/* User Profile Section */}
      {connection?.user && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="min-w-0 border-t border-bolt-elements-borderColor pt-6"
        >
          <div className="flex min-w-0 flex-col items-start gap-4 rounded-lg bg-bolt-elements-background-depth-1 p-4 min-[420px]:flex-row min-[420px]:items-center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-bolt-elements-item-contentAccent bg-bolt-elements-background-depth-2">
              {connection.user.avatar_url &&
              connection.user.avatar_url !== 'null' &&
              connection.user.avatar_url !== '' ? (
                <img
                  src={connection.user.avatar_url}
                  alt={interpolateGitLabTabCopy(copy['gitLabTab.user.avatarAlt'], {
                    username: userDisplayName,
                  })}
                  className="h-full w-full rounded-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';

                    const parent = target.parentElement;

                    if (parent) {
                      parent.textContent = userInitial;
                      parent.classList.add(
                        'text-white',
                        'font-semibold',
                        'text-sm',
                        'flex',
                        'items-center',
                        'justify-center',
                      );
                    }
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-bolt-elements-item-contentAccent text-sm font-semibold text-white">
                  {userInitial}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h4 className="break-all text-sm font-medium text-bolt-elements-textPrimary">{userDisplayName}</h4>
              <p className="break-all text-sm text-bolt-elements-textSecondary">{connection.user?.username}</p>
            </div>
          </div>
        </motion.div>
      )}

      {hasRefreshError && (
        <div
          className="flex min-w-0 flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200 sm:flex-row sm:justify-between"
          role="alert"
        >
          <div className="flex min-w-0 items-start gap-2">
            <div className="i-ph:warning-circle mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{copy['gitLabTab.refresh.errorTitle']}</p>
              <p className="break-words text-sm">{copy['gitLabTab.refresh.errorDescription']}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshingStats}
            className="inline-flex min-h-11 max-w-full shrink-0 items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-center text-sm font-medium whitespace-normal transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:hover:bg-red-900/40"
          >
            {copy['gitLabTab.refresh.retry']}
          </button>
        </div>
      )}

      {/* GitLab Stats Section */}
      {connection?.stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="min-w-0 border-t border-bolt-elements-borderColor pt-6"
        >
          <h3 className="mb-4 break-words text-base font-medium text-bolt-elements-textPrimary">
            {copy['gitLabTab.statistics.title']}
          </h3>
          <StatsDisplay
            stats={connection.stats}
            onRefresh={() => void handleRefresh()}
            isRefreshing={isRefreshingStats}
          />
        </motion.div>
      )}

      {/* GitLab Repositories Section */}
      {connection?.stats?.projects && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="min-w-0 border-t border-bolt-elements-borderColor pt-6"
        >
          <RepositoryList
            repositories={connection.stats.projects}
            onRefresh={() => void handleRefresh()}
            isRefreshing={isRefreshingStats}
          />
        </motion.div>
      )}
    </div>
  );
}
