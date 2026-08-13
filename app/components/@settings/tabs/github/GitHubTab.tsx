import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import React, { useState } from 'react';
import { GitHubCacheManager } from './components/GitHubCacheManager';
import { GitHubConnection } from './components/GitHubConnection';
import { GitHubErrorBoundary } from './components/GitHubErrorBoundary';
import { GitHubStats } from './components/GitHubStats';
import { GitHubUserProfile } from './components/GitHubUserProfile';
import { LoadingState, ErrorState, ConnectionTestIndicator, RepositoryCard } from './components/shared';
import { hasRepos, splitRepos } from './github-repos-display';
import { Button } from '~/components/ui/Button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { useGitHubConnection, useGitHubStats } from '~/lib/hooks';
import { classNames } from '~/utils/classNames';

interface ConnectionTestResult {
  status: 'success' | 'error' | 'testing';
  message: string;
  timestamp?: number;
}

// GitHub logo SVG component
const GithubLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path
      fill="currentColor"
      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
    />
  </svg>
);

export default function GitHubTab() {
  const { connection, isConnected, isLoading, error, testConnection } = useGitHubConnection();

  const {
    stats,
    isLoading: isStatsLoading,
    isRefreshing: isStatsRefreshing,
    isStale: isStatsStale,
    refreshStats,
    error: statsError,
  } = useGitHubStats(
    connection,
    {
      autoFetch: true,
      cacheTimeout: 30 * 60 * 1000, // 30 minutes
    },
    isConnected && connection ? !connection.token : false,
  ); // Use server-side when no token but connected

  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [isReposExpanded, setIsReposExpanded] = useState(false);

  const handleTestConnection = async () => {
    if (!connection?.user) {
      setConnectionTest({
        status: 'error',
        message: 'No connection established',
        timestamp: Date.now(),
      });
      return;
    }

    setConnectionTest({
      status: 'testing',
      message: 'Testing connection...',
    });

    try {
      const isValid = await testConnection();

      if (isValid) {
        setConnectionTest({
          status: 'success',
          message: `Connected successfully as ${connection.user.login}`,
          timestamp: Date.now(),
        });
      } else {
        setConnectionTest({
          status: 'error',
          message: 'Connection test failed',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      setConnectionTest({
        status: 'error',
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  };

  // Loading state for initial connection check
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <GithubLogo />
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">GitHub Integration</h2>
        </div>
        <LoadingState message="Checking GitHub connection..." />
      </div>
    );
  }

  // Error state for connection issues
  if (error && !connection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <GithubLogo />
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">GitHub Integration</h2>
        </div>
        <ErrorState
          title="Connection Error"
          message={error}
          onRetry={() => window.location.reload()}
          retryLabel="Reload Page"
        />
      </div>
    );
  }

  // Not connected state
  if (!isConnected || !connection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <GithubLogo />
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">GitHub Integration</h2>
        </div>
        <p className="text-sm text-bolt-elements-textSecondary">
          Connect your GitHub account to enable advanced repository management features, statistics, and seamless
          integration.
        </p>
        <GitHubConnection connectionTest={connectionTest} onTestConnection={handleTestConnection} />
      </div>
    );
  }

  return (
    <GitHubErrorBoundary>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          className="flex items-center justify-between gap-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2">
            <GithubLogo />
            <h2 className="text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
              GitHub Integration
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isStatsRefreshing && stats && (
              <div className="flex items-center gap-2 px-3 py-1 bg-bolt-elements-background-depth-1 rounded-lg text-xs">
                <div className="i-ph:spinner-gap w-4 h-4 animate-spin text-bolt-elements-item-contentAccent" />
                <span className="text-bolt-elements-textSecondary">Refreshing…</span>
              </div>
            )}
            {connection?.rateLimit && (
              <div className="flex items-center gap-2 px-3 py-1 bg-bolt-elements-background-depth-1 rounded-lg text-xs">
                <div className="i-ph:cloud w-4 h-4 text-bolt-elements-textSecondary" />
                <span className="text-bolt-elements-textSecondary">
                  API: {connection.rateLimit.remaining}/{connection.rateLimit.limit}
                </span>
              </div>
            )}
          </div>
        </motion.div>

        <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
          Manage your GitHub integration with advanced repository features and comprehensive statistics
        </p>

        {/* Connection Test Results */}
        <ConnectionTestIndicator
          status={connectionTest?.status || null}
          message={connectionTest?.message}
          timestamp={connectionTest?.timestamp}
        />

        {/* Connection Component */}
        <GitHubConnection connectionTest={connectionTest} onTestConnection={handleTestConnection} />

        {/* User Profile */}
        {connection.user && <GitHubUserProfile user={connection.user} />}

        {/* Stats Section — driven by the single hook instance above (no second auto-fetch) */}
        <GitHubStats
          connection={connection}
          isExpanded={isStatsExpanded}
          onToggleExpanded={setIsStatsExpanded}
          stats={stats}
          isLoading={isStatsLoading}
          isRefreshing={isStatsRefreshing}
          isStale={isStatsStale}
          refreshStats={refreshStats}
        />

        {/* Repositories Section */}
        {stats && hasRepos(stats.repos) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="border-t border-bolt-elements-borderColor pt-6"
          >
            {(() => {
              const { preview, remaining, hasMore, hiddenCount } = splitRepos(stats.repos);

              const renderRepo = (repo: (typeof stats.repos)[number]) => (
                <RepositoryCard
                  key={repo.full_name}
                  repository={repo}
                  variant="detailed"
                  showHealthScore
                  showExtendedMetrics
                  onSelect={() => window.open(repo.html_url, '_blank', 'noopener,noreferrer')}
                />
              );

              return (
                <Collapsible open={isReposExpanded} onOpenChange={setIsReposExpanded}>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-bolt-elements-background dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor">
                    <div className="flex items-center gap-2">
                      <div className="i-ph:folder w-4 h-4 text-bolt-elements-item-contentAccent" />
                      <span className="text-sm font-medium text-bolt-elements-textPrimary">
                        All Repositories ({stats.repos.length})
                      </span>
                    </div>
                  </div>

                  {/* Preview list — always visible so the section is never empty */}
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{preview.map(renderRepo)}</div>

                    {/* Remaining repositories — revealed by the Collapsible */}
                    {hasMore && (
                      <CollapsibleContent className="overflow-hidden">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{remaining.map(renderRepo)}</div>
                      </CollapsibleContent>
                    )}

                    {hasMore && (
                      <div className="text-center">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                          >
                            <ChevronDown
                              className={classNames(
                                'w-4 h-4 mr-1 transform transition-transform duration-200',
                                isReposExpanded ? 'rotate-180' : '',
                              )}
                            />
                            {isReposExpanded ? 'Show fewer repositories' : `Show ${hiddenCount} more repositories`}
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    )}
                  </div>
                </Collapsible>
              );
            })()}
          </motion.div>
        )}

        {/* Repositories Empty State — stats loaded but no repositories to show */}
        {stats && !statsError && !hasRepos(stats.repos) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="border-t border-bolt-elements-borderColor pt-6"
          >
            <div className="flex items-center gap-3 p-4 rounded-lg bg-bolt-elements-background dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor">
              <div className="i-ph:folder-open w-5 h-5 text-bolt-elements-textTertiary" />
              <div>
                <p className="text-sm font-medium text-bolt-elements-textPrimary">No repositories found</p>
                <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                  This account has no repositories visible to E-Code yet. Create a repository on GitHub, or check that
                  your token grants access to the repositories you expect.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Stats Error State */}
        {statsError && !stats && (
          <ErrorState
            title="Failed to Load Statistics"
            message={statsError}
            onRetry={() => window.location.reload()}
            retryLabel="Retry"
          />
        )}

        {/*
         * Stats Loading State is handled inside <GitHubStats> above (it renders its own
         * spinner when isLoading && !stats). A second standalone progressive loader here
         * would stack two loading UIs for the same single fetch, so it has been removed.
         */}

        {/* Cache Management Section - Only show when connected */}
        {isConnected && connection && (
          <div className="mt-8 pt-6 border-t border-bolt-elements-borderColor">
            <GitHubCacheManager showStats={true} />
          </div>
        )}
      </div>
    </GitHubErrorBoundary>
  );
}
