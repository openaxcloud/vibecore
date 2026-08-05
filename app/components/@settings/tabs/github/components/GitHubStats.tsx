import React from 'react';
import { useTranslation } from 'react-i18next';
import { GitHubErrorBoundary } from './GitHubErrorBoundary';
import { Button } from '~/components/ui/Button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { useGitHubStats } from '~/lib/hooks';
import {
  formatRepositoryTooltip,
  formatSourceControlDateTime,
  formatSourceControlNumber,
  getSourceControlConnectionsCopy,
  interpolateSourceControlCopy,
} from '~/lib/i18n/catalogs/source-control-connections';
import type { GitHubConnection, GitHubStats as GitHubStatsType } from '~/types/GitHub';
import { classNames } from '~/utils/classNames';

interface GitHubStatsProps {
  connection: GitHubConnection;
  isExpanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;

  /*
   * Optional pre-fetched stats. When provided, this component renders them
   * directly instead of mounting its own useGitHubStats instance. The parent
   * (GitHubTab) already owns a single hook instance, so passing these props
   * avoids a second auto-fetch (duplicate /api/github-stats calls + a duplicate
   * "stats updated" toast) over the shared singleton cache.
   */
  stats?: GitHubStatsType | null;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isStale?: boolean;
  refreshStats?: () => Promise<void>;
}

export function GitHubStats({
  connection,
  isExpanded,
  onToggleExpanded,
  stats: statsProp,
  isLoading: isLoadingProp,
  isRefreshing: isRefreshingProp,
  isStale: isStaleProp,
  refreshStats: refreshStatsProp,
}: GitHubStatsProps) {
  const isControlled = refreshStatsProp !== undefined;

  /*
   * Only mount our own hook (and thus our own auto-fetch) when the parent has
   * not already supplied stats. Calling the hook unconditionally keeps the
   * Rules of Hooks happy; `autoFetch` is disabled in controlled mode so no
   * second fetch/toast fires.
   */
  const owned = useGitHubStats(
    connection,
    {
      autoFetch: !isControlled,
      cacheTimeout: 30 * 60 * 1000, // 30 minutes
    },
    !connection?.token,
  ); // Use server-side if no token

  const stats = isControlled ? (statsProp ?? null) : owned.stats;
  const isLoading = isControlled ? !!isLoadingProp : owned.isLoading;
  const isRefreshing = isControlled ? !!isRefreshingProp : owned.isRefreshing;
  const isStale = isControlled ? !!isStaleProp : owned.isStale;
  const refreshStats = isControlled ? refreshStatsProp! : owned.refreshStats;

  return (
    <GitHubErrorBoundary>
      <GitHubStatsContent
        stats={stats}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        refreshStats={refreshStats}
        isStale={isStale}
        isExpanded={isExpanded}
        onToggleExpanded={onToggleExpanded}
      />
    </GitHubErrorBoundary>
  );
}

function GitHubStatsContent({
  stats,
  isLoading,
  isRefreshing,
  refreshStats,
  isStale,
  isExpanded,
  onToggleExpanded,
}: {
  stats: GitHubStatsType | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refreshStats: () => Promise<void>;
  isStale: boolean;
  isExpanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getSourceControlConnectionsCopy(language);

  /*
   * Guard against legacy/partial cached blobs that may lack `languages`
   * (cache can be hydrated from localStorage or connection.stats, neither validates shape).
   */
  const languages = stats?.languages ?? {};

  if (!stats) {
    return (
      <div className="mt-6 border-t border-bolt-elements-borderColor dark:border-bolt-elements-borderColor pt-6">
        <div className="flex items-center justify-center p-8" role="status" aria-live="polite" aria-busy={isLoading}>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <>
                <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" aria-hidden="true" />
                <span className="text-bolt-elements-textSecondary">{copy['sourceControl.github.stats.loading']}</span>
              </>
            ) : (
              <span className="text-bolt-elements-textSecondary">{copy['sourceControl.github.stats.empty']}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-bolt-elements-borderColor dark:border-bolt-elements-borderColor pt-6">
      <Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
        <div className="flex flex-col items-stretch gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background p-4 transition-all duration-200 hover:border-bolt-elements-borderColorActive/70 dark:border-bolt-elements-borderColor dark:bg-bolt-elements-background-depth-2 dark:hover:border-bolt-elements-borderColorActive/70 sm:flex-row sm:items-center sm:justify-between">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="vc-focus-ring flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-md text-left"
              aria-label={
                isExpanded
                  ? copy['sourceControl.github.stats.collapseAria']
                  : copy['sourceControl.github.stats.expandAria']
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="i-ph:chart-bar h-4 w-4 shrink-0 text-bolt-elements-item-contentAccent"
                  aria-hidden="true"
                />
                <span className="min-w-0 text-sm font-medium text-bolt-elements-textPrimary">
                  {copy['sourceControl.github.stats.title']}
                  {isStale && (
                    <span className="ml-1 text-bolt-elements-textTertiary">
                      {copy['sourceControl.github.stats.stale']}
                    </span>
                  )}
                </span>
              </span>
              <span
                className={classNames(
                  'i-ph:caret-down h-4 w-4 shrink-0 transform text-bolt-elements-textSecondary transition-transform duration-200',
                  isExpanded ? 'rotate-180' : '',
                )}
                aria-hidden="true"
              />
            </button>
          </CollapsibleTrigger>
          <Button
            onClick={() => {
              /*
               * The hook re-throws on failure but already surfaces the error via toast + error state.
               * Swallow the rejection here to avoid an unhandled promise rejection on manual refresh.
               */
              void refreshStats().catch(() => undefined);
            }}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="min-h-11 justify-center whitespace-normal text-xs sm:min-h-9 sm:flex-none"
            aria-label={copy['sourceControl.github.stats.refreshAria']}
          >
            {isRefreshing ? (
              <>
                <span className="i-ph:spinner-gap h-3 w-3 animate-spin" aria-hidden="true" />
                {copy['sourceControl.github.stats.refreshing']}
              </>
            ) : (
              <>
                <span className="i-ph:arrows-clockwise h-3 w-3" aria-hidden="true" />
                {copy['sourceControl.github.stats.refresh']}
              </>
            )}
          </Button>
        </div>

        <CollapsibleContent className="overflow-hidden">
          <div className="space-y-4 mt-4">
            {/* Languages Section */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">
                {copy['sourceControl.github.stats.topLanguages']}
              </h4>
              {stats.mostUsedLanguages && stats.mostUsedLanguages.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {stats.mostUsedLanguages.slice(0, 15).map(({ language: languageName, bytes, repos }) => (
                      <span
                        key={languageName}
                        className="px-3 py-1 text-xs rounded-full bg-bolt-elements-sidebar-buttonBackgroundDefault text-bolt-elements-sidebar-buttonText"
                        title={formatRepositoryTooltip(language, {
                          languageName,
                          bytes,
                          repositoryCount: repos,
                        })}
                      >
                        {languageName} ({formatSourceControlNumber(repos, language)})
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary">
                    {copy['sourceControl.github.stats.basis']}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(languages)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([language]) => (
                      <span
                        key={language}
                        className="px-3 py-1 text-xs rounded-full bg-bolt-elements-sidebar-buttonBackgroundDefault text-bolt-elements-sidebar-buttonText"
                      >
                        {language}
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* GitHub Overview Summary */}
            <div className="mb-6 p-4 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
              <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">
                {copy['sourceControl.github.stats.overview']}
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                    {formatSourceControlNumber((stats.publicRepos || 0) + (stats.privateRepos || 0), language)}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary">
                    {copy['sourceControl.github.stats.totalRepositories']}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                    {formatSourceControlNumber(stats.totalBranches || 0, language)}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary">
                    {copy['sourceControl.github.stats.totalBranches']}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                    {formatSourceControlNumber(stats.organizations?.length || 0, language)}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary">
                    {copy['sourceControl.github.stats.organizations']}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                    {formatSourceControlNumber(Object.keys(languages).length, language)}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary">
                    {copy['sourceControl.github.stats.languagesUsed']}
                  </div>
                </div>
              </div>
            </div>

            {/* Activity Summary */}
            <div className="mb-6">
              <h5 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">
                {copy['sourceControl.github.stats.activity']}
              </h5>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: copy['sourceControl.github.stats.totalBranches'],
                    value: stats.totalBranches || 0,
                    icon: 'i-ph:git-branch',
                    iconColor: 'text-bolt-elements-icon-info',
                  },
                  {
                    label: copy['sourceControl.github.stats.contributors'],
                    value: stats.totalContributors || 0,
                    icon: 'i-ph:users',
                    iconColor: 'text-bolt-elements-icon-success',
                  },
                  {
                    label: copy['sourceControl.github.stats.issues'],
                    value: stats.totalIssues || 0,
                    icon: 'i-ph:circle',
                    iconColor: 'text-bolt-elements-icon-warning',
                  },
                  {
                    label: copy['sourceControl.github.stats.pullRequests'],
                    value: stats.totalPullRequests || 0,
                    icon: 'i-ph:git-pull-request',
                    iconColor: 'text-bolt-elements-icon-accent',
                  },
                ].map((stat, index) => (
                  <div
                    key={index}
                    className="flex flex-col p-3 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor"
                  >
                    <span className="text-xs text-bolt-elements-textSecondary">{stat.label}</span>
                    <span className="text-lg font-medium text-bolt-elements-textPrimary flex items-center gap-1">
                      <div className={`${stat.icon} w-4 h-4 ${stat.iconColor}`} />
                      {formatSourceControlNumber(stat.value, language)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Organizations Section */}
            {stats.organizations && stats.organizations.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  {copy['sourceControl.github.stats.organizations']}
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {stats.organizations.map((org) => (
                    <a
                      key={org.login}
                      href={org.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive dark:hover:border-bolt-elements-borderColorActive transition-all duration-200"
                    >
                      <img
                        src={org.avatar_url}
                        alt={org.login}
                        className="w-8 h-8 rounded-full border border-bolt-elements-borderColor"
                      />
                      <div className="flex-1 min-w-0">
                        <h6 className="text-sm font-medium text-bolt-elements-textPrimary truncate">
                          {org.name || org.login}
                        </h6>
                        <p className="text-xs text-bolt-elements-textSecondary truncate">{org.login}</p>
                        {org.description && (
                          <p className="text-xs text-bolt-elements-textTertiary truncate">{org.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                        {org.public_repos && (
                          <span className="flex items-center gap-1">
                            <div className="i-ph:folder w-3 h-3" />
                            {formatSourceControlNumber(org.public_repos, language)}
                          </span>
                        )}
                        {org.followers && (
                          <span className="flex items-center gap-1">
                            <div className="i-ph:users w-3 h-3" />
                            {formatSourceControlNumber(org.followers, language)}
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Last Updated */}
            <div className="pt-2 border-t border-bolt-elements-borderColor">
              <span className="text-xs text-bolt-elements-textSecondary">
                {(() => {
                  const lastUpdated = stats.lastUpdated ? new Date(stats.lastUpdated) : null;

                  const date =
                    lastUpdated && Number.isFinite(lastUpdated.getTime())
                      ? formatSourceControlDateTime(lastUpdated, language)
                      : copy['sourceControl.github.stats.never'];

                  return interpolateSourceControlCopy(copy['sourceControl.github.stats.lastUpdated'], { date });
                })()}
              </span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
