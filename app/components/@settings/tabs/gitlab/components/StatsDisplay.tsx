import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import {
  formatGitLabTabDateTime,
  formatGitLabTabNumber,
  formatGitLabTabPlural,
  getGitLabTabCopy,
  interpolateGitLabTabCopy,
  type GitLabTabCopy,
} from '~/lib/i18n/catalogs/gitlab-tab';
import type { GitLabStats } from '~/types/GitLab';

interface StatsDisplayProps {
  stats: GitLabStats;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface GitLabStatMetric {
  id: string;
  value: number;
  one: keyof GitLabTabCopy;
  other: keyof GitLabTabCopy;
  icon?: string;
  iconColor?: string;
}

function normalizeGitLabCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function StatsDisplay({ stats, onRefresh, isRefreshing }: StatsDisplayProps) {
  const { i18n } = useTranslation();
  const headingIdPrefix = useId();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getGitLabTabCopy(language);

  const repositoryMetrics: GitLabStatMetric[] = [
    {
      id: 'public-repositories',
      value: normalizeGitLabCount(stats.publicProjects),
      one: 'gitLabTab.statistics.publicRepositories_one',
      other: 'gitLabTab.statistics.publicRepositories_other',
    },
    {
      id: 'private-repositories',
      value: normalizeGitLabCount(stats.privateProjects),
      one: 'gitLabTab.statistics.privateRepositories_one',
      other: 'gitLabTab.statistics.privateRepositories_other',
    },
  ];
  const contributionMetrics: GitLabStatMetric[] = [
    {
      id: 'stars',
      value: normalizeGitLabCount(stats.stars),
      one: 'gitLabTab.statistics.stars_one',
      other: 'gitLabTab.statistics.stars_other',
      icon: 'i-ph:star',
      iconColor: 'text-bolt-elements-icon-warning',
    },
    {
      id: 'forks',
      value: normalizeGitLabCount(stats.forks),
      one: 'gitLabTab.statistics.forks_one',
      other: 'gitLabTab.statistics.forks_other',
      icon: 'i-ph:git-fork',
      iconColor: 'text-bolt-elements-icon-info',
    },
    {
      id: 'followers',
      value: normalizeGitLabCount(stats.followers),
      one: 'gitLabTab.statistics.followers_one',
      other: 'gitLabTab.statistics.followers_other',
      icon: 'i-ph:users',
      iconColor: 'text-bolt-elements-icon-success',
    },
  ];

  const allMetrics = [...repositoryMetrics, ...contributionMetrics];
  const hasRecordedActivity = allMetrics.some((metric) => metric.value > 0);
  const refreshing = isRefreshing === true;
  const repositoryHeadingId = `${headingIdPrefix}-repositories`;
  const contributionHeadingId = `${headingIdPrefix}-contributions`;

  const renderMetric = (metric: GitLabStatMetric) => {
    const label = formatGitLabTabPlural(language, metric.value, {
      one: copy[metric.one],
      other: copy[metric.other],
    });

    return (
      <li
        key={metric.id}
        className="flex min-w-0 flex-col rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
      >
        <span className="break-words text-xs text-bolt-elements-textSecondary [overflow-wrap:anywhere]">{label}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1 text-lg font-medium text-bolt-elements-textPrimary">
          {metric.icon ? (
            <span className={`${metric.icon} ${metric.iconColor ?? ''} h-4 w-4 shrink-0`} aria-hidden="true" />
          ) : null}
          <span className="min-w-0 break-words tabular-nums [overflow-wrap:anywhere]">
            {formatGitLabTabNumber(metric.value, language)}
          </span>
        </span>
      </li>
    );
  };

  return (
    <div className="min-w-0 space-y-4" aria-busy={refreshing} data-testid="gitlab-stats-display">
      <section className="min-w-0" aria-labelledby={repositoryHeadingId}>
        <h4
          id={repositoryHeadingId}
          className="mb-2 break-words text-sm font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]"
        >
          {copy['gitLabTab.statistics.repositoriesTitle']}
        </h4>
        <ul className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4">
          {repositoryMetrics.map(renderMetric)}
        </ul>
      </section>

      <section className="min-w-0" aria-labelledby={contributionHeadingId}>
        <h4
          id={contributionHeadingId}
          className="mb-2 break-words text-sm font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]"
        >
          {copy['gitLabTab.statistics.contributionsTitle']}
        </h4>
        <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {contributionMetrics.map(renderMetric)}
        </ul>
      </section>

      {!hasRecordedActivity ? (
        <p
          className="break-words rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]"
          role="status"
        >
          {copy['gitLabTab.statistics.empty']}
        </p>
      ) : null}

      <div className="border-t border-bolt-elements-borderColor pt-2">
        <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span
            className="min-w-0 break-words text-xs text-bolt-elements-textSecondary [overflow-wrap:anywhere]"
            data-testid="gitlab-stats-last-updated"
          >
            {interpolateGitLabTabCopy(copy['gitLabTab.statistics.lastUpdated'], {
              date: formatGitLabTabDateTime(stats.lastUpdated, language),
            })}
          </span>
          {onRefresh ? (
            <Button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
              variant="outline"
              size="sm"
              className="!h-auto min-h-11 w-full max-w-full gap-2 !whitespace-normal px-3 py-2 text-center text-xs leading-snug sm:w-auto"
            >
              {refreshing ? (
                <span
                  className="i-ph:spinner-gap-bold h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : null}
              <span className="break-words [overflow-wrap:anywhere]" aria-live="polite">
                {copy[refreshing ? 'gitLabTab.statistics.refreshing' : 'gitLabTab.statistics.refresh']}
              </span>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
